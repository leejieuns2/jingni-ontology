// HTTP entry point. Node runs this .ts file directly (>=22.18 strips types),
// so imports keep their real ".ts" extension.
//
// The clock override must come first: module bodies run in import order, so this
// puts the anchored Date in place before any route module is even evaluated.
import "./clock.ts";

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ActionError } from "./actions/types.ts";
import { actionRoutes } from "./routes/actions.ts";
import { metaRoutes } from "./routes/meta.ts";
import { objectRoutes } from "./routes/objects.ts";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));

// Order matters: /meta/types would otherwise be swallowed by /:type/:id.
app.route("/api/objects", metaRoutes);
app.route("/api/objects", actionRoutes);
app.route("/api/objects", objectRoutes);

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  if (err instanceof ActionError) {
    return c.json({ error: err.message }, err.status);
  }
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

const port = Number(process.env["PORT"] ?? 3000);
serve({ fetch: app.fetch, port });

console.log(`listening on http://localhost:${port}`);
