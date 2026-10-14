// `tank_schedule_maintenance` — invoke Tank.scheduleMaintenance through the
// action route.
//
// A thin shell over POST /api/objects/tank/:id/actions/scheduleMaintenance: the
// service validates the params and enforces the domain rule (no fermenting batch
// in the tank), so a rejected call comes back as a 4xx whose message is handed
// straight to the model.
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { describe, errorResult, extractMessage, okResult, ontologyUrl } from "../shared/http.ts";

export const tankScheduleMaintenance = tool(
  "tank_schedule_maintenance",
  [
    "Schedule maintenance on a tank. This takes the tank offline: its status is set",
    "to `maintenance` immediately and a maintenance log is created with `scheduled`",
    "status for the planned time. A tank holding a fermenting batch cannot be taken",
    "offline; that comes back as a 409 naming the batch.",
    "`tankId` is the tank's primary key, e.g. `T-7`. `plannedAt` is an ISO 8601",
    "datetime for when the work is planned.",
  ].join(" "),
  {
    tankId: z.string().describe("Primary key of the tank, e.g. `T-7`"),
    type: z
      .enum(["inspection", "preventive", "corrective", "cleaning"])
      .describe("Kind of maintenance to schedule"),
    plannedAt: z
      .string()
      .describe("When the work is planned, ISO 8601 datetime — e.g. `2026-05-01T09:00:00Z`"),
    notes: z.string().describe("What prompted the maintenance and what to look at"),
  },
  async ({ tankId, type, plannedAt, notes }) => {
    const url = `${ontologyUrl}/api/objects/tank/${encodeURIComponent(tankId)}/actions/scheduleMaintenance`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, plannedAt, notes }),
      });
    } catch (cause) {
      return errorResult(
        `Could not reach the ontology service at ${ontologyUrl}: ${describe(cause)}`,
      );
    }

    const text = await response.text();
    if (!response.ok) {
      return errorResult(
        `scheduleMaintenance failed (${response.status}): ${extractMessage(text)}`,
      );
    }

    return okResult(text);
  },
);
