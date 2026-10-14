// `batch_defer_start` — invoke Batch.deferStart through the action route.
//
// A thin shell over POST /api/objects/batch/:id/actions/deferStart: the service
// validates the params against the action's parameter_schema and enforces the
// domain rules (only a queued batch, only a future date), so a rejected call
// comes back as a 4xx whose message is handed straight to the model.
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { describe, errorResult, extractMessage, okResult, ontologyUrl } from "../shared/http.ts";

export const batchDeferStart = tool(
  "batch_defer_start",
  [
    "Postpone a queued batch's planned start date.",
    "`batchId` is the batch's primary key, e.g. `B-2126`. `newPlannedStart` is an",
    "ISO 8601 datetime and must be in the future. Only a batch whose status is",
    "`queued` can be deferred; anything else comes back as a 409 saying why.",
  ].join(" "),
  {
    batchId: z.string().describe("Primary key of the batch to defer, e.g. `B-2126`"),
    newPlannedStart: z
      .string()
      .describe("New planned start, ISO 8601 datetime — e.g. `2026-05-08T00:00:00Z`"),
  },
  async ({ batchId, newPlannedStart }) => {
    const url = `${ontologyUrl}/api/objects/batch/${encodeURIComponent(batchId)}/actions/deferStart`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newPlannedStart }),
      });
    } catch (cause) {
      return errorResult(
        `Could not reach the ontology service at ${ontologyUrl}: ${describe(cause)}`,
      );
    }

    const text = await response.text();
    if (!response.ok) {
      return errorResult(`deferStart failed (${response.status}): ${extractMessage(text)}`);
    }

    return okResult(text);
  },
);
