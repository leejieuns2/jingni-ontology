// Renders the ontology's own metadata into a prompt block.
//
// The agent's tools take API names as strings, so without this it has to spend
// turns guessing them — asking for `Batch`, then `FermentationBatch`, then reading
// a row to see what the properties are called. Handing it the schema up front
// turns that discovery into part of the first prompt.
//
// Everything here comes from the metadata endpoints at request time; nothing knows
// the manufacturing schema exists.
import { extractMessage, ontologyUrl } from "../tools/shared/http.ts";

type TypeSummary = { api_name: string };

type Property = {
  api_name: string;
  data_type: string;
  required: boolean;
  is_primary_key: boolean;
  is_title: boolean;
};

type Link = { apiName: string; targetType: string; sourceType: string; cardinality?: string };

type Action = { api_name: string; description: string | null };

type TypeDetail = {
  objectType: { api_name: string; name: string; description: string | null; instanceCount: number | null };
  properties: Property[];
  links: { outbound: Link[]; inbound: Link[] };
  actions: Action[];
};

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${ontologyUrl}${path}`);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GET ${path} failed (${response.status}): ${extractMessage(text)}`);
  }
  return JSON.parse(text) as T;
}

/**
 * The ontology as text, ready to paste into a system or user prompt.
 *
 * Types are fetched in parallel — there are a handful of them and this runs once
 * per agent start, so the round trips are not worth sequencing.
 */
export async function buildSchemaBlock(): Promise<string> {
  const { data: types } = await getJson<{ data: TypeSummary[] }>("/api/objects/meta/types");

  const details = await Promise.all(
    types.map((type) => getJson<TypeDetail>(`/api/objects/meta/types/${type.api_name}`)),
  );

  const sections = details.map((detail) => renderType(detail));

  // No heading of its own: the caller wraps this in <ontology-schema> tags, which
  // already say what it is.
  return [
    "These are the object types you can read. `type` and `property` arguments take the",
    "API names shown here verbatim — they are case-sensitive.",
    "",
    sections.join("\n"),
  ].join("\n");
}

function renderType(detail: TypeDetail): string {
  const { objectType, properties, links, actions } = detail;

  const lines = [`## ${objectType.api_name}`];

  const count = objectType.instanceCount === null ? "unknown" : String(objectType.instanceCount);
  lines.push(`${objectType.description ?? objectType.name} — ${count} instances`);
  lines.push("");

  lines.push("Properties:");
  for (const property of properties) {
    lines.push(`  ${property.api_name}: ${property.data_type}${propertyFlags(property)}`);
  }

  const allLinks = [
    ...links.outbound.map((link) => ({ link, direction: "→" })),
    ...links.inbound.map((link) => ({ link, direction: "←" })),
  ];
  if (allLinks.length > 0) {
    lines.push("Links:");
    for (const { link, direction } of allLinks) {
      lines.push(`  ${link.apiName} ${direction} ${link.targetType ?? link.sourceType}`);
    }
  }

  if (actions.length > 0) {
    lines.push("Actions:");
    for (const action of actions) {
      lines.push(`  ${action.api_name}${action.description ? ` — ${action.description}` : ""}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

/** Only the flags that change how a property can be used are worth the tokens. */
function propertyFlags(property: Property): string {
  const flags: string[] = [];
  if (property.is_primary_key) flags.push("primary key");
  if (property.is_title) flags.push("title");
  if (property.required) flags.push("required");
  return flags.length > 0 ? ` (${flags.join(", ")})` : "";
}
