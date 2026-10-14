// Everything the routes need to go from metadata to a query against a
// datasource table. This is the only module that builds SQL from metadata, so
// it is the only place identifier injection could happen — see `datasourceOf`
// and `selectRows` for how that is contained.
import { HTTPException } from "hono/http-exception";
import { sql, type Kysely, type RawBuilder, type Selectable } from "kysely";
import type { Database } from "../db.ts";

/** The schema whose metadata tables describe this service's ontology. */
export const METADATA_SCHEMA = "manufacturing";

/**
 * Schemas this service is allowed to read instance tables from. A `schema` value
 * that reached us from metadata is still checked against this list before it is
 * ever put into SQL.
 */
const INSTANCE_SCHEMAS = new Set(["manufacturing"]);

/** Metadata tables are schema-agnostic in `Database`; bind them to a schema. */
export function meta(db: Kysely<Database>): Kysely<Database> {
  return db.withSchema(METADATA_SCHEMA);
}

export type ObjectTypeRow = Selectable<Database["object_type"]>;
export type PropertyRow = Selectable<Database["property"]>;
export type ActionTypeRow = Selectable<Database["action_type"]>;

/** A validated, safe-to-quote pointer at a physical table. */
export type Datasource = { schema: string; table: string };

/** One end of a link, already resolved to the direction being traversed. */
export type ResolvedLink = {
  /** api_name for the forward direction, inverse_api_name for the backward one. */
  apiName: string;
  name: string;
  direction: "outbound" | "inbound";
  cardinality: string;
  /** The type at the other end. */
  otherTypeId: string;
  otherTypeApiName: string;
  otherSchema: string | null;
  otherTable: string | null;
  /** Column holding the foreign key. Always on the *source* type's table. */
  viaColumn: string | null;
};

/** Looks a type up by api_name — never by display name, which is editable. */
export async function findObjectType(
  db: Kysely<Database>,
  apiName: string,
): Promise<ObjectTypeRow | undefined> {
  return await meta(db)
    .selectFrom("object_type")
    .selectAll()
    .where("api_name", "=", apiName)
    .executeTakeFirst();
}

/** Same, but 404s instead of returning undefined. */
export async function requireObjectType(
  db: Kysely<Database>,
  apiName: string,
): Promise<ObjectTypeRow> {
  const type = await findObjectType(db, apiName);
  if (!type) {
    throw new HTTPException(404, { message: `Unknown object type "${apiName}"` });
  }
  return type;
}

export async function loadProperties(
  db: Kysely<Database>,
  objectTypeId: string,
): Promise<PropertyRow[]> {
  return await meta(db)
    .selectFrom("property")
    .selectAll()
    .where("object_type_id", "=", objectTypeId)
    .orderBy("is_primary_key", "desc")
    .orderBy("api_name")
    .execute();
}

export async function loadActionTypes(
  db: Kysely<Database>,
  objectTypeId: string,
): Promise<ActionTypeRow[]> {
  return await meta(db)
    .selectFrom("action_type")
    .selectAll()
    .where("object_type_id", "=", objectTypeId)
    .orderBy("api_name")
    .execute();
}

export async function findActionType(
  db: Kysely<Database>,
  objectTypeId: string,
  apiName: string,
): Promise<ActionTypeRow | undefined> {
  return await meta(db)
    .selectFrom("action_type")
    .selectAll()
    .where("object_type_id", "=", objectTypeId)
    .where("api_name", "=", apiName)
    .executeTakeFirst();
}

/**
 * Links in both directions, each already labelled for the direction it will be
 * traversed in: outbound uses api_name/name, inbound uses inverse_api_name and
 * inverse_name.
 */
export async function loadLinks(
  db: Kysely<Database>,
  objectTypeId: string,
): Promise<ResolvedLink[]> {
  const outbound = await meta(db)
    .selectFrom("link")
    .innerJoin("object_type as other", "other.id", "link.target_type_id")
    .leftJoin("property as via", "via.id", "link.via_property_id")
    .where("link.source_type_id", "=", objectTypeId)
    .select([
      "link.api_name as apiName",
      "link.name as name",
      "link.cardinality as cardinality",
      "other.id as otherTypeId",
      "other.api_name as otherTypeApiName",
      "other.schema as otherSchema",
      "other.datasource_table as otherTable",
      "via.datasource_column as viaColumn",
    ])
    .orderBy("link.api_name")
    .execute();

  const inbound = await meta(db)
    .selectFrom("link")
    .innerJoin("object_type as other", "other.id", "link.source_type_id")
    .leftJoin("property as via", "via.id", "link.via_property_id")
    .where("link.target_type_id", "=", objectTypeId)
    .select([
      "link.inverse_api_name as apiName",
      "link.inverse_name as name",
      "link.cardinality as cardinality",
      "other.id as otherTypeId",
      "other.api_name as otherTypeApiName",
      "other.schema as otherSchema",
      "other.datasource_table as otherTable",
      "via.datasource_column as viaColumn",
    ])
    .orderBy("link.inverse_api_name")
    .execute();

  return [
    ...outbound.map((l) => ({ ...l, direction: "outbound" as const })),
    ...inbound.map((l) => ({ ...l, direction: "inbound" as const })),
  ];
}

/**
 * Turns a type's `schema` + `datasource_table` into a Datasource, refusing any
 * schema outside INSTANCE_SCHEMAS. A rejection here means the metadata is
 * misconfigured, not that the client asked for something invalid — hence 500.
 */
export function datasourceOf(type: {
  api_name: string;
  schema: string | null;
  datasource_table: string | null;
}): Datasource {
  const { schema, datasource_table: table } = type;
  if (!schema || !table) {
    throw new HTTPException(500, {
      message: `Object type "${type.api_name}" has no datasource configured`,
    });
  }
  if (!INSTANCE_SCHEMAS.has(schema)) {
    throw new HTTPException(500, {
      message: `Object type "${type.api_name}" points at unsupported schema "${schema}"`,
    });
  }
  return { schema, table };
}

/** The column a type's rows are keyed by. */
export function primaryKeyColumn(properties: PropertyRow[]): string {
  const pk = properties.find((p) => p.is_primary_key)?.datasource_column;
  if (!pk) {
    throw new HTTPException(500, { message: "Object type has no primary key property" });
  }
  return pk;
}

/** api_name of the property that labels an instance, falling back to the key. */
export function titleApiName(properties: PropertyRow[]): string | undefined {
  return (properties.find((p) => p.is_title) ?? properties.find((p) => p.is_primary_key))
    ?.api_name;
}

/**
 * Reshapes a raw database row into the API's view of an instance: only declared
 * properties, keyed by api_name instead of datasource_column.
 */
export function projectRow(
  properties: PropertyRow[],
  row: Record<string, unknown>,
): Record<string, unknown> {
  const projected: Record<string, unknown> = {};
  for (const property of properties) {
    if (!property.datasource_column) continue;
    projected[property.api_name] = row[property.datasource_column] ?? null;
  }
  return projected;
}

/** `column = value` with the identifier quoted and the value bound as a parameter. */
export function eq(column: string, value: unknown): RawBuilder<unknown> {
  return sql`${sql.id(column)} = ${value}`;
}

/** Operators a query filter may use. */
export const FILTER_OPS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "contains",
  "isNull",
  "isNotNull",
] as const;

export type FilterOp = (typeof FILTER_OPS)[number];

/** These read no `value` — the operator is the whole predicate. */
export const NO_VALUE_OPS = new Set<FilterOp>(["isNull", "isNotNull"]);

/** A `data_type` of "string[]" (etc.) means the column is a Postgres array. */
function isArrayType(dataType: string): boolean {
  return dataType.endsWith("[]");
}

/**
 * One `column <op> value` predicate, with the identifier quoted and the value
 * bound as a parameter — same containment as `eq`, which this generalises.
 *
 * Two operators are worth spelling out:
 *
 * - `neq` uses `is distinct from` rather than `<>`, so "status is not active"
 *   also returns rows whose status is NULL. Under `<>` a NULL compares to NULL
 *   and the row silently drops out, which reads as missing data to a caller.
 * - `contains` splits on the property's declared type: array columns test
 *   membership, everything else is a case-insensitive substring match. The cast
 *   to text lets it work on numbers and enums too. A caller that passes `%` or
 *   `_` gets LIKE's wildcard, not a literal — harmless here, since the value is
 *   still a bound parameter.
 */
export function condition(
  column: string,
  dataType: string,
  op: FilterOp,
  value: unknown,
): RawBuilder<unknown> {
  const id = sql.id(column);
  switch (op) {
    case "eq":
      return sql`${id} = ${value}`;
    case "neq":
      return sql`${id} is distinct from ${value}`;
    case "gt":
      return sql`${id} > ${value}`;
    case "gte":
      return sql`${id} >= ${value}`;
    case "lt":
      return sql`${id} < ${value}`;
    case "lte":
      return sql`${id} <= ${value}`;
    case "in":
      return sql`${id} = any(${value})`;
    case "contains":
      return isArrayType(dataType)
        ? sql`${value} = any(${id})`
        : sql`${id}::text ilike ${`%${String(value)}%`}`;
    case "isNull":
      return sql`${id} is null`;
    case "isNotNull":
      return sql`${id} is not null`;
  }
}

/**
 * Reads rows from a datasource table.
 *
 * Injection containment: the table name is quoted by `sql.id` and its schema was
 * allowlisted in `datasourceOf`; every column name comes from a
 * `property.datasource_column` we looked up ourselves (never from the request)
 * and is quoted by `sql.id`; and every filter value travels as a bound
 * parameter. No request string is ever concatenated into SQL text.
 */
export async function selectRows(
  db: Kysely<Database>,
  ds: Datasource,
  conditions: RawBuilder<unknown>[] = [],
  orderByColumn?: string,
  limit?: number,
): Promise<Record<string, unknown>[]> {
  const where =
    conditions.length > 0 ? sql`where ${sql.join(conditions, sql` and `)}` : sql``;
  const orderBy = orderByColumn ? sql`order by ${sql.id(orderByColumn)}` : sql``;
  const limitClause = limit === undefined ? sql`` : sql`limit ${limit}`;

  const { rows } = await sql<Record<string, unknown>>`
    select * from ${sql.id(ds.schema, ds.table)} ${where} ${orderBy} ${limitClause}
  `.execute(db);

  return rows;
}

/** How many instances a type has. Same identifier containment as `selectRows`. */
export async function countRows(db: Kysely<Database>, ds: Datasource): Promise<number> {
  const { rows } = await sql<{ count: number }>`
    select count(*)::int as count from ${sql.id(ds.schema, ds.table)}
  `.execute(db);
  return rows[0]?.count ?? 0;
}

/** A single row by primary key, or undefined. */
export async function selectRowById(
  db: Kysely<Database>,
  ds: Datasource,
  pkColumn: string,
  id: string,
): Promise<Record<string, unknown> | undefined> {
  const rows = await selectRows(db, ds, [eq(pkColumn, id)]);
  return rows[0];
}
