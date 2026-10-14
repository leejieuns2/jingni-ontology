// The action dispatch table, keyed by `${objectTypeApiName}.${actionApiName}`.
//
// Handlers narrow their own arguments to the row and params they actually work
// with, so each entry is asserted into the registry's wider signature. The
// assertion holds because the route resolves a handler only after matching the
// instance's object type and validating the params against parameter_schema.
import { batchCancel } from "./manufacturing/batchCancel.ts";
import { batchDeferStart } from "./manufacturing/batchDeferStart.ts";
import { batchExtendRest } from "./manufacturing/batchExtendRest.ts";
import { batchFlag } from "./manufacturing/batchFlag.ts";
import { batchNotifyOperator } from "./manufacturing/batchNotifyOperator.ts";
import { batchPlaceOnHold } from "./manufacturing/batchPlaceOnHold.ts";
import { batchScheduleEarlyTransfer } from "./manufacturing/batchScheduleEarlyTransfer.ts";
import { tankScheduleMaintenance } from "./manufacturing/tankScheduleMaintenance.ts";
import { proposalApprove } from "./shared/proposalApprove.ts";
import { proposalEscalate } from "./shared/proposalEscalate.ts";
import { proposalReject } from "./shared/proposalReject.ts";
import type { ActionHandler } from "./types.ts";

export const actionHandlers: Record<string, ActionHandler> = {
  "batch.cancel": batchCancel as unknown as ActionHandler,
  "batch.deferStart": batchDeferStart as unknown as ActionHandler,
  "batch.extendRest": batchExtendRest as unknown as ActionHandler,
  "batch.flag": batchFlag as unknown as ActionHandler,
  "batch.placeOnHold": batchPlaceOnHold as unknown as ActionHandler,
  "batch.scheduleEarlyTransfer": batchScheduleEarlyTransfer as unknown as ActionHandler,
  "batch.notifyOperator": batchNotifyOperator as unknown as ActionHandler,
  "tank.scheduleMaintenance": tankScheduleMaintenance as unknown as ActionHandler,
  // Schema-generic: these two work for any ontology that carries proposals.
  "proposal.approve": proposalApprove as unknown as ActionHandler,
  "proposal.escalate": proposalEscalate as unknown as ActionHandler,
  "proposal.reject": proposalReject as unknown as ActionHandler,
};
