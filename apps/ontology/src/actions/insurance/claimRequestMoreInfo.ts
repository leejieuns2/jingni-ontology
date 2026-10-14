// Claim.requestMoreInfo — park a filed claim pending information from the
// customer. The claim moves to pendingReview; what was asked for travels in the
// audit entry.
import type { Selectable } from "kysely";
import type { Database } from "../../db.ts";
import { METADATA_SCHEMA } from "../../ontology/metadata.ts";
import { ActionError, type ActionContext } from "../types.ts";

type Claim = Selectable<Database["insurance.claim"]>;

type RequestMoreInfoParams = {
  reason: string;
  requestedInfo: string;
};

export async function claimRequestMoreInfo(
  claim: Claim,
  params: RequestMoreInfoParams,
  ctx: ActionContext,
): Promise<Claim> {
  if (claim.status !== "filed") {
    throw new ActionError(
      409,
      `Claim ${claim.id} is "${claim.status}"; only a filed claim can be moved to pendingReview`,
    );
  }

  // The update and its audit row land together or not at all.
  return await ctx.db.transaction().execute(async (trx) => {
    const updated = await trx
      .updateTable("insurance.claim")
      .set({ status: "pendingReview" })
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
        params: { reason: params.reason, requestedInfo: params.requestedInfo },
        result: { previousStatus: claim.status, status: updated.status },
      })
      .execute();

    return updated;
  });
}
