import {
  Button,
  ButtonGroup,
  Callout,
  H2,
  Section,
  SectionCard,
  Spinner,
  Tag,
  Tooltip,
} from "@blueprintjs/core";
import { useCallback, useEffect, useState } from "react";
import {
  getInstance,
  getTypeBundle,
  type ActionMeta,
  type Instance,
  type InstanceDetail,
  type ObjectTypeMeta,
  type PropertyMeta,
  type ResolvedLink,
  type TypeBundle,
} from "../api.ts";
import { EMPTY, formatValue, instanceId, instanceLabel } from "../format.ts";
import { ActionDialog } from "./ActionDialog.tsx";

type Props = {
  type: string;
  id: string;
  /** Used to show link targets by display name rather than api_name. */
  types: ObjectTypeMeta[];
  canGoBack: boolean;
  onBack: () => void;
  onOpenLinked: (type: string, id: string) => void;
};

export function ObjectDetail({ type, id, types, canGoBack, onBack, onOpenLinked }: Props) {
  const [bundle, setBundle] = useState<TypeBundle | null>(null);
  const [detail, setDetail] = useState<InstanceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openAction, setOpenAction] = useState<ActionMeta | null>(null);

  /** Also used to refresh after an action writes to this object. */
  const reload = useCallback(async () => {
    try {
      const [nextBundle, nextDetail] = await Promise.all([
        getTypeBundle(type),
        getInstance(type, id),
      ]);
      setBundle(nextBundle);
      setDetail(nextDetail);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [type, id]);

  useEffect(() => {
    setBundle(null);
    setDetail(null);
    void reload();
  }, [reload]);

  if (error) {
    return (
      <>
        <BackButton canGoBack={canGoBack} onBack={onBack} />
        <Callout intent="danger" title="Request failed">
          {error}
        </Callout>
      </>
    );
  }

  if (!bundle || !detail) {
    return (
      <div className="page__loading">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <header className="detail-header">
        <div className="detail-header__title">
          <BackButton canGoBack={canGoBack} onBack={onBack} />
          <H2 className="detail-header__name">
            {instanceLabel(detail.properties, bundle.properties)}
          </H2>
          <Tag minimal>{bundle.objectType.name}</Tag>
          <Tag minimal>
            <code>{detail.id}</code>
          </Tag>
        </div>

        {/* Action strip: one button per action the type declares. */}
        {bundle.actions.length > 0 && (
          <ButtonGroup className="action-strip">
            {bundle.actions.map((action) => (
              <Tooltip
                key={action.id}
                content={action.description ?? action.api_name}
                placement="bottom"
                compact
              >
                <Button
                  icon="lightning"
                  text={action.name}
                  onClick={() => setOpenAction(action)}
                />
              </Tooltip>
            ))}
          </ButtonGroup>
        )}
      </header>

      <div className="detail-columns">
        <Section className="section" title="Properties">
          <SectionCard padded={false}>
            <dl className="property-list">
              {bundle.properties.map((property) => (
                <div key={property.id} className="property-list__row">
                  <dt>{property.name}</dt>
                  <dd>{formatValue(detail.properties[property.api_name], property.data_type)}</dd>
                </div>
              ))}
            </dl>
          </SectionCard>
        </Section>

        <Section className="section" title="Links">
          {Object.entries(detail.links).length === 0 ? (
            <SectionCard>
              <span className="muted">This type has no links.</span>
            </SectionCard>
          ) : (
            Object.entries(detail.links).map(([apiName, link]) => (
              <LinkGroup
                key={apiName}
                link={link}
                typeLabel={types.find((t) => t.api_name === link.type)?.name ?? link.type}
                onOpen={(linkedId) => onOpenLinked(link.type, linkedId)}
              />
            ))
          )}
        </Section>
      </div>

      {openAction && (
        <ActionDialog
          action={openAction}
          type={type}
          id={id}
          onClose={() => setOpenAction(null)}
          onCompleted={reload}
        />
      )}
    </>
  );
}

/** One link, with its resolved objects listed underneath. */
function LinkGroup({
  link,
  typeLabel,
  onOpen,
}: {
  link: ResolvedLink;
  typeLabel: string;
  onOpen: (id: string) => void;
}) {
  const [linkedProperties, setLinkedProperties] = useState<PropertyMeta[] | null>(null);
  const linked = toArray(link.value);

  // The other side's property metadata is what tells us how to label its rows.
  useEffect(() => {
    if (linked.length === 0) return;
    let active = true;
    void getTypeBundle(link.type)
      .then((bundle) => active && setLinkedProperties(bundle.properties))
      .catch(() => active && setLinkedProperties([]));
    return () => {
      active = false;
    };
  }, [link.type, linked.length]);

  return (
    <SectionCard padded={false}>
      <div className="link-group__head">
        <span className="link-group__name">{link.name}</span>
        <Tag minimal icon={link.direction === "outbound" ? "arrow-right" : "arrow-left"}>
          {typeLabel}
        </Tag>
        <Tag minimal round>
          {linked.length}
        </Tag>
      </div>

      {link.error ? (
        <div className="link-group__empty muted">{link.error}</div>
      ) : linked.length === 0 ? (
        <div className="link-group__empty muted">{EMPTY}</div>
      ) : (
        <ul className="link-list">
          {linked.map((instance) => {
            const id = linkedProperties
              ? instanceId(instance, linkedProperties)
              : String(instance["id"] ?? "");
            return (
              <li key={id}>
                <Button
                  variant="minimal"
                  fill
                  alignText="start"
                  icon="chevron-right"
                  text={linkedProperties ? instanceLabel(instance, linkedProperties) : id}
                  onClick={() => onOpen(id)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

function BackButton({ canGoBack, onBack }: { canGoBack: boolean; onBack: () => void }) {
  return (
    <Button
      variant="minimal"
      icon="arrow-left"
      disabled={!canGoBack}
      text="Back"
      onClick={onBack}
    />
  );
}

function toArray(value: ResolvedLink["value"]): Instance[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}
