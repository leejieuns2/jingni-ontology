// `get_object` — one instance by id, with its links resolved one hop out.
//
// A thin shell over GET /api/objects/:type/:id. Where `query_objects` finds rows,
// this one reads a row you already have the id for and follows its relationships,
// so it is the cheaper call once an id is known.
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { describe, errorResult, extractMessage, okResult, ontologyUrl } from "./http.ts";

export const getObject = tool(
  "get_object",
  [
    "Read a single ontology object by id, together with its linked objects one hop",
    "out in both directions.",
    "`type` takes the object type's API name, case-sensitive and lowerCamelCase:",
    "`batch`, not `Batch`. `id` is the object's primary key, e.g. `B-2105`.",
    "Returns the object's properties plus a `links` map; each entry names the link,",
    "its direction and cardinality, and carries the related object or list of objects.",
    "An unknown type or id comes back as a 404 saying which one was not found.",
    "Use query_objects instead when you need to search for objects rather than",
    "fetch one whose id you already know.",
  ].join(" "),
  {
    type: z
      .string()
      .describe("API name of the object type, lowerCamelCase — e.g. `batch`"),
    id: z.string().describe("Primary key of the object to read, e.g. `B-2105`"),
  },
  async ({ type, id }) => {
    const url = `${ontologyUrl}/api/objects/${encodeURIComponent(type)}/${encodeURIComponent(id)}`;

    let response: Response;
    try {
      response = await fetch(url);
    } catch (cause) {
      // The service being down is not something the model can fix by retrying
      // with different arguments, so say what failed rather than just "error".
      return errorResult(
        `Could not reach the ontology service at ${ontologyUrl}: ${describe(cause)}`,
      );
    }

    const text = await response.text();
    if (!response.ok) {
      return errorResult(`Read failed (${response.status}): ${extractMessage(text)}`);
    }

    return okResult(text);
  },
);
