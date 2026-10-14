// The action dispatch table, keyed by `${objectTypeApiName}.${actionApiName}`.
//
// Handlers narrow their own arguments to the row and params they actually work
// with, so each entry is asserted into the registry's wider signature. The
// assertion holds because the route resolves a handler only after matching the
// instance's object type and validating the params against parameter_schema.
import { batchCancel } from "./manufacturing/batchCancel.ts";
import { batchDeferStart } from "./manufacturing/batchDeferStart.ts";
import { batchNotifyOperator } from "./manufacturing/batchNotifyOperator.ts";
import { tankScheduleMaintenance } from "./manufacturing/tankScheduleMaintenance.ts";
import { proposalApprove } from "./shared/proposalApprove.ts";
import { proposalReject } from "./shared/proposalReject.ts";
import type { ActionHandler } from "./types.ts";

export const actionHandlers: Record<string, ActionHandler> = {
  "batch.cancel": batchCancel as unknown as ActionHandler,
  "batch.deferStart": batchDeferStart as unknown as ActionHandler,
  "batch.notifyOperator": batchNotifyOperator as unknown as ActionHandler,
  "tank.scheduleMaintenance": tankScheduleMaintenance as unknown as ActionHandler,
  // Schema-generic: these two work for any ontology that carries proposals.
  "proposal.approve": proposalApprove as unknown as ActionHandler,
  "proposal.reject": proposalReject as unknown as ActionHandler,
};
