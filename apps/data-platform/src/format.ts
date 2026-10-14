// Value rendering driven by the ontology's `data_type` vocabulary, so the UI
// never has to guess from the runtime shape of a value.
import type { Instance, PropertyMeta } from "./api.ts";

export const EMPTY = "—";

export function formatValue(value: unknown, dataType: string): string {
  if (value === null || value === undefined) return EMPTY;

  switch (dataType) {
    case "datetime":
    case "timestamp": {
      const date = new Date(String(value));
      return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
    }
    case "number":
    case "double":
    case "integer":
      return typeof value === "number"
        ? value.toLocaleString(undefined, { maximumFractionDigits: 3 })
        : String(value);
    case "boolean":
      return value ? "Yes" : "No";
    case "string[]":
      return Array.isArray(value) && value.length > 0 ? value.join(", ") : EMPTY;
    case "json":
      return JSON.stringify(value);
    default:
      return String(value);
  }
}

/** The property that labels an instance, falling back to its key. */
export function titleProperty(properties: PropertyMeta[]): PropertyMeta | undefined {
  return properties.find((p) => p.is_title) ?? properties.find((p) => p.is_primary_key);
}

export function primaryKeyProperty(properties: PropertyMeta[]): PropertyMeta | undefined {
  return properties.find((p) => p.is_primary_key);
}

/** The label to show for an instance in a list or a link. */
export function instanceLabel(instance: Instance, properties: PropertyMeta[]): string {
  const title = titleProperty(properties);
  const value = title ? instance[title.api_name] : undefined;
  return value === null || value === undefined ? String(instance["id"] ?? EMPTY) : String(value);
}

/** An instance's key, which every route addresses instances by. */
export function instanceId(instance: Instance, properties: PropertyMeta[]): string {
  const pk = primaryKeyProperty(properties);
  return String((pk ? instance[pk.api_name] : undefined) ?? instance["id"] ?? "");
}

/**
 * Flattens a value into text for substring search. Booleans are excluded by the
 * caller, since "true"/"false" matches are noise rather than intent.
 */
export function searchableText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(searchableText).join(" ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Does any searchable property of this instance contain `query`? */
export function matchesQuery(
  instance: Instance,
  properties: PropertyMeta[],
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  return properties.some((property) => {
    if (property.data_type === "boolean") return false;
    return searchableText(instance[property.api_name]).toLowerCase().includes(needle);
  });
}
