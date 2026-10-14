// External action demo — an agent whose one write crosses the system boundary.
// Run: node --env-file=../../.env src/agents/manufacturing/external-action-demo.ts "<instruction>"
import { runAgent } from "../../run-agent.ts";
import { batchNotifyOperator } from "../../tools/manufacturing/batchNotifyOperator.ts";
import { getObject } from "../../tools/shared/getObject.ts";
import { queryObjects } from "../../tools/shared/queryObjects.ts";

const instruction = process.argv[2];
if (!instruction) {
  console.error('Usage: node src/agents/manufacturing/external-action-demo.ts "<instruction>"');
  process.exit(1);
}

await runAgent({
  identity: "external-action-demo",
  prompt: instruction,
  tools: [queryObjects, getObject, batchNotifyOperator],
  options: {
    systemPrompt:
      "You are a brewery operations notifier. When asked to alert or notify an " +
      "operator about a batch, first read the batch to confirm it exists and see " +
      "who is assigned, then send exactly one notification with a clear, specific " +
      "message. Report whether the delivery succeeded; a failed delivery means the " +
      "operator was not told — never claim otherwise.",
  },
});
