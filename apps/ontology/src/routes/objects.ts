// Instance routes. Nothing here knows the manufacturing schema exists — every
// table and column comes from the metadata tables at request time.
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { db } from "../db.ts";
import {
  condition,
  datasourceOf,
  eq,
  FILTER_OPS,
  loadLinks,
  loadProperties,
  meta,
  NO_VALUE_OPS,
  primaryKeyColumn,
  projectRow,
  requireObjectType,
  selectRowById,
  selectRows,
  type FilterOp,
  type ResolvedLink,
} from "../ontology/metadata.ts";

export const objectRoutes = new Hono();

/** GET /:type — every instance of a type, optionally filtered by property. */
objectRoutes.get("/:type", async (c) => {
  const type = await requireObjectType(db, c.req.param("type"));
  const ds = datasourceOf(type);
  const properties = await loadProperties(db, type.id);

  // Filters are accepted only for declared properties, and the column that ends
  // up in the query is the metadata's, never the caller's string.
  const byApiName = new Map(properties.map((p) => [p.api_name, p]));
  const conditions = Object.entries(c.req.query()).map(([key, value]) => {
    const column = byApiName.get(key)?.datasource_column;
    if (!column) {
      throw new HTTPException(400, {
        message: `"${key}" is not a filterable property of ${type.api_name}`,
      });
    }
    return eq(column, value);
  });

  const rows = await selectRows(db, ds, conditions, primaryKeyColumn(properties));

  return c.json({
    type: type.api_name,
    count: rows.length,
    data: rows.map((row) => projectRow(properties, row)),
  });
});

/**
 * POST /:type/query — a filtered read with explicit operators.
 *
 * The GET /:type query string can only express equality, and only one value per
 * property. This takes the same containment route — the column comes from
 * metadata we looked up, the value is bound — but lets the caller pick the
 * operator. Filters are ANDed; an empty filter list reads the whole type.
 *
 * `limit` defaults and is capped rather than being unbounded: the callers are
 * agents, and a few thousand rows would arrive as context rather than as a paged
 * result. The response echoes the effective `limit` and sets `truncated`, so the
 * caller knows to narrow instead of assuming it saw everything.
 */
objectRoutes.post("/:type/query", async (c) => {
  const type = await requireObjectType(db, c.req.param("type"));
  const ds = datasourceOf(type);
  const properties = await loadProperties(db, type.id);

  const { filters, limit } = await readQueryBody(c.req.raw);

  const byApiName = new Map(properties.map((p) => [p.api_name, p]));
  const conditions = filters.map((filter) => {
    const property = byApiName.get(filter.property);
    const column = property?.datasource_column;
    if (!property || !column) {
      throw new HTTPException(400, {
        message: `"${filter.property}" is not a filterable property of ${type.api_name}`,
      });
    }
    return condition(column, property.data_type, filter.op, filter.value);
  });

  const rows = await selectRows(db, ds, conditions, primaryKeyColumn(properties), limit);

  return c.json({
    // `limit` is echoed because it may have been clamped — otherwise a caller that
    // asked for 50000 and got 1000 rows has no way to tell a cap from an empty tail.
    type: type.api_name,
    count: rows.length,
    limit,
    truncated: rows.length === limit,
    data: rows.map((row) => projectRow(properties, row)),
  });
});

/** GET /:type/:id — one instance plus one hop of links in both directions. */
objectRoutes.get("/:type/:id", async (c) => {
  const id = c.req.param("id");
  const type = await requireObjectType(db, c.req.param("type"));
  const ds = datasourceOf(type);
  const properties = await loadProperties(db, type.id);

  const row = await selectRowById(db, ds, primaryKeyColumn(properties), id);
  if (!row) {
    throw new HTTPException(404, { message: `${type.api_name} "${id}" not found` });
  }

  const links = await loadLinks(db, type.id);
  const resolved: Record<string, unknown> = {};
  for (const link of links) {
    resolved[link.apiName] = await resolveLink(link, row, id);
  }

  return c.json({
    type: type.api_name,
    id,
    properties: projectRow(properties, row),
    links: resolved,
  });
});

/**
 * GET /:type/:id/audit — this object's action history, newest first.
 *
 * Reads the snapshot columns rather than joining through them, so the trail still
 * resolves for objects whose action type has since been renamed or deleted; the
 * join only supplies the current display name when one still exists.
 */
objectRoutes.get("/:type/:id/audit", async (c) => {
  const id = c.req.param("id");
  const type = await requireObjectType(db, c.req.param("type"));

  const data = await meta(db)
    .selectFrom("audit_log")
    .leftJoin("action_type", "action_type.id", "audit_log.action_type_id")
    .where("audit_log.target_type_api_name", "=", type.api_name)
    .where("audit_log.target_id", "=", id)
    .orderBy("audit_log.created_at", "desc")
    .select([
      "audit_log.id as id",
      "audit_log.action_api_name as action",
      "action_type.name as actionName",
      "audit_log.actor as actor",
      "audit_log.params as params",
      "audit_log.result as result",
      "audit_log.created_at as timestamp",
    ])
    .execute();

  return c.json({ type: type.api_name, id, count: data.length, data });
});

/** Rows returned when the caller names no `limit`. */
const DEFAULT_LIMIT = 100;

/**
 * Hard ceiling on `limit`. A caller that asks for more is clamped rather than
 * refused: the request is answerable, and `truncated` already tells it the page
 * was cut. Without this an agent can neutralise the cap entirely by asking for
 * Number.MAX_SAFE_INTEGER, which is exactly what one did.
 */
const MAX_LIMIT = 1000;

const OPS = new Set<string>(FILTER_OPS);

type QueryFilter = { property: string; op: FilterOp; value: unknown };

/**
 * Parses the body of POST /:type/query.
 *
 * Every rejection is a 400 naming the offending path, because the caller is
 * usually a model assembling the body from a tool schema — "filters[1].op must
 * be one of ..." is something it can act on, where a 500 is not. An absent or
 * empty body means "no filters", matching how the action routes read params.
 */
async function readQueryBody(
  request: Request,
): Promise<{ filters: QueryFilter[]; limit: number }> {
  const text = await request.text();
  if (!text.trim()) return { filters: [], limit: DEFAULT_LIMIT };

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HTTPException(400, { message: "Request body is not valid JSON" });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new HTTPException(400, { message: "Request body must be a JSON object" });
  }

  const { filters: rawFilters, limit: rawLimit } = body as {
    filters?: unknown;
    limit?: unknown;
  };

  let limit = DEFAULT_LIMIT;
  if (rawLimit !== undefined && rawLimit !== null) {
    if (typeof rawLimit !== "number" || !Number.isInteger(rawLimit) || rawLimit < 1) {
      throw new HTTPException(400, { message: `"limit" must be a positive integer` });
    }
    limit = Math.min(rawLimit, MAX_LIMIT);
  }

  if (rawFilters === undefined || rawFilters === null) return { filters: [], limit };
  if (!Array.isArray(rawFilters)) {
    throw new HTTPException(400, { message: `"filters" must be an array` });
  }

  return { filters: rawFilters.map(parseFilter), limit };
}

function parseFilter(entry: unknown, index: number): QueryFilter {
  const at = `filters[${index}]`;
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    throw new HTTPException(400, { message: `${at} must be an object` });
  }

  const { property, op, value } = entry as {
    property?: unknown;
    op?: unknown;
    value?: unknown;
  };

  if (typeof property !== "string" || !property) {
    throw new HTTPException(400, {
      message: `${at}.property must be a non-empty string`,
    });
  }
  if (typeof op !== "string" || !OPS.has(op)) {
    throw new HTTPException(400, {
      message: `${at}.op must be one of ${FILTER_OPS.join(", ")}`,
    });
  }

  const filterOp = op as FilterOp;

  // isNull/isNotNull are the whole predicate; a value would be silently dropped,
  // so it is neither required nor read.
  if (NO_VALUE_OPS.has(filterOp)) return { property, op: filterOp, value: null };

  if (value === undefined) {
    throw new HTTPException(400, { message: `${at}.value is required for op "${op}"` });
  }
  if (filterOp === "in" && !Array.isArray(value)) {
    throw new HTTPException(400, {
      message: `${at}.value must be an array for op "in"`,
    });
  }

  return { property, op: filterOp, value };
}

/**
 * Follows one link from a single instance.
 *
 * Outbound, the foreign key sits on the row we already have: read it via the
 * link's property, then look the target up by its own primary key. Inbound, the
 * foreign key sits on the other side, so we scan the source table for rows
 * pointing back at us.
 */
async function resolveLink(
  link: ResolvedLink,
  row: Record<string, unknown>,
  id: string,
): Promise<Record<string, unknown>> {
  const single =
    link.direction === "outbound"
      ? link.cardinality === "many_to_one" || link.cardinality === "one_to_one"
      : link.cardinality === "one_to_one";

  const label = {
    name: link.name,
    direction: link.direction,
    type: link.otherTypeApiName,
    cardinality: link.cardinality,
  };

  const viaColumn = link.viaColumn;
  if (!viaColumn) {
    // A link with no backing property cannot be walked; say so rather than
    // silently reporting "no related objects".
    return { ...label, error: "link has no via property" };
  }

  const otherDs = datasourceOf({
    api_name: link.otherTypeApiName,
    schema: link.otherSchema,
    datasource_table: link.otherTable,
  });
  const otherProperties = await loadProperties(db, link.otherTypeId);

  let rows: Record<string, unknown>[] = [];
  if (link.direction === "inbound") {
    rows = await selectRows(db, otherDs, [eq(viaColumn, id)]);
  } else {
    const foreignKey = row[viaColumn];
    if (foreignKey !== null && foreignKey !== undefined) {
      rows = await selectRows(db, otherDs, [eq(primaryKeyColumn(otherProperties), foreignKey)]);
    }
  }

  const projected = rows.map((r) => projectRow(otherProperties, r));
  return { ...label, value: single ? (projected[0] ?? null) : projected };
}
