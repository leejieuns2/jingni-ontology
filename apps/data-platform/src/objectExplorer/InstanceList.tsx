import {
  Callout,
  H2,
  H3,
  HTMLTable,
  InputGroup,
  NonIdealState,
  Spinner,
  Switch,
  Tag,
} from "@blueprintjs/core";
import { useEffect, useMemo, useState } from "react";
import {
  getTypeBundle,
  listInstances,
  type Instance,
  type ObjectTypeMeta,
  type PropertyMeta,
} from "../api.ts";
import { formatValue, instanceId, instanceLabel, matchesQuery, titleProperty } from "../format.ts";

type Props = {
  type: string;
  types: ObjectTypeMeta[];
  onOpen: (type: string, id: string) => void;
};

/** Instances plus the property metadata needed to label and search them. */
type Loaded = { properties: PropertyMeta[]; instances: Instance[] };

export function InstanceList({ type, types, onOpen }: Props) {
  const [query, setQuery] = useState("");
  const [allTypes, setAllTypes] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Loaded | null>(null);
  /** Only populated while "search all types" is on, keyed by type api_name. */
  const [everything, setEverything] = useState<Record<string, Loaded> | null>(null);

  useEffect(() => {
    setSelected(null);
    void load(type)
      .then(setSelected)
      .catch((cause: unknown) => setError(messageOf(cause)));
  }, [type]);

  // Searching across types needs every type's instances and property metadata,
  // so it is fetched once when the toggle is switched on.
  useEffect(() => {
    if (!allTypes || everything || types.length === 0) return;
    void Promise.all(types.map(async (t) => [t.api_name, await load(t.api_name)] as const))
      .then((entries) => setEverything(Object.fromEntries(entries)))
      .catch((cause: unknown) => setError(messageOf(cause)));
  }, [allTypes, everything, types]);

  const displayName = (apiName: string) =>
    types.find((t) => t.api_name === apiName)?.name ?? apiName;

  const groups = useMemo(() => {
    const source: [string, Loaded][] = allTypes
      ? Object.entries(everything ?? {})
      : selected
        ? [[type, selected]]
        : [];

    return source
      .map(([apiName, loaded]) => ({
        type: apiName,
        properties: loaded.properties,
        instances: loaded.instances.filter((i) => matchesQuery(i, loaded.properties, query)),
      }))
      .filter((group) => !allTypes || group.instances.length > 0);
  }, [allTypes, everything, selected, type, query]);

  const total = groups.reduce((sum, group) => sum + group.instances.length, 0);
  const loading = allTypes ? !everything : !selected;

  return (
    <>
      {error && (
        <Callout intent="danger" title="Request failed">
          {error}
        </Callout>
      )}

      <header className="list-header">
        <H2 className="list-header__title">{displayName(type)}</H2>
        <Tag minimal round>
          {selected?.instances.length ?? 0}
        </Tag>
      </header>

      <div className="list-toolbar">
        <InputGroup
          large
          leftIcon="search"
          placeholder={allTypes ? "Search all object types" : `Search ${displayName(type)}`}
          value={query}
          onValueChange={setQuery}
          {...(query
            ? {
                rightElement: (
                  <Tag minimal>
                    {total} match{total === 1 ? "" : "es"}
                  </Tag>
                ),
              }
            : {})}
          fill
        />
        <Switch
          className="list-toolbar__switch"
          checked={allTypes}
          label="Search all types"
          onChange={(event) => setAllTypes(event.currentTarget.checked)}
        />
      </div>

      {loading ? (
        <div className="page__loading">
          <Spinner />
        </div>
      ) : total === 0 ? (
        <NonIdealState
          icon="search"
          title="No matching instances"
          description={query ? `Nothing matches "${query}".` : "This type has no instances yet."}
        />
      ) : (
        groups.map((group) => (
          <section key={group.type} className="instance-group">
            {allTypes && (
              <H3 className="instance-group__title">
                {displayName(group.type)}
                <Tag minimal round>
                  {group.instances.length}
                </Tag>
              </H3>
            )}
            <InstanceTable
              properties={group.properties}
              instances={group.instances}
              onOpen={(id) => onOpen(group.type, id)}
            />
          </section>
        ))
      )}
    </>
  );
}

function InstanceTable({
  properties,
  instances,
  onOpen,
}: {
  properties: PropertyMeta[];
  instances: Instance[];
  onOpen: (id: string) => void;
}) {
  const title = titleProperty(properties);
  const status = properties.find((p) => p.api_name === "status");

  return (
    <HTMLTable className="data-table" interactive striped>
      <thead>
        <tr>
          <th>{title?.name ?? "Object"}</th>
          {status && <th>{status.name}</th>}
        </tr>
      </thead>
      <tbody>
        {instances.map((instance) => {
          const id = instanceId(instance, properties);
          return (
            <tr key={id} onClick={() => onOpen(id)}>
              <td>{instanceLabel(instance, properties)}</td>
              {status && (
                <td>
                  {instance[status.api_name] == null ? (
                    "—"
                  ) : (
                    <Tag minimal>{formatValue(instance[status.api_name], status.data_type)}</Tag>
                  )}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </HTMLTable>
  );
}

async function load(apiName: string): Promise<Loaded> {
  const [bundle, list] = await Promise.all([getTypeBundle(apiName), listInstances(apiName)]);
  return { properties: bundle.properties, instances: list.data };
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
