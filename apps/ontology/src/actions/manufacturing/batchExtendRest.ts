// Batch.extendRest — give the ferment more time in its current vessel.
//
// Pushes only this batch's planned transfer later. Deliberately no cascade:
// downstream batches sharing the tank are untouched, and resolving the knock-on
// schedule is a human problem, not this action's.
import type { Selectable } from "kysely";
import type { Database } from "../../db.ts";
import { METADATA_SCHEMA } from "../../ontology/metadata.ts";
import { ActionError, type ActionContext } from "../types.ts";

type Batch = Selectable<Database["manufacturing.batch"]>;

type ExtendRestParams = {
  additionalDays: number;
};

const RESTABLE = new Set(["fermenting", "conditioning"]);

export async function batchExtendRest(
  batch: Batch,
  params: ExtendRestParams,
  ctx: ActionContext,
): Promise<Batch> {
  if (!RESTABLE.has(batch.status)) {
    throw new ActionError(
      409,
      `Batch ${batch.id} is "${batch.status}"; only a fermenting or conditioning batch can have its rest extended`,
    );
  }
  if (!Number.isInteger(params.additionalDays) || params.additionalDays <= 0) {
    throw new ActionError(400, "additionalDays must be a positive integer");
  }
  const previousTransfer = batch.planned_transfer_at;
  if (previousTransfer === null) {
    throw new ActionError(409, `Batch ${batch.id} has no planned transfer to push back`);
  }

  const newTransfer = new Date(previousTransfer);
  newTransfer.setUTCDate(newTransfer.getUTCDate() + params.additionalDays);

  // The update and its audit row land together or not at all.
  return await ctx.db.transaction().execute(async (trx) => {
    const updated = await trx
      .updateTable("manufacturing.batch")
      .set({ planned_transfer_at: newTransfer })
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
        params: { additionalDays: params.additionalDays },
        result: {
          previousPlannedTransferAt: previousTransfer.toISOString(),
          plannedTransferAt: newTransfer.toISOString(),
        },
      })
      .execute();

    return updated;
  });
}
