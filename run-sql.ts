#!/usr/bin/env node
// Executes a .sql file against DATABASE_URL and reports what each statement did.
// Run with: pnpm run-sql <file.sql>
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const filePath = process.argv[2];
if (!filePath) {
  console.error("usage: node --env-file=.env run-sql.ts <file.sql>");
  process.exit(1);
}

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  console.error("DATABASE_URL is not set (expected in .env at the repo root)");
  process.exit(1);
}

const absolutePath = resolve(filePath);
const sql = await readFile(absolutePath, "utf8");

if (!sql.trim()) {
  console.error(`${absolutePath} is empty — nothing to execute`);
  process.exit(1);
}

const client = new pg.Client({ connectionString });
await client.connect();

try {
  const result = await client.query(sql);
  // A multi-statement query yields one result per statement.
  const results = Array.isArray(result) ? result : [result];

  console.log(`${absolutePath}: ${results.length} statement(s) executed`);

  for (const [index, r] of results.entries()) {
    const label = `[${index + 1}/${results.length}] ${r.command ?? "?"}`;
    if (r.rows.length > 0) {
      console.log(`${label} — ${r.rows.length} row(s)`);
      console.table(r.rows);
    } else {
      console.log(`${label} — ${r.rowCount ?? 0} row(s) affected`);
    }
  }
} catch (error) {
  const { message, detail, hint, position } = error as pg.DatabaseError;
  console.error(`Failed executing ${absolutePath}: ${message}`);
  if (detail) console.error(`detail: ${detail}`);
  if (hint) console.error(`hint: ${hint}`);
  if (position) console.error(`position: ${position}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
