// `propose_batch_cancel` — create a Proposal to cancel a batch; execute nothing.
//
// The agent's authority ends at the proposal row: a human reviews it in the
// queue and only their approval runs the underlying `batch.cancel`. The `type`
// field must be the exact case-sensitive handler key, because approval parses it
// to find the action in the registry.
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { describe, errorResult, extractMessage, okResult, ontologyUrl } from "../shared/http.ts";
import { PROPOSED_BY, proposedAt } from "./proposalDefaults.ts";

export const proposeBatchCancel = tool(
  "propose_batch_cancel",
  [
    "Propose cancelling a batch. This does NOT cancel anything: it creates a pending",
    "Proposal that a human reviewer approves or rejects. `batchId` is the batch's",
    "primary key, e.g. `B-2117`. `reason` is the operational reason recorded on the",
    "cancellation itself if approved; `rationale` is your full case for proposing it,",
    "which the reviewer reads. Returns the created Proposal's id.",
  ].join(" "),
  {
    batchId: z.string().describe("Primary key of the batch to propose cancelling, e.g. `B-2117`"),
    reason: z.string().describe("Reason recorded on the cancellation if the proposal is approved"),
    rationale: z
      .string()
      .describe("Your reasoning for the reviewer: evidence, impact, and why cancel over defer"),
  },
  async ({ batchId, reason, rationale }) => {
    let response: Response;
    try {
      response = await fetch(`${ontologyUrl}/api/objects/proposal`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "batch.cancel",
          targetId: batchId,
          params: { reason },
          rationale,
          status: "pending",
          proposedBy: PROPOSED_BY,
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
