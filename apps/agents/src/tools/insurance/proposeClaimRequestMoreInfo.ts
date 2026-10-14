// `propose_claim_request_more_info` — create a Proposal to ask the customer for
// a specific missing fact; execute nothing.
//
// Same contract as the manufacturing propose_* tools: the proposal row is where
// the agent's work ends, and `type` carries the exact case-sensitive handler key
// that approval will dispatch.
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { describe, errorResult, extractMessage, okResult, ontologyUrl } from "../shared/http.ts";

export const proposeClaimRequestMoreInfo = tool(
  "propose_claim_request_more_info",
  [
    "Propose moving a filed claim to pendingReview to request specific missing",
    "information from the customer. This does NOT change the claim: it creates a",
    "pending Proposal that a human adjuster approves or rejects. `claimId` is the",
    "claim's primary key, e.g. `CLM-402`. `requestedInfo` must name the specific",
    "missing fact, not a generic request. Returns the created Proposal's id.",
  ].join(" "),
  {
    claimId: z.string().describe("Primary key of the claim, e.g. `CLM-402`"),
    reason: z.string().describe("Why the claim cannot be decided as filed"),
    requestedInfo: z
      .string()
      .describe("The specific fact the customer must provide, e.g. who was driving at impact"),
    rationale: z
      .string()
      .describe("Your full case for the adjuster: the clause chain and what the fact decides"),
  },
  async ({ claimId, reason, requestedInfo, rationale }) => {
    let response: Response;
    try {
      response = await fetch(`${ontologyUrl}/api/objects/proposal`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "claim.requestMoreInfo",
          targetId: claimId,
          params: { reason, requestedInfo },
          rationale,
          status: "pending",
          proposedBy: "claim-triage-agent",
          proposedAt: process.env["COURSE_NOW"] ?? new Date().toISOString(),
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
