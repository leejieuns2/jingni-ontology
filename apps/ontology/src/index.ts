// Note the explicit ".ts" extension: Node resolves the real file on disk, and
// `allowImportingTsExtensions` lets tsc agree with it.
import { ancestorsOf, buildOntology, type Concept } from "./types.ts";

const concepts: readonly Concept[] = [
  { id: "thing", label: "Thing" },
  { id: "place", label: "Place", broader: "thing" },
  { id: "city", label: "City", broader: "place" },
  { id: "seoul", label: "Seoul", broader: "city" },
];

const ontology = buildOntology(concepts);
const trail = ancestorsOf(ontology, "seoul").map((c) => c.label);

console.log(`seoul -> ${trail.join(" -> ")}`);
