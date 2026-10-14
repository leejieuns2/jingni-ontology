// The contract between the action route and the handlers. Kept separate from
// the registry so handlers can import it without an import cycle.
import type { Kysely } from "kysely";
import type { Database } from "../db.ts";

/** Everything a handler needs beyond its instance and params. */
export type ActionContext = {
  db: Kysely<Database>;
  /** Metadata identity of the action, for the audit trail's dual snapshot. */
  action: { id: string; apiName: string };
  objectType: { id: string; apiName: string };
  targetId: string;
  actor: string;
};

/**
 * A handler receives the instance it was invoked on, the validated params (absent
 * for actions that take none), and the context. It returns the updated raw row,
 * which the route projects through the type's properties before responding.
 *
 * Shape validation already happened in the route, against the action's
 * parameter_schema, so a handler only deals with business rules and the write.
 */
export type ActionHandler = (
  instance: Record<string, unknown>,
  params: Record<string, unknown> | undefined,
  ctx: ActionContext,
) => Promise<Record<string, unknown>>;

/** A rejected business rule. The route maps this onto an HTTP status. */
export class ActionError extends Error {
  readonly status: 400 | 404 | 409;

  constructor(status: 400 | 404 | 409, message: string) {
    super(message);
    this.name = "ActionError";
    this.status = status;
  }
}
