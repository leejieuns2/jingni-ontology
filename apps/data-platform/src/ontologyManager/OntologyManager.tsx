import {
  Callout,
  Card,
  EditableText,
  H2,
  HTMLTable,
  NonIdealState,
  Section,
  SectionCard,
  Icon,
  Spinner,
  Tag,
} from "@blueprintjs/core";
import { useEffect, useState, type ReactNode } from "react";
import {
  getTypeBundle,
  patchType,
  type LinkMeta,
  type ObjectTypeMeta,
  type TypeBundle,
} from "../api.ts";
import { TypeRail } from "../TypeRail.tsx";

type Props = {
  types: ObjectTypeMeta[];
  loadError: string | null;
  /** Called after a successful edit so the rail picks up the new display name. */
  onTypeUpdated: () => void;
};

export function OntologyManager({ types, loadError, onTypeUpdated }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [bundle, setBundle] = useState<TypeBundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Land on the first type once the list arrives.
  useEffect(() => {
    if (!selected && types.length > 0) setSelected(types[0]?.api_name ?? null);
  }, [types, selected]);

  useEffect(() => {
    if (!selected) return;
    setBundle(null);
    setError(null);
    getTypeBundle(selected)
      .then(setBundle)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : String(cause)),
      );
  }, [selected]);

  async function save(updates: { name?: string; description?: string | null }) {
    if (!selected) return;
    try {
      const objectType = await patchType(selected, updates);
      setBundle((current) => (current ? { ...current, objectType } : current));
      setError(null);
      onTypeUpdated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <div className="page">
      <TypeRail types={types} selectedApiName={selected} onSelect={setSelected} />

      <main className="page__main">
        {loadError && <Callout intent="danger" title="Could not load object types">{loadError}</Callout>}
        {error && <Callout intent="danger" title="Request failed">{error}</Callout>}

        {!bundle ? (
          <div className="page__loading">{selected ? <Spinner /> : null}</div>
        ) : (
          <TypeDetail bundle={bundle} onSave={save} />
        )}
      </main>
    </div>
  );
}

function TypeDetail({
  bundle,
  onSave,
}: {
  bundle: TypeBundle;
  onSave: (updates: { name?: string; description?: string | null }) => void;
}) {
  const { objectType, properties, links, actions } = bundle;

  return (
    <>
      {/* Header then a two-column summary card, following the Foundry layout in
          ui-moodboard/OMA-One.png: editable identity on the left, governance
          fields on the right. */}
      <header className="type-header">
        <Icon icon="cube" size={22} className="type-header__icon" />
        <div>
          <H2 className="type-header__name">
            {/* Inline editing: focus the text, edit, then Enter (or blur) to save. */}
            <InlineEditable
              value={objectType.name}
              placeholder="Display name"
              onConfirm={(name) => {
                if (name.trim() && name !== objectType.name) onSave({ name });
              }}
            />
          </H2>
          <div className="type-header__subtitle">
            Object type
            {typeof objectType.instanceCount === "number" &&
              ` · ${objectType.instanceCount.toLocaleString()} objects`}
          </div>
        </div>
      </header>

      <Card className="type-summary">
        <dl className="fact-list">
          <Fact label="Description">
            <InlineEditable
              multiline
              value={objectType.description ?? ""}
              placeholder="Add a description"
              onConfirm={(description) => {
                if (description !== (objectType.description ?? "")) onSave({ description });
              }}
            />
          </Fact>
          <Fact label="Point of contact">{objectType.point_of_contact ?? "—"}</Fact>
          <Fact label="API name">
            <code>{objectType.api_name}</code>
          </Fact>
          <Fact label="Datasource">
            <code>
              {objectType.schema}.{objectType.datasource_table}
            </code>
          </Fact>
        </dl>

        <dl className="fact-list fact-list--governance">
          <Fact label="Status">
            <Tag minimal intent="success">
              {objectType.status ?? "—"}
            </Tag>
          </Fact>
          <Fact label="Visibility">
            <Tag minimal icon="eye-open">
              {objectType.visibility ?? "—"}
            </Tag>
          </Fact>
          <Fact label="Edits">
            <Tag minimal>{objectType.edits_enabled ? "Enabled" : "Disabled"}</Tag>
          </Fact>
          <Fact label="ID">
            <code className="truncate">{objectType.id}</code>
          </Fact>
        </dl>
      </Card>

      <div className="type-columns">
      <Section
        className="section"
        title="Properties"
        rightElement={<Tag minimal round>{properties.length}</Tag>}
      >
        <SectionCard padded={false}>
          {/* A list rather than a wide table: the column is narrow here, and this is
              how the moodboard presents properties. */}
          <ul className="property-rows">
            {properties.map((property) => (
              <li key={property.id} className="property-row">
                <Tag minimal className="property-row__type">
                  {property.data_type}
                </Tag>
                <div className="property-row__body">
                  <div className="property-row__name">
                    {property.name}
                    {property.is_primary_key && (
                      <Tag minimal intent="primary">
                        Primary key
                      </Tag>
                    )}
                    {property.is_title && (
                      <Tag minimal intent="warning">
                        Title
                      </Tag>
                    )}
                    {property.required && <Tag minimal>Required</Tag>}
                  </div>
                  <div className="property-row__meta muted">
                    <code>{property.api_name}</code>
                    <span>→</span>
                    <code>{property.datasource_column ?? "—"}</code>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </Section>

      <Section
        className="section"
        title="Action types"
        rightElement={<Tag minimal round>{actions.length}</Tag>}
      >
        {actions.length === 0 ? (
          <SectionCard>
            <NonIdealState icon="lightning" title="No actions" layout="horizontal" />
          </SectionCard>
        ) : (
          actions.map((action) => (
            <SectionCard key={action.id}>
              <div className="action-meta">
                <div className="action-meta__head">
                  <strong>{action.name}</strong>
                  <Tag minimal>{action.api_name}</Tag>
                </div>
                {action.description && <p className="muted">{action.description}</p>}
                {action.parameter_schema?.properties && (
                  <div className="cell-tags">
                    {Object.entries(action.parameter_schema.properties).map(([key, schema]) => (
                      <Tag key={key} minimal icon="variable">
                        {key}: {schema.format ?? schema.type ?? "any"}
                        {action.parameter_schema?.required?.includes(key) ? " *" : ""}
                      </Tag>
                    ))}
                  </div>
                )}
              </div>
            </SectionCard>
          ))
        )}
      </Section>
      </div>

      {/* A table beats a graph here: it shows both directions, the cardinality and
          the property each link is carried by, all readable at a glance. */}
      <Section
        className="section"
        title="Links"
        rightElement={
          <Tag minimal round>{links.outbound.length + links.inbound.length}</Tag>
        }
      >
        <SectionCard padded={false}>
          <HTMLTable className="data-table" striped>
            <thead>
              <tr>
                <th>Link</th>
                <th>Direction</th>
                <th>From</th>
                <th>To</th>
                <th>Cardinality</th>
                <th>Via property</th>
              </tr>
            </thead>
            <tbody>
              {links.outbound.map((link) => (
                <LinkRow key={`out-${link.id}`} link={link} direction="outbound" />
              ))}
              {links.inbound.map((link) => (
                <LinkRow key={`in-${link.id}`} link={link} direction="inbound" />
              ))}
            </tbody>
          </HTMLTable>
        </SectionCard>
      </Section>
    </>
  );
}

/**
 * A controlled EditableText needs its own draft state: without `onChange` every
 * keystroke is discarded, since the value snaps back to the prop. The draft is
 * re-synced whenever the saved value changes underneath it.
 */
function InlineEditable({
  value,
  placeholder,
  multiline,
  onConfirm,
}: {
  value: string;
  placeholder: string;
  multiline?: boolean;
  onConfirm: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  return (
    <EditableText
      value={draft}
      placeholder={placeholder}
      multiline={multiline ?? false}
      minLines={multiline ? 2 : 1}
      onChange={setDraft}
      onCancel={() => setDraft(value)}
      onConfirm={onConfirm}
    />
  );
}

function LinkRow({ link, direction }: { link: LinkMeta; direction: "outbound" | "inbound" }) {
  return (
    <tr>
      <td>
        {link.name} <code className="muted">{link.apiName}</code>
      </td>
      <td>
        <Tag minimal icon={direction === "outbound" ? "arrow-right" : "arrow-left"}>
          {direction}
        </Tag>
      </td>
      <td>{link.sourceType}</td>
      <td>{link.targetType}</td>
      <td>
        <code>{link.cardinality}</code>
      </td>
      <td>
        <code>{link.viaProperty ?? "—"}</code>
      </td>
    </tr>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
