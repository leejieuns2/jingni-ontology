// Batch Investigation Workspace: metrics across the top, batch table on the left,
// detail panel for the selected batch on the right.
import {
  Callout,
  Card,
  H2,
  HTMLSelect,
  HTMLTable,
  NonIdealState,
  Spinner,
  Switch,
  Tag,
} from "@blueprintjs/core";
import { useEffect, useMemo, useState } from "react";
import { listInstances, type Instance } from "../api.ts";
import { isAnchored, now, withinLastDays } from "../now.ts";
import { BatchDetail } from "./BatchDetail.tsx";
import { bandIntent, formatDelta, parseCurve, sugarStatus, type CurvePoint } from "./sugar.ts";

/** A batch row joined to what the table and the metrics need from other types. */
type BatchRow = {
  instance: Instance;
  id: string;
  status: string;
  tankId: string | null;
  tankName: string | null;
  recipeId: string | null;
  recipeName: string | null;
  curve: CurvePoint[];
  daysFermenting: number | null;
  sugar: ReturnType<typeof sugarStatus>;
  /** Tank had maintenance in the 7 days before the course clock's "now". */
  recentTankMaintenance: boolean;
};

const MAINTENANCE_WINDOW_DAYS = 7;

/** api_names as the ontology declares them. */
const BATCH_TYPE = "batch";
const TANK_TYPE = "tank";

export function BatchWorkspace() {
  const [rows, setRows] = useState<BatchRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState("all");
  const [tankFilter, setTankFilter] = useState("all");
  const [behindOnly, setBehindOnly] = useState(false);

  useEffect(() => {
    // Batches plus the reference data the columns and metrics are computed from.
    void Promise.all([
      listInstances(BATCH_TYPE),
      listInstances("recipe"),
      listInstances("tank"),
      listInstances("maintenanceLog", { targetType: TANK_TYPE }),
    ])
      .then(([batches, recipes, tanks, maintenance]) => setRows(join(batches.data, recipes.data, tanks.data, maintenance.data)))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  const metrics = useMemo(() => {
    const fermenting = (rows ?? []).filter((row) => row.status === "fermenting");
    return {
      fermenting: fermenting.length,
      behind: fermenting.filter((row) => row.sugar.behind).length,
      recentMaintenance: fermenting.filter((row) => row.recentTankMaintenance).length,
    };
  }, [rows]);

  const statuses = useMemo(() => unique((rows ?? []).map((row) => row.status)), [rows]);
  const tanks = useMemo(
    () => unique((rows ?? []).flatMap((row) => (row.tankId ? [row.tankId] : []))),
    [rows],
  );

  const visible = useMemo(
    () =>
      (rows ?? []).filter(
        (row) =>
          (statusFilter === "all" || row.status === statusFilter) &&
          (tankFilter === "all" || row.tankId === tankFilter) &&
          (!behindOnly || row.sugar.behind),
      ),
    [rows, statusFilter, tankFilter, behindOnly],
  );

  const selected = visible.find((row) => row.id === selectedId) ?? null;

  return (
    <div className="workspace">
      <header className="workspace__header">
        <H2 className="workspace__title">Batch Investigation</H2>
        {isAnchored && (
          <Tag minimal icon="time">
            as of {now().toLocaleString()}
          </Tag>
        )}
      </header>

      {error && (
        <Callout intent="danger" title="Request failed">
          {error}
        </Callout>
      )}

      <div className="metric-row">
        <Metric label="Fermenting Batches" value={metrics.fermenting} icon="pulse" />
        <Metric
          label="Behind Target"
          value={metrics.behind}
          icon="warning-sign"
          intent={metrics.behind > 0 ? "danger" : "none"}
          detail={`Sugar ${SUGAR_HINT} behind the curve`}
        />
        <Metric
          label="Recent Tank Maintenance"
          value={metrics.recentMaintenance}
          icon="wrench"
          intent={metrics.recentMaintenance > 0 ? "warning" : "none"}
          detail={`Tank serviced in the last ${MAINTENANCE_WINDOW_DAYS} days`}
        />
      </div>

      <div className="workspace__columns">
        <section className="workspace__list">
          <div className="workspace__filters">
            <HTMLSelect
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.currentTarget.value)}
              iconName="caret-down"
            >
              <option value="all">All statuses</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </HTMLSelect>

            <HTMLSelect
              value={tankFilter}
              onChange={(event) => setTankFilter(event.currentTarget.value)}
              iconName="caret-down"
            >
              <option value="all">All tanks</option>
              {tanks.map((tank) => (
                <option key={tank} value={tank}>
                  {tank}
                </option>
              ))}
            </HTMLSelect>

            <Switch
              className="workspace__switch"
              checked={behindOnly}
              label="Behind target only"
              onChange={(event) => setBehindOnly(event.currentTarget.checked)}
            />
          </div>

          {rows === null ? (
            <div className="page__loading">
              <Spinner />
            </div>
          ) : visible.length === 0 ? (
            <NonIdealState icon="filter-remove" title="No batches match these filters" />
          ) : (
            <HTMLTable className="data-table" interactive striped>
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Recipe</th>
                  <th>Sugar vs target</th>
                  <th>Days</th>
                  <th>Tank</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelectedId(row.id)}
                    className={row.id === selectedId ? "is-selected" : undefined}
                  >
                    <td>{row.id}</td>
                    <td>{row.recipeName ?? row.recipeId ?? "—"}</td>
                    <td>
                      <Tag minimal intent={bandIntent(row.sugar.band)}>
                        {row.sugar.delta === null
                          ? "—"
                          : `${formatDelta(row.sugar.delta)} vs ${row.sugar.target?.toFixed(3)}`}
                      </Tag>
                    </td>
                    <td>{row.daysFermenting ?? "—"}</td>
                    <td>
                      {row.tankName ?? row.tankId ?? "—"}
                      {row.recentTankMaintenance && (
                        <Tag minimal intent="warning" icon="wrench" className="cell-inline-tag">
                          serviced
                        </Tag>
                      )}
                    </td>
                    <td>
                      <Tag minimal>{row.status}</Tag>
                    </td>
                  </tr>
                ))}
              </tbody>
            </HTMLTable>
          )}
        </section>

        <aside className="workspace__detail">
          {selected ? (
            <BatchDetail
              batch={selected.instance}
              recipeName={selected.recipeName}
              curve={selected.curve}
              sugar={selected.sugar}
              tankId={selected.tankId}
            />
          ) : (
            <Card className="workspace__placeholder">
              <NonIdealState
                icon="select"
                title="No batch selected"
                description="Pick a batch on the left to see its investigation detail."
              />
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

const SUGAR_HINT = "≥ 0.008";

function Metric({
  label,
  value,
  icon,
  intent = "none",
  detail,
}: {
  label: string;
  value: number;
  icon: "pulse" | "warning-sign" | "wrench";
  intent?: "none" | "warning" | "danger";
  detail?: string;
}) {
  return (
    <Card className="metric">
      <div className="metric__label">
        <Tag minimal icon={icon} intent={intent}>
          {label}
        </Tag>
      </div>
      <div className={`metric__value metric__value--${intent}`}>{value}</div>
      {detail && <div className="metric__detail">{detail}</div>}
    </Card>
  );
}

/**
 * Joins batches to their recipe (for the name and target curve), their tank (for
 * the display name) and the tank's maintenance history (for the recent-service
 * flag), all of which arrive as separate list-route responses.
 */
function join(
  batches: Instance[],
  recipes: Instance[],
  tanks: Instance[],
  maintenance: Instance[],
): BatchRow[] {
  const recipeById = new Map(recipes.map((recipe) => [String(recipe["id"]), recipe]));
  const tankById = new Map(tanks.map((tank) => [String(tank["id"]), tank]));

  const recentlyServicedTanks = new Set(
    maintenance
      .filter((log) => withinLastDays(log["startedAt"], MAINTENANCE_WINDOW_DAYS))
      .map((log) => String(log["targetId"])),
  );

  return batches.map((instance) => {
    const recipeId = asString(instance["recipeId"]);
    const tankId = asString(instance["assignedTankId"]);
    const recipe = recipeId ? recipeById.get(recipeId) : undefined;
    const curve = parseCurve(recipe?.["targetSugarCurve"]);
    const days = typeof instance["daysFermenting"] === "number" ? instance["daysFermenting"] : null;

    return {
      instance,
      id: String(instance["id"]),
      status: String(instance["status"] ?? ""),
      tankId,
      tankName: tankId ? asString(tankById.get(tankId)?.["name"]) : null,
      recipeId,
      recipeName: asString(recipe?.["name"]),
      curve,
      daysFermenting: days,
      sugar: sugarStatus(instance["currentSugarLevel"], curve, days),
      recentTankMaintenance: tankId !== null && recentlyServicedTanks.has(tankId),
    };
  });
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}
