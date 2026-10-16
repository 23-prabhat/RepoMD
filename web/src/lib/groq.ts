import Groq from "groq-sdk";
import {
  completeWithOpenCode,
  isOpenCodeConfigured,
  OpenCodeRequestError,
} from "./opencode";
import type { AnalysisResult, FetchedFile, RepoContext } from "./types";

const GROQ_MODEL = "openai/gpt-oss-120b";
const MAX_ANALYSIS_FILES = 35;
const FULL_CONTEXT_BUDGET = 48_000;
const COMPACT_CONTEXT_BUDGET = 20_000;
const MAX_ANALYSIS_TOKENS = 5_000;

function getGroqClient(): Groq {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("The fallback AI provider is not configured");
  }

  return new Groq({ apiKey });
}

const responseJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    folderStructure: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string" },
          purpose: { type: "string" },
        },
        required: ["path", "purpose"],
      },
    },
    entryPoints: {
      type: "object",
      additionalProperties: false,
      properties: {
        primary: {
          type: "object",
          additionalProperties: false,
          properties: {
            file: { type: "string" },
            description: { type: "string" },
            executionFlow: { type: "array", items: { type: "string" } },
          },
          required: ["file", "description", "executionFlow"],
        },
        secondary: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              file: { type: "string" },
              description: { type: "string" },
            },
            required: ["file", "description"],
          },
        },
      },
      required: ["primary", "secondary"],
    },
    dependencyMap: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          uses: { type: "string" },
        },
        required: ["from", "to", "uses"],
      },
    },
    criticalFiles: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          file: { type: "string" },
          reason: { type: "string" },
          category: { type: "string" },
        },
        required: ["file", "reason", "category"],
      },
    },
    executionFlow: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          step: { type: "number" },
          layer: { type: "string" },
          file: { type: "string" },
          description: { type: "string" },
        },
        required: ["step", "layer", "file", "description"],
      },
    },
    repoSummary: {
      type: "object",
      additionalProperties: false,
      properties: {
        description: { type: "string" },
        techStack: {
          type: "object",
          additionalProperties: false,
          properties: {
            languages: { type: "array", items: { type: "string" } },
            frameworks: { type: "array", items: { type: "string" } },
            databases: { type: "array", items: { type: "string" } },
            tools: { type: "array", items: { type: "string" } },
          },
          required: ["languages", "frameworks", "databases", "tools"],
        },
        architectureStyle: { type: "string" },
        keyDecisions: { type: "array", items: { type: "string" } },
      },
      required: ["description", "techStack", "architectureStyle", "keyDecisions"],
    },
  },
  required: [
    "folderStructure",
    "entryPoints",
    "dependencyMap",
    "criticalFiles",
    "executionFlow",
    "repoSummary",
  ],
};

function buildPrompt(
  context: RepoContext,
  files: FetchedFile[],
  contextBudget = FULL_CONTEXT_BUDGET
): string {
  const { repo, treeText, treeTruncated } = context;

  const metaSection = [
    `Name: ${repo.full_name}`,
    `Description: ${(repo.description ?? "N/A").slice(0, 500)}`,
    `Primary Language: ${repo.language ?? "N/A"}`,
    `Topics: ${repo.topics?.join(", ") || "none"}`,
    `Stars: ${repo.stargazers_count}`,
    `Default Branch: ${repo.default_branch}`,
  ].join("\n");

  const treeLimit = Math.min(10_000, Math.floor(contextBudget / 5));
  const treeSection = treeText.length > treeLimit || treeTruncated
    ? `${treeText.slice(0, treeLimit)}\n... (tree truncated)`
    : treeText;

  const selectedFiles = files.slice(0, MAX_ANALYSIS_FILES);
  const perFileLimit = Math.floor((contextBudget - treeLimit) / Math.max(selectedFiles.length, 1));
  const filesSection = selectedFiles
    .map((f) => {
      const lines = f.content.split("\n");
      const excerpt = lines.slice(0, 240).join("\n").slice(0, perFileLimit);
      const body = excerpt.length < f.content.length ? `${excerpt}\n... (truncated)` : excerpt;
      return `=== FILE: ${f.path} ===\n${body}\n=== END: ${f.path} ===`;
    })
    .join("\n\n");

  return `You are a senior software architect analyzing a GitHub repository. Produce an evidence-based architecture report as structured JSON.

Analyze the repository in this order before writing the answer:
1. Identify runtime boundaries, manifests, frameworks, and deployment targets.
2. Locate real entry points and follow imports/calls through routing, business logic, persistence, and external services.
3. Separate runtime code from tests, generated files, examples, and build configuration.
4. Cross-check every named file against the supplied tree. Never invent a path.

## REPOSITORY METADATA
${metaSection}

## FILE TREE (complete${treeTruncated ? ", GitHub-truncated" : ""})
${treeSection}

## KEY FILE CONTENTS
${filesSection}

## REQUIRED OUTPUT
Produce a JSON object with exactly these six keys:

1. **folderStructure** — 8–16 { path, purpose } items covering the meaningful directories and boundary files. Describe each module's responsibility and avoid generic wording.

2. **entryPoints** — Object with:
   - primary: { file, description, executionFlow: string[] } — The main user-facing or runtime entry point, why it is primary, and 4–10 concrete startup/request steps.
   - secondary: 0–6 { file, description } items for distinct runtime entry points such as a CLI, worker, API route, alternate server, or scheduled job. Do not list ordinary modules or tests unless the repository is a test tool.

3. **dependencyMap** — 8–20 { from, to, uses } edges backed by visible imports, calls, or configuration. Prefer relationships that cross architectural boundaries. "uses" must name the concrete responsibility, symbol, API, or data being used.

4. **criticalFiles** — 6–12 { file, reason, category } items. Explain the consequence of changing each file. Use the best matching category from "auth", "database", "api", "config", "core", "routing", or "middleware".

5. **executionFlow** — 6–12 { step, layer, file, description } items tracing one coherent, representative user action from entry to final response or side effect. Steps must be sequential, use real files, state what data/control is passed, and use stable layer names such as Client, Route, Middleware, Service, Data, External API, or Response. Do not mix unrelated flows.

6. **repoSummary** — Object with:
   - description: One paragraph summary of what this repo does.
   - techStack: { languages[], frameworks[], databases[], tools[] }
   - architectureStyle: 1–3 precise patterns supported by the files, comma-separated (for example "Layered monolith, server-rendered web app").
   - keyDecisions: 4–8 notable decisions, each stating the observed choice and its architectural effect.

Quality rules:
- Prefer exact evidence over broad guesses. If evidence is limited, describe only what the tree and excerpts support.
- Normalize paths exactly as they appear in the repository tree.
- Do not duplicate files or relationships just to reach a target count.
- Keep descriptions compact but specific enough that a developer can understand responsibility, control flow, and data flow.

Return all six required sections as valid JSON with no prose outside the JSON object.`;
}

async function analyzeWithGroq(
  context: RepoContext,
  files: FetchedFile[],
  contextBudget = FULL_CONTEXT_BUDGET
): Promise<AnalysisResult> {
  const prompt = buildPrompt(context, files, contextBudget);

  const response = await getGroqClient().chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      {
        role: "system",
        content: "You are a senior software architect. Return only the requested structured analysis.",
      },
      { role: "user", content: prompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "repository_analysis",
        strict: true,
        schema: responseJsonSchema,
      },
    },
    temperature: 0.2,
    max_completion_tokens: MAX_ANALYSIS_TOKENS,
    reasoning_effort: "low",
  });

  const text = response.choices[0]?.message.content;
  if (!text) {
    throw new Error("The fallback AI provider returned an empty repository analysis");
  }

  return JSON.parse(text) as AnalysisResult;
}

async function analyzeWithOpenCode(
  context: RepoContext,
  files: FetchedFile[],
  contextBudget = FULL_CONTEXT_BUDGET
): Promise<AnalysisResult> {
  const text = await completeWithOpenCode({
    messages: [
      {
        role: "system",
        content: "You are a senior software architect. Return only the requested structured analysis.",
      },
      { role: "user", content: buildPrompt(context, files, contextBudget) },
    ],
    jsonSchema: {
      name: "repository_analysis",
      schema: responseJsonSchema,
    },
    temperature: 0.2,
    maxTokens: MAX_ANALYSIS_TOKENS,
  });

  return JSON.parse(text) as AnalysisResult;
}

type AnalysisProvider = (
  context: RepoContext,
  files: FetchedFile[],
  contextBudget?: number
) => Promise<AnalysisResult>;

function shouldRetryWithCompactContext(error: unknown): boolean {
  if (error instanceof OpenCodeRequestError) {
    return error.status === 400 || error.status === 413;
  }
  return error instanceof Groq.APIError &&
    (error.status === 413 || (error.status === 400 && error.message.includes("json_validate_failed")));
}

async function runAnalysis(
  provider: AnalysisProvider,
  context: RepoContext,
  files: FetchedFile[]
): Promise<AnalysisResult> {
  try {
    return await provider(context, files);
  } catch (error) {
    if (shouldRetryWithCompactContext(error)) {
      return provider(context, files, COMPACT_CONTEXT_BUDGET);
    }
    throw error;
  }
}

export async function analyzeRepository(
  context: RepoContext,
  files: FetchedFile[]
): Promise<AnalysisResult> {
  if (isOpenCodeConfigured()) {
    try {
      return await runAnalysis(analyzeWithOpenCode, context, files);
    } catch (error) {
      console.warn("[ai] Primary analysis failed; using fallback", error);
    }
  }

  return runAnalysis(analyzeWithGroq, context, files);
}
