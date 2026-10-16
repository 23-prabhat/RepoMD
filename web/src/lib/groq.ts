import Groq from "groq-sdk";
import {
  completeWithOpenCode,
  isOpenCodeConfigured,
  OpenCodeRequestError,
} from "./opencode";
import type { AnalysisResult, FetchedFile, RepoContext } from "./types";

const GROQ_MODEL = "openai/gpt-oss-120b";

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

function buildPrompt(context: RepoContext, files: FetchedFile[], contextBudget = 8_000): string {
  const { repo, treeText, treeTruncated } = context;

  const metaSection = [
    `Name: ${repo.full_name}`,
    `Description: ${(repo.description ?? "N/A").slice(0, 500)}`,
    `Primary Language: ${repo.language ?? "N/A"}`,
    `Topics: ${repo.topics?.join(", ") || "none"}`,
    `Stars: ${repo.stargazers_count}`,
    `Default Branch: ${repo.default_branch}`,
  ].join("\n");

  const treeLimit = Math.floor(contextBudget / 4);
  const treeSection = treeText.length > treeLimit || treeTruncated
    ? `${treeText.slice(0, treeLimit)}\n... (tree truncated)`
    : treeText;

  const selectedFiles = files.slice(0, 20);
  const perFileLimit = Math.floor((contextBudget - treeLimit) / Math.max(selectedFiles.length, 1));
  const filesSection = selectedFiles
    .map((f) => {
      const lines = f.content.split("\n");
      const excerpt = lines.slice(0, 150).join("\n").slice(0, perFileLimit);
      const body = excerpt.length < f.content.length ? `${excerpt}\n... (truncated)` : excerpt;
      return `=== FILE: ${f.path} ===\n${body}\n=== END: ${f.path} ===`;
    })
    .join("\n\n");

  return `You are a senior software architect analyzing a GitHub repository. Your task is to produce a comprehensive intelligence report as structured JSON.

## REPOSITORY METADATA
${metaSection}

## FILE TREE (complete${treeTruncated ? ", GitHub-truncated" : ""})
${treeSection}

## KEY FILE CONTENTS
${filesSection}

## REQUIRED OUTPUT
Produce a JSON object with exactly these six keys:

1. **folderStructure** — Array of { path, purpose } for every meaningful directory and key file. Explain what each module owns in plain English.

2. **entryPoints** — Object with:
   - primary: { file, description, executionFlow: string[] } — The single most important entry point and a step-by-step startup sequence.
   - secondary: { file, description }[] — Other entry points (CLI scripts, alternative servers, test runners, etc.)

3. **dependencyMap** — Array of { from, to, uses } edges showing how files import/depend on each other. Focus on the most architecturally significant relationships.

4. **criticalFiles** — Array of { file, reason, category } for the most important files. Categories: "auth", "database", "api", "config", "core", "routing", "middleware".

5. **executionFlow** — Array of { step, layer, file, description } tracing a typical request from entry to response (e.g., Route → Middleware → Controller → Service → Database).

6. **repoSummary** — Object with:
   - description: One paragraph summary of what this repo does.
   - techStack: { languages[], frameworks[], databases[], tools[] }
   - architectureStyle: e.g., "MVC", "Microservices", "Monorepo", "Serverless", "Event-driven"
   - keyDecisions: Array of notable architectural or design decisions observed in the code.

Be concise: use at most 8 items per array and short descriptions. Return all six required sections as valid JSON. Be specific and use actual file paths from this repo. Do not hallucinate files that do not appear in the tree or content.`;
}

async function analyzeWithGroq(
  context: RepoContext,
  files: FetchedFile[],
  contextBudget = 8_000
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
    max_completion_tokens: 3_000,
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
  contextBudget = 8_000
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
    maxTokens: 3_000,
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
      return provider(context, files, 4_000);
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
