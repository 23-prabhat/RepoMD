// ── GitHub API shapes ──────────────────────────────────────────────────────

export interface GitHubRepo {
  full_name: string;
  description: string | null;
  language: string | null;
  topics: string[];
  stargazers_count: number;
  default_branch: string;
  html_url: string;
}

export interface GitHubTreeItem {
  path: string;
  type: "blob" | "tree";
  size?: number;
  sha: string;
  url: string;
}

export interface GitHubTreeResponse {
  sha: string;
  truncated: boolean;
  tree: GitHubTreeItem[];
}

export interface GitHubFileContent {
  path: string;
  content: string; // base64-encoded
  encoding: string;
  size: number;
}

// ── Internal data-passing types ────────────────────────────────────────────

export interface FetchedFile {
  path: string;
  content: string; // decoded UTF-8
}

export interface RepoContext {
  repo: GitHubRepo;
  treeText: string;
  treeTruncated: boolean;
  totalFileCount: number;
}

// ── Analysis result types ──────────────────────────────────────────────────

export interface FolderEntry {
  path: string;
  purpose: string;
}

export interface EntryPointPrimary {
  file: string;
  description: string;
  executionFlow: string[];
}

export interface EntryPointSecondary {
  file: string;
  description: string;
}

export interface EntryPoints {
  primary: EntryPointPrimary;
  secondary: EntryPointSecondary[];
}

export interface DependencyEdge {
  from: string;
  to: string;
  uses: string;
}

export interface CriticalFile {
  file: string;
  reason: string;
  category: string;
}

export interface ExecutionFlowStep {
  step: number;
  layer: string;
  file: string;
  description: string;
}

export interface TechStack {
  languages: string[];
  frameworks: string[];
  databases: string[];
  tools: string[];
}

export interface RepoSummary {
  description: string;
  techStack: TechStack;
  architectureStyle: string;
  keyDecisions: string[];
}

export interface AnalysisResult {
  folderStructure: FolderEntry[];
  entryPoints: EntryPoints;
  dependencyMap: DependencyEdge[];
  criticalFiles: CriticalFile[];
  executionFlow: ExecutionFlowStep[];
  repoSummary: RepoSummary;
}

// ── API request / response ─────────────────────────────────────────────────

export interface AnalyzeRequest {
  url: string;
}

export type AnalyzeResponse = AnalyzeSuccessResponse | AnalyzeErrorResponse;

export interface AnalyzeSuccessResponse {
  ok: true;
  repoFullName: string;
  repoUrl: string;
  analyzedFileCount: number;
  totalFileCount: number;
  treeTruncated: boolean;
  analysis: AnalysisResult;
}

export interface AnalyzeErrorResponse {
  ok: false;
  error: string;
  code: "INVALID_URL" | "REPO_NOT_FOUND" | "RATE_LIMITED" | "INTERNAL_ERROR";
}
