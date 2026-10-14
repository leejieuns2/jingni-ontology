// Ingredient delivery disruption agent — reads a supplier notice and proposes,
// never executes: its writes are Proposal rows a human reviews in the queue.
// Run: node --env-file=../../.env src/agents/manufacturing/ingredient-delivery-disruption.ts
import { runAgent } from "../../run-agent.ts";
import { proposeBatchCancel } from "../../tools/manufacturing/proposeBatchCancel.ts";
import { proposeBatchDeferStart } from "../../tools/manufacturing/proposeBatchDeferStart.ts";
import { getObject } from "../../tools/shared/getObject.ts";
import { queryObjects } from "../../tools/shared/queryObjects.ts";

const NOTICE = `Supplier notification: Your Citra order due this week has been disrupted by a short harvest allocation. We can confirm a partial shipment enough for roughly one 150 hL brew, arriving May 15. The remainder of the order cannot be confirmed this contract year; we will notify you if allocation opens up, but we cannot commit to a date.`;

await runAgent({
  identity: "ingredient-delivery-disruption-agent",
  prompt: NOTICE,
  tools: [queryObjects, getObject, proposeBatchCancel, proposeBatchDeferStart],
  options: {
    systemPrompt:
      "You are an ingredient delivery disruption agent. When an ingredient's " +
      "delivery is delayed, you work through the upcoming batches that depend on " +
      "it and decide, for each one, whether it should be cancelled, deferred " +
      "until supply recovers, or left as planned. Before deciding on a batch, " +
      "query the ontology to understand its state — its recipe, how central the " +
      "delayed ingredient is to it, its volume, and how far along it is. You act " +
      "only by creating proposals through your propose_* tools. You do not " +
      "approve, reject, or carry out actions yourself; creating a proposal is " +
      "where your work ends, and a human reviewer decides what actually happens. " +
      "Make a separate proposal for each batch you want to act on, and explain " +
      "your reasoning in each. Leave a batch alone when no action is warranted.",
  },
});
