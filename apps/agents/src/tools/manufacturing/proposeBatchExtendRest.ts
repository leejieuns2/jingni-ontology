// `propose_batch_extend_rest` — create a Proposal to give a batch more time in
// its current vessel; execute nothing.
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { describe, errorResult, extractMessage, okResult, ontologyUrl } from "../shared/http.ts";
import { proposedAt } from "./proposalDefaults.ts";

export const proposeBatchExtendRest = tool(
  "propose_batch_extend_rest",
  [
    "Propose pushing a batch's planned transfer later by a number of days, keeping",
    "it in its current vessel for more time. This does NOT change anything: it",
    "creates a pending Proposal that a human reviewer approves or rejects. The shift",
    "affects only this batch — it does not cascade to other batches. `batchId` is",
    "the batch's primary key, e.g. `B-2105`. Returns the created Proposal's id.",
  ].join(" "),
  {
    batchId: z.string().describe("Primary key of the batch, e.g. `B-2105`"),
    additionalDays: z
      .number()
      .int()
      .positive()
      .describe("How many days later the planned transfer should move"),
    rationale: z
      .string()
      .describe("Your reasoning for the reviewer: evidence and why more time helps"),
  },
  async ({ batchId, additionalDays, rationale }) => {
    let response: Response;
    try {
      response = await fetch(`${ontologyUrl}/api/objects/proposal`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "batch.extendRest",
          targetId: batchId,
          params: { additionalDays },
          rationale,
          status: "pending",
          proposedBy: "planning-agent",
          proposedAt: proposedAt(),
        }),
      });
    } catch (cause) {
      return errorResult(
        `Could not reach the ontology service at ${ontologyUrl}: ${describe(cause)}`,
      );
    }

    const text = await response.text();
    if (!response.ok) {
      return errorResult(`Proposal creation failed (${response.status}): ${extractMessage(text)}`);
    }

    const created = JSON.parse(text) as { properties?: { id?: number } };
    return okResult(
      JSON.stringify({ proposalId: created.properties?.id ?? null, status: "pending" }),
    );
  },
);
