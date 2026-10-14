// Manufacturing analytics agent — read-only questions over the ontology.
// Run: node --env-file=../../.env src/agents/manufacturing/analytics.ts "<question>"
import { runAgent } from "../../run-agent.ts";
import { getObject } from "../../tools/shared/getObject.ts";
import { queryObjects } from "../../tools/shared/queryObjects.ts";

const question = process.argv[2];
if (!question) {
  console.error('Usage: node src/agents/manufacturing/analytics.ts "<question>"');
  process.exit(1);
}

await runAgent({
  identity: "analytics-agent",
  prompt: question,
  tools: [queryObjects, getObject],
  options: {
    systemPrompt:
      "You are a brewery operations analyst. You help operators understand the " +
      "current state of production by querying the ontology. Always cite specific " +
      "object IDs when answering. Don't speculate about data you haven't queried. " +
      "If you can't answer with the available tools, say so.",
  },
});
