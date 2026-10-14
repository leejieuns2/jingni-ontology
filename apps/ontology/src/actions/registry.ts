// The action dispatch table, keyed by `${objectTypeApiName}.${actionApiName}`.
//
// Handlers narrow their own arguments to the row and params they actually work
// with, so each entry is asserted into the registry's wider signature. The
// assertion holds because the route resolves a handler only after matching the
// instance's object type and validating the params against parameter_schema.
import { batchDeferStart } from "./manufacturing/batchDeferStart.ts";
import { batchNotifyOperator } from "./manufacturing/batchNotifyOperator.ts";
import { tankScheduleMaintenance } from "./manufacturing/tankScheduleMaintenance.ts";
import type { ActionHandler } from "./types.ts";

export const actionHandlers: Record<string, ActionHandler> = {
  "batch.deferStart": batchDeferStart as unknown as ActionHandler,
  "batch.notifyOperator": batchNotifyOperator as unknown as ActionHandler,
  "tank.scheduleMaintenance": tankScheduleMaintenance as unknown as ActionHandler,
};
