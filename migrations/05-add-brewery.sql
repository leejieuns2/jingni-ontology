-- 05-add-brewery.sql
-- Additive, idempotent migration on top of 04-manufacturing-with-monitoring.sql.
-- Applied via: pnpm run-sql migrations/05-add-brewery.sql
--
-- Adds a Brewery object type and parents existing tanks and lines under it:
--   - New instance table: manufacturing.brewery.
--   - New nullable FK column brewery_id on tank and on line (-> brewery.id).
--   - One default brewery (BREW-1) holding all existing equipment.
--   - Backfills every tank and line whose brewery_id is still NULL to BREW-1.
--   - Metadata so the type, the new columns, and the links are visible to the
--     generic routes/UI: a Brewery object_type, its properties, breweryId
--     properties on Tank and Line, and Tank -> Brewery / Line -> Brewery links.
--
-- Safe to run multiple times: tables/columns use IF NOT EXISTS, inserts use
-- ON CONFLICT DO NOTHING, and the backfill only touches still-NULL rows.

CREATE TABLE IF NOT EXISTS manufacturing.brewery (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  location        TEXT,
  commissioned_at TIMESTAMPTZ
);

ALTER TABLE manufacturing.tank ADD COLUMN IF NOT EXISTS brewery_id TEXT REFERENCES manufacturing.brewery(id);
ALTER TABLE manufacturing.line ADD COLUMN IF NOT EXISTS brewery_id TEXT REFERENCES manufacturing.brewery(id);

INSERT INTO manufacturing.brewery (id, name, location, commissioned_at) VALUES
  ('BREW-1', 'Original Brewery', 'Seoul', '2017-01-01')
ON CONFLICT (id) DO NOTHING;

UPDATE manufacturing.tank SET brewery_id = 'BREW-1' WHERE brewery_id IS NULL;
UPDATE manufacturing.line SET brewery_id = 'BREW-1' WHERE brewery_id IS NULL;

INSERT INTO manufacturing.object_type (id, api_name, name, description, schema, datasource_table) VALUES
  ('b1f0c0de-0000-4000-8000-000000000001', 'brewery', 'Brewery', 'A brewery site housing tanks and lines', 'manufacturing', 'brewery')
ON CONFLICT (api_name) DO NOTHING;

INSERT INTO manufacturing.property (id, object_type_id, api_name, name, data_type, required, is_title, is_primary_key, datasource_column) VALUES
  ('b1f0c0de-0000-4000-8000-000000000002', 'b1f0c0de-0000-4000-8000-000000000001', 'id',             'ID',           'string',   true,  false, true,  'id'),
  ('b1f0c0de-0000-4000-8000-000000000003', 'b1f0c0de-0000-4000-8000-000000000001', 'name',           'Name',         'string',   true,  true,  false, 'name'),
  ('b1f0c0de-0000-4000-8000-000000000004', 'b1f0c0de-0000-4000-8000-000000000001', 'location',       'Location',     'string',   false, false, false, 'location'),
  ('b1f0c0de-0000-4000-8000-000000000005', 'b1f0c0de-0000-4000-8000-000000000001', 'commissionedAt', 'Commissioned', 'datetime', false, false, false, 'commissioned_at')
ON CONFLICT (object_type_id, api_name) DO NOTHING;

INSERT INTO manufacturing.property (id, object_type_id, api_name, name, data_type, required, is_title, is_primary_key, datasource_column) VALUES
  ('b1f0c0de-0000-4000-8000-000000000006', '1455b2b2-5acf-43f3-918c-f96e13a34284', 'breweryId', 'Brewery', 'string', false, false, false, 'brewery_id'),
  ('b1f0c0de-0000-4000-8000-000000000007', '27c798ff-25e8-46c1-a327-cdd787d4a7b0', 'breweryId', 'Brewery', 'string', false, false, false, 'brewery_id')
ON CONFLICT (object_type_id, api_name) DO NOTHING;

INSERT INTO manufacturing.link (id, api_name, name, inverse_api_name, inverse_name, source_type_id, target_type_id, via_property_id, cardinality) VALUES
  ('b1f0c0de-0000-4000-8000-000000000008', 'brewery', 'Brewery', 'tanks', 'Tanks', '1455b2b2-5acf-43f3-918c-f96e13a34284', 'b1f0c0de-0000-4000-8000-000000000001', 'b1f0c0de-0000-4000-8000-000000000006', 'many_to_one'),
  ('b1f0c0de-0000-4000-8000-000000000009', 'brewery', 'Brewery', 'lines', 'Lines', '27c798ff-25e8-46c1-a327-cdd787d4a7b0', 'b1f0c0de-0000-4000-8000-000000000001', 'b1f0c0de-0000-4000-8000-000000000007', 'many_to_one')
ON CONFLICT DO NOTHING;
