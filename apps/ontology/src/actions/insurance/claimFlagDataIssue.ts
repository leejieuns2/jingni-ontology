// Claim.flagDataIssue — record a data-quality problem on a claim.
//
// Deliberately does not approve, deny, or otherwise resolve the claim: a broken
// core reference is a data problem for a human to fix, not a claim decision.
import type { Selectable } from "kysely";
import type { Database } from "../../db.ts";
import { METADATA_SCHEMA } from "../../ontology/metadata.ts";
import type { ActionContext } from "../types.ts";

type Claim = Selectable<Database["insurance.claim"]>;

type FlagDataIssueParams = {
  reason: string;
};

export async function claimFlagDataIssue(
  claim: Claim,
  params: FlagDataIssueParams,
  ctx: ActionContext,
): Promise<Claim> {
  // Pinned server clock: the process runs with its clock anchored to COURSE_NOW.
  const flaggedAt = new Date();
  const actor = ctx.callerIdentity ?? "system";

  // Readable id with a short suffix so two issues on the same claim and day
  // cannot collide on the primary key.
  const issueId = `DI-${claim.id}-${flaggedAt.toISOString().slice(0, 10)}-${Date.now()
    .toString(36)
    .slice(-4)}`;

  // The issue and its audit row land together or not at all.
  await ctx.db.transaction().execute(async (trx) => {
    const issue = await trx
      .insertInto("insurance.data_issue")
      .values({
        id: issueId,
        claim_id: claim.id,
        reason: params.reason,
        status: "open",
      })
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
        actor,
        authorized_by_proposal: ctx.authorizedByProposal ?? null,
        created_at: flaggedAt,
        params: { reason: params.reason },
        result: { dataIssueId: issue.id, status: issue.status, claimStatus: claim.status },
      })
      .execute();
  });

  // The claim itself is untouched; the issue travels in the audit entry.
  return claim;
}
