import { Button, Tooltip } from "@blueprintjs/core";
import { useEffect, useState } from "react";
import { listTypes, type ObjectTypeMeta } from "./api.ts";
import { BatchWorkspace } from "./investigation/BatchWorkspace.tsx";
import { ObjectExplorer } from "./objectExplorer/ObjectExplorer.tsx";
import { OntologyManager } from "./ontologyManager/OntologyManager.tsx";
import { ProposalsQueue } from "./proposals/ProposalsQueue.tsx";

type AppId = "ontology-manager" | "object-explorer" | "batch-investigation" | "proposals-queue";

const APPS: {
  id: AppId;
  label: string;
  icon: "cube" | "search-template" | "pulse" | "inbox";
}[] = [
  { id: "ontology-manager", label: "Ontology Manager", icon: "cube" },
  { id: "object-explorer", label: "Object Explorer", icon: "search-template" },
  { id: "batch-investigation", label: "Batch Investigation", icon: "pulse" },
  { id: "proposals-queue", label: "Proposals Queue", icon: "inbox" },
];

export function App() {
  const [activeApp, setActiveApp] = useState<AppId>("ontology-manager");

  // The type list is the spine of both apps, so it is fetched once here and
  // passed down. `reloadTypes` lets an edit in the Ontology Manager refresh the
  // rail without a page reload.
  const [types, setTypes] = useState<ObjectTypeMeta[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function reloadTypes() {
    try {
      const { data } = await listTypes();
      setTypes(data);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  useEffect(() => {
    void reloadTypes();
  }, []);

  return (
    <div className="app-shell">
      <nav className="app-rail">
        {APPS.map((app) => (
          <Tooltip key={app.id} content={app.label} placement="right" compact>
            <Button
              large
              variant="minimal"
              active={activeApp === app.id}
              icon={app.icon}
              aria-label={app.label}
              onClick={() => setActiveApp(app.id)}
            />
          </Tooltip>
        ))}
      </nav>

      {activeApp === "ontology-manager" && (
        <OntologyManager types={types} loadError={error} onTypeUpdated={reloadTypes} />
      )}
      {activeApp === "object-explorer" && <ObjectExplorer types={types} loadError={error} />}
      {activeApp === "batch-investigation" && <BatchWorkspace />}
      {activeApp === "proposals-queue" && <ProposalsQueue />}
    </div>
  );
}
