// Batch.deferStart — push a batch's planned start date back.
//
// The route has already validated the params against the action's
// parameter_schema, so what is left here is the domain rule (only a queued batch
// can be deferred, and only to a future date) and the write itself.
import type { Selectable } from "kysely";
import type { Database } from "../../db.ts";
import { METADATA_SCHEMA } from "../../ontology/metadata.ts";
import { ActionError, type ActionContext } from "../types.ts";

type Batch = Selectable<Database["manufacturing.batch"]>;

type DeferStartParams = {
  /** ISO 8601 datetime; `format: date-time` in the action's parameter_schema. */
  newPlannedStart: string;
};

export async function batchDeferStart(
  batch: Batch,
  params: DeferStartParams,
  ctx: ActionContext,
): Promise<Batch> {
  if (batch.status !== "queued") {
    throw new ActionError(
      409,
      `Batch ${batch.id} is "${batch.status}"; only a queued batch can have its start deferred`,
    );
  }

  const newPlannedStart = new Date(params.newPlannedStart);
  if (Number.isNaN(newPlannedStart.getTime())) {
    throw new ActionError(400, `newPlannedStart "${params.newPlannedStart}" is not a valid datetime`);
  }
  if (newPlannedStart.getTime() <= Date.now()) {
    throw new ActionError(
      400,
      `newPlannedStart ${newPlannedStart.toISOString()} must be in the future`,
    );
  }

  // The update and its audit row land together or not at all.
  return await ctx.db.transaction().execute(async (trx) => {
    const updated = await trx
      .updateTable("manufacturing.batch")
      .set({ planned_start: newPlannedStart })
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
        actor: ctx.actor,
        // Explicit rather than the column default: `now()` is the database's
        // clock, which ignores the COURSE_NOW anchor this process runs on.
        created_at: new Date(),
        params: { newPlannedStart: newPlannedStart.toISOString() },
        result: {
          previousPlannedStart: batch.planned_start?.toISOString() ?? null,
          plannedStart: updated.planned_start?.toISOString() ?? null,
        },
      })
      .execute();

    return updated;
  });
}
