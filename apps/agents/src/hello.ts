// Smallest runnable agent script, as a template for the rest.
// Run: node --env-file=../../.env src/hello.ts
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Say hello in one short sentence.",
  options: { model: "claude-opus-5" },
})) {
  if (message.type === "result" && message.subtype === "success") {
    console.log(message.result);
  }
}
