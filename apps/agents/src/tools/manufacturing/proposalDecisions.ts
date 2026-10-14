// Proposal decision tools for a reviewing agent: approve, reject, escalate.
//
// All three are thin shells over the proposal action routes. Approve executes
// the proposal's underlying action server-side, so it is the one direct write a
// verification agent carries; escalate is its honest alternative when a material
// concern cannot be resolved from the data.
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { describe, errorResult, extractMessage, okResult, ontologyUrl } from "../shared/http.ts";

async function invokeProposalAction(
  proposalId: number,
  action: "approve" | "reject" | "escalate",
  body: Record<string, unknown>,
) {
  const url = `${ontologyUrl}/api/objects/proposal/${proposalId}/actions/${action}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    return errorResult(
      `Could not reach the ontology service at ${ontologyUrl}: ${describe(cause)}`,
    );
  }

  const text = await response.text();
  if (!response.ok) {
    return errorResult(`${action} failed (${response.status}): ${extractMessage(text)}`);
  }
  return okResult(text);
}

export const proposalApprove = tool(
  "proposal_approve",
  [
    "Approve a pending or escalated proposal. The server immediately executes the",
    "proposal's underlying action; if that action fails, the proposal stays pending",
    "and the error comes back. Approve only when the rationale is sound and the",
    "evidence supports the proposed action.",
  ].join(" "),
  {
    proposalId: z.number().int().describe("The proposal's id"),
    decisionNote: z.string().optional().describe("Why the proposal passes review"),
  },
  async ({ proposalId, decisionNote }) =>
    invokeProposalAction(proposalId, "approve", decisionNote ? { decisionNote } : {}),
);

export const proposalReject = tool(
  "proposal_reject",
  [
    "Reject a pending or escalated proposal. The underlying action never runs.",
    "Reject when the proposal is wrong — not merely uncertain; for unresolved",
    "material concerns, escalate instead.",
  ].join(" "),
  {
    proposalId: z.number().int().describe("The proposal's id"),
    decisionNote: z.string().optional().describe("Why the proposal fails review"),
  },
  async ({ proposalId, decisionNote }) =>
    invokeProposalAction(proposalId, "reject", decisionNote ? { decisionNote } : {}),
);

export const proposalEscalate = tool(
  "proposal_escalate",
  [
    "Escalate a pending proposal for human resolution without approving or",
    "rejecting it. The proposal stays open — a human can still approve or reject it",
    "later. Use when a material assumption in the rationale cannot be verified from",
    "the data; the note must name the unresolved concern.",
  ].join(" "),
  {
    proposalId: z.number().int().describe("The proposal's id"),
    note: z.string().describe("The specific unresolved concern a human must settle"),
  },
  async ({ proposalId, note }) => invokeProposalAction(proposalId, "escalate", { note }),
);
