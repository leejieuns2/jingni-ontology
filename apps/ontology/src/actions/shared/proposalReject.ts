// Proposal.reject — the reviewer declines; the underlying action never runs.
//
// Records the reviewer and decision the same way approval does, so an audit
// reader sees who looked at it and when regardless of the outcome.
import type { Selectable } from "kysely";
import type { Database } from "../../db.ts";
import { METADATA_SCHEMA } from "../../ontology/metadata.ts";
import { ActionError, type ActionContext } from "../types.ts";

type Proposal = Selectable<Database["manufacturing.proposal"]>;

type DecisionParams = {
  decisionNote?: string;
};

export async function proposalReject(
  proposal: Proposal,
  params: DecisionParams | undefined,
  ctx: ActionContext,
): Promise<Proposal> {
  if (proposal.status !== "pending") {
    throw new ActionError(
      409,
      `Proposal ${proposal.id} is "${proposal.status}"; only a pending proposal can be rejected`,
    );
  }

  const reviewer = ctx.callerIdentity ?? "system";
  // Pinned server clock: the process runs with its clock anchored to COURSE_NOW.
  const reviewedAt = new Date();

  // The update and its audit row land together or not at all.
  return await ctx.db.transaction().execute(async (trx) => {
    const updated = await trx
      .updateTable("manufacturing.proposal")
      .set({
        status: "rejected",
        reviewed_by: reviewer,
        reviewed_at: reviewedAt,
        decision_note: params?.decisionNote ?? null,
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
        created_at: reviewedAt,
        params: { decisionNote: params?.decisionNote ?? null },
        result: { status: "rejected" },
      })
      .execute();

    return updated;
  });
}
