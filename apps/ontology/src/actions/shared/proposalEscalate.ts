// Proposal.escalate — park a proposal for human resolution without deciding it.
//
// The escalation verb exists for the reviewer-agent case: it found a material
// concern it cannot resolve, and neither approving nor rejecting is honest. An
// escalated proposal stays open — approve and reject still work on it later, so
// a human can resolve what the agent could not.
import type { Selectable } from "kysely";
import type { Database } from "../../db.ts";
import { METADATA_SCHEMA } from "../../ontology/metadata.ts";
import { ActionError, type ActionContext } from "../types.ts";

type Proposal = Selectable<Database["manufacturing.proposal"]>;

type EscalateParams = {
  note: string;
};

export async function proposalEscalate(
  proposal: Proposal,
  params: EscalateParams,
  ctx: ActionContext,
): Promise<Proposal> {
  if (proposal.status !== "pending") {
    throw new ActionError(
      409,
      `Proposal ${proposal.id} is "${proposal.status}"; only a pending proposal can be escalated`,
    );
  }

  const reviewer = ctx.callerIdentity ?? "system";
  // Pinned server clock: the process runs with its clock anchored to COURSE_NOW.
  const escalatedAt = new Date();

  // The update and its audit row land together or not at all. reviewed_by and
  // reviewed_at stay empty: escalation is not a decision, and the human who
  // eventually approves or rejects will fill them.
  return await ctx.db.transaction().execute(async (trx) => {
    const updated = await trx
      .updateTable("manufacturing.proposal")
      .set({
        status: "escalated",
        decision_note: params.note,
      })
      .where("id", "=", proposal.id)
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
        target_id: String(proposal.id),
        actor: reviewer,
        created_at: escalatedAt,
        params: { note: params.note },
        result: { status: "escalated" },
      })
      .execute();

    return updated;
  });
}
