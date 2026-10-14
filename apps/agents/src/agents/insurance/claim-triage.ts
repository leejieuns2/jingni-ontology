// Insurance claim triage agent — processes filed auto claims with the same
// clause-chain reasoning as the coverage explanation agent (grant → applicable
// exclusion → policy-specific rider override), then acts: direct auto-approval
// for clear-cut claims, a Proposal for borderline ones, a DataIssue for broken
// data.
// Run: node --env-file=../../.env src/agents/insurance/claim-triage.ts
import { runAgent } from "../../run-agent.ts";
import { claimAutoApprove } from "../../tools/insurance/claimAutoApprove.ts";
import { claimFlagDataIssue } from "../../tools/insurance/claimFlagDataIssue.ts";
import { proposeClaimRequestMoreInfo } from "../../tools/insurance/proposeClaimRequestMoreInfo.ts";
import { getObject } from "../../tools/shared/getObject.ts";
import { queryObjects } from "../../tools/shared/queryObjects.ts";

const CLAIM_IDS = ["CLM-401", "CLM-402", "CLM-403"];

await runAgent({
  identity: "claim-triage-agent",
  prompt: `Triage these claims: ${CLAIM_IDS.join(", ")}.`,
  tools: [queryObjects, getObject, claimAutoApprove, proposeClaimRequestMoreInfo, claimFlagDataIssue],
  options: {
    systemPrompt: [
      "You are a claim triage agent. Read filed auto claims, inspect the policy",
      "and coverage context, and triage each claim. Reason through the clause",
      "chain the way a coverage analyst does: coverage grant → applicable",
      "exclusion → policy-specific rider override. Explain your reasoning and",
      "cite clause ids. Skip claims that are no longer in `filed` status, and do",
      "not repeat work that is already recorded (an existing pending proposal or",
      "open DataIssue for the same concern).",
      "",
      "Auto-approve only when ALL of these are true:",
      "1. the claim, customer, and policy exist;",
      "2. the policy was active on the incident date;",
      "3. coverage is affirmatively established through the clause chain;",
      "4. no undefeated exclusion applies;",
      "5. filedDate - incidentDate is within policy.reportingWindowDays;",
      "6. documentsComplete is true;",
      "7. approvedAmount is within a cited clause's limit;",
      "8. the narrative states the facts needed to decide coverage.",
      "",
      "If driver identity is material and unresolved, do not approve. Propose",
      "`claim.requestMoreInfo` with the specific missing fact.",
      "",
      "If the claim has a broken core reference, such as a nonexistent policy,",
      "call `claim.flagDataIssue` and stop. Do not approve and do not create an",
      "ordinary claim-decision proposal.",
      "",
      "Do not auto-deny. If a claim is clearly excluded, explain that denial",
      "would be a human-mediated action, not a direct auto-action.",
    ].join("\n"),
  },
});
