// Object Explorer shell. Holds the navigation stack so "back" works across
// list → detail → linked detail → ... and keeps the type rail in sync with it.
import { Callout } from "@blueprintjs/core";
import { useState } from "react";
import type { ObjectTypeMeta } from "../api.ts";
import { TypeRail } from "../TypeRail.tsx";
import { InstanceList } from "./InstanceList.tsx";
import { ObjectDetail } from "./ObjectDetail.tsx";

/** One entry in the navigation stack. */
type View =
  | { kind: "list"; type: string }
  | { kind: "detail"; type: string; id: string };

type Props = {
  types: ObjectTypeMeta[];
  loadError: string | null;
};

export function ObjectExplorer({ types, loadError }: Props) {
  const [stack, setStack] = useState<View[]>([]);
  const current = stack[stack.length - 1];

  function push(view: View) {
    setStack((s) => [...s, view]);
  }

  function back() {
    setStack((s) => s.slice(0, -1));
  }

  /** Selecting a type restarts the stack: it is a new place, not a step deeper. */
  function selectType(type: string) {
    setStack([{ kind: "list", type }]);
  }

  return (
    <div className="page">
      <TypeRail
        types={types}
        selectedApiName={current?.type ?? null}
        onSelect={selectType}
      />

      <main className="page__main">
        {loadError && (
          <Callout intent="danger" title="Could not load object types">
            {loadError}
          </Callout>
        )}

        {!current && (
          <Callout icon="search-template" title="Pick an object type">
            Choose a type on the left to browse its instances.
          </Callout>
        )}

        {current?.kind === "list" && (
          <InstanceList
            type={current.type}
            types={types}
            onOpen={(type, id) => push({ kind: "detail", type, id })}
          />
        )}

        {current?.kind === "detail" && (
          <ObjectDetail
            type={current.type}
            id={current.id}
            types={types}
            canGoBack={stack.length > 1}
            onBack={back}
            onOpenLinked={(type, id) => push({ kind: "detail", type, id })}
          />
        )}
      </main>
    </div>
  );
}
