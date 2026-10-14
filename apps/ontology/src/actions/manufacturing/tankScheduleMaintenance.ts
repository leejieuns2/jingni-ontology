// Tank.scheduleMaintenance — take a tank offline for planned service.
//
// The route has already validated the params against the action's
// parameter_schema (type is one of the four maintenance kinds, plannedAt is a
// date-time, notes is a string), so what is left here is the domain rule — a tank
// holding a fermenting batch cannot be pulled offline — and the writes.
import type { Selectable } from "kysely";
import type { Database } from "../../db.ts";
import { METADATA_SCHEMA } from "../../ontology/metadata.ts";
import { ActionError, type ActionContext } from "../types.ts";

type Tank = Selectable<Database["manufacturing.tank"]>;

type ScheduleMaintenanceParams = {
  type: "inspection" | "preventive" | "corrective" | "cleaning";
  /** ISO 8601 datetime; `format: date-time` in the action's parameter_schema. */
  plannedAt: string;
  notes: string;
};

export async function tankScheduleMaintenance(
  tank: Tank,
  params: ScheduleMaintenanceParams,
  ctx: ActionContext,
): Promise<Tank> {
  const plannedAt = new Date(params.plannedAt);
  if (Number.isNaN(plannedAt.getTime())) {
    throw new ActionError(400, `plannedAt "${params.plannedAt}" is not a valid datetime`);
  }

  const fermenting = await ctx.db
    .selectFrom("manufacturing.batch")
    .select("id")
    .where("assigned_tank_id", "=", tank.id)
    .where("status", "=", "fermenting")
    .execute();
  if (fermenting.length > 0) {
    throw new ActionError(
      409,
      `Tank ${tank.id} has a fermenting batch (${fermenting.map((b) => b.id).join(", ")}); ` +
        "it cannot be taken offline for maintenance",
    );
  }

  // Readable id in the seed's style, with a short suffix so two logs for the same
  // tank and day cannot collide on the primary key.
  const logId = `ML-${tank.id}-${plannedAt.toISOString().slice(0, 10)}-${Date.now()
    .toString(36)
    .slice(-4)}`;

  // The status change, the log, and the audit row land together or not at all.
  return await ctx.db.transaction().execute(async (trx) => {
    const updated = await trx
      .updateTable("manufacturing.tank")
      .set({ status: "maintenance" })
      .where("id", "=", tank.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    const log = await trx
      .insertInto("manufacturing.maintenance_log")
      .values({
        id: logId,
        target_type: "tank",
        target_id: tank.id,
        type: params.type,
        status: "scheduled",
        planned_at: plannedAt,
        notes: params.notes,
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
        target_id: tank.id,
        actor: ctx.actor,
        // Explicit rather than the column default: `now()` is the database's
        // clock, which ignores the COURSE_NOW anchor this process runs on.
        created_at: new Date(),
        params: {
          type: params.type,
          plannedAt: plannedAt.toISOString(),
          notes: params.notes,
        },
        result: {
          previousStatus: tank.status,
          status: updated.status,
          maintenanceLogId: log.id,
        },
      })
      .execute();

    return updated;
  });
}
