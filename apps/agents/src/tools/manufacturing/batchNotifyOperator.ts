// `batch_notify_operator` — invoke Batch.notifyOperator through the action route.
//
// This is an external action: the service sends the message to the batch's
// assigned operator over a webhook. A failed delivery comes back as a 502 — the
// operator was NOT told — so the model must not treat a failure as sent.
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { describe, errorResult, extractMessage, okResult, ontologyUrl } from "../shared/http.ts";

export const batchNotifyOperator = tool(
  "batch_notify_operator",
  [
    "Send a notification message to the operator assigned to a batch, through the",
    "external alerting webhook. `batchId` is the batch's primary key, e.g. `B-2105`.",
    "A batch with no assigned operator comes back as a 409. A delivery failure comes",
    "back as a 502 and means the operator was NOT notified — say so rather than",
    "assuming the message arrived.",
  ].join(" "),
  {
    batchId: z.string().describe("Primary key of the batch whose operator to notify, e.g. `B-2105`"),
    message: z.string().describe("The notification text the operator should receive"),
  },
  async ({ batchId, message }) => {
    const url = `${ontologyUrl}/api/objects/batch/${encodeURIComponent(batchId)}/actions/notifyOperator`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      });
    } catch (cause) {
      return errorResult(
        `Could not reach the ontology service at ${ontologyUrl}: ${describe(cause)}`,
      );
    }

    const text = await response.text();
    if (!response.ok) {
      return errorResult(`notifyOperator failed (${response.status}): ${extractMessage(text)}`);
    }

    return okResult(text);
  },
);
