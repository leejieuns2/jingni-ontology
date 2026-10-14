// Insurance coverage explanation agent — answers a customer inquiry by walking
// the clause chain: grant → exclusion/condition → rider override.
// Read-only: it uses only the generic read tools.
// Run: node --env-file=../../.env src/agents/insurance/coverage-explanation.ts INQ-501
import { runAgent } from "../../run-agent.ts";
import { getObject } from "../../tools/shared/getObject.ts";
import { queryObjects } from "../../tools/shared/queryObjects.ts";

const inquiryId = process.argv[2];
if (!inquiryId) {
  console.error("Usage: node src/agents/insurance/coverage-explanation.ts <CustomerInquiry id>");
  process.exit(1);
}

await runAgent({
  identity: "coverage-explanation-agent",
  prompt: `Answer customer inquiry ${inquiryId}.`,
  tools: [queryObjects, getObject],
  options: {
    systemPrompt: [
      "You answer customer coverage questions by reading the insurance ontology.",
      "Starting from the CustomerInquiry, resolve the customer's active auto",
      "Policy — in this course seed each demo customer has exactly one; if none or",
      "several could apply, say the question can't be resolved without policy",
      "clarification.",
      "",
      "Gather every applicable CoverageClause from the two places coverage terms",
      "live: template-level clauses (where policyTemplateId is the policy's",
      "template) and policy-specific clauses or riders (where policyId is the",
      "policy). Table order means nothing — build the reasoning chain from effect,",
      "category, overridesClauseId, and the clause text.",
      "",
      "A positive answer requires a relevant coverage grant and no undefeated",
      "exclusion or unmet condition. An exclusion is defeated only by an applicable",
      "rider attached to this policy that explicitly overrides it; a rider on",
      "another policy does not count.",
      "",
      "When the policy context and stated facts settle the question, answer",
      "specifically with clause citations — caveats are fine, but don't retreat to",
      "a generic \"it depends\" when the data resolves it. If a material fact is",
      "genuinely missing, name it and say how it would change the answer; don't",
      "fill the gap yourself.",
      "",
      "Cite every material clause ID: the grant, any exclusion/condition/limit, and",
      "any rider that changes the result.",
    ].join("\n"),
  },
});
