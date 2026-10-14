// OpenTelemetry wiring that sends agent traces to Langfuse.
//
// Tracing is opt-in by configuration, not by code: with the Langfuse keys absent
// this module hands back the SDK's own `query` untouched and every agent still
// runs. That way a missing key is a quiet loss of observability rather than a
// crash on startup.
import { ClaudeAgentSDKInstrumentation } from "@arizeai/openinference-instrumentation-claude-agent-sdk";
import { LangfuseSpanProcessor, isDefaultExportSpan } from "@langfuse/otel";
import { NodeSDK } from "@opentelemetry/sdk-node";
import * as claudeAgentSdk from "@anthropic-ai/claude-agent-sdk";

const INSTRUMENTATION_SCOPE =
  "@arizeai/openinference-instrumentation-claude-agent-sdk";

/**
 * Scope of the root span `runAgent` opens to name the trace.
 *
 * It has to be listed in `shouldExportSpan` alongside the instrumentation's own
 * scope: the predicate is a full override of Langfuse's default filtering, so a
 * scope missing from it is dropped — and dropping this one loses the trace name
 * while still exporting the agent and tool spans beneath it.
 */
export const TRACER_NAME = "jingni-agents";

type QueryFn = typeof claudeAgentSdk.query;

type Tracing = {
  /** `query`, instrumented when tracing is on and the plain export when it is off. */
  query: QueryFn;
  enabled: boolean;
  /** Flushes pending spans. Safe to call when tracing never started. */
  shutdown: () => Promise<void>;
};

let tracing: Tracing | undefined;

/**
 * Starts tracing once per process and returns the `query` to call.
 *
 * The returned function matters: `manuallyInstrument` cannot mutate an ESM
 * namespace object, so it hands back a *patched copy* of the module. Calling the
 * directly imported `query` would therefore run untraced — every caller has to go
 * through the function returned here.
 */
export function initTracing(): Tracing {
  if (tracing) return tracing;

  if (!process.env["LANGFUSE_PUBLIC_KEY"] || !process.env["LANGFUSE_SECRET_KEY"]) {
    tracing = {
      query: claudeAgentSdk.query,
      enabled: false,
      shutdown: async () => {},
    };
    return tracing;
  }

  const instrumentation = new ClaudeAgentSDKInstrumentation();
  const patched = instrumentation.manuallyInstrument({ ...claudeAgentSdk });

  const sdk = new NodeSDK({
    spanProcessors: [
      new LangfuseSpanProcessor({
        shouldExportSpan: ({ otelSpan }) =>
          isDefaultExportSpan(otelSpan) ||
          otelSpan.instrumentationScope.name === INSTRUMENTATION_SCOPE ||
          otelSpan.instrumentationScope.name === TRACER_NAME,
      }),
    ],
    instrumentations: [instrumentation],
  });
  sdk.start();

  tracing = {
    // `manuallyInstrument` leaves `query` in place, so fall back to the plain
    // export rather than failing if a future version stops re-exporting it.
    query: patched.query ?? claudeAgentSdk.query,
    enabled: true,
    shutdown: () => sdk.shutdown(),
  };
  return tracing;
}
