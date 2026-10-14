// Batch.scheduleEarlyTransfer — advance the batch toward the next stage ahead
// of plan, for when staying in the current vessel is itself the risk.
//
// This rewrites only this batch's planned transfer date. It does NOT check or
// reserve a destination vessel — whether a tank or line is actually free at
// `plannedAt` is the operator's and downstream scheduling's problem, and nothing
// here claims otherwise.
import type { Selectable } from "kysely";
import type { Database } from "../../db.ts";
import { METADATA_SCHEMA } from "../../ontology/metadata.ts";
import { ActionError, type ActionContext } from "../types.ts";

type Batch = Selectable<Database["manufacturing.batch"]>;

type ScheduleEarlyTransferParams = {
  /** ISO 8601 datetime; `format: date-time` in the action's parameter_schema. */
  plannedAt: string;
};

const TRANSFERABLE = new Set(["fermenting", "conditioning"]);

export async function batchScheduleEarlyTransfer(
  batch: Batch,
  params: ScheduleEarlyTransferParams,
  ctx: ActionContext,
): Promise<Batch> {
  if (!TRANSFERABLE.has(batch.status)) {
    throw new ActionError(
      409,
      `Batch ${batch.id} is "${batch.status}"; only a fermenting or conditioning batch can be transferred early`,
    );
  }

  const newTransfer = new Date(params.plannedAt);
  if (Number.isNaN(newTransfer.getTime())) {
    throw new ActionError(400, `plannedAt "${params.plannedAt}" is not a valid datetime`);
  }

  // It must actually be earlier than the current plan — this is an *early*
  // transfer, not a reschedule. Pushing it later is extendRest's job.
  if (
    batch.planned_transfer_at !== null &&
    newTransfer.getTime() >= batch.planned_transfer_at.getTime()
  ) {
    throw new ActionError(
      400,
      "plannedAt must be earlier than the current planned transfer; use extendRest to push it later",
    );
  }

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
        params: { plannedAt: newTransfer.toISOString() },
        result: {
          previousPlannedTransferAt: batch.planned_transfer_at?.toISOString() ?? null,
          plannedTransferAt: newTransfer.toISOString(),
        },
      })
      .execute();

    return updated;
  });
}
