// Batch.notifyOperator — an external action: send a message to the batch's
// assigned operator through a webhook.
//
// Unlike the local actions this one has two systems that can fail independently:
// our database and the webhook on the other end. So it follows the log-first
// pattern — a `notification_attempted` audit row is written BEFORE the external
// call, then a `notification_succeeded` or `notification_failed` row after it.
// If the process dies mid-call, the attempted row is the evidence that a
// notification may have gone out. The rows are deliberately not wrapped in one
// transaction: rolling back the attempted row on failure would erase exactly the
// record that matters.
//
// The payload carries an idempotency key so the receiving side can drop a
// duplicate if a retry re-sends a notification that actually arrived.
import type { Selectable } from "kysely";
import type { Database } from "../../db.ts";
import { METADATA_SCHEMA } from "../../ontology/metadata.ts";
import { ActionError, type ActionContext } from "../types.ts";

type Batch = Selectable<Database["manufacturing.batch"]>;

type NotifyOperatorParams = {
  message: string;
};

export async function batchNotifyOperator(
  batch: Batch,
  params: NotifyOperatorParams,
  ctx: ActionContext,
): Promise<Batch> {
  const webhookUrl = process.env["WEBHOOK_URL"];
  if (!webhookUrl) {
    throw new ActionError(502, "WEBHOOK_URL is not configured; cannot send notifications");
  }

  if (!batch.assigned_operator_id) {
    throw new ActionError(409, `Batch ${batch.id} has no assigned operator to notify`);
  }
  const operator = await ctx.db
    .selectFrom("manufacturing.operator")
    .selectAll()
    .where("id", "=", batch.assigned_operator_id)
    .executeTakeFirst();
  if (!operator) {
    throw new ActionError(409, `Operator "${batch.assigned_operator_id}" not found`);
  }

  const timestamp = new Date();
  const idempotencyKey = `${batch.id}_${ctx.action.id}_${timestamp.getTime()}`;
  const payload = {
    idempotency_key: idempotencyKey,
    batchId: batch.id,
    operatorName: operator.name,
    message: params.message,
    timestamp: timestamp.toISOString(),
  };

  // Log-first: the attempted row must survive even if the call or process dies.
  await writeAudit(ctx, batch.id, params, {
    status: "notification_attempted",
    idempotencyKey,
    operator: operator.name,
  });

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`webhook responded ${response.status}`);
    }
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    await writeAudit(ctx, batch.id, params, {
      status: "notification_failed",
      idempotencyKey,
      error,
    });
    // This notification is treated as critical: the caller must see the failure
    // so it can retry or escalate, rather than believe the operator was told.
    throw new ActionError(502, `Notification to ${operator.name} failed: ${error}`);
  }

  await writeAudit(ctx, batch.id, params, {
    status: "notification_succeeded",
    idempotencyKey,
    operator: operator.name,
  });

  // Nothing on the batch itself changes; the side effect lives outside the system.
  return batch;
}

function writeAudit(
  ctx: ActionContext,
  batchId: string,
  params: NotifyOperatorParams,
  result: Record<string, unknown>,
): Promise<unknown> {
  return ctx.db
    .withSchema(METADATA_SCHEMA)
    .insertInto("audit_log")
    .values({
      action_type_id: ctx.action.id,
      action_api_name: ctx.action.apiName,
      target_type_id: ctx.objectType.id,
      target_type_api_name: ctx.objectType.apiName,
      target_id: batchId,
      actor: ctx.actor,
      // Explicit rather than the column default: `now()` is the database's
      // clock, which ignores the COURSE_NOW anchor this process runs on.
      created_at: new Date(),
      params: { message: params.message },
      result,
    })
    .execute();
}
