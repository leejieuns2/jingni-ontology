/** A single node in the ontology. */
export type Concept = {
  readonly id: string;
  readonly label: string;
  readonly broader?: string;
};

/** A flat concept store keyed by id. */
export type Ontology = ReadonlyMap<string, Concept>;

export function buildOntology(concepts: readonly Concept[]): Ontology {
  return new Map(concepts.map((c) => [c.id, c]));
}

/** Walks `broader` links from `id` up to the root. */
export function ancestorsOf(ontology: Ontology, id: string): Concept[] {
  const path: Concept[] = [];
  const seen = new Set<string>();

  let current = ontology.get(id)?.broader;
  while (current !== undefined && !seen.has(current)) {
    seen.add(current);
    const parent = ontology.get(current);
    if (parent === undefined) break;
    path.push(parent);
    current = parent.broader;
  }

  return path;
}
