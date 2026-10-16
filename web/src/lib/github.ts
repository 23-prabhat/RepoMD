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

const ENTRY_POINT_PATTERNS = /^(src\/|)?(index|main|server|app|start)\.[a-z]+$/i;
const CONFIG_FILES = new Set([
  "package.json",
  "pyproject.toml",
  "go.mod",
  "Cargo.toml",
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
      item.type === "blob" && (item.size ?? 0) <= 100_000
  );

  // Tier 1: entry points (max 3)
  const tier1 = blobs
    .filter((f) => ENTRY_POINT_PATTERNS.test(f.path))
    .slice(0, 3)
    .map((f) => f.path);

  // Tier 2: config files (max 5)
  const tier2 = blobs
    .filter((f) => {
      const name = f.path.split("/").pop() ?? "";
      return CONFIG_FILES.has(name) || NEXT_CONFIG_PATTERN.test(name);
    })
    .slice(0, 5)
    .map((f) => f.path);

  // Tier 3: README (max 1)
  const tier3 = blobs
    .filter((f) => README_PATTERN.test(f.path.split("/").pop() ?? ""))
    .slice(0, 1)
    .map((f) => f.path);

  const selected = new Set([...tier1, ...tier2, ...tier3]);

  // Tier 4: top-level source files in root or src/ (max 10)
  const tier4Candidates = blobs.filter((f) => {
    if (selected.has(f.path)) return false;
    const parts = f.path.split("/");
    // root-level or directly inside src/
    return parts.length === 1 || (parts.length === 2 && parts[0] === "src");
  });
  let tier4Count = 0;
  for (const f of tier4Candidates) {
    if (tier4Count >= 10) break;
    selected.add(f.path);
    tier4Count++;
  }

  // Tier 5: one representative file per unique top-level directory (max 16)
  const seenDirs = new Set<string>();
  let tier5Count = 0;
  for (const f of blobs) {
    if (selected.has(f.path)) continue;
    const parts = f.path.split("/");
    if (parts.length < 2) continue;
    const topDir = parts[0];
    if (seenDirs.has(topDir)) continue;
    if (tier5Count >= 16 || selected.size >= maxFiles) break;
    seenDirs.add(topDir);
    selected.add(f.path);
    tier5Count++;
  }

  // Tier 6: fill any remaining slots with eligible source files. This lets
  // repositories with fewer top-level directories still reach the file cap.
  for (const f of blobs) {
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
