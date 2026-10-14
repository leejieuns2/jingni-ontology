// Invoke a registered action handler by its registry key, outside the HTTP
// route. Used by Proposal.approve to run the action a proposal describes,
// building the same ActionContext the invoke route would.
import type { Kysely } from "kysely";
import type { Database } from "../db.ts";
import {
  datasourceOf,
  findActionType,
  findObjectType,
  loadProperties,
  primaryKeyColumn,
  selectRowById,
} from "../ontology/metadata.ts";
import { actionHandlers } from "./registry.ts";
import { ActionError } from "./types.ts";

type DispatchInput = {
  /** Registry key, case-sensitive: `<objectTypeApiName>.<actionApiName>`. */
  handlerKey: string;
  targetId: string;
  params: Record<string, unknown>;
  /** Recorded as the inner action's actor. */
  callerIdentity: string;
  /** Proposal id, recorded on the inner action's audit row. */
  authorizedByProposal: string;
};

export async function dispatchAction(
  db: Kysely<Database>,
  { handlerKey, targetId, params, callerIdentity, authorizedByProposal }: DispatchInput,
): Promise<Record<string, unknown>> {
  const handler = actionHandlers[handlerKey];
  if (!handler) {
    throw new ActionError(400, `No action handler registered for "${handlerKey}"`);
  }

  // The key is "<typeApiName>.<actionApiName>"; neither half contains a dot.
  const dot = handlerKey.indexOf(".");
  const typeApiName = handlerKey.slice(0, dot);
  const actionApiName = handlerKey.slice(dot + 1);

  const type = await findObjectType(db, typeApiName);
  if (!type) {
    throw new ActionError(400, `Unknown object type "${typeApiName}" in "${handlerKey}"`);
  }
  const action = await findActionType(db, type.id, actionApiName);
  if (!action) {
    throw new ActionError(400, `${typeApiName} has no action "${actionApiName}"`);
  }

  const properties = await loadProperties(db, type.id);
  const instance = await selectRowById(db, datasourceOf(type), primaryKeyColumn(properties), targetId);
  if (!instance) {
    throw new ActionError(404, `${typeApiName} "${targetId}" not found`);
  }

  return handler(instance, params, {
    db,
    action: { id: action.id, apiName: action.api_name },
    objectType: { id: type.id, apiName: type.api_name },
    targetId,
    actor: callerIdentity,
    callerIdentity,
    authorizedByProposal,
  });
}
