// Metadata routes: what the ontology says about itself. Fully typed, because
// the metadata tables are schema-agnostic in `Database` and reached through
// `meta()` — the same code would serve another schema's ontology unchanged.
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { db } from "../db.ts";
import {
  countRows,
  datasourceOf,
  loadActionTypes,
  loadProperties,
  meta,
  requireObjectType,
  type ObjectTypeRow,
} from "../ontology/metadata.ts";

export const metaRoutes = new Hono();

/** GET /meta/types — every object type, with how many instances each has. */
metaRoutes.get("/meta/types", async (c) => {
  const types = await meta(db)
    .selectFrom("object_type")
    .selectAll()
    .orderBy("api_name")
    .execute();

  const data = await Promise.all(
    types.map(async (type) => ({ ...type, instanceCount: await instanceCount(type) })),
  );

  return c.json({ count: data.length, data });
});

/**
 * PATCH /meta/types/:type — edit a type's display name and description.
 *
 * Only these two are editable: api_name is the contract code depends on, and the
 * datasource columns describe physical storage.
 */
metaRoutes.patch("/meta/types/:type", async (c) => {
  const type = await requireObjectType(db, c.req.param("type"));

  const body: unknown = await c.req.json().catch(() => {
    throw new HTTPException(400, { message: "Request body is not valid JSON" });
  });
  if (typeof body !== "object" || body === null) {
    throw new HTTPException(400, { message: "Request body must be an object" });
  }

  const updates: { name?: string; description?: string | null } = {};
  const patch = body as Record<string, unknown>;

  if ("name" in patch) {
    const name = patch["name"];
    if (typeof name !== "string" || !name.trim()) {
      throw new HTTPException(400, { message: "name must be a non-empty string" });
    }
    updates.name = name.trim();
  }
  if ("description" in patch) {
    const description = patch["description"];
    if (description !== null && typeof description !== "string") {
      throw new HTTPException(400, { message: "description must be a string or null" });
    }
    updates.description = typeof description === "string" ? description.trim() : null;
  }
  if (Object.keys(updates).length === 0) {
    throw new HTTPException(400, { message: "Nothing to update: send name and/or description" });
  }

  const updated = await meta(db)
    .updateTable("object_type")
    .set(updates)
    .where("id", "=", type.id)
    .returningAll()
    .executeTakeFirstOrThrow();

  // Same shape as the list and bundle routes, so callers can swap the row in
  // without losing fields.
  return c.json({ ...updated, instanceCount: await instanceCount(updated) });
});

/** GET /meta/types/:type — one type's full metadata bundle. */
metaRoutes.get("/meta/types/:type", async (c) => {
  const type = await requireObjectType(db, c.req.param("type"));

  const [properties, outbound, inbound, actions, count] = await Promise.all([
    loadProperties(db, type.id),
    linksFrom(type.id),
    linksTo(type.id),
    loadActionTypes(db, type.id),
    instanceCount(type),
  ]);

  return c.json({
    objectType: { ...type, instanceCount: count },
    properties,
    links: { outbound, inbound },
    actions,
  });
});

/**
 * One misconfigured datasource shouldn't take the whole listing down, so a type
 * we cannot count degrades to null instead of throwing.
 */
async function instanceCount(type: ObjectTypeRow): Promise<number | null> {
  try {
    return await countRows(db, datasourceOf(type));
  } catch {
    return null;
  }
}

/** Links this type is the source of, labelled in the forward direction. */
function linksFrom(objectTypeId: string) {
  return linkQuery()
    .where("link.source_type_id", "=", objectTypeId)
    .select([
      "link.api_name as apiName",
      "link.name as name",
      "link.inverse_api_name as inverseApiName",
      "link.inverse_name as inverseName",
      "source.api_name as sourceType",
      "target.api_name as targetType",
    ])
    .orderBy("link.api_name")
    .execute();
}

/** Links this type is the target of, labelled in the inverse direction. */
function linksTo(objectTypeId: string) {
  return linkQuery()
    .where("link.target_type_id", "=", objectTypeId)
    .select([
      "link.inverse_api_name as apiName",
      "link.inverse_name as name",
      "link.api_name as inverseApiName",
      "link.name as inverseName",
      "source.api_name as sourceType",
      "target.api_name as targetType",
    ])
    .orderBy("link.inverse_api_name")
    .execute();
}

function linkQuery() {
  return meta(db)
    .selectFrom("link")
    .innerJoin("object_type as source", "source.id", "link.source_type_id")
    .innerJoin("object_type as target", "target.id", "link.target_type_id")
    .leftJoin("property as via", "via.id", "link.via_property_id")
    .select([
      "link.id as id",
      "link.cardinality as cardinality",
      "via.api_name as viaProperty",
      "via.datasource_column as viaColumn",
    ]);
}
