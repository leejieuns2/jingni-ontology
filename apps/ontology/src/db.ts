// Kysely over the pg driver. DATABASE_URL comes from the .env at the repo root,
// loaded by Node itself via `--env-file=../../.env` (see the package scripts).
import { Kysely, PostgresDialect, type ColumnType, type Generated } from "kysely";
import pg from "pg";

// NUMERIC arrives as a string by default, which would leak into every JSON
// response and break numeric comparisons downstream. The values in this ontology
// (gravities, temperatures, volumes) are all well inside float precision.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, Number);

/**
 * The ontology this service serves. The single switch: metadata, object, and
 * action routes expose and query only this schema. Every ontology schema
 * carries the same metadata tables (plus `proposal`), so flipping this value to
 * another schema (e.g. "insurance") repoints the whole generic surface at once.
 */
export const ACTIVE_ONTOLOGY_SCHEMA = "manufacturing";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL is not set (expected in .env at the repo root)");
}

/** timestamptz: node-pg parses reads into Date; writes accept a Date or an ISO string. */
type Timestamp = ColumnType<Date, Date | string, Date | string>;

/** jsonb: node-pg parses reads and serialises plain objects/arrays on write. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** jsonb that is always an object (a JSON Schema, an action's params, ...). */
type JsonObject = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Metadata tables — deliberately NOT schema-prefixed.
//
// Every ontology schema carries these five tables with the identical shape, so
// one type serves all of them and the schema is chosen at query time with
// `withSchema(...)` (see `meta()` in ontology/metadata.ts). That keeps the meta
// routes fully typed while staying reusable across schemas.
//
// The three-identifier pattern: `id` (UUID, for internal references),
// `api_name` (stable, what code depends on), `name` (editable display label).
// ---------------------------------------------------------------------------

type ObjectTypeTable = {
  id: Generated<string>;
  api_name: string;
  name: string;
  description: string | null;
  status: string | null;
  visibility: string | null;
  point_of_contact: string | null;
  edits_enabled: Generated<boolean>;
  /** Postgres schema holding the datasource table. */
  schema: string | null;
  datasource_table: string | null;
};

type PropertyTable = {
  id: Generated<string>;
  api_name: string;
  name: string;
  object_type_id: string;
  data_type: string;
  required: Generated<boolean>;
  is_title: Generated<boolean>;
  is_primary_key: Generated<boolean>;
  datasource_column: string | null;
};

type LinkTable = {
  id: Generated<string>;
  /** Label for the source → target direction. */
  api_name: string;
  name: string;
  /** Label for the target → source direction. */
  inverse_api_name: string;
  inverse_name: string;
  source_type_id: string;
  target_type_id: string;
  /** The property holding the foreign key. It lives on the source type. */
  via_property_id: string | null;
  cardinality: string;
};

type ActionTypeTable = {
  id: Generated<string>;
  api_name: string;
  name: string;
  object_type_id: string;
  description: string | null;
  /** JSON Schema for the action's parameters. */
  parameter_schema: JsonObject | null;
  /** Caller identities allowed to invoke; null or empty means unrestricted. */
  allowed_callers: string[] | null;
};

// Dual snapshot: the UUIDs keep the trail joinable to live metadata, the
// api_name columns keep it readable after a rename or delete. Both are always
// written; no api_name/name of its own, since an audit row is an event.
type AuditLogTable = {
  id: Generated<string>;
  action_type_id: string | null;
  action_api_name: string;
  target_type_id: string | null;
  target_type_api_name: string;
  target_id: string;
  actor: string;
  params: JsonObject | null;
  result: JsonObject | null;
  /** Proposal id when the action was run on behalf of an approved proposal. */
  authorized_by_proposal: string | null;
  created_at: Generated<Date>;
};

// One row per access decision on the action route — allowed and denied alike,
// so an investigation can see attempts, not just successes. Schema-agnostic
// like audit_log: bind to the active schema with withSchema.
type AccessLogTable = {
  id: Generated<string>;
  caller_identity: string;
  action_type: string;
  target_type: string;
  target_id: string;
  decision: "allowed" | "denied";
  reason: string | null;
  timestamp: Generated<Date>;
};

// ---------------------------------------------------------------------------
// Instance tables — schema-prefixed, because their shape is specific to the
// `manufacturing` ontology. Mirrors 01-manufacturing-foundation.sql.
// ---------------------------------------------------------------------------

type TankTable = {
  id: string;
  name: string;
  capacity: number | null;
  status: string;
  current_temperature: number | null;
  commissioned_at: Timestamp | null;
};

type LineTable = {
  id: string;
  name: string;
  status: string;
  commissioned_at: Timestamp | null;
};

type OperatorTable = {
  id: string;
  name: string;
  certifications: Generated<string[]>;
  shift: string | null;
};

type RecipeTable = {
  id: string;
  name: string;
  target_sugar_curve: JsonValue | null;
  fermentation_days: number | null;
  required_ingredients: Generated<string[]>;
  notes: string | null;
};

type BatchTable = {
  id: string;
  recipe_id: string;
  target_volume: number | null;
  status: string;
  planned_start: Timestamp | null;
  planned_transfer_at: Timestamp | null;
  current_sugar_level: number | null;
  current_temperature: number | null;
  days_fermenting: number | null;
  assigned_tank_id: string | null;
  assigned_operator_id: string | null;
  last_operator_note: string | null;
};

type BottlingRunTable = {
  id: string;
  batch_id: string;
  line_id: string;
  planned_start: Timestamp | null;
  status: string;
  assigned_operator_id: string | null;
};

type QualityTestTable = {
  id: string;
  batch_id: string;
  test_date: Timestamp;
  ph: number | null;
  sugar_level: number | null;
  notes: string | null;
  tested_by: string | null;
};

type MaintenanceLogTable = {
  id: string;
  /** Which type target_id points at — polymorphic, so no foreign key. */
  target_type: string;
  target_id: string;
  type: string;
  status: string;
  planned_at: Timestamp | null;
  started_at: Timestamp | null;
  completed_at: Timestamp | null;
  notes: string | null;
};

type FlagLogTable = {
  id: string;
  batch_id: string | null;
  reason: string;
  severity: string;
  status: Generated<string>;
  flagged_by: string | null;
  flagged_at: Timestamp | null;
  resolved_at: Timestamp | null;
};

/**
 * Like the metadata tables, deliberately NOT schema-prefixed: every ontology
 * schema carries a `proposal` table with this identical shape, so the shared
 * proposal actions bind it to the active schema with `withSchema(...)`.
 */
type ProposalTable = {
  id: Generated<number>;
  /** Exact handler key of the proposed action, e.g. `batch.cancel`. */
  type: string;
  target_id: string;
  params: JsonObject;
  rationale: string;
  status: Generated<string>;
  proposed_by: string;
  proposed_at: Generated<Timestamp>;
  reviewed_by: string | null;
  reviewed_at: Timestamp | null;
  decision_note: string | null;
};

// ---------------------------------------------------------------------------
// Insurance instance tables — the handlers under actions/insurance work with
// these. Mirrors insurance-base.sql.
// ---------------------------------------------------------------------------

type PolicyTable = {
  id: string;
  policy_number: string;
  customer_id: string | null;
  template_id: string | null;
  start_date: Timestamp | null;
  end_date: Timestamp | null;
  premium: number | null;
  status: string;
  driver_scope: string | null;
  reporting_window_days: number | null;
};

type ClaimTable = {
  id: string;
  claim_number: string;
  policy_id: string | null;
  customer_id: string | null;
  incident_date: Timestamp | null;
  filed_date: Timestamp | null;
  claim_type: string | null;
  amount_claimed: number | null;
  status: string;
  narrative: string | null;
  documents_complete: boolean | null;
};

type CoverageClauseTable = {
  id: string;
  policy_template_id: string | null;
  policy_id: string | null;
  effect: string;
  category: string | null;
  text: string | null;
  overrides_clause_id: string | null;
  limit_amount: number | null;
  deductible_amount: number | null;
};

type DataIssueTable = {
  id: string;
  claim_id: string | null;
  reason: string;
  status: Generated<string>;
};

export interface Database {
  // Metadata (address with withSchema)
  object_type: ObjectTypeTable;
  property: PropertyTable;
  link: LinkTable;
  action_type: ActionTypeTable;
  audit_log: AuditLogTable;
  access_log: AccessLogTable;
  proposal: ProposalTable;

  // Instances
  "manufacturing.tank": TankTable;
  "manufacturing.line": LineTable;
  "manufacturing.operator": OperatorTable;
  "manufacturing.recipe": RecipeTable;
  "manufacturing.batch": BatchTable;
  "manufacturing.bottling_run": BottlingRunTable;
  "manufacturing.quality_test": QualityTestTable;
  "manufacturing.maintenance_log": MaintenanceLogTable;
  "manufacturing.flag_log": FlagLogTable;

  "insurance.policy": PolicyTable;
  "insurance.claim": ClaimTable;
  "insurance.coverage_clause": CoverageClauseTable;
  "insurance.data_issue": DataIssueTable;
}

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new pg.Pool({ connectionString }),
  }),
});
