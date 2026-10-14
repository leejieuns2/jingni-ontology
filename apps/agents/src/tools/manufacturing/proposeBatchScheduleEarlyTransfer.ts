// `propose_batch_schedule_early_transfer` — create a Proposal to move a batch
// toward the next stage earlier than planned; execute nothing.
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { describe, errorResult, extractMessage, okResult, ontologyUrl } from "../shared/http.ts";
import { proposedAt } from "./proposalDefaults.ts";

export const proposeBatchScheduleEarlyTransfer = tool(
  "propose_batch_schedule_early_transfer",
  [
    "Propose moving a batch's planned transfer earlier, advancing it toward the",
    "next stage ahead of schedule. For cases where staying in the current vessel or",
    "conditions is itself the risk. This does NOT change anything: it creates a",
    "pending Proposal that a human reviewer approves or rejects. The action rewrites",
    "only this batch's planned transfer date and does not check or reserve a",
    "destination vessel. `batchId` is the batch's primary key, e.g. `B-2179`.",
    "Returns the created Proposal's id.",
  ].join(" "),
  {
    batchId: z.string().describe("Primary key of the batch, e.g. `B-2179`"),
    plannedAt: z
      .string()
      .describe(
        "Proposed transfer time, ISO 8601 datetime — must be earlier than the current plan",
      ),
    rationale: z
      .string()
      .describe("Your reasoning for the reviewer: evidence and why moving early helps"),
  },
  async ({ batchId, plannedAt, rationale }) => {
    let response: Response;
    try {
      response = await fetch(`${ontologyUrl}/api/objects/proposal`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "batch.scheduleEarlyTransfer",
          targetId: batchId,
          params: { plannedAt },
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
