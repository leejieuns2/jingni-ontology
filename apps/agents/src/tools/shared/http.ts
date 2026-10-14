// Shared plumbing for the tools that talk to the ontology service.
//
// The service is the single source of truth for what is valid, so every tool here
// follows the same contract: pass the caller's strings through, and when the service
// says no, hand its message to the model verbatim so it can retry with something
// better. That means the failure shapes are identical across tools, which is why
// they live here rather than in each one.

/**
 * Base URL of the ontology service. Read once at import: a missing value is a
 * configuration error, and failing here beats failing on the first tool call.
 */
const url = process.env["ONTOLOGY_URL"];
if (!url) {
  throw new Error("ONTOLOGY_URL is not set (expected in .env at the repo root)");
}
export const ontologyUrl = url;

/** A tool result the model reads as a failure rather than as data. */
export function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

/** A tool result carrying the service's response body unchanged. */
export function okResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

/** The service reports failures as `{ "error": "..." }`; fall back to raw text. */
export function extractMessage(text: string): string {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null && "error" in parsed) {
      return String((parsed as { error: unknown }).error);
    }
  } catch {
    // Not JSON — the raw body is the most informative thing we have.
  }
  return text || "no response body";
}

export function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
