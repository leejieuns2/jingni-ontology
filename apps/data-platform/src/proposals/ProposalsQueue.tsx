// The human half of the proposal loop: agents write proposal rows, this queue is
// where a person reads the rationale and decides. Approve invokes the underlying
// action server-side; a failure there leaves the row pending and surfaces the
// error on it, so the queue never claims an action happened that did not.
import {
  Button,
  Callout,
  H2,
  H3,
  HTMLTable,
  NonIdealState,
  Spinner,
  Tag,
} from "@blueprintjs/core";
import { useEffect, useState } from "react";
import { decideProposal, listInstances, type Instance } from "../api.ts";

type Proposal = {
  id: number;
  type: string;
  targetId: string;
  params: Record<string, unknown>;
  rationale: string;
  status: string;
  proposedBy: string;
  proposedAt: string;
  /** Carries the escalation note while a proposal sits in the escalated lane. */
  decisionNote: string | null;
};

export function ProposalsQueue() {
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Row-level failures from approve/reject, keyed by proposal id. */
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  /** Proposal id with a decision in flight, so its buttons disable. */
  const [busy, setBusy] = useState<number | null>(null);

  async function reload() {
    try {
      const { data } = await listInstances("proposal");
      setProposals(
        (data as Instance[])
          .map(toProposal)
          .filter((p) => p.status === "pending" || p.status === "escalated"),
      );
      setLoadError(null);
    } catch (cause) {
      setLoadError(messageOf(cause));
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function decide(id: number, decision: "approve" | "reject") {
    setBusy(id);
    try {
      await decideProposal(id, decision);
      setRowErrors(({ [id]: _cleared, ...rest }) => rest);
      await reload();
    } catch (cause) {
      // The row stays pending — the server refused, so nothing was approved.
      setRowErrors((errors) => ({ ...errors, [id]: messageOf(cause) }));
    } finally {
      setBusy(null);
    }
  }

  const pending = proposals?.filter((p) => p.status === "pending") ?? [];
  const escalated = proposals?.filter((p) => p.status === "escalated") ?? [];

  return (
    <main className="page">
      <header className="list-header">
        <H2 className="list-header__title">Proposals Queue</H2>
        <Tag minimal round>
          {proposals?.length ?? 0}
        </Tag>
      </header>

      {loadError && (
        <Callout intent="danger" title="Request failed">
          {loadError}
        </Callout>
      )}

      {proposals === null ? (
        <div className="page__loading">
          <Spinner />
        </div>
      ) : proposals.length === 0 ? (
        <NonIdealState
          icon="inbox"
          title="No open proposals"
          description="Agent proposals awaiting review will appear here."
        />
      ) : (
        <>
          {escalated.length > 0 && (
            <Lane
              title="Escalated"
              intent="warning"
              proposals={escalated}
              busy={busy}
              rowErrors={rowErrors}
              onDecide={decide}
            />
          )}
          <Lane
            title="Pending"
            proposals={pending}
            busy={busy}
            rowErrors={rowErrors}
            onDecide={decide}
          />
        </>
      )}
    </main>
  );
}

function Lane({
  title,
  intent,
  proposals,
  busy,
  rowErrors,
  onDecide,
}: {
  title: string;
  intent?: "warning";
  proposals: Proposal[];
  busy: number | null;
  rowErrors: Record<number, string>;
  onDecide: (id: number, decision: "approve" | "reject") => Promise<void>;
}) {
  return (
    <section className="proposal-lane">
      <H3 className="proposal-lane__title">
        {title}
        <Tag minimal round {...(intent ? { intent } : {})}>
          {proposals.length}
        </Tag>
      </H3>
      <HTMLTable className="data-table" striped>
        <thead>
          <tr>
            <th>Type</th>
            <th>Target</th>
            <th>Proposed By</th>
            <th>Proposed At</th>
            <th>Rationale</th>
            <th>Parameters</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {proposals.map((proposal) => (
            <tr key={proposal.id}>
              <td>
                <code>{proposal.type}</code>
              </td>
              <td>{proposal.targetId}</td>
              <td>{proposal.proposedBy}</td>
              <td>{new Date(proposal.proposedAt).toLocaleString()}</td>
              <td className="proposal-rationale">
                {proposal.rationale}
                {proposal.status === "escalated" && proposal.decisionNote && (
                  <Callout intent="warning" compact className="proposal-error">
                    Escalation: {proposal.decisionNote}
                  </Callout>
                )}
              </td>
              <td>
                <dl className="proposal-params">
                  {Object.entries(proposal.params).map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              </td>
              <td>
                <Tag minimal intent={proposal.status === "escalated" ? "warning" : "none"}>
                  {proposal.status}
                </Tag>
              </td>
              <td>
                <div className="proposal-actions">
                  <Button
                    small
                    intent="success"
                    text="Approve"
                    disabled={busy !== null}
                    loading={busy === proposal.id}
                    onClick={() => void onDecide(proposal.id, "approve")}
                  />
                  <Button
                    small
                    intent="danger"
                    variant="outlined"
                    text="Reject"
                    disabled={busy !== null}
                    onClick={() => void onDecide(proposal.id, "reject")}
                  />
                </div>
                {rowErrors[proposal.id] && (
                  <Callout intent="danger" compact className="proposal-error">
                    {rowErrors[proposal.id]}
                  </Callout>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </HTMLTable>
    </section>
  );
}

function toProposal(instance: Instance): Proposal {
  return {
    id: Number(instance["id"]),
    type: String(instance["type"]),
    targetId: String(instance["targetId"]),
    params: (instance["params"] ?? {}) as Record<string, unknown>,
    rationale: String(instance["rationale"] ?? ""),
    status: String(instance["status"]),
    proposedBy: String(instance["proposedBy"] ?? ""),
    proposedAt: String(instance["proposedAt"] ?? ""),
    decisionNote: instance["decisionNote"] == null ? null : String(instance["decisionNote"]),
  };
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
