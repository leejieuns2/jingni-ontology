// Batch.flag — raise an open FlagLog against a batch.
//
// Deliberately the mildest write in the system: it changes nothing about the
// batch itself, it only records that something needs human or planning-agent
// attention. The severity vocabulary is enforced by the parameter_schema; the
// domain leaves nothing else to validate.
import type { Selectable } from "kysely";
import type { Database } from "../../db.ts";
import { METADATA_SCHEMA } from "../../ontology/metadata.ts";
import type { ActionContext } from "../types.ts";

type Batch = Selectable<Database["manufacturing.batch"]>;

type FlagParams = {
  reason: string;
  severity: "low" | "medium" | "high";
};

export async function batchFlag(
  batch: Batch,
  params: FlagParams,
  ctx: ActionContext,
): Promise<Batch> {
  // Pinned server clock: the process runs with its clock anchored to COURSE_NOW.
  const flaggedAt = new Date();
  const actor = ctx.callerIdentity ?? "system";

  // Readable id in the seed's style, with a short suffix so two flags on the
  // same batch and day cannot collide on the primary key.
  const flagId = `FL-${batch.id}-${flaggedAt.toISOString().slice(0, 10)}-${Date.now()
    .toString(36)
    .slice(-4)}`;

  // The flag and its audit row land together or not at all.
  await ctx.db.transaction().execute(async (trx) => {
    const flag = await trx
      .insertInto("manufacturing.flag_log")
      .values({
        id: flagId,
        batch_id: batch.id,
        reason: params.reason,
        severity: params.severity,
        status: "open",
        flagged_by: actor,
        flagged_at: flaggedAt,
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
        target_id: batch.id,
        actor,
        authorized_by_proposal: ctx.authorizedByProposal ?? null,
        created_at: flaggedAt,
        params: { reason: params.reason, severity: params.severity },
        result: {
          flagLogId: flag.id,
          status: flag.status,
          batchStatus: batch.status,
        },
      })
      .execute();
  });

  // The batch itself is untouched; the flag travels in the audit entry.
  return batch;
}
