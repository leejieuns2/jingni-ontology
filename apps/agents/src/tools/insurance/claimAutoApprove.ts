// `claim_auto_approve` — invoke Claim.autoApprove through the action route.
//
// Direct, not proposal-mediated: the server-side handler re-validates every
// auto-approval gate (policy active, incident in period, reporting window,
// documents, cited clause limits), so a call that doesn't qualify comes back as
// a 4xx naming the failed gate.
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { describe, errorResult, extractMessage, okResult, ontologyUrl } from "../shared/http.ts";

export const claimAutoApprove = tool(
  "claim_auto_approve",
  [
    "Auto-approve a filed claim: its status becomes `autoApproved`. The server",
    "validates every gate — the claim is filed, its policy exists and is active,",
    "the incident falls inside the policy period, filing was within the reporting",
    "window, documents are complete, and the approved amount is positive, within",
    "the claimed amount, and within a cited clause's limitAmount. A failed gate",
    "comes back as an error naming it, and nothing is approved.",
  ].join(" "),
  {
    claimId: z.string().describe("Primary key of the claim, e.g. `CLM-401`"),
    reason: z.string().describe("The coverage reasoning behind the approval"),
    citedClauseIds: z
      .array(z.string())
      .min(1)
      .describe("CoverageClause ids the approval rests on — the grant and any rider"),
    approvedAmount: z.number().positive().describe("Amount to approve, <= the claimed amount"),
  },
  async ({ claimId, reason, citedClauseIds, approvedAmount }) => {
    const url = `${ontologyUrl}/api/objects/claim/${encodeURIComponent(claimId)}/actions/autoApprove`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason, citedClauseIds, approvedAmount }),
      });
    } catch (cause) {
      return errorResult(
        `Could not reach the ontology service at ${ontologyUrl}: ${describe(cause)}`,
      );
    }

    const text = await response.text();
    if (!response.ok) {
      return errorResult(`autoApprove failed (${response.status}): ${extractMessage(text)}`);
    }

    return okResult(text);
  },
);
