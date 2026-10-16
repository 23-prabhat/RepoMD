import test from "node:test";
import assert from "node:assert/strict";
import { createArchitectureSvg, createEntryPointsSvg } from "../dist/diagrams.js";

const analysis = {
  folderStructure: [],
  entryPoints: {
    primary: { file: "src/index.ts", description: "Starts the app", executionFlow: ["start"] },
    secondary: [{ file: "src/worker.ts", description: "Starts the worker" }],
  },
  dependencyMap: [{ from: "src/index.ts", to: "src/service.ts", uses: "dispatches requests" }],
  criticalFiles: [{ file: "src/service.ts", reason: "Owns business rules", category: "core" }],
  executionFlow: [
    { step: 1, layer: "API", file: "src/index.ts", description: "Handles <requests>" },
    { step: 2, layer: "Service", file: "src/service.ts", description: "Applies business rules" },
  ],
  repoSummary: {
    description: "Test repository",
    techStack: { languages: ["TypeScript"], frameworks: [], databases: [], tools: [] },
    architectureStyle: "Layered",
    keyDecisions: [],
  },
};

test("architecture SVG escapes content", () => {
  const svg = createArchitectureSvg("owner/repo", analysis);
  assert.match(svg, /^<\?xml/);
  assert.match(svg, /Handles &lt;requests&gt;/);
  assert.match(svg, /owner\/repo · Architecture/);
  assert.match(svg, /2 LAYERS · 2 COMPONENTS/);
  assert.match(svg, /CORE/);
  assert.match(svg, /EXECUTION FLOW/);
});

test("entry point SVG includes primary and secondary entry points", () => {
  const svg = createEntryPointsSvg("owner/repo", analysis);
  assert.match(svg, /src\/index\.ts/);
  assert.match(svg, /src\/worker\.ts/);
});
