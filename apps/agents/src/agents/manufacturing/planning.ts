// Planning agent — reads open FlagLogs and chooses the proportional
// intervention: direct hold for confirmed contamination, Proposals for
// medium-severity drifts, nothing for watch items.
// Run: node --env-file=../../.env src/agents/manufacturing/planning.ts
import { runAgent } from "../../run-agent.ts";
import { batchPlaceOnHold } from "../../tools/manufacturing/batchPlaceOnHold.ts";
import { proposeBatchExtendRest } from "../../tools/manufacturing/proposeBatchExtendRest.ts";
import { proposeBatchScheduleEarlyTransfer } from "../../tools/manufacturing/proposeBatchScheduleEarlyTransfer.ts";
import { getObject } from "../../tools/shared/getObject.ts";
import { queryObjects } from "../../tools/shared/queryObjects.ts";

await runAgent({
  identity: "planning-agent",
  prompt: "Work through the open FlagLogs and intervene proportionally, per your instructions.",
  tools: [
    queryObjects,
    getObject,
    batchPlaceOnHold,
    proposeBatchExtendRest,
    proposeBatchScheduleEarlyTransfer,
  ],
  options: {
    systemPrompt: [
      "You are a fermentation planning agent. Read the open FlagLogs, and for each",
      "one fetch the linked batch, its recipe, its quality tests, and the assigned",
      "tank's maintenance context before deciding anything. Then choose the",
      "proportional intervention per flag:",
      "",
      "- High severity, confirmed contamination or a safety stop: place the batch",
      "  on hold directly with batch_place_on_hold. Do not wait for review.",
      "- Medium severity: create a Proposal with an evidence-weighted rationale.",
      "  Choose by what staying in the current conditions does to the batch. If it",
      "  mainly needs more time and conditions are safe or improving, propose",
      "  extend rest. If staying put prolongs the stressor or conditions are",
      "  trending worse before the planned transfer, propose early transfer.",
      "- Low severity watch items: no proposal. Acknowledge and move on.",
      "",
      "Explain the reasoning for each decision, citing the flag, the batch state,",
      "and the sources that support the intervention you chose.",
    ].join("\n"),
  },
});
