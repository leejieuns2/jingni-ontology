// Fermentation health monitoring agent — scans fermenting batches and raises
// FlagLogs for evidenced drifts. Flags are its only write; interventions belong
// to the planning agent downstream.
// Run: node --env-file=../../.env src/agents/manufacturing/monitoring.ts
import { runAgent } from "../../run-agent.ts";
import { batchFlag } from "../../tools/manufacturing/batchFlag.ts";
import { getObject } from "../../tools/shared/getObject.ts";
import { queryObjects } from "../../tools/shared/queryObjects.ts";

await runAgent({
  identity: "monitoring-agent",
  prompt:
    "Scan all fermenting batches and flag the ones whose fermentation health is " +
    "drifting, per your instructions.",
  tools: [queryObjects, getObject, batchFlag],
  options: {
    systemPrompt: [
      "You are a fermentation health monitor. Scan every batch whose status is",
      "`fermenting`. For each one, compare its current sugar level to the recipe's",
      "target sugar curve for the batch's current fermentation day (interpolate",
      "between curve points when the day falls between them). Read the batch's",
      "linked QualityTests, the assigned tank's MaintenanceLogs, the recipe notes,",
      "and the batch's lastOperatorNote before judging.",
      "",
      "Create a FlagLog only for drifts the evidence supports; quote explicit",
      "recommendations or caveats from the sources as evidence in the flag's",
      "reason. Do not prescribe the intervention — the flag records what is wrong",
      "and the evidence, not what to do about it.",
      "",
      "Severity: `low` for drifts that are within acceptable range and need only",
      "watching; `medium` for drifts likely to need intervention; `high` for",
      "confirmed contamination or a safety hold.",
      "",
      "Two mistakes to avoid: a source saying a condition is \"recoverable\" does",
      "not mean no action is needed — a drift that needs intervention to recover",
      "is still at least medium. And lifecycle lateness alone (a batch past its",
      "planned transfer but fermenting healthily) is not a fermentation-health",
      "drift — do not flag it.",
    ].join("\n"),
  },
});
