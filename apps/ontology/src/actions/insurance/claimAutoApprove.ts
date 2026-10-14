// Claim.autoApprove — the one write in the claims flow that pays money, so the
// handler re-validates every gate itself rather than trusting the caller's
// story: the agent's reasoning picks WHICH claims to bring here, but the rules
// that make an auto-approval safe live in this code, not in a prompt.
import type { Selectable } from "kysely";
import type { Database } from "../../db.ts";
import { METADATA_SCHEMA } from "../../ontology/metadata.ts";
import { ActionError, type ActionContext } from "../types.ts";

type Claim = Selectable<Database["insurance.claim"]>;

type AutoApproveParams = {
  reason: string;
  citedClauseIds: string[];
  approvedAmount: number;
};

const DAY_MS = 86_400_000;

export async function claimAutoApprove(
  claim: Claim,
  params: AutoApproveParams,
  ctx: ActionContext,
): Promise<Claim> {
  if (claim.status !== "filed") {
    throw new ActionError(
      409,
      `Claim ${claim.id} is "${claim.status}"; only a filed claim can be auto-approved`,
    );
  }

  if (!claim.policy_id) {
    throw new ActionError(409, `Claim ${claim.id} has no linked policy`);
  }
  const policy = await ctx.db
    .selectFrom("insurance.policy")
    .selectAll()
    .where("id", "=", claim.policy_id)
    .executeTakeFirst();
  if (!policy) {
    throw new ActionError(409, `Linked policy "${claim.policy_id}" does not exist`);
  }
  if (policy.status !== "active") {
    throw new ActionError(409, `Policy ${policy.id} is "${policy.status}"; must be active`);
  }

  if (!claim.incident_date) {
    throw new ActionError(409, `Claim ${claim.id} has no incident date`);
  }
  if (!policy.start_date || !policy.end_date) {
    throw new ActionError(409, `Policy ${policy.id} has no coverage period`);
  }
  if (claim.incident_date < policy.start_date || claim.incident_date > policy.end_date) {
    throw new ActionError(
      409,
      `Incident date ${iso(claim.incident_date)} is outside the policy period ` +
        `${iso(policy.start_date)}–${iso(policy.end_date)}`,
    );
  }

  if (!claim.filed_date) {
    throw new ActionError(409, `Claim ${claim.id} has no filed date`);
  }
  if (policy.reporting_window_days === null) {
    throw new ActionError(409, `Policy ${policy.id} has no reporting window`);
  }
  const reportingDelay = Math.round(
    (claim.filed_date.getTime() - claim.incident_date.getTime()) / DAY_MS,
  );
  if (reportingDelay > policy.reporting_window_days) {
    throw new ActionError(
      409,
      `Reported ${reportingDelay} day(s) after the incident, exceeding the policy's ` +
        `${policy.reporting_window_days}-day reporting window`,
    );
  }

  if (claim.documents_complete !== true) {
    throw new ActionError(409, `Claim ${claim.id}'s documents are incomplete`);
  }

  if (!(params.approvedAmount > 0)) {
    throw new ActionError(400, `approvedAmount must be positive, got ${params.approvedAmount}`);
  }
  if (claim.amount_claimed === null) {
    throw new ActionError(409, `Claim ${claim.id} has no claimed amount`);
  }
  if (params.approvedAmount > claim.amount_claimed) {
    throw new ActionError(
      400,
      `approvedAmount ${params.approvedAmount} exceeds the claimed amount ${claim.amount_claimed}`,
    );
  }

  const clauses = await ctx.db
    .selectFrom("insurance.coverage_clause")
    .select(["id", "limit_amount"])
    .where("id", "in", params.citedClauseIds)
    .execute();
  const covering = clauses.find(
    (clause) => clause.limit_amount !== null && clause.limit_amount >= params.approvedAmount,
  );
  if (!covering) {
    throw new ActionError(
      409,
      `No cited coverage clause has a limitAmount of at least ${params.approvedAmount}`,
    );
  }

  // The status change and its audit row land together or not at all.
  return await ctx.db.transaction().execute(async (trx) => {
    const updated = await trx
      .updateTable("insurance.claim")
      .set({ status: "autoApproved" })
      .where("id", "=", claim.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    await trx
      .withSchema(METADATA_SCHEMA)
      .insertInto("audit_log")
      .values({
        action_type_id: ctx.action.id,
        action_api_name: ctx.action.apiName,
        target_type_id: ctx.objectType.id,
        target_type_api_name: ctx.objectType.apiName,
        target_id: claim.id,
        actor: ctx.callerIdentity ?? "system",
        authorized_by_proposal: ctx.authorizedByProposal ?? null,
        // Explicit rather than the column default: `now()` is the database's
        // clock, which ignores the COURSE_NOW anchor this process runs on.
        created_at: new Date(),
        params: {
          reason: params.reason,
          citedClauseIds: params.citedClauseIds,
          approvedAmount: params.approvedAmount,
        },
        result: {
          previousStatus: claim.status,
          status: updated.status,
          coveringClauseId: covering.id,
        },
      })
      .execute();

    return updated;
  });
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}
