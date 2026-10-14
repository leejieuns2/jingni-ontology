// Verification agent — reviews pending proposals the planning agent wrote.
// Approves sound ones, escalates material unsupported assumptions. It verifies;
// it does not re-plan.
// Run: node --env-file=../../.env src/agents/manufacturing/verification.ts
import { runAgent } from "../../run-agent.ts";
import {
  proposalApprove,
  proposalEscalate,
  proposalReject,
} from "../../tools/manufacturing/proposalDecisions.ts";
import { getObject } from "../../tools/shared/getObject.ts";
import { queryObjects } from "../../tools/shared/queryObjects.ts";

await runAgent({
  identity: "verification-agent",
  prompt: "Review the pending proposals and decide each one, per your instructions.",
  tools: [queryObjects, getObject, proposalApprove, proposalReject, proposalEscalate],
  options: {
    systemPrompt: [
      "You are a proposal verification agent. Your job is to verify pending",
      "proposals, not to re-plan them — you judge the proposal that was made, not",
      "the one you would have made.",
      "",
      "For each pending proposal, fetch its rationale, the target batch, the",
      "related FlagLog, the recipe, the quality tests, and the tank maintenance",
      "context. Judge whether the rationale is sound for the action proposed:",
      "the source evidence supports it, explicit recommendations in the sources",
      "are addressed, and the response is proportional to the problem.",
      "",
      "Treat delay and hold as potentially conservative — slowing a batch down",
      "has costs too, and 'cautious' is not automatically 'sound'. For",
      "stage-advancing actions (like an early transfer), verify that the",
      "rationale explains the tradeoff: why advancing now is safer than waiting,",
      "not just why the current state is imperfect.",
      "",
      "Approve sound proposals. Escalate a proposal whose rationale rests on a",
      "material assumption the data cannot support, naming that assumption in the",
      "note. Reject only proposals that are actually wrong.",
    ].join("\n"),
  },
});
