// Shared values the propose_* tools stamp on every Proposal they create.

/** The agent identity recorded as the proposer. */
export const PROPOSED_BY = "ingredient-delivery-disruption-agent";

/**
 * The course's current time, so proposals sort consistently with the seeded
 * world rather than with the developer's wall clock.
 */
export function proposedAt(): string {
  return process.env["COURSE_NOW"] ?? new Date().toISOString();
}
