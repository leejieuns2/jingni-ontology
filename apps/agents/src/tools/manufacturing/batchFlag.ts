// `batch_flag` — invoke Batch.flag through the action route.
//
// The mildest write available to an agent: it opens a FlagLog for review and
// changes nothing about the batch itself.
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { describe, errorResult, extractMessage, okResult, ontologyUrl } from "../shared/http.ts";

export const batchFlag = tool(
  "batch_flag",
  [
    "Raise a flag against a batch for review. This creates an open FlagLog recording",
    "the reason and severity; it does NOT change the batch's status or schedule.",
    "`batchId` is the batch's primary key, e.g. `B-2203`. Severity: `low` for",
    "acceptable watch-only drifts, `medium` for drifts likely needing intervention,",
    "`high` for confirmed contamination or a safety hold.",
  ].join(" "),
  {
    batchId: z.string().describe("Primary key of the batch to flag, e.g. `B-2203`"),
    reason: z
      .string()
      .describe("What was observed and the evidence for it, quoting sources where possible"),
    severity: z.enum(["low", "medium", "high"]).describe("How urgent the drift is"),
  },
  async ({ batchId, reason, severity }) => {
    const url = `${ontologyUrl}/api/objects/batch/${encodeURIComponent(batchId)}/actions/flag`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason, severity }),
      });
    } catch (cause) {
      return errorResult(
        `Could not reach the ontology service at ${ontologyUrl}: ${describe(cause)}`,
      );
    }

    const text = await response.text();
    if (!response.ok) {
      return errorResult(`flag failed (${response.status}): ${extractMessage(text)}`);
    }

    return okResult(text);
  },
);
