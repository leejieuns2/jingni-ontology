// Thin client over the ontology API. The shapes here mirror what the routes in
// apps/ontology return; Vite proxies /api to that service in dev.

export type ObjectTypeMeta = {
  id: string;
  api_name: string;
  name: string;
  description: string | null;
  status: string | null;
  visibility: string | null;
  point_of_contact: string | null;
  edits_enabled: boolean;
  schema: string | null;
  datasource_table: string | null;
  /** null when the type's datasource could not be counted. */
  instanceCount: number | null;
};

export type PropertyMeta = {
  id: string;
  api_name: string;
  name: string;
  data_type: string;
  required: boolean;
  is_title: boolean;
  is_primary_key: boolean;
  datasource_column: string | null;
};

export type LinkMeta = {
  id: string;
  apiName: string;
  name: string;
  inverseApiName: string;
  inverseName: string;
  sourceType: string;
  targetType: string;
  cardinality: string;
  viaProperty: string | null;
};

export type ActionMeta = {
  id: string;
  api_name: string;
  name: string;
  description: string | null;
  parameter_schema: JsonSchema | null;
};

/** Only the parts of JSON Schema the action form understands. */
export type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  format?: string;
  description?: string;
  title?: string;
  minimum?: number;
  maximum?: number;
};

export type TypeBundle = {
  objectType: ObjectTypeMeta;
  properties: PropertyMeta[];
  links: { outbound: LinkMeta[]; inbound: LinkMeta[] };
  actions: ActionMeta[];
};

export type Instance = Record<string, unknown>;

export type InstanceList = {
  type: string;
  count: number;
  data: Instance[];
};

export type ResolvedLink = {
  name: string;
  direction: "outbound" | "inbound";
  type: string;
  cardinality: string;
  value?: Instance | Instance[] | null;
  error?: string;
};

export type InstanceDetail = {
  type: string;
  id: string;
  properties: Instance;
  links: Record<string, ResolvedLink>;
};

export type AuditEntry = {
  id: string;
  action: string;
  /** Current display name, null if the action type no longer exists. */
  actionName: string | null;
  actor: string | null;
  params: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  timestamp: string;
};

export type AuditList = {
  type: string;
  id: string;
  count: number;
  data: AuditEntry[];
};

export type ActionResult = {
  action: string;
  type: string;
  id: string;
  properties: Instance;
};

/** Rejects with the API's own error message so callers can surface it verbatim. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(
    path,
    init?.body
      ? { ...init, headers: { "content-type": "application/json", ...init.headers } }
      : init,
  );

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  return payload as T;
}

export function listTypes(): Promise<{ count: number; data: ObjectTypeMeta[] }> {
  return request("/api/objects/meta/types");
}

export function getTypeBundle(apiName: string): Promise<TypeBundle> {
  return request(`/api/objects/meta/types/${encodeURIComponent(apiName)}`);
}

export function patchType(
  apiName: string,
  updates: { name?: string; description?: string | null },
): Promise<ObjectTypeMeta> {
  return request(`/api/objects/meta/types/${encodeURIComponent(apiName)}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

/** `filters` keys are property api_names; the route rejects anything else. */
export function listInstances(
  apiName: string,
  filters?: Record<string, string>,
): Promise<InstanceList> {
  const query = filters ? `?${new URLSearchParams(filters).toString()}` : "";
  return request(`/api/objects/${encodeURIComponent(apiName)}${query}`);
}

export function listAudit(apiName: string, id: string): Promise<AuditList> {
  return request(
    `/api/objects/${encodeURIComponent(apiName)}/${encodeURIComponent(id)}/audit`,
  );
}

export function getInstance(apiName: string, id: string): Promise<InstanceDetail> {
  return request(`/api/objects/${encodeURIComponent(apiName)}/${encodeURIComponent(id)}`);
}

/**
 * Approve or reject a proposal. The decision travels with a caller identity so
 * the audit trail records who clicked, not an anonymous browser.
 */
export function decideProposal(
  id: number,
  decision: "approve" | "reject",
  decisionNote?: string,
): Promise<ActionResult> {
  return request(`/api/objects/proposal/${id}/actions/${decision}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-caller-identity": "brewmaster-lee",
    },
    body: JSON.stringify(decisionNote ? { decisionNote } : {}),
  });
}

export function invokeAction(
  apiName: string,
  id: string,
  actionName: string,
  params: Record<string, unknown>,
): Promise<ActionResult> {
  return request(
    `/api/objects/${encodeURIComponent(apiName)}/${encodeURIComponent(id)}/actions/${encodeURIComponent(actionName)}`,
    { method: "POST", body: JSON.stringify(params) },
  );
}
