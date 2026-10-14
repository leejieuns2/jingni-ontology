// Detail panel for the selected batch. The three requests are independent — the
// tank id comes from the row that was clicked — so they go out in parallel.
import {
  Button,
  Callout,
  Collapse,
  HTMLTable,
  Section,
  SectionCard,
  Spinner,
  Tag,
} from "@blueprintjs/core";
import { useEffect, useMemo, useState } from "react";
import {
  getInstance,
  listAudit,
  listInstances,
  type AuditEntry,
  type Instance,
  type InstanceDetail,
} from "../api.ts";
import { DAY_MS, now, toDate } from "../now.ts";
import { bandIntent, formatDelta, type CurvePoint, type SugarStatus } from "./sugar.ts";

type Props = {
  batch: Instance;
  recipeName: string | null;
  curve: CurvePoint[];
  sugar: SugarStatus;
  tankId: string | null;
};

type Loaded = {
  detail: InstanceDetail;
  maintenance: Instance[];
  audit: AuditEntry[];
};

export function BatchDetail({ batch, recipeName, curve, sugar, tankId }: Props) {
  const id = String(batch["id"]);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoaded(null);
    setError(null);

    void Promise.all([
      getInstance("batch", id),
      tankId
        ? listInstances("maintenanceLog", { targetType: "tank", targetId: tankId })
        : Promise.resolve({ type: "maintenanceLog", count: 0, data: [] }),
      listAudit("batch", id),
    ])
      .then(([detail, maintenance, audit]) =>
        setLoaded({ detail, maintenance: maintenance.data, audit: audit.data }),
      )
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [id, tankId]);

  const recipe = linkedOne(loaded?.detail, "recipe");
  const tank = linkedOne(loaded?.detail, "assignedTank");
  const qualityTests = linkedMany(loaded?.detail, "qualityTests");

  /**
   * The batch's fermentation window: planned start through the recipe's
   * fermentation length, falling back to the course clock's "now" when the recipe
   * does not say. Maintenance inside this window is what gets flagged.
   */
  const window = useMemo(() => {
    const start = toDate(batch["plannedStart"]);
    if (!start) return null;
    const days = recipe && typeof recipe["fermentationDays"] === "number"
      ? recipe["fermentationDays"]
      : null;
    const end = days === null ? now() : new Date(start.getTime() + days * DAY_MS);
    return { start, end };
  }, [batch, recipe]);

  if (error) {
    return (
      <Callout intent="danger" title="Request failed">
        {error}
      </Callout>
    );
  }

  if (!loaded) {
    return (
      <div className="page__loading">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="detail-panel">
      <header className="detail-panel__header">
        <span className="detail-panel__id">{id}</span>
        <Tag minimal>{String(batch["status"] ?? "")}</Tag>
        <Tag minimal intent={bandIntent(sugar.band)}>
          {sugar.delta === null ? "no target" : `${formatDelta(sugar.delta)} vs target`}
        </Tag>
      </header>

      <Section className="section" title="Batch" collapsible compact>
        <SectionCard padded={false}>
          <Facts
            rows={[
              [
                "Sugar level",
                sugar.target === null
                  ? text(batch["currentSugarLevel"])
                  : `${text(batch["currentSugarLevel"])} (target ${sugar.target.toFixed(3)})`,
              ],
              ["Temperature", text(batch["currentTemperature"])],
              ["Days fermenting", text(batch["daysFermenting"])],
              ["Planned start", dateText(batch["plannedStart"])],
              ["Last operator note", text(batch["lastOperatorNote"])],
            ]}
          />
        </SectionCard>
      </Section>

      <Section className="section" title="Recipe" collapsible compact>
        <SectionCard padded={false}>
          <Facts
            rows={[
              ["Name", recipeName ?? text(recipe?.["name"])],
              ["Fermentation days", text(recipe?.["fermentationDays"])],
              ["Sensitivity notes", text(recipe?.["notes"])],
            ]}
          />
        </SectionCard>
        {curve.length > 0 && (
          <SectionCard>
            <div className="curve">
              {curve.map((point) => {
                const current = sugar.point?.day === point.day;
                return (
                  <div
                    key={point.day}
                    className={`curve__point${current ? " curve__point--current" : ""}`}
                  >
                    <span className="curve__day">day {point.day}</span>
                    <span className="curve__sugar">{point.sugar.toFixed(3)}</span>
                    {current && (
                      <Tag minimal intent={bandIntent(sugar.band)}>
                        now
                      </Tag>
                    )}
                  </div>
                );
              })}
            </div>
          </SectionCard>
        )}
      </Section>

      <Section className="section" title="Tank + Maintenance" collapsible compact>
        <SectionCard padded={false}>
          <Facts
            rows={[
              ["Tank", text(tank?.["name"]) === "—" ? (tankId ?? "—") : text(tank?.["name"])],
              ["Tank status", text(tank?.["status"])],
              ["Tank temperature", text(tank?.["currentTemperature"])],
            ]}
          />
        </SectionCard>
        <SectionCard padded={false}>
          {loaded.maintenance.length === 0 ? (
            <div className="link-group__empty muted">No maintenance recorded for this tank.</div>
          ) : (
            <HTMLTable className="data-table" striped>
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {loaded.maintenance.map((log) => {
                  const inWindow = isInWindow(log["startedAt"], window);
                  return (
                    <tr key={String(log["id"])}>
                      <td>{dateText(log["startedAt"])}</td>
                      <td>
                        {text(log["type"])}
                        {inWindow && (
                          <Tag
                            minimal
                            intent="warning"
                            icon="warning-sign"
                            className="cell-inline-tag"
                          >
                            Warning
                          </Tag>
                        )}
                      </td>
                      <td>
                        <Tag minimal>{text(log["status"])}</Tag>
                      </td>
                      <td className="cell-notes">{text(log["notes"])}</td>
                    </tr>
                  );
                })}
              </tbody>
            </HTMLTable>
          )}
          {window && (
            <div className="detail-panel__note muted">
              Fermentation window: {window.start.toLocaleDateString()} –{" "}
              {window.end.toLocaleDateString()}. Maintenance inside it is flagged.
            </div>
          )}
        </SectionCard>
      </Section>

      <Section
        className="section"
        title="Quality Tests"
        collapsible
        compact
        rightElement={
          <Tag minimal round>
            {qualityTests.length}
          </Tag>
        }
      >
        <SectionCard padded={false}>
          {qualityTests.length === 0 ? (
            <div className="link-group__empty muted">No quality tests for this batch.</div>
          ) : (
            <HTMLTable className="data-table" striped>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>pH</th>
                  <th>Sugar</th>
                  <th>Tested by</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {qualityTests.map((test) => (
                  <tr key={String(test["id"])}>
                    <td>{dateText(test["testDate"])}</td>
                    {/* The ontology spells this property `pH`; the lowercase
                        fallback keeps a differently-cased datasource working. */}
                    <td>{text(test["pH"] ?? test["ph"])}</td>
                    <td>{text(test["sugarLevel"])}</td>
                    <td>{text(test["testedBy"])}</td>
                    <td className="cell-notes">{text(test["notes"])}</td>
                  </tr>
                ))}
              </tbody>
            </HTMLTable>
          )}
        </SectionCard>
      </Section>

      <Section
        className="section"
        title="Audit"
        collapsible
        compact
        rightElement={
          <Tag minimal round>
            {loaded.audit.length}
          </Tag>
        }
      >
        <SectionCard padded={false}>
          {loaded.audit.length === 0 ? (
            <div className="link-group__empty muted">No actions recorded for this batch.</div>
          ) : (
            <ul className="audit-list">
              {loaded.audit.map((entry) => (
                <AuditRow key={entry.id} entry={entry} />
              ))}
            </ul>
          )}
        </SectionCard>
      </Section>
    </div>
  );
}

/** One audit entry, expandable to show the parameters it was called with. */
function AuditRow({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);

  return (
    <li className="audit-row">
      <Button
        variant="minimal"
        fill
        alignText="start"
        icon={open ? "chevron-down" : "chevron-right"}
        onClick={() => setOpen(!open)}
      >
        <span className="audit-row__action">{entry.actionName ?? entry.action}</span>
        <span className="audit-row__actor muted">{entry.actor ?? "unknown actor"}</span>
        <span className="audit-row__time muted">{dateText(entry.timestamp)}</span>
      </Button>
      <Collapse isOpen={open}>
        <pre className="audit-row__params">
          {JSON.stringify({ params: entry.params, result: entry.result }, null, 2)}
        </pre>
      </Collapse>
    </li>
  );
}

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="property-list">
      {rows.map(([label, value]) => (
        <div key={label} className="property-list__row">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function isInWindow(value: unknown, window: { start: Date; end: Date } | null): boolean {
  const date = toDate(value);
  if (!date || !window) return false;
  return date >= window.start && date <= window.end;
}

function linkedOne(detail: InstanceDetail | undefined, apiName: string): Instance | null {
  const value = detail?.links[apiName]?.value;
  if (!value || Array.isArray(value)) return null;
  return value;
}

function linkedMany(detail: InstanceDetail | undefined, apiName: string): Instance[] {
  const value = detail?.links[apiName]?.value;
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function dateText(value: unknown): string {
  return toDate(value)?.toLocaleString() ?? "—";
}
