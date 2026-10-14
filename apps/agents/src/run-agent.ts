// The entry point every agent script calls.
//
// `runAgent` owns everything an agent needs but should not have to restate: the
// live view on 3455, Langfuse tracing, the ontology schema and the COURSE_NOW
// override in the prompt, the tool surface, and the permission rules that keep the
// agent inside that surface. An agent file is then just an identity and a prompt.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  createSdkMcpServer,
  type Options,
  type PermissionResult,
  type SdkMcpToolDefinition,
} from "@anthropic-ai/claude-agent-sdk";
import { trace } from "@opentelemetry/api";
import { startEventServer, type AgentEvent } from "./event-server.ts";
import { buildSchemaBlock } from "./helpers/buildSchemaBlock.ts";
import { ontologyUrl } from "./tools/shared/http.ts";
import { initTracing, TRACER_NAME } from "./tracing.ts";

const VIEW_PORT = 3455;
const SERVER_NAME = "ontology";

/** The only prefix `canUseTool` will approve. */
const TOOL_PREFIX = `mcp__${SERVER_NAME}__`;

/**
 * Built-ins named explicitly rather than relying on `tools: []` alone, so that the
 * ban survives someone later re-enabling the preset: `disallowedTools` wins over
 * anything that would otherwise make a tool available.
 */
const BANNED_TOOLS = ["Bash", "Read"];

export type RunAgentInput = {
  /** Names the Langfuse trace and travels to the ontology as `x-caller-identity`. */
  identity: string;
  prompt: string;
  /** The agent's whole tool surface; the MCP server and allow-list are built from it. */
  tools: SdkMcpToolDefinition<any>[];
  /** Merged over the defaults; `mcpServers` and the permission fields are fixed. */
  options?: Omit<Options, "mcpServers" | "canUseTool" | "disallowedTools">;
};

export async function runAgent({ identity, prompt, tools, options }: RunAgentInput): Promise<void> {
  installIdentityHeader(identity);

  const { query, enabled: traced, shutdown } = initTracing();
  const view = await startEventServer(VIEW_PORT);

  const emit = (event: AgentEvent): void => {
    view.publish(event);
    logToConsole(event);
  };

  emit({ kind: "start", identity, prompt });
  emit({ kind: "status", text: traced ? "tracing to Langfuse" : "tracing off (no Langfuse keys)" });

  try {
    const schema = await buildSchemaBlock();
    const fullPrompt = [courseNowBlock(), prompt].filter(Boolean).join("\n\n");

    // A root span named after the identity gives Langfuse the trace name; the
    // instrumentation's own agent span hangs off it.
    const tracer = trace.getTracer(TRACER_NAME);
    await tracer.startActiveSpan(identity, async (span) => {
      span.setAttribute("langfuse.trace.name", identity);
      try {
        for await (const message of query({
          prompt: fullPrompt,
          options: {
            ...agentOptions(tools),
            ...options,
            // Computed after the spread so a caller's own systemPrompt is composed
            // with the schema rather than replacing it.
            systemPrompt: withSchema(schema, options?.systemPrompt),
          },
        })) {
          for (const event of toEvents(message)) emit(event);
        }
      } finally {
        span.end();
      }
    });
  } catch (cause) {
    emit({ kind: "status", text: `run failed: ${describe(cause)}` });
    throw cause;
  } finally {
    emit({ kind: "done" });
    await shutdown();
    await view.close();
  }
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

function agentOptions(tools: SdkMcpToolDefinition<any>[]): Options {
  return {
    model: "claude-opus-5",
    mcpServers: {
      [SERVER_NAME]: createSdkMcpServer({
        name: SERVER_NAME,
        version: "0.0.0",
        tools,
        // Otherwise the tools sit behind ToolSearch and the agent spends turns
        // discovering what it already has.
        alwaysLoad: true,
      }),
    },
    // No built-ins at all: the ontology tools are the whole surface.
    tools: [],
    disallowedTools: BANNED_TOOLS,
    // `tools: []` does not touch MCP servers, so without this the developer's own
    // ~/.claude config loads dozens of unrelated ones into every run.
    settingSources: [],
    // Isolation mode drops the credential helper along with everything else, which
    // on a Bedrock setup turns every run into a 403.
    env: { ...process.env, ...bedrockCredentialEnv() },
    // Our own tools run unattended; anything else is refused rather than queued for
    // a human who is not watching.
    allowedTools: tools.map((tool) => `${TOOL_PREFIX}${tool.name}`),
    canUseTool: approveOwnToolsOnly(tools),
  };
}

/**
 * The backstop behind `allowedTools` and `disallowedTools`.
 *
 * Those two are configuration; this is the rule. Anything outside our own MCP
 * server is denied outright — a non-interactive run has nobody to ask, so a prompt
 * would just hang until the turn limit.
 */
const approveOwnToolsOnly =
  (tools: SdkMcpToolDefinition<any>[]) =>
  async (toolName: string, input: Record<string, unknown>) =>
    (toolName.startsWith(TOOL_PREFIX)
      ? { behavior: "allow", updatedInput: input }
      : {
          behavior: "deny",
          message:
            `${toolName} is not available. Use the ${SERVER_NAME} tools ` +
            `(${tools.map((tool) => tool.name).join(", ")}) instead.`,
        }) satisfies PermissionResult;

// ---------------------------------------------------------------------------
// Prompt preamble
// ---------------------------------------------------------------------------

/**
 * Puts the schema at the front of the system prompt, keeping whatever the caller
 * asked for.
 *
 * The tags matter: the block is a few thousand characters of generated reference
 * text, and delimiting it stops the model reading the tail of it as instructions.
 *
 * One shape cannot honour "at the start" — the `preset` form exposes only `append`,
 * so there the schema lands after Claude Code's own prompt instead of before it.
 */
function withSchema(
  schema: string,
  caller: Options["systemPrompt"],
): NonNullable<Options["systemPrompt"]> {
  const block = `<ontology-schema>\n${schema}\n</ontology-schema>`;

  if (caller === undefined) return block;
  if (typeof caller === "string") return [block, caller];
  if (Array.isArray(caller)) return [block, ...caller];

  if (caller.type === "custom") {
    const prompt = Array.isArray(caller.prompt) ? caller.prompt : [caller.prompt];
    return { ...caller, prompt: [block, ...prompt] };
  }

  return { ...caller, append: caller.append ? `${block}\n\n${caller.append}` : block };
}

/**
 * COURSE_NOW, framed as an override.
 *
 * The ontology's data is seeded around a fixed date, and the service anchors its
 * own clock to the same value. Without saying so the agent reasons about "overdue"
 * and "day 8" against the real wall clock and quietly gets every relative date
 * wrong, so the instruction is explicit about which date wins.
 */
function courseNowBlock(): string {
  const courseNow = process.env["COURSE_NOW"];
  if (!courseNow) return "";

  return [
    "# Current date override",
    "",
    `COURSE_NOW=${courseNow}`,
    "",
    "Treat COURSE_NOW as the current date and time for all time-relative reasoning",
    "about ontology data — what is overdue, how many days a batch has been running,",
    "what counts as recent. It overrides your own sense of today and any date you",
    "might infer from elsewhere. The ontology service anchors its clock to the same",
    "value, so its data is consistent with it and your real-world date is not.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Identity propagation
// ---------------------------------------------------------------------------

/**
 * Stamps `x-caller-identity` on ontology requests only.
 *
 * Scoped by URL prefix on purpose: the same global `fetch` carries Anthropic and
 * Langfuse traffic, and leaking a caller identity to either is both useless and a
 * small disclosure. Anything not addressed to the ontology passes through
 * untouched.
 */
function installIdentityHeader(identity: string): void {
  const original = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    if (!targetsOntology(input)) return original(input, init);

    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    headers.set("x-caller-identity", identity);
    return original(input, { ...init, headers });
  };
}

function targetsOntology(input: Parameters<typeof fetch>[0]): boolean {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return url.startsWith(ontologyUrl);
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

/**
 * AWS credentials for the subprocess, on setups that route through Bedrock.
 *
 * `settingSources: []` drops `awsCredentialExport` — the credential helper the
 * machine authenticates with — so it is run here and its output handed over as
 * environment variables. The command comes from the developer's own settings rather
 * than being written in; no helper configured means the environment authenticates
 * some other way and there is nothing to carry.
 */
function bedrockCredentialEnv(): Record<string, string> {
  let command: unknown;
  try {
    const settings: unknown = JSON.parse(
      readFileSync(join(homedir(), ".claude", "settings.json"), "utf8"),
    );
    command =
      typeof settings === "object" && settings !== null
        ? (settings as Record<string, unknown>)["awsCredentialExport"]
        : undefined;
  } catch {
    return {};
  }
  if (typeof command !== "string" || !command) return {};

  // Run through a shell deliberately: the setting is authored as a shell command
  // string (the default quotes its executable path), so splitting it into an argv
  // for execFile would break it. Nothing is interpolated — the whole string is the
  // developer's own local config, which is what Claude Code itself executes.
  let output: string;
  try {
    output = execSync(command, {
      encoding: "utf8",
      timeout: 60_000,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return {};
  }

  try {
    const { Credentials: credentials } = JSON.parse(output) as {
      Credentials?: { AccessKeyId?: string; SecretAccessKey?: string; SessionToken?: string };
    };
    if (!credentials?.AccessKeyId || !credentials.SecretAccessKey) return {};

    const env: Record<string, string> = {
      AWS_ACCESS_KEY_ID: credentials.AccessKeyId,
      AWS_SECRET_ACCESS_KEY: credentials.SecretAccessKey,
    };
    if (credentials.SessionToken) env["AWS_SESSION_TOKEN"] = credentials.SessionToken;
    return env;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// SDK messages → view events
// ---------------------------------------------------------------------------

type Block = {
  type: string;
  text?: unknown;
  thinking?: unknown;
  name?: unknown;
  input?: unknown;
  content?: unknown;
  is_error?: unknown;
};

/** The SDKMessage union carries many telemetry frames; only these four are shown. */
function toEvents(message: unknown): AgentEvent[] {
  if (typeof message !== "object" || message === null || !("type" in message)) return [];
  const turn = message as { type: string; [key: string]: unknown };

  switch (turn.type) {
    case "system":
      return turn["subtype"] === "init"
        ? [{ kind: "status", text: `model ${String(turn["model"])}` }]
        : [];

    case "assistant":
      return blocks(turn["message"]).flatMap((block): AgentEvent[] => {
        if (block.type === "thinking" && typeof block.thinking === "string" && block.thinking) {
          return [{ kind: "thinking", text: block.thinking }];
        }
        if (block.type === "text" && typeof block.text === "string") {
          return [{ kind: "assistant", text: block.text }];
        }
        if (block.type === "tool_use") {
          return [{ kind: "tool_use", name: String(block.name), input: block.input }];
        }
        return [];
      });

    case "user":
      return blocks(turn["message"])
        .filter((block) => block.type === "tool_result")
        .map((block) => ({
          kind: "tool_result",
          text: renderResult(block.content),
          isError: block.is_error === true,
        }));

    case "result":
      return [
        {
          kind: "result",
          ok: turn["subtype"] === "success",
          answer: typeof turn["result"] === "string" ? turn["result"] : String(turn["subtype"]),
          turns: Number(turn["num_turns"] ?? 0),
          durationMs: Number(turn["duration_ms"] ?? 0),
          costUsd: Number(turn["total_cost_usd"] ?? 0),
        },
      ];

    default:
      return [];
  }
}

function blocks(message: unknown): Block[] {
  if (typeof message !== "object" || message === null) return [];
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) return [];
  return content.filter(
    (block): block is Block => typeof block === "object" && block !== null && "type" in block,
  );
}

/** A tool_result's content is a string or a list of content blocks. */
function renderResult(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return JSON.stringify(content);
  return content
    .map((block) =>
      typeof block === "object" && block !== null && "text" in block
        ? String((block as { text: unknown }).text)
        : JSON.stringify(block),
    )
    .join("\n");
}

// ---------------------------------------------------------------------------
// Console mirror
// ---------------------------------------------------------------------------

function logToConsole(event: AgentEvent): void {
  switch (event.kind) {
    case "start":
      console.log(`\n${event.identity}\n${"─".repeat(72)}\n${event.prompt}\n`);
      return;
    case "status":
      console.log(`· ${event.text}`);
      return;
    case "thinking":
      console.log(`[thinking] ${clip(event.text, 200)}`);
      return;
    case "assistant":
      console.log(`\n${event.text}\n`);
      return;
    case "tool_use":
      console.log(`[tool] ${event.name} ${clip(JSON.stringify(event.input), 200)}`);
      return;
    case "tool_result":
      console.log(`[${event.isError ? "tool error" : "result"}] ${clip(event.text, 200)}`);
      return;
    case "result":
      console.log(
        `${"─".repeat(72)}\nturns ${event.turns} · ` +
          `${(event.durationMs / 1000).toFixed(1)}s · $${event.costUsd.toFixed(4)}`,
      );
      return;
    case "done":
      return;
  }
}

function clip(text: string, max: number): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
