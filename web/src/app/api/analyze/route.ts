import {
  parseGitHubUrl,
  fetchRepoMetadata,
  fetchRepoTree,
  selectPriorityFiles,
  fetchPriorityFiles,
  buildRepoContext,
  getGitHubAuthStatus,
} from "@/lib/github";
import { analyzeRepository } from "@/lib/groq";
import type {
  AnalyzeSuccessResponse,
  GitHubRepo,
  GitHubTreeResponse,
} from "@/lib/types";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

interface SSEProgress {
  stage: string;
  progress: number;
  detail?: string;
}

interface SSEDone {
  stage: "done";
  progress: 100;
  data: AnalyzeSuccessResponse;
}

interface SSEError {
  stage: "error";
  error: string;
  code: string;
}

type SSEEvent = SSEProgress | SSEDone | SSEError;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body", "INVALID_URL", 400);
  }

  const rawUrl =
    body && typeof body === "object" && "url" in body && typeof (body as { url: unknown }).url === "string"
      ? (body as { url: string }).url
      : null;

  if (!rawUrl?.trim()) {
    return jsonError("Missing or empty url field", "INVALID_URL", 400);
  }

  let owner: string, repo: string;
  try {
    ({ owner, repo } = parseGitHubUrl(rawUrl));
  } catch {
    return jsonError("Invalid GitHub URL — paste a full https://github.com/owner/repo URL", "INVALID_URL", 400);
  }

  console.log(`[analyze] owner="${owner}" repo="${repo}" github=${JSON.stringify(getGitHubAuthStatus())}`);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: SSEEvent) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      try {
        // 1. Fetch metadata
        send({ stage: "metadata", progress: 10, detail: "Fetching repository info..." });
        let meta: GitHubRepo;
        try {
          meta = await fetchRepoMetadata(owner, repo);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[analyze] fetchRepoMetadata failed: ${msg}`);
          if (msg.includes("404")) {
            send({
              stage: "error",
              error:
                `Repository "${owner}/${repo}" was not found or is private. Check the URL and repository access.`,
              code: "REPO_NOT_FOUND_OR_PRIVATE",
            });
          } else if (msg.includes("401")) {
            send({ stage: "error", error: "We couldn't access this repository. Please check repository access and try again.", code: "INTERNAL_ERROR" });
          } else if (msg.includes("429") || msg.includes("rate limit")) {
            send({ stage: "error", error: "GitHub rate limit exceeded. Try again later.", code: "RATE_LIMITED" });
          } else {
            send({ stage: "error", error: "We couldn't fetch the repository. Please try again later.", code: "INTERNAL_ERROR" });
          }
          return;
        }

        console.log(`[analyze] Fetched metadata: ${meta.full_name}, branch=${meta.default_branch}`);

        // 2. Fetch tree
        send({ stage: "tree", progress: 20, detail: "Scanning file tree..." });
        let tree: GitHubTreeResponse;
        try {
          tree = await fetchRepoTree(owner, repo, meta.default_branch);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[analyze] fetchRepoTree failed: ${msg}`);
          send({ stage: "error", error: "We couldn't read the repository files. Please try again later.", code: "INTERNAL_ERROR" });
          return;
        }

        console.log(`[analyze] Tree: ${tree.tree.length} items, truncated=${tree.truncated}`);

        // 3. Fetch priority files
        const priorityPaths = selectPriorityFiles(tree);
        send({ stage: "files", progress: 30, detail: `Fetching 0/${priorityPaths.length} files...` });

        const files = await fetchPriorityFiles(owner, repo, priorityPaths, (fetched, total) => {
          const fileProgress = 30 + Math.round((fetched / total) * 35);
          send({ stage: "files", progress: fileProgress, detail: `Fetching ${fetched}/${total} files...` });
        });

        console.log(`[analyze] Fetched ${files.length}/${priorityPaths.length} files — sending to AI provider`);

        // 4. Analyze with Groq, falling back to Gemini when needed
        send({ stage: "analyzing", progress: 70, detail: "AI is analyzing the codebase..." });
        const context = buildRepoContext(meta, tree);

        const analysis = await analyzeRepository(context, files);

        console.log(`[analyze] Done ✓`);

        // 5. Send final result
        const successResponse: AnalyzeSuccessResponse = {
          ok: true,
          repoFullName: meta.full_name,
          repoUrl: meta.html_url,
          analyzedFileCount: files.length,
          totalFileCount: context.totalFileCount,
          treeTruncated: context.treeTruncated,
          analysis,
        };

        send({ stage: "done", progress: 100, data: successResponse });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[analyze] Unexpected error: ${msg}`);
        send({ stage: "error", error: "We couldn't complete the analysis. Please try again in a few minutes.", code: "INTERNAL_ERROR" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function jsonError(error: string, code: string, status: number): Response {
  return Response.json({ ok: false, error, code }, { status });
}
