// The browser's clock, anchored the same way the API's is.
//
// COURSE_NOW comes from the workspace-root .env via Vite (see vite.config.ts).
// The offset is taken once at load, so time advances normally from the anchor.
// Anything computing a date window must use `now()` rather than `new Date()`.
const anchor = import.meta.env["COURSE_NOW"] as string | undefined;

const offset = (() => {
  if (!anchor) return 0;
  const anchorMs = new Date(anchor).getTime();
  if (Number.isNaN(anchorMs)) {
    console.warn(`COURSE_NOW is not a valid datetime: "${anchor}" — using the real clock`);
    return 0;
  }
  return anchorMs - Date.now();
})();

/** "Now" according to the course clock. */
export function now(): Date {
  return new Date(Date.now() + offset);
}

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Whether `value` falls in the `days` before `now()`. */
export function withinLastDays(value: unknown, days: number): boolean {
  const date = toDate(value);
  if (!date) return false;
  const end = now().getTime();
  return date.getTime() <= end && date.getTime() >= end - days * DAY_MS;
}

export function toDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** True when the anchor is in effect, for the "as of" note in the UI. */
export const isAnchored = offset !== 0;
