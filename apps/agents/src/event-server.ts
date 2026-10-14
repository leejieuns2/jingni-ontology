// A one-page live view of an agent run, on port 3455.
//
// Two routes and no build step: `/` returns a self-contained page, `/events` is an
// SSE stream. Events are also kept in memory and replayed to each new client, so
// opening the page after the run started still shows the whole transcript rather
// than whatever happens next.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export type AgentEvent =
  | { kind: "start"; identity: string; prompt: string }
  | { kind: "status"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool_use"; name: string; input: unknown }
  | { kind: "tool_result"; text: string; isError: boolean }
  | { kind: "result"; ok: boolean; answer: string; turns: number; durationMs: number; costUsd: number }
  | { kind: "done" };

export type EventServer = {
  publish: (event: AgentEvent) => void;
  /** Resolves once the final frames have had a chance to reach connected clients. */
  close: () => Promise<void>;
};

/**
 * Binds the viewer, or gives up on it.
 *
 * A run whose port is already taken should still produce an answer, so a bind
 * failure degrades to a no-op publisher instead of taking the agent down with it.
 */
export async function startEventServer(port: number): Promise<EventServer> {
  const history: AgentEvent[] = [];
  const clients = new Set<ServerResponse>();

  const server = createServer((request, response) => {
    if (request.url === "/events") {
      openStream(request, response, history, clients);
      return;
    }
    if (request.url === "/" || request.url === "/index.html") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(PAGE);
      return;
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  });

  const bound = await listen(server, port);
  if (!bound) {
    console.warn(`port ${port} is busy — running without the live view`);
    return { publish: () => {}, close: async () => {} };
  }

  console.log(`live view: http://localhost:${port}`);

  return {
    publish(event) {
      history.push(event);
      const frame = `data: ${JSON.stringify(event)}\n\n`;
      for (const client of clients) client.write(frame);
    },

    async close() {
      // The last frames are written but not necessarily flushed to the socket yet;
      // without this pause the browser loses the result it was waiting for.
      await new Promise((resolve) => setTimeout(resolve, 400));
      for (const client of clients) client.end();
      clients.clear();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

function listen(server: Server, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    server.once("error", () => resolve(false));
    server.listen(port, () => resolve(true));
  });
}

function openStream(
  request: IncomingMessage,
  response: ServerResponse,
  history: AgentEvent[],
  clients: Set<ServerResponse>,
): void {
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  for (const event of history) response.write(`data: ${JSON.stringify(event)}\n\n`);
  clients.add(response);
  request.on("close", () => clients.delete(response));
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent run</title>
<style>
  :root {
    --bg: #14110f;
    --panel: #1c1917;
    --line: #2f2925;
    --text: #efe9e3;
    --dim: #a09890;
    --accent: #d9a05b;
    --tool: #7fb3d3;
    --ok: #8fbf7f;
    --err: #d98b7f;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font: 15px/1.6 ui-sans-serif, system-ui, -apple-system, sans-serif;
  }
  header {
    position: sticky; top: 0;
    background: color-mix(in oklab, var(--bg) 88%, transparent);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--line);
    padding: 18px 28px;
  }
  h1 { margin: 0; font-size: 15px; font-weight: 600; letter-spacing: .01em; }
  h1 span { color: var(--accent); }
  #prompt { margin: 6px 0 0; color: var(--dim); font-size: 14px; }
  main { max-width: 900px; margin: 0 auto; padding: 28px; }
  .ev {
    border-left: 2px solid var(--line);
    padding: 2px 0 2px 18px;
    margin: 0 0 20px;
  }
  .label {
    font: 600 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
    letter-spacing: .09em; text-transform: uppercase;
    color: var(--dim); margin-bottom: 6px;
  }
  .ev.tool { border-left-color: var(--tool); }
  .ev.tool .label { color: var(--tool); }
  .ev.res { border-left-color: var(--ok); }
  .ev.res .label { color: var(--ok); }
  .ev.err { border-left-color: var(--err); }
  .ev.err .label { color: var(--err); }
  .ev.fin { border-left-color: var(--accent); }
  .ev.fin .label { color: var(--accent); }
  .ev.dim, .ev.dim .label { color: var(--dim); }
  pre {
    margin: 0; padding: 12px 14px;
    background: var(--panel); border: 1px solid var(--line); border-radius: 7px;
    font: 12.5px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace;
    white-space: pre-wrap; word-break: break-word;
    max-height: 22em; overflow: auto;
  }
  .text { white-space: pre-wrap; }
  .stats {
    display: flex; gap: 20px; flex-wrap: wrap;
    margin-top: 10px; color: var(--dim);
    font: 12.5px ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .stats b { color: var(--text); font-weight: 600; }
  #waiting { color: var(--dim); font-size: 14px; }
  #waiting::after {
    content: ""; display: inline-block;
    width: 6px; height: 6px; margin-left: 7px; border-radius: 50%;
    background: var(--accent); animation: pulse 1.1s ease-in-out infinite;
  }
  @keyframes pulse { 0%, 100% { opacity: .25 } 50% { opacity: 1 } }
</style>
</head>
<body>
<header>
  <h1>Agent run <span id="identity"></span></h1>
  <p id="prompt"></p>
</header>
<main>
  <div id="log"></div>
  <p id="waiting">waiting for events</p>
</main>
<script>
  const log = document.getElementById("log");
  const waiting = document.getElementById("waiting");

  function block(cls, label, body) {
    const el = document.createElement("div");
    el.className = "ev " + cls;
    const head = document.createElement("div");
    head.className = "label";
    head.textContent = label;
    el.appendChild(head);
    el.appendChild(body);
    log.appendChild(el);
    window.scrollTo(0, document.body.scrollHeight);
  }

  function pre(text) {
    const el = document.createElement("pre");
    el.textContent = text;
    return el;
  }

  function para(text) {
    const el = document.createElement("div");
    el.className = "text";
    el.textContent = text;
    return el;
  }

  // Built as nodes rather than innerHTML: the values arrive over the wire, and
  // textContent cannot smuggle markup even if one of them is ever a string.
  function stat(label, value) {
    const el = document.createElement("span");
    el.textContent = label + " ";
    const strong = document.createElement("b");
    strong.textContent = value;
    el.appendChild(strong);
    return el;
  }

  const source = new EventSource("/events");
  source.onmessage = (message) => {
    const ev = JSON.parse(message.data);

    if (ev.kind === "start") {
      document.getElementById("identity").textContent = "· " + ev.identity;
      document.getElementById("prompt").textContent = ev.prompt;
      document.title = "Agent run · " + ev.identity;
      return;
    }
    if (ev.kind === "status")    return block("dim", "status", para(ev.text));
    if (ev.kind === "thinking")  return block("dim", "thinking", para(ev.text));
    if (ev.kind === "assistant") return block("", "assistant", para(ev.text));
    if (ev.kind === "tool_use") {
      return block("tool", "tool · " + ev.name, pre(JSON.stringify(ev.input, null, 2)));
    }
    if (ev.kind === "tool_result") {
      return block(ev.isError ? "err" : "res", ev.isError ? "tool error" : "tool result", pre(ev.text));
    }
    if (ev.kind === "result") {
      const wrap = document.createElement("div");
      wrap.appendChild(para(ev.answer));
      const stats = document.createElement("div");
      stats.className = "stats";
      stats.append(
        stat("turns", String(ev.turns)),
        stat("duration", (Number(ev.durationMs) / 1000).toFixed(1) + "s"),
        stat("cost", "$" + Number(ev.costUsd).toFixed(4)),
      );
      wrap.appendChild(stats);
      return block(ev.ok ? "fin" : "err", ev.ok ? "result" : "failed", wrap);
    }
    if (ev.kind === "done") {
      waiting.style.display = "none";
      source.close();
    }
  };
  source.onerror = () => { waiting.textContent = "stream closed"; };
</script>
</body>
</html>
`;
