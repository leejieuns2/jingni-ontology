// `query_objects` — filtered reads against the ontology service.
//
// The tool is a thin shell over POST /api/objects/:type/query: the service owns
// validation, so anything the caller gets wrong comes back as a 400 whose message
// names the offending path, and that message is handed straight to the model to
// retry with. Nothing here knows the manufacturing schema — the type and property
// names travel as strings and are resolved against metadata server-side.
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { describe, errorResult, extractMessage, okResult, ontologyUrl } from "./http.ts";

// Mirrors FILTER_OPS in apps/ontology/src/ontology/metadata.ts. The two apps are
// separate workspaces with no shared package, so this list is duplicated across
// the HTTP boundary on purpose; the service rejects anything it does not know.
const FILTER_OPS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "contains",
  "isNull",
  "isNotNull",
] as const;

const filterValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string(), z.number(), z.boolean()])),
]);

export const queryObjects = tool(
  "query_objects",
  [
    "Read instances of an ontology object type, optionally filtered.",
    "Filters are combined with AND.",
    "`type` and `property` take API names, which are case-sensitive and lowerCamelCase:",
    "`batch`, not `Batch` or `FermentationBatch`; `assignedTankId`, not `assigned_tank_id`.",
    "An unknown name comes back as a 400 or 404 saying so; to learn a type's properties,",
    "read one row with no filters and look at the keys.",
    "`in` takes an array value; `isNull` and `isNotNull` take no value;",
    "`contains` tests array membership on array properties and a case-insensitive",
    "substring match on everything else.",
    "Results are capped: 100 by default, 1000 at most, and a larger `limit` is clamped",
    "to that rather than honoured. The response echoes the effective `limit`; when",
    "`truncated` is true, narrow the filters instead of assuming you saw every row.",
  ].join(" "),
  {
    type: z
      .string()
      .describe("API name of the object type to read, lowerCamelCase — e.g. `batch`"),
    filters: z
      .array(
        z.object({
          property: z.string().describe("API name of the property to filter on"),
          op: z.enum(FILTER_OPS).describe("Comparison operator"),
          value: filterValue
            .optional()
            .describe("Value to compare against; omit for isNull/isNotNull, array for in"),
        }),
      )
      .optional()
      .describe("Filters to AND together. Omit to read every instance (still capped)."),
    limit: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Maximum rows to return; defaults to 100 and is clamped to 1000"),
  },
  async ({ type, filters, limit }) => {
    // Built key by key: the tsconfig runs exactOptionalPropertyTypes, and an
    // explicit `"limit": undefined` would serialise to nothing useful anyway.
    const body: Record<string, unknown> = {};
    if (filters !== undefined) body["filters"] = filters;
    if (limit !== undefined) body["limit"] = limit;

    const url = `${ontologyUrl}/api/objects/${encodeURIComponent(type)}/query`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (cause) {
      // The service being down is not something the model can fix by retrying
      // with different arguments, so say what failed rather than just "error".
      return errorResult(
        `Could not reach the ontology service at ${ontologyUrl}: ${describe(cause)}`,
      );
    }

    const text = await response.text();
    if (!response.ok) {
      return errorResult(`Query failed (${response.status}): ${extractMessage(text)}`);
    }

    return okResult(text);
  },
);
