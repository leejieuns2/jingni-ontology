// `batch_place_on_hold` — invoke Batch.placeOnHold through the action route.
//
// Direct, not proposal-mediated: a hold is the stop-the-line response to a
// confirmed contamination or safety stop, where waiting for review is the risk.
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { describe, errorResult, extractMessage, okResult, ontologyUrl } from "../shared/http.ts";

export const batchPlaceOnHold = tool(
  "batch_place_on_hold",
  [
    "Place a batch on hold immediately: its status becomes `onHold` and production",
    "on it stops pending investigation. Only a fermenting or conditioning batch can",
    "be held; anything else comes back as a 409. `batchId` is the batch's primary",
    "key, e.g. `B-2203`. This executes directly — reserve it for confirmed",
    "contamination or safety stops.",
  ].join(" "),
  {
    batchId: z.string().describe("Primary key of the batch to hold, e.g. `B-2203`"),
    reason: z.string().describe("The confirmed finding that requires stopping the batch"),
  },
  async ({ batchId, reason }) => {
    const url = `${ontologyUrl}/api/objects/batch/${encodeURIComponent(batchId)}/actions/placeOnHold`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
    } catch (cause) {
      return errorResult(
        `Could not reach the ontology service at ${ontologyUrl}: ${describe(cause)}`,
      );
    }

    const text = await response.text();
    if (!response.ok) {
      return errorResult(`placeOnHold failed (${response.status}): ${extractMessage(text)}`);
    }

    return okResult(text);
  },
);
