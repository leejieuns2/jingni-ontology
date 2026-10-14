// Batch.cancel — stop a batch before or during fermentation.
//
// The route has already validated the params against the action's
// parameter_schema, so what is left here is the domain rule (only a queued or
// fermenting batch can be cancelled) and the write itself. The reason travels
// into the audit entry, which is the record a reviewer later reads.
import type { Selectable } from "kysely";
import type { Database } from "../../db.ts";
import { METADATA_SCHEMA } from "../../ontology/metadata.ts";
import { ActionError, type ActionContext } from "../types.ts";

type Batch = Selectable<Database["manufacturing.batch"]>;

type CancelParams = {
  reason: string;
};

const CANCELLABLE = new Set(["queued", "fermenting"]);

export async function batchCancel(
  batch: Batch,
  params: CancelParams,
  ctx: ActionContext,
): Promise<Batch> {
  if (!CANCELLABLE.has(batch.status)) {
    throw new ActionError(
      409,
      `Batch ${batch.id} is "${batch.status}"; only a queued or fermenting batch can be cancelled`,
    );
  }

  // The update and its audit row land together or not at all.
  return await ctx.db.transaction().execute(async (trx) => {
    const updated = await trx
      .updateTable("manufacturing.batch")
      .set({ status: "cancelled" })
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
        result: {
          previousStatus: batch.status,
          status: updated.status,
        },
      })
      .execute();

    return updated;
  });
}
