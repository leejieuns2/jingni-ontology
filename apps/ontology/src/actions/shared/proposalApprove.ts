// Proposal.approve — a human decision that executes the proposed action.
//
// Ordering is the whole design: the underlying action runs FIRST. If it throws,
// nothing here has written yet — the proposal stays pending and no approve audit
// row persists, so a failed approval looks exactly like no approval. Only once
// the inner action has committed is the proposal marked approved and the
// decision audited.
//
// Schema-generic on purpose: nothing in here knows which action a proposal
// carries. The `type` field is the registry key, parsed case-sensitively.
import type { Selectable } from "kysely";
import type { Database } from "../../db.ts";
import { METADATA_SCHEMA } from "../../ontology/metadata.ts";
import { dispatchAction } from "../dispatch.ts";
import { ActionError, type ActionContext } from "../types.ts";

type Proposal = Selectable<Database["manufacturing.proposal"]>;

type DecisionParams = {
  decisionNote?: string;
};

export async function proposalApprove(
  proposal: Proposal,
  params: DecisionParams | undefined,
  ctx: ActionContext,
): Promise<Proposal> {
  // Escalated proposals stay approvable: escalation parks a decision for a
  // human, it does not retire the proposal.
  if (proposal.status !== "pending" && proposal.status !== "escalated") {
    throw new ActionError(
      409,
      `Proposal ${proposal.id} is "${proposal.status}"; only a pending or escalated proposal can be approved`,
    );
  }

  const reviewer = ctx.callerIdentity ?? "system";
  // Pinned server clock: the process runs with its clock anchored to COURSE_NOW.
  const reviewedAt = new Date();

  // 1. Run the proposed action. The approving user becomes its actor and the
  //    proposal id lands on its audit row, making the authorization chain
  //    explicit. A throw here aborts before the proposal is touched.
  const triggeredResult = await dispatchAction(ctx.db, {
    handlerKey: proposal.type,
    targetId: proposal.target_id,
    params: proposal.params,
    callerIdentity: reviewer,
    authorizedByProposal: String(proposal.id),
  });

  // 2. The inner action committed: mark the proposal approved and audit the
  //    decision itself, atomically.
  return await ctx.db.transaction().execute(async (trx) => {
    const updated = await trx
      .updateTable("manufacturing.proposal")
      .set({
        status: "approved",
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
        result: {
          status: "approved",
          triggeredAction: proposal.type,
          triggeredTargetId: proposal.target_id,
          triggeredResult,
        },
      })
      .execute();

    return updated;
  });
}
