-- insurance-base.sql
-- Seed for the `insurance` ontology.
-- Applied via: pnpm run-sql seeds/insurance-base.sql

-- ============================================================================
-- Schema
-- ============================================================================

DROP SCHEMA IF EXISTS insurance CASCADE;
CREATE SCHEMA insurance;

-- ============================================================================
-- Metadata tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS insurance.object_type (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_name      TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'active',
  visibility    TEXT NOT NULL DEFAULT 'visible',
  point_of_contact TEXT,
  edits_enabled BOOLEAN NOT NULL DEFAULT true,
  schema        TEXT NOT NULL,
  datasource_table TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS insurance.property (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type_id   UUID NOT NULL REFERENCES insurance.object_type(id),
  api_name         TEXT NOT NULL,
  name             TEXT NOT NULL,
  data_type        TEXT NOT NULL,
  required         BOOLEAN NOT NULL DEFAULT false,
  is_title         BOOLEAN NOT NULL DEFAULT false,
  is_primary_key   BOOLEAN NOT NULL DEFAULT false,
  datasource_column TEXT NOT NULL,
  UNIQUE (object_type_id, api_name)
);

CREATE TABLE IF NOT EXISTS insurance.link (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_name         TEXT NOT NULL,
  name             TEXT NOT NULL,
  inverse_api_name TEXT NOT NULL,
  inverse_name     TEXT NOT NULL,
  source_type_id   UUID NOT NULL REFERENCES insurance.object_type(id),
  target_type_id   UUID NOT NULL REFERENCES insurance.object_type(id),
  via_property_id  UUID NOT NULL REFERENCES insurance.property(id),
  cardinality      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS insurance.action_type (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type_id   UUID NOT NULL REFERENCES insurance.object_type(id),
  api_name         TEXT NOT NULL,
  name             TEXT NOT NULL,
  description      TEXT,
  parameter_schema JSONB NOT NULL,
  UNIQUE (object_type_id, api_name)
);

CREATE TABLE IF NOT EXISTS insurance.audit_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type_id        UUID NOT NULL REFERENCES insurance.action_type(id),
  action_api_name       TEXT NOT NULL,
  target_type_id        UUID NOT NULL REFERENCES insurance.object_type(id),
  target_type_api_name  TEXT NOT NULL,
  target_id             TEXT NOT NULL,
  actor                 TEXT NOT NULL,
  params                JSONB,
  result                JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- Instance tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS insurance.customer (
  id      TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  contact TEXT
);

CREATE TABLE IF NOT EXISTS insurance.policy_template (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  line TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS insurance.policy (
  id                    TEXT PRIMARY KEY,
  policy_number         TEXT NOT NULL,
  customer_id           TEXT,
  template_id           TEXT,
  start_date            DATE,
  end_date              DATE,
  premium               NUMERIC,
  status                TEXT NOT NULL,
  driver_scope          TEXT,
  reporting_window_days INTEGER
);

CREATE TABLE IF NOT EXISTS insurance.coverage_clause (
  id                  TEXT PRIMARY KEY,
  policy_template_id  TEXT,
  policy_id           TEXT,
  effect              TEXT NOT NULL,
  category            TEXT,
  text                TEXT,
  overrides_clause_id TEXT,
  limit_amount        NUMERIC,
  deductible_amount   NUMERIC
);

CREATE TABLE IF NOT EXISTS insurance.customer_inquiry (
  id          TEXT PRIMARY KEY,
  customer_id TEXT,
  question    TEXT NOT NULL,
  status      TEXT NOT NULL,
  resolution  TEXT
);

CREATE TABLE IF NOT EXISTS insurance.claim (
  id                 TEXT PRIMARY KEY,
  claim_number       TEXT NOT NULL,
  policy_id          TEXT,
  customer_id        TEXT,
  incident_date      DATE,
  filed_date         DATE,
  claim_type         TEXT,
  amount_claimed     NUMERIC,
  status             TEXT NOT NULL,
  narrative          TEXT,
  documents_complete BOOLEAN
);

CREATE TABLE IF NOT EXISTS insurance.proposal (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type          TEXT NOT NULL,
  target_id     TEXT NOT NULL,
  params        JSONB NOT NULL,
  rationale     TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected', 'escalated')),
  proposed_by   TEXT NOT NULL,
  proposed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by   TEXT,
  reviewed_at   TIMESTAMPTZ,
  decision_note TEXT
);

-- ============================================================================
-- Metadata: object types
-- ============================================================================

INSERT INTO insurance.object_type (id, api_name, name, description, schema, datasource_table) VALUES
  ('2afeb90f-c514-4bca-ae69-3682cb616034', 'customer',        'Customer',         'A policyholder',                                       'insurance', 'customer'),
  ('de8d3a14-c67d-43d8-a5a2-afaaf6cd833b', 'policyTemplate',  'Policy Template',  'A reusable product template a policy is issued from',  'insurance', 'policy_template'),
  ('f9606c28-7de7-4b0b-a9f3-c2eed384e7f6', 'policy',          'Policy',           'An issued insurance policy held by a customer',        'insurance', 'policy'),
  ('f8be80b5-4e31-42fc-9413-0a9f0878478e', 'coverageClause',  'Coverage Clause',  'A clause attached to a template or a policy that covers, excludes, limits, or conditions coverage', 'insurance', 'coverage_clause'),
  ('73a33800-16c7-404f-b045-4d155c7986b8', 'customerInquiry', 'Customer Inquiry', 'A customer''s coverage question',                      'insurance', 'customer_inquiry'),
  ('512de3ee-92cc-4e26-83b8-b3e136550aed', 'claim',           'Claim',            'A claim filed against a policy',                       'insurance', 'claim'),
  ('32ecff2d-ce8d-4b51-b548-ca29b7fdc900', 'proposal',        'Proposal',         'An agent-authored request to run an action, awaiting human review', 'insurance', 'proposal')
ON CONFLICT (api_name) DO NOTHING;

-- ============================================================================
-- Metadata: properties
-- ============================================================================

-- Customer properties
INSERT INTO insurance.property (id, object_type_id, api_name, name, data_type, required, is_title, is_primary_key, datasource_column) VALUES
  ('1c101662-0a36-4248-8057-fee8a878aa0a', '2afeb90f-c514-4bca-ae69-3682cb616034', 'id',      'ID',      'string', true,  false, true,  'id'),
  ('83da5156-eb88-4c5d-9729-576c4f00067b', '2afeb90f-c514-4bca-ae69-3682cb616034', 'name',    'Name',    'string', true,  true,  false, 'name'),
  ('aabe3f0e-2b1d-497e-b0ca-d333ecd243b5', '2afeb90f-c514-4bca-ae69-3682cb616034', 'contact', 'Contact', 'string', false, false, false, 'contact')
ON CONFLICT (object_type_id, api_name) DO NOTHING;

-- PolicyTemplate properties
INSERT INTO insurance.property (id, object_type_id, api_name, name, data_type, required, is_title, is_primary_key, datasource_column) VALUES
  ('478cf96c-b768-4965-b53e-17d7bbc07a6e', 'de8d3a14-c67d-43d8-a5a2-afaaf6cd833b', 'id',   'ID',   'string', true,  false, true,  'id'),
  ('45dcb10a-2a2d-4ad1-ba22-911bdb2071fb', 'de8d3a14-c67d-43d8-a5a2-afaaf6cd833b', 'name', 'Name', 'string', true,  true,  false, 'name'),
  ('2593f2b6-7ca9-4c35-bd6c-d03a7e69a155', 'de8d3a14-c67d-43d8-a5a2-afaaf6cd833b', 'line', 'Line', 'string', true,  false, false, 'line')
ON CONFLICT (object_type_id, api_name) DO NOTHING;

-- Policy properties
INSERT INTO insurance.property (id, object_type_id, api_name, name, data_type, required, is_title, is_primary_key, datasource_column) VALUES
  ('ec5b82ba-0ce4-499f-9f5f-35f35dffa183', 'f9606c28-7de7-4b0b-a9f3-c2eed384e7f6', 'id',                  'ID',                  'string', true,  false, true,  'id'),
  ('5354ed73-5632-42b9-b2a6-26809ba5c79a', 'f9606c28-7de7-4b0b-a9f3-c2eed384e7f6', 'policyNumber',        'Policy Number',       'string', true,  true,  false, 'policy_number'),
  ('5454122e-0db2-4db4-8171-4ace30668553', 'f9606c28-7de7-4b0b-a9f3-c2eed384e7f6', 'customerId',          'Customer',            'string', true,  false, false, 'customer_id'),
  ('f93ca7fa-10f6-4fdf-88c8-23626f07a31b', 'f9606c28-7de7-4b0b-a9f3-c2eed384e7f6', 'templateId',          'Template',            'string', true,  false, false, 'template_id'),
  ('3d169dc7-7ba9-4a78-bc9e-89a64f648f2d', 'f9606c28-7de7-4b0b-a9f3-c2eed384e7f6', 'startDate',           'Start Date',          'date',   false, false, false, 'start_date'),
  ('6e31cfd4-97df-4e65-b098-745a9e677799', 'f9606c28-7de7-4b0b-a9f3-c2eed384e7f6', 'endDate',             'End Date',            'date',   false, false, false, 'end_date'),
  ('8143d10d-4a4e-48ec-a38f-fc62b763b0a6', 'f9606c28-7de7-4b0b-a9f3-c2eed384e7f6', 'premium',             'Premium',             'number', false, false, false, 'premium'),
  ('9d7dbd3a-dffe-412d-883c-0d8ee06eed25', 'f9606c28-7de7-4b0b-a9f3-c2eed384e7f6', 'status',              'Status',              'enum',   true,  false, false, 'status'),
  ('03bd56c2-88fa-4bfd-a73e-039843aab186', 'f9606c28-7de7-4b0b-a9f3-c2eed384e7f6', 'driverScope',         'Driver Scope',        'enum',   false, false, false, 'driver_scope'),
  ('0e8d5383-31f1-47f1-bf13-4809d788c5d8', 'f9606c28-7de7-4b0b-a9f3-c2eed384e7f6', 'reportingWindowDays', 'Reporting Window (days)', 'number', false, false, false, 'reporting_window_days')
ON CONFLICT (object_type_id, api_name) DO NOTHING;

-- CoverageClause properties
INSERT INTO insurance.property (id, object_type_id, api_name, name, data_type, required, is_title, is_primary_key, datasource_column) VALUES
  ('360b8913-bdb5-4790-a3f5-ce2c95f1a11c', 'f8be80b5-4e31-42fc-9413-0a9f0878478e', 'id',                'ID',                'string', true,  true,  true,  'id'),
  ('4e29aeef-c04d-4bbb-a1a9-318ce6617785', 'f8be80b5-4e31-42fc-9413-0a9f0878478e', 'policyTemplateId',  'Policy Template',   'string', false, false, false, 'policy_template_id'),
  ('c84a0d75-bc57-49f3-8cd5-fb1062c51b90', 'f8be80b5-4e31-42fc-9413-0a9f0878478e', 'policyId',          'Policy',            'string', false, false, false, 'policy_id'),
  ('9e0b9325-7c06-4df8-b022-6f7c237c5ff9', 'f8be80b5-4e31-42fc-9413-0a9f0878478e', 'effect',            'Effect',            'enum',   true,  false, false, 'effect'),
  ('b078dbb3-d97d-4fdc-94a9-3d3432725e00', 'f8be80b5-4e31-42fc-9413-0a9f0878478e', 'category',          'Category',          'string', false, false, false, 'category'),
  ('c8ce2a16-01b5-4d45-b105-5f42926edde1', 'f8be80b5-4e31-42fc-9413-0a9f0878478e', 'text',              'Text',              'string', false, false, false, 'text'),
  ('9c2efa5c-2f9c-45dd-857e-99a210afbb46', 'f8be80b5-4e31-42fc-9413-0a9f0878478e', 'overridesClauseId', 'Overrides Clause',  'string', false, false, false, 'overrides_clause_id'),
  ('06a22484-bdd7-467f-a751-2cf691d5987a', 'f8be80b5-4e31-42fc-9413-0a9f0878478e', 'limitAmount',       'Limit Amount',      'number', false, false, false, 'limit_amount'),
  ('c4e6fe85-242e-4cd4-a2f0-635bb1552ace', 'f8be80b5-4e31-42fc-9413-0a9f0878478e', 'deductibleAmount',  'Deductible Amount', 'number', false, false, false, 'deductible_amount')
ON CONFLICT (object_type_id, api_name) DO NOTHING;

-- CustomerInquiry properties
INSERT INTO insurance.property (id, object_type_id, api_name, name, data_type, required, is_title, is_primary_key, datasource_column) VALUES
  ('a2c07394-e849-4287-ac7d-ad202ce6db7a', '73a33800-16c7-404f-b045-4d155c7986b8', 'id',         'ID',         'string', true,  true,  true,  'id'),
  ('96323955-f692-4c07-a698-2b1abc439e11', '73a33800-16c7-404f-b045-4d155c7986b8', 'customerId', 'Customer',   'string', true,  false, false, 'customer_id'),
  ('0337f3d1-a886-46ef-80e0-3f7d913e2343', '73a33800-16c7-404f-b045-4d155c7986b8', 'question',   'Question',   'string', true,  false, false, 'question'),
  ('9218c489-a63e-4b34-b362-64325684931f', '73a33800-16c7-404f-b045-4d155c7986b8', 'status',     'Status',     'string', true,  false, false, 'status'),
  ('d1caa444-e188-47ef-9b82-136b44b53e5a', '73a33800-16c7-404f-b045-4d155c7986b8', 'resolution', 'Resolution', 'string', false, false, false, 'resolution')
ON CONFLICT (object_type_id, api_name) DO NOTHING;

-- Claim properties
INSERT INTO insurance.property (id, object_type_id, api_name, name, data_type, required, is_title, is_primary_key, datasource_column) VALUES
  ('88c37643-ae43-4c7c-aea7-bfc48b82675a', '512de3ee-92cc-4e26-83b8-b3e136550aed', 'id',                'ID',                'string',  true,  true,  true,  'id'),
  ('585181fd-4bd3-4f74-b90a-d9b6f0f12d74', '512de3ee-92cc-4e26-83b8-b3e136550aed', 'claimNumber',       'Claim Number',      'string',  true,  false, false, 'claim_number'),
  ('19505b3c-330d-4b27-a280-0dfa368bfe08', '512de3ee-92cc-4e26-83b8-b3e136550aed', 'policyId',          'Policy',            'string',  true,  false, false, 'policy_id'),
  ('c3d5a9a8-89c7-4643-8470-b88e1a4b30cc', '512de3ee-92cc-4e26-83b8-b3e136550aed', 'customerId',        'Customer',          'string',  true,  false, false, 'customer_id'),
  ('fd44b894-29b9-4c2a-8c73-abff7af3f4b5', '512de3ee-92cc-4e26-83b8-b3e136550aed', 'incidentDate',      'Incident Date',     'date',    false, false, false, 'incident_date'),
  ('42e2971e-64a6-4812-8313-54316d11f735', '512de3ee-92cc-4e26-83b8-b3e136550aed', 'filedDate',         'Filed Date',        'date',    false, false, false, 'filed_date'),
  ('d76b32d2-0b33-4feb-a201-900a8c6a63c7', '512de3ee-92cc-4e26-83b8-b3e136550aed', 'claimType',         'Claim Type',        'string',  false, false, false, 'claim_type'),
  ('7add8307-7d4f-4146-b521-a7822a328fa4', '512de3ee-92cc-4e26-83b8-b3e136550aed', 'amountClaimed',     'Amount Claimed',    'number',  false, false, false, 'amount_claimed'),
  ('48355f40-5ed0-46fd-ad47-5126446be4bd', '512de3ee-92cc-4e26-83b8-b3e136550aed', 'status',            'Status',            'enum',    true,  false, false, 'status'),
  ('eace3715-8a09-45fd-9097-0cd62b6eb1d8', '512de3ee-92cc-4e26-83b8-b3e136550aed', 'narrative',         'Narrative',         'string',  false, false, false, 'narrative'),
  ('60f866ef-8164-4db6-8468-92a40373d5bd', '512de3ee-92cc-4e26-83b8-b3e136550aed', 'documentsComplete', 'Documents Complete', 'boolean', false, false, false, 'documents_complete')
ON CONFLICT (object_type_id, api_name) DO NOTHING;

-- Proposal properties (mirrors manufacturing.proposal)
INSERT INTO insurance.property (id, object_type_id, api_name, name, data_type, required, is_title, is_primary_key, datasource_column) VALUES
  ('2076f890-0669-47ee-baaa-950bfe5bd27a', '32ecff2d-ce8d-4b51-b548-ca29b7fdc900', 'id',           'ID',            'string',   true,  false, true,  'id'),
  ('b84600d9-92ab-4e69-81fe-9ce0a03a9c35', '32ecff2d-ce8d-4b51-b548-ca29b7fdc900', 'type',         'Type',          'string',   true,  true,  false, 'type'),
  ('47077cda-7a46-4394-b602-2b4227ca9d22', '32ecff2d-ce8d-4b51-b548-ca29b7fdc900', 'targetId',     'Target',        'string',   true,  false, false, 'target_id'),
  ('4e65c918-c811-4501-955f-87a7a72875f0', '32ecff2d-ce8d-4b51-b548-ca29b7fdc900', 'params',       'Parameters',    'json',     true,  false, false, 'params'),
  ('62d28bf7-17f0-4503-990e-a6551409e596', '32ecff2d-ce8d-4b51-b548-ca29b7fdc900', 'rationale',    'Rationale',     'string',   true,  false, false, 'rationale'),
  ('e4a3345e-4849-42ef-92e5-a6bed0e4d900', '32ecff2d-ce8d-4b51-b548-ca29b7fdc900', 'status',       'Status',        'enum',     true,  false, false, 'status'),
  ('d9e588d6-5a7f-4f60-98ea-a515e20130c7', '32ecff2d-ce8d-4b51-b548-ca29b7fdc900', 'proposedBy',   'Proposed By',   'string',   true,  false, false, 'proposed_by'),
  ('29baee4c-1a6e-43bb-8539-0fb4fb36067e', '32ecff2d-ce8d-4b51-b548-ca29b7fdc900', 'proposedAt',   'Proposed At',   'datetime', true,  false, false, 'proposed_at'),
  ('956ec3ba-bcdf-4009-b158-297bb5dd2f0d', '32ecff2d-ce8d-4b51-b548-ca29b7fdc900', 'reviewedBy',   'Reviewed By',   'string',   false, false, false, 'reviewed_by'),
  ('ba85dccc-cfd5-45ad-bb6f-02997d149f14', '32ecff2d-ce8d-4b51-b548-ca29b7fdc900', 'reviewedAt',   'Reviewed At',   'datetime', false, false, false, 'reviewed_at'),
  ('a90f59f0-1873-4235-a0d8-252052e544ff', '32ecff2d-ce8d-4b51-b548-ca29b7fdc900', 'decisionNote', 'Decision Note', 'string',   false, false, false, 'decision_note')
ON CONFLICT (object_type_id, api_name) DO NOTHING;

-- ============================================================================
-- Metadata: links
-- ============================================================================
-- Source holds the FK; via_property_id points at the FK property on the source.

INSERT INTO insurance.link (id, api_name, name, inverse_api_name, inverse_name, source_type_id, target_type_id, via_property_id, cardinality) VALUES
  -- Policy.customerId -> Customer (inverse: policies)
  ('bfe154c5-311b-4ee6-90b4-d597698100ce', 'customer',       'Customer',        'policies',     'Policies',       'f9606c28-7de7-4b0b-a9f3-c2eed384e7f6', '2afeb90f-c514-4bca-ae69-3682cb616034', '5454122e-0db2-4db4-8171-4ace30668553', 'many_to_one'),
  -- Policy.templateId -> PolicyTemplate (inverse: policies)
  ('0ad90c3c-eb09-401b-a8f7-38f55edd3a51', 'template',       'Template',        'policies',     'Policies',       'f9606c28-7de7-4b0b-a9f3-c2eed384e7f6', 'de8d3a14-c67d-43d8-a5a2-afaaf6cd833b', 'f93ca7fa-10f6-4fdf-88c8-23626f07a31b', 'many_to_one'),
  -- CoverageClause.policyTemplateId -> PolicyTemplate (inverse: clauses)
  ('800d9da2-0d6e-4626-b0cd-9b9e2727679c', 'policyTemplate', 'Policy Template', 'clauses',      'Clauses',        'f8be80b5-4e31-42fc-9413-0a9f0878478e', 'de8d3a14-c67d-43d8-a5a2-afaaf6cd833b', '4e29aeef-c04d-4bbb-a1a9-318ce6617785', 'many_to_one'),
  -- CoverageClause.policyId -> Policy (inverse: riders)
  ('cd93bd9f-a6df-435f-9d87-f1b9491f58f1', 'policy',         'Policy',          'riders',       'Riders',         'f8be80b5-4e31-42fc-9413-0a9f0878478e', 'f9606c28-7de7-4b0b-a9f3-c2eed384e7f6', 'c84a0d75-bc57-49f3-8cd5-fb1062c51b90', 'many_to_one'),
  -- CoverageClause.overridesClauseId -> CoverageClause (self-ref; inverse: overriddenBy)
  ('7acd6d96-95c7-4dbc-842c-809e1e0eb56c', 'overrides',      'Overrides',       'overriddenBy', 'Overridden By',  'f8be80b5-4e31-42fc-9413-0a9f0878478e', 'f8be80b5-4e31-42fc-9413-0a9f0878478e', '9c2efa5c-2f9c-45dd-857e-99a210afbb46', 'many_to_one'),
  -- CustomerInquiry.customerId -> Customer (inverse: inquiries)
  ('e6f16eb9-2f1d-4b20-92e8-79be6c369a6a', 'customer',       'Customer',        'inquiries',    'Inquiries',      '73a33800-16c7-404f-b045-4d155c7986b8', '2afeb90f-c514-4bca-ae69-3682cb616034', '96323955-f692-4c07-a698-2b1abc439e11', 'many_to_one'),
  -- Claim.policyId -> Policy (inverse: claims)
  ('dca65424-4a1f-4e07-9a2d-7e5cc2f32bc5', 'policy',         'Policy',          'claims',       'Claims',         '512de3ee-92cc-4e26-83b8-b3e136550aed', 'f9606c28-7de7-4b0b-a9f3-c2eed384e7f6', '19505b3c-330d-4b27-a280-0dfa368bfe08', 'many_to_one'),
  -- Claim.customerId -> Customer (inverse: claims)
  ('34f07f81-80ef-434e-bada-c7584814ad81', 'customer',       'Customer',        'claims',       'Claims',         '512de3ee-92cc-4e26-83b8-b3e136550aed', '2afeb90f-c514-4bca-ae69-3682cb616034', 'c3d5a9a8-89c7-4643-8470-b88e1a4b30cc', 'many_to_one')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Metadata: action types
-- ============================================================================

INSERT INTO insurance.action_type (id, object_type_id, api_name, name, description, parameter_schema) VALUES
  ('e3db28cc-233b-41ff-9964-5ff1f3401f11', '32ecff2d-ce8d-4b51-b548-ca29b7fdc900', 'approve', 'Approve Proposal',
   'Approve a pending proposal and run the underlying action it requests',
   '{"type":"object","properties":{"decisionNote":{"type":"string"}}}'),
  ('eecc501c-fc4d-4e74-9f3d-130c7488e5d7', '32ecff2d-ce8d-4b51-b548-ca29b7fdc900', 'reject', 'Reject Proposal',
   'Reject a pending proposal without running the underlying action',
   '{"type":"object","properties":{"decisionNote":{"type":"string"}}}'),
  ('f440bf3a-6457-4f2f-833d-29bde42b3ccd', '32ecff2d-ce8d-4b51-b548-ca29b7fdc900', 'escalate', 'Escalate Proposal',
   'Escalate a pending proposal to a human when its rationale rests on a material unsupported assumption. Does not run the underlying action; the proposal stays open for a human to approve or reject.',
   '{"type":"object","properties":{"note":{"type":"string"}},"required":["note"]}')
ON CONFLICT (object_type_id, api_name) DO NOTHING;

-- ============================================================================
-- Instance data: Customers
-- ============================================================================

INSERT INTO insurance.customer (id, name, contact) VALUES
  ('CUST-301', 'Kim Min-jun',  'kim.minjun@example.com'),
  ('CUST-302', 'Lee Seo-yeon', 'lee.seoyeon@example.com')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Instance data: Policy templates
-- ============================================================================

INSERT INTO insurance.policy_template (id, name, line) VALUES
  ('PT-AUTO-STD', 'Standard Auto Policy', 'auto')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Instance data: Policies
-- ============================================================================

INSERT INTO insurance.policy (id, policy_number, customer_id, template_id, start_date, end_date, premium, status, driver_scope, reporting_window_days) VALUES
  ('POL-301', 'AUTO-2026-0301', 'CUST-301', 'PT-AUTO-STD', '2026-01-01', '2026-12-31', 720000, 'active', 'couple', 30),
  ('POL-302', 'AUTO-2026-0302', 'CUST-302', 'PT-AUTO-STD', '2026-01-01', '2026-12-31', 720000, 'active', 'couple', 30)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Instance data: Coverage clauses
-- ============================================================================
-- Exactly one of policy_template_id / policy_id is populated per row.

INSERT INTO insurance.coverage_clause (id, policy_template_id, policy_id, effect, category, text, overrides_clause_id, limit_amount, deductible_amount) VALUES
  ('CL-BASE-COLLISION',   'PT-AUTO-STD', NULL,      'covers',   'collision',      'Covers collision damage from personal auto use up to the policy limit.',                                              NULL,             10000000, NULL),
  ('CL-EXCL-DRIVER',      'PT-AUTO-STD', NULL,      'excludes', 'driver-scope',   'Excludes coverage when the vehicle is driven by someone outside the policy''s listed driver scope.',                  NULL,             NULL,     NULL),
  ('CL-EXCL-COMMERCIAL',  'PT-AUTO-STD', NULL,      'excludes', 'commercial-use', 'Excludes collision damage while the vehicle is used for paid delivery or other commercial use.',                       NULL,             NULL,     NULL),
  ('CL-RIDER-TEMP',       NULL,          'POL-301', 'covers',   'driver-scope',   'Restores collision coverage for a temporary unlisted driver, subject to policy terms.',                               'CL-EXCL-DRIVER', NULL,     NULL)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Instance data: Customer inquiries
-- ============================================================================

INSERT INTO insurance.customer_inquiry (id, customer_id, question, status, resolution) VALUES
  ('INQ-501', 'CUST-301', 'I was driving my car on a weekend trip and rear-ended another car. Is the damage to my car covered?',        'open', NULL),
  ('INQ-502', 'CUST-301', 'I was driving my car to do paid food deliveries when I got into an accident. Is that covered?',             'open', NULL),
  ('INQ-503', 'CUST-301', 'My friend borrowed my car for the afternoon and got into an accident. Am I covered?',                       'open', NULL),
  ('INQ-504', 'CUST-302', 'My friend borrowed my car for the afternoon and got into an accident. Am I covered?',                       'open', NULL)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Instance data: Claims
-- ============================================================================

INSERT INTO insurance.claim (id, claim_number, policy_id, customer_id, incident_date, filed_date, claim_type, amount_claimed, status, narrative, documents_complete) VALUES
  ('CLM-401', 'CL-2026-401', 'POL-301', 'CUST-301', '2026-04-20', '2026-04-22', 'collision', 3000000, 'filed', 'I was driving my own car for a personal errand when another vehicle rear-ended me at a stoplight. The rear bumper and trunk are damaged.', true),
  ('CLM-402', 'CL-2026-402', 'POL-302', 'CUST-302', '2026-04-21', '2026-04-24', 'collision', 2500000, 'filed', 'After a weekend trip, my car was damaged in a collision. I was with a friend who sometimes drove during the trip, and I need to claim the repair.', true),
  ('CLM-403', 'CL-2026-403', 'POL-999', 'CUST-301', '2026-04-19', '2026-04-23', 'collision', 1800000, 'filed', 'Minor collision in a parking lot, filing for repair.', true)
ON CONFLICT (id) DO NOTHING;