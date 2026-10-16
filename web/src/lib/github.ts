import type {
  GitHubRepo,
  GitHubTreeResponse,
  GitHubTreeItem,
  GitHubFileContent,
  FetchedFile,
  RepoContext,
} from "./types";

function getGitHubToken(): string | undefined {
  // Read per-request (not cached at import) so .env updates take effect after restart,
  // trim whitespace/newlines that often sneak in when pasting PATs,
  // and accept common alt names.
  const raw =
    process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? process.env.GITHUB_PAT;
  const token = raw?.trim();
  return token ? token : undefined;
}

async function githubFetch(url: string): Promise<Response> {
  const GITHUB_TOKEN = getGitHubToken();
  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (GITHUB_TOKEN) {
    headers["Authorization"] = `Bearer ${GITHUB_TOKEN}`;
  }

  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  } catch {
    // Retry a transient connection failure once, with a bounded wait.
    res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  }

  if (!res.ok) {
    if (res.status === 404) {
      // GitHub intentionally returns 404 for private repos the token can't see,
      // so distinguish the two cases with an actionable message.
      if (GITHUB_TOKEN) {
        throw new Error(
          "404: Repository not found or is private and this token has no access to it. " +
            "For a private repo, grant this token Contents: Read (and Metadata: Read) " +
            "plus repository access to that repo, then restart the dev server."
        );
      }
      throw new Error(
        "404: Repository not found or is private. Set GITHUB_TOKEN in .env to analyze private repos."
      );
    }
    if (res.status === 401) {
      throw new Error("401: Invalid or expired GITHUB_TOKEN — generate a new token and restart the server");
    }
    if (res.status === 403) {
      const remaining = res.headers.get("x-ratelimit-remaining");
      if (remaining === "0") {
        throw new Error("429: GitHub rate limit exceeded");
      }
      throw new Error(
        "403: GitHub API forbidden — token lacks permission for this repo (needs Contents: Read). " +
          "Check token scopes and repository access, then restart the server."
      );
    }
    throw new Error(`${res.status}: GitHub API error`);
  }

  return res;
}

export function getGitHubAuthStatus(): { configured: boolean; tokenLength: number; tokenPrefix: string } {
  const t = getGitHubToken();
  return {
    configured: !!t,
    tokenLength: t?.length ?? 0,
    tokenPrefix: t ? `${t.slice(0, 11)}...` : "",
  };
}

export function parseGitHubUrl(rawUrl: string): { owner: string; repo: string } {
  let url = rawUrl.trim();
  // Strip protocol
  url = url.replace(/^https?:\/\//i, "");
  // Strip .git suffix
  url = url.replace(/\.git$/, "");
  // Strip domain
  url = url.replace(/^github\.com\//i, "");
  // Strip /tree/... or /blob/... suffixes
  url = url.replace(/\/(tree|blob)\/.*$/, "");
  // Strip trailing slashes
  url = url.replace(/\/+$/, "");

  const segments = url.split("/").filter(Boolean);
  if (segments.length < 2) {
    throw new Error("Invalid GitHub URL");
  }

  return { owner: segments[0], repo: segments[1] };
}

export async function fetchRepoMetadata(owner: string, repo: string): Promise<GitHubRepo> {
  const res = await githubFetch(`https://api.github.com/repos/${owner}/${repo}`);
  return res.json() as Promise<GitHubRepo>;
}

export async function fetchRepoTree(
  owner: string,
  repo: string,
  branch: string
): Promise<GitHubTreeResponse> {
  const res = await githubFetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`
  );
  return res.json() as Promise<GitHubTreeResponse>;
}

const ENTRY_POINT_PATTERNS = /(^|\/)(index|main|server|app|start|bootstrap|cli|worker|page|layout|route|handler)\.(?:[cm]?[jt]sx?|py|go|rs|java|kt|rb|php|cs)$/i;
const ARCHITECTURE_FILE_PATTERNS = /(^|\/)(routes?|controllers?|services?|repositories?|models?|schemas?|middleware|auth|database|db|store|providers?|adapters?|clients?|commands?|handlers?)(\/|\.)/i;
const SOURCE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?|py|go|rs|java|kt|rb|php|cs|vue|svelte)$/i;
const LOW_VALUE_PATH_PATTERN = /(^|\/)(node_modules|vendor|dist|build|coverage|fixtures?|snapshots?|generated)(\/|$)|\.(?:min\.js|map|lock)$/i;
const CONFIG_FILES = new Set([
  "package.json",
  "pnpm-workspace.yaml",
  "requirements.txt",
  "Gemfile",
  "pyproject.toml",
  "go.mod",
  "Cargo.toml",
  "pom.xml",
  "build.gradle",
  "tsconfig.json",
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
]);
const NEXT_CONFIG_PATTERN = /^next\.config\./;
const README_PATTERN = /^README/i;

export function selectPriorityFiles(tree: GitHubTreeResponse, maxFiles = 35): string[] {
  const blobs = tree.tree.filter(
    (item): item is GitHubTreeItem & { type: "blob" } =>
      item.type === "blob" &&
      (item.size ?? 0) <= 100_000 &&
      !LOW_VALUE_PATH_PATTERN.test(item.path)
  );

  const selected = new Set<string>();
  const byShallowPath = (a: GitHubTreeItem, b: GitHubTreeItem) => {
    const depth = a.path.split("/").length - b.path.split("/").length;
    return depth || a.path.localeCompare(b.path);
  };
  const addTier = (candidates: GitHubTreeItem[], limit: number) => {
    let added = 0;
    for (const file of candidates.sort(byShallowPath)) {
      if (selected.size >= maxFiles || added >= limit) break;
      if (selected.has(file.path)) continue;
      selected.add(file.path);
      added++;
    }
  };

  // Runtime entry points reveal control flow. Include framework conventions such
  // as Next.js page/route files as well as traditional main/server files.
  addTier(blobs.filter((file) => ENTRY_POINT_PATTERNS.test(file.path)), 8);

  // Manifests and deployment configuration identify package boundaries,
  // frameworks, commands, infrastructure, and generated runtime behavior.
  addTier(blobs.filter((file) => {
    const name = file.path.split("/").pop() ?? "";
    return CONFIG_FILES.has(name) || NEXT_CONFIG_PATTERN.test(name);
  }), 7);

  addTier(
    blobs.filter((file) => README_PATTERN.test(file.path.split("/").pop() ?? "")),
    1
  );

  // Sample architectural seams rather than spending the remaining budget on
  // whichever files happen to appear first in the Git tree.
  addTier(blobs.filter((file) => ARCHITECTURE_FILE_PATTERNS.test(file.path)), 14);

  // Add one source file from each top-level package/application so monorepos
  // and polyglot repositories retain coverage across runtime boundaries.
  const seenDirs = new Set<string>();
  for (const f of blobs) {
    if (selected.size >= maxFiles) break;
    if (selected.has(f.path)) continue;
    if (!SOURCE_FILE_PATTERN.test(f.path)) continue;
    const parts = f.path.split("/");
    if (parts.length < 2) continue;
    const topDir = parts[0];
    if (seenDirs.has(topDir)) continue;
    seenDirs.add(topDir);
    selected.add(f.path);
  }

  // Fill remaining slots with shallow source files first, then other useful
  // text files. This keeps the full 35-file budget useful for smaller repos.
  const remaining = [...blobs].sort((a, b) => {
    const sourceDifference = Number(SOURCE_FILE_PATTERN.test(b.path)) - Number(SOURCE_FILE_PATTERN.test(a.path));
    return sourceDifference || byShallowPath(a, b);
  });
  for (const f of remaining) {
    if (selected.size >= maxFiles) break;
    selected.add(f.path);
  }

  return Array.from(selected).slice(0, maxFiles);
}

export async function fetchPriorityFiles(
  owner: string,
  repo: string,
  paths: string[],
  onProgress?: (fetched: number, total: number) => void
): Promise<FetchedFile[]> {
  const CHUNK_SIZE = 10;
  const results: FetchedFile[] = [];

  for (let i = 0; i < paths.length; i += CHUNK_SIZE) {
    const chunk = paths.slice(i, i + CHUNK_SIZE);
    const settled = await Promise.allSettled(
      chunk.map(async (path) => {
        const res = await githubFetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/${path}`
        );
        const data = (await res.json()) as GitHubFileContent;
        const content = Buffer.from(data.content, "base64").toString("utf-8");
        return { path, content } satisfies FetchedFile;
      })
    );

    for (const result of settled) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      }
      // silently skip failed individual file fetches
    }

    onProgress?.(Math.min(i + CHUNK_SIZE, paths.length), paths.length);
  }

  return results;
}

export function formatTreeForPrompt(tree: GitHubTreeResponse): string {
  const blobs = tree.tree
    .filter((item) => item.type === "blob")
    .sort((a, b) => a.path.localeCompare(b.path))
    .slice(0, 500);

  return blobs
    .map((f) => {
      if ((f.size ?? 0) > 10_000) {
        const kb = ((f.size ?? 0) / 1024).toFixed(1);
        return `${f.path} (${kb}KB)`;
      }
      return f.path;
    })
    .join("\n");
}

export function buildRepoContext(repo: GitHubRepo, tree: GitHubTreeResponse): RepoContext {
  return {
    repo,
    treeText: formatTreeForPrompt(tree),
    treeTruncated: tree.truncated,
    totalFileCount: tree.tree.filter((i) => i.type === "blob").length,
  };
}
