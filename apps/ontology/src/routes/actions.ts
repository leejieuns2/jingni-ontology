// Action invocation. The route is generic: it resolves metadata, enforces the
// action's parameter_schema, then hands off to a registered handler.
import { Validator, type Schema } from "@cfworker/json-schema";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { actionHandlers } from "../actions/registry.ts";
import { db } from "../db.ts";
import {
  datasourceOf,
  findActionType,
  loadProperties,
  meta,
  primaryKeyColumn,
  projectRow,
  requireObjectType,
  selectRowById,
} from "../ontology/metadata.ts";

export const actionRoutes = new Hono();

actionRoutes.post("/:type/:id/actions/:actionName", async (c) => {
  const id = c.req.param("id");
  const actionName = c.req.param("actionName");

  const type = await requireObjectType(db, c.req.param("type"));
  const ds = datasourceOf(type);
  const properties = await loadProperties(db, type.id);

  const instance = await selectRowById(db, ds, primaryKeyColumn(properties), id);
  if (!instance) {
    throw new HTTPException(404, { message: `${type.api_name} "${id}" not found` });
  }

  const action = await findActionType(db, type.id, actionName);
  if (!action) {
    throw new HTTPException(404, {
      message: `${type.api_name} has no action "${actionName}"`,
    });
  }

  // Access check, before the body is even validated. An unidentified caller is
  // checked as "system" — absence of a header is not a free pass. Both outcomes
  // are logged: an investigation needs to see attempts, not just successes.
  const headerIdentity = c.req.header("x-caller-identity");
  const accessIdentity = headerIdentity ?? "system";
  const restricted = (action.allowed_callers?.length ?? 0) > 0;
  const allowed = !restricted || action.allowed_callers!.includes(accessIdentity);
  await meta(db)
    .insertInto("access_log")
    .values({
      caller_identity: accessIdentity,
      action_type: action.api_name,
      target_type: type.api_name,
      target_id: id,
      decision: allowed ? "allowed" : "denied",
      reason: !restricted
        ? "action is unrestricted"
        : allowed
          ? "caller is in allowed_callers"
          : `caller is not in allowed_callers [${action.allowed_callers!.join(", ")}]`,
      // Explicit rather than the column default: `now()` is the database's
      // clock, which ignores the COURSE_NOW anchor this process runs on.
      timestamp: new Date(),
    })
    .execute();
  if (!allowed) {
    throw new HTTPException(403, {
      message: `"${accessIdentity}" is not allowed to invoke ${type.api_name}.${action.api_name}`,
    });
  }

  const params = action.parameter_schema
    ? validateParams(action.parameter_schema, await readBody(c.req.raw), actionName)
    : undefined;

  const handler = actionHandlers[`${type.api_name}.${action.api_name}`];
  if (!handler) {
    throw new HTTPException(501, {
      message: `No handler registered for ${type.api_name}.${action.api_name}`,
    });
  }

  const callerIdentity = headerIdentity;
  const updated = await handler(instance, params, {
    db,
    action: { id: action.id, apiName: action.api_name },
    objectType: { id: type.id, apiName: type.api_name },
    targetId: id,
    // audit_log.actor is NOT NULL: every action is attributed to someone, and an
    // unidentified caller is recorded as such rather than as a missing value.
    actor: callerIdentity ?? "unknown",
    ...(callerIdentity !== undefined && { callerIdentity }),
  });

  return c.json({
    action: action.api_name,
    type: type.api_name,
    id,
    properties: projectRow(properties, updated),
  });
});

/** An absent or empty body is an empty parameter object, not a parse error. */
async function readBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HTTPException(400, { message: "Request body is not valid JSON" });
  }
}

function validateParams(
  parameterSchema: Record<string, unknown>,
  body: unknown,
  actionName: string,
): Record<string, unknown> {
  // parameter_schema is jsonb, so it is `Record<string, unknown>` here; the
  // asserted `Schema` is the same object, just described structurally.
  const result = new Validator(parameterSchema as Schema).validate(body);
  if (!result.valid) {
    throw new HTTPException(400, {
      message: `Invalid parameters for "${actionName}": ${result.errors
        .map((e) => `${e.instanceLocation} ${e.error}`)
        .join("; ")}`,
    });
  }
  return body as Record<string, unknown>;
}
