// `claim_flag_data_issue` — invoke Claim.flagDataIssue through the action route.
//
// Direct: recording that a claim's core references are broken is a data-quality
// act, not a claim decision, and it should not wait on a review queue.
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { describe, errorResult, extractMessage, okResult, ontologyUrl } from "../shared/http.ts";

export const claimFlagDataIssue = tool(
  "claim_flag_data_issue",
  [
    "Open a DataIssue against a claim recording a broken or inconsistent core",
    "reference — for example a policy id that does not exist. This does NOT",
    "approve, deny, or otherwise resolve the claim; it records the problem for a",
    "human to fix. `claimId` is the claim's primary key, e.g. `CLM-403`.",
  ].join(" "),
  {
    claimId: z.string().describe("Primary key of the claim, e.g. `CLM-403`"),
    reason: z.string().describe("What reference is broken and how it was detected"),
  },
  async ({ claimId, reason }) => {
    const url = `${ontologyUrl}/api/objects/claim/${encodeURIComponent(claimId)}/actions/flagDataIssue`;

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
      return errorResult(`flagDataIssue failed (${response.status}): ${extractMessage(text)}`);
    }

    return okResult(text);
  },
);
