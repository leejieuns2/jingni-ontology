// Sugar level vs. the recipe's target curve.
//
// Thresholds are on the deviation between a batch's current sugar level and the
// curve's value for its current fermentation day. They are the numbers the
// workspace was specced with — adjust here if the ontology's sugar scale changes.
export const SUGAR_ON_TARGET = 0.005; // within this: green
export const SUGAR_NEAR_TARGET = 0.008; // within this: amber, beyond: red

export type CurvePoint = { day: number; sugar: number };

export type SugarBand = "on-target" | "near-target" | "off-target" | "unknown";

export type SugarStatus = {
  target: number | null;
  /** current − target. Positive means sugar is still high, i.e. behind schedule. */
  delta: number | null;
  band: SugarBand;
  /** Behind by at least SUGAR_NEAR_TARGET, which is what "Behind Target" counts. */
  behind: boolean;
  /** The curve point the target came from, for highlighting the curve. */
  point: CurvePoint | null;
};

/**
 * Reads a recipe's `targetSugarCurve` jsonb into sorted points.
 *
 * Two shapes are accepted: the seed's object form `{"day_1": 1.050, ...}` and a
 * plain array of `{ day, sugar }`, so the workspace does not care which the
 * ontology's datasource happens to use.
 */
export function parseCurve(value: unknown): CurvePoint[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => {
        if (typeof entry !== "object" || entry === null) return [];
        const { day, sugar } = entry as Record<string, unknown>;
        return typeof day === "number" && typeof sugar === "number" ? [{ day, sugar }] : [];
      })
      .sort((a, b) => a.day - b.day);
  }

  if (typeof value === "object" && value !== null) {
    return Object.entries(value as Record<string, unknown>)
      .flatMap(([key, sugar]) => {
        const day = Number(key.replace(/^day[_-]?/i, ""));
        return Number.isFinite(day) && typeof sugar === "number" ? [{ day, sugar }] : [];
      })
      .sort((a, b) => a.day - b.day);
  }

  return [];
}

/**
 * The target in force on `day`: the last curve point at or before it. Days before
 * the first point fall back to that point, so a batch on day 0 has a target.
 */
export function targetAtDay(curve: CurvePoint[], day: number | null): CurvePoint | null {
  if (curve.length === 0) return null;
  if (day === null) return null;

  let active = curve[0] ?? null;
  for (const point of curve) {
    if (point.day <= day) active = point;
    else break;
  }
  return active;
}

export function sugarStatus(
  currentSugar: unknown,
  curve: CurvePoint[],
  day: number | null,
): SugarStatus {
  const point = targetAtDay(curve, day);
  const current = typeof currentSugar === "number" ? currentSugar : null;

  if (point === null || current === null) {
    return { target: point?.sugar ?? null, delta: null, band: "unknown", behind: false, point };
  }

  const delta = current - point.sugar;
  const deviation = Math.abs(delta);

  return {
    target: point.sugar,
    delta,
    band:
      deviation <= SUGAR_ON_TARGET
        ? "on-target"
        : deviation <= SUGAR_NEAR_TARGET
          ? "near-target"
          : "off-target",
    behind: delta >= SUGAR_NEAR_TARGET,
    point,
  };
}

/** Blueprint intent per band, so the table and the detail panel agree. */
export function bandIntent(band: SugarBand): "success" | "warning" | "danger" | "none" {
  switch (band) {
    case "on-target":
      return "success";
    case "near-target":
      return "warning";
    case "off-target":
      return "danger";
    default:
      return "none";
  }
}

export function formatDelta(delta: number | null): string {
  if (delta === null) return "—";
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "±";
  return `${sign}${Math.abs(delta).toFixed(3)}`;
}
