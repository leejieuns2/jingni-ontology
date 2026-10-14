// Batch.placeOnHold — stop an in-progress batch pending investigation.
//
// A hold stops an active ferment or conditioning run; queued or finished batches
// have nothing to hold. The reason travels into the audit entry.
import type { Selectable } from "kysely";
import type { Database } from "../../db.ts";
import { METADATA_SCHEMA } from "../../ontology/metadata.ts";
import { ActionError, type ActionContext } from "../types.ts";

type Batch = Selectable<Database["manufacturing.batch"]>;

type PlaceOnHoldParams = {
  reason: string;
};

const HOLDABLE = new Set(["fermenting", "conditioning"]);

export async function batchPlaceOnHold(
  batch: Batch,
  params: PlaceOnHoldParams,
  ctx: ActionContext,
): Promise<Batch> {
  if (!HOLDABLE.has(batch.status)) {
    throw new ActionError(
      409,
      `Batch ${batch.id} is "${batch.status}"; only a fermenting or conditioning batch can be placed on hold`,
    );
  }

  // The update and its audit row land together or not at all.
  return await ctx.db.transaction().execute(async (trx) => {
    const updated = await trx
      .updateTable("manufacturing.batch")
      .set({ status: "onHold" })
      .where("id", "=", batch.id)
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
        target_id: batch.id,
        actor: ctx.callerIdentity ?? "system",
        authorized_by_proposal: ctx.authorizedByProposal ?? null,
        // Explicit rather than the column default: `now()` is the database's
        // clock, which ignores the COURSE_NOW anchor this process runs on.
        created_at: new Date(),
        params: { reason: params.reason },
        result: { previousStatus: batch.status, status: updated.status },
      })
      .execute();

    return updated;
  });
}
