// `propose_batch_defer_start` — create a Proposal to defer a batch's start;
// execute nothing.
//
// Same contract as propose_batch_cancel: the proposal row is where the agent's
// work ends, and `type` carries the exact case-sensitive handler key that
// approval will dispatch.
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { describe, errorResult, extractMessage, okResult, ontologyUrl } from "../shared/http.ts";
import { PROPOSED_BY, proposedAt } from "./proposalDefaults.ts";

export const proposeBatchDeferStart = tool(
  "propose_batch_defer_start",
  [
    "Propose postponing a queued batch's planned start. This does NOT defer anything:",
    "it creates a pending Proposal that a human reviewer approves or rejects.",
    "`batchId` is the batch's primary key, e.g. `B-2125`. `newPlannedStart` is the",
    "ISO 8601 datetime the start would move to if approved. `rationale` is your full",
    "case for the reviewer. Returns the created Proposal's id.",
  ].join(" "),
  {
    batchId: z.string().describe("Primary key of the batch to propose deferring, e.g. `B-2125`"),
    newPlannedStart: z
      .string()
      .describe("Proposed new start, ISO 8601 datetime — e.g. `2026-05-15T00:00:00Z`"),
    rationale: z
      .string()
      .describe("Your reasoning for the reviewer: evidence, impact, and why this date"),
  },
  async ({ batchId, newPlannedStart, rationale }) => {
    let response: Response;
    try {
      response = await fetch(`${ontologyUrl}/api/objects/proposal`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "batch.deferStart",
          targetId: batchId,
          params: { newPlannedStart },
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
