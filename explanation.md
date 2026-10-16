# RepoMD Architecture Explanation

This document explains the RepoMD architecture in presentation order. Use it with [`architecture.html`](architecture.html) for a judge demonstration and [`architecture.svg`](architecture.svg) as the standalone diagram.

## One-sentence description

RepoMD is a repository-intelligence system with a visual web interface and a terminal interface that share one server-side pipeline for GitHub ingestion, structured architecture analysis, diagrams, and repository-specific chat.

## The main design decision

RepoMD is presented as two products backed by one engine:

- **RepoMD Web** is designed for visual exploration, presentation, and PDF export.
- **RepoMD CLI** is designed for developers working inside a repository terminal.
- **The RepoMD API** provides one analysis contract to both products.

This separation prevents the CLI from becoming a second analysis implementation. Improvements to repository selection, prompts, provider routing, output structure, and error handling immediately benefit both interfaces.

## Architecture boundaries

The diagram is divided into three boundaries.

### 1. User surfaces

The left side contains the products a user interacts with.

#### Browser product

The Next.js browser interface accepts a full GitHub URL. It streams analysis progress and then renders:

1. Folder structure and module ownership
2. Primary and secondary entry points
3. Dependency relationships
4. Critical files
5. Execution flow
6. Repository and technology summary
7. Interactive repository chat
8. Downloadable PDF report

The browser stores the current analysis in tab-scoped `sessionStorage`. RepoMD does not currently maintain user accounts or server-side analysis history.

#### CLI product

The Node.js CLI runs from a repository terminal:

```bash
repomd init
```

It detects the current repository's GitHub remote, calls the same web API, streams progress, and writes:

```text
.repomd/
├── analysis.json
├── report.md
├── architecture.svg
└── entry-points.svg
```

After analysis, the CLI opens an interactive chat grounded in the saved repository report. The CLI does not download a local model and does not contain provider credentials.

### 2. RepoMD server trust boundary

The center of the diagram is the secret-bearing application boundary. It contains two API routes and the shared analysis pipeline.

#### `POST /api/analyze`

This route owns the complete repository-analysis workflow:

1. Parse and validate the submitted URL.
2. Normalize it into a GitHub owner and repository name.
3. Fetch repository metadata.
4. Fetch the recursive Git tree.
5. Select a bounded set of useful files.
6. Download and decode selected file content.
7. Build a compact repository context.
8. Request the structured analysis.
9. Stream progress and the final response through server-sent events.

The browser and CLI receive these stages:

```text
metadata → tree → files → analyzing → done
```

#### `POST /api/chat`

This route receives three values:

- The repository name
- The saved structured analysis
- The user's question

The saved analysis becomes the grounding context. Chat therefore answers questions about what RepoMD analyzed instead of silently reading new files on every message.

#### Shared structured result

Both routes use the same analysis model:

```text
AnalysisResult
├── folderStructure[]
├── entryPoints
├── dependencyMap[]
├── criticalFiles[]
├── executionFlow[]
└── repoSummary
```

This shared contract is the architectural connection between the web UI, CLI artifact generation, diagrams, PDF export, and chat.

### 3. External services

The right side contains services outside the RepoMD trust boundary.

#### GitHub REST API

GitHub is the repository source. RepoMD reads:

- Repository metadata
- Default branch
- Recursive file tree
- Selected file content

Public repositories can be analyzed without a token, subject to GitHub rate limits. Private repositories require an authorized, read-only token.

#### Primary analysis provider

OpenCode Zen is the primary route. RepoMD currently requests the configured DeepSeek model through the OpenAI-compatible chat endpoint. Analysis requests include a strict JSON schema so the result matches the six required report sections.

#### Fallback analysis provider

Groq is the fallback. If the primary route is unavailable, returns no usable content, or fails structured parsing, RepoMD attempts the same task through Groq. The client still receives the same `AnalysisResult` shape.

Provider selection remains an internal server decision. The browser and CLI do not change behavior based on which provider completed the request.

## Complete analysis sequence

### Step 1: Input

The web user pastes a GitHub URL. The CLI user can provide a URL or allow RepoMD to detect the current repository's remote.

### Step 2: Validation

The server accepts a GitHub repository URL, strips protocol and `.git`, removes branch or blob suffixes, and extracts the owner and repository.

### Step 3: Repository discovery

RepoMD fetches repository metadata and the recursive Git tree. This gives it the repository's language, default branch, description, topics, file paths, and sizes.

### Step 4: Deterministic file selection

RepoMD selects evidence before invoking AI. Current tiers are:

1. Up to three likely entry points such as `index`, `main`, `server`, `app`, or `start`.
2. Up to five configuration files.
3. One README.
4. Up to ten root-level or direct `src/` files.
5. Up to nine representative files from unique top-level directories.

The total selection is capped at 28 files, and files above 100 KB are excluded.

### Step 5: Context construction

RepoMD combines:

- Repository metadata
- Up to 500 file-tree entries
- Selected source excerpts
- Explicit output requirements

Only the first 20 fetched files are used in the main prompt. Each excerpt is bounded by line count and context allocation.

### Step 6: Structured analysis

The server requests a JSON object containing exactly the six analysis sections. It asks for actual repository paths, concise descriptions, and no invented files.

### Step 7: Retry and fallback

Request-size and structured-output failures can receive one retry using a smaller context. If the primary route still fails, the server uses Groq. If neither route succeeds, the user receives a generic error without provider or model details.

### Step 8: Presentation

The browser turns the result into cards, graphs, diagrams, chat context, and PDF output. The CLI turns the same result into terminal output and files under `.repomd/`.

## Why there is no local model

RepoMD's CLI is intended to install and start quickly on ordinary developer machines. Requiring a local model would introduce large downloads, hardware requirements, model runtime management, and inconsistent performance.

The CLI therefore calls the hosted RepoMD API. This gives users a lightweight command while keeping provider routing, schema behavior, and credentials centralized.

## Why there is no central database

The current product does not require shared history, accounts, teams, or cross-device synchronization. A database would add deployment and privacy complexity without helping the core repository-analysis flow.

Current storage rules are:

- Browser result: current tab's `sessionStorage`
- CLI result: local `.repomd/` directory
- Server: request-scoped processing

A future account-based product could add persistent storage behind the same API without changing the analysis schema.

## Reliability behavior

RepoMD uses several layers of reliability:

1. GitHub connection failures receive one bounded retry.
2. Individual file failures are skipped instead of failing the complete repository.
3. Large or invalid structured-analysis requests can retry with a compact context.
4. Primary provider failures switch to Groq.
5. User-facing errors remain generic and actionable.
6. Internal details remain in server logs.

## Security and privacy model

### Secrets

These values belong only in the web server environment:

```env
OPENCODE_API_KEY=...
OPENCODE_MODEL=deepseek-v4.1-flash
GROQ_API_KEY=...
GITHUB_TOKEN=...
```

They must never use a `NEXT_PUBLIC_` prefix. The CLI only needs `REPOMD_API_URL` when it connects to a non-local deployment.

### Repository permissions

RepoMD performs repository reads. It does not push commits, create branches, modify issues, or write to GitHub. Private-repository tokens should have the minimum required access: repository metadata and contents read permission.

### Data sent externally

Selected repository metadata, paths, and source excerpts are sent to the configured AI provider. Repository chat sends the saved analysis and user question. Anyone deploying RepoMD for confidential source code must evaluate provider retention terms and establish an appropriate privacy policy.

### Compliance position

RepoMD currently documents technical controls but does not claim certification under SOC 2, ISO 27001, HIPAA, PCI DSS, GDPR, or another regulatory framework. A public production service would need explicit policies for authentication, consent, retention, deletion, audit logs, incident response, rate limiting, and provider data-processing agreements.

## Architecture rules

These rules should remain true as RepoMD grows:

1. Web and CLI remain separate experiences backed by one analysis contract.
2. GitHub and AI credentials remain server-side.
3. The response schema does not depend on the provider.
4. Repository reads remain bounded by explicit limits.
5. Provider failures are hidden behind generic client messages.
6. Generated paths must be supported by repository evidence.
7. CLI files remain inside the active repository's `.repomd/` directory.
8. Repository-derived SVG text is XML-escaped.
9. Private repository access uses least privilege.
10. Schema changes update web rendering, CLI types, diagrams, documentation, and validation together.

## Technology stack

| Area | Technology | Purpose |
| --- | --- | --- |
| Web framework | Next.js 16 | Pages, server rendering, API routes, metadata |
| UI runtime | React 19 | Interactive browser components |
| Language | TypeScript | Shared contracts and implementation safety |
| Styling | Tailwind CSS 4 | Responsive layouts and themes |
| Graphs | React Flow and Dagre | Interactive architecture and dependency layout |
| Reports | jsPDF and AutoTable | PDF export |
| Icons | Lucide React | Interface iconography |
| CLI runtime | Node.js 22+ | Terminal product |
| CLI interaction | `readline/promises` and ANSI | Chat, status, and progress |
| Repository source | GitHub REST API | Metadata, tree, and content |
| Primary AI | OpenCode Zen | Structured analysis and chat |
| Fallback AI | Groq | Automatic resilience route |
| Storage | `sessionStorage` and local files | Temporary browser and repository-local results |

## Current limits

| Limit | Value |
| --- | --- |
| Selected files | Maximum 28 |
| Selected file size | Maximum 100 KB |
| GitHub fetch batch | 10 files |
| Prompt files | First 20 fetched files |
| Source excerpt | First 150 lines, also bounded by context allocation |
| Tree paths | First 500 files |
| Full context budget | Approximately 8,000 characters before allocation |
| Compact retry | Approximately 4,000 characters |
| Requested array length | Maximum 8 items per section |
| GitHub timeout | 15 seconds |
| AI timeout | 60 seconds |
| API execution budget | 60 seconds |

## Tradeoffs

### Benefits

- One engine keeps web and CLI results consistent.
- Server-side credentials simplify installation and reduce secret exposure.
- Deterministic source sampling controls cost and latency.
- Structured output enables multiple visualizations from one response.
- Local CLI artifacts work with normal repository workflows.
- Provider fallback improves availability.

### Limitations

- Sampling can miss behavior in very large or unusually organized repositories.
- Results describe the repository's default branch at analysis time.
- Chat is grounded in the generated report rather than every source file.
- Browser results are not persisted after the tab session.
- The CLI currently depends on a running or hosted RepoMD web API.

## Judge presentation script

### 30-second version

> RepoMD has two interfaces: a visual web product and a repository-native CLI. Both call one Next.js analysis API, which reads a bounded set of files from GitHub and produces a strict six-section architecture report. OpenCode Zen is the primary intelligence engine and Groq is the automatic fallback. Credentials stay on the server, there is no central database, and every result can be explored in the browser or saved as local CLI artifacts.

### Two-minute version

1. Start on the left side of the diagram and introduce the web and CLI as separate products.
2. Move to the center and explain that both call the same analyze and chat APIs.
3. Follow the analysis route to GitHub and explain deterministic, bounded file selection.
4. Follow the pipeline through ingest, prompt construction, and provider routing.
5. Explain the primary and fallback providers on the right.
6. Return to the structured result and show how one schema drives browser modules, PDF, CLI reports, SVGs, and chat.
7. Finish with the four rules at the bottom: server-side secrets, no central database, bounded analysis, and graceful failure.

## Suggested live demo

1. Open [`architecture.html`](architecture.html) and use fullscreen mode for the diagram.
2. Open the RepoMD web product and analyze a repository.
3. Point out streamed progress and the six structured report sections.
4. Ask a concrete repository question in chat.
5. Export the PDF.
6. Open a terminal in the same repository and run `repomd init`.
7. Show `.repomd/architecture.svg`, `.repomd/entry-points.svg`, and the terminal chat.
8. Return to the architecture presentation and explain that both demonstrations used the same secured engine.

## Related documents

- Interactive presentation: [`architecture.html`](architecture.html)
- Standalone SVG: [`architecture.svg`](architecture.svg)
- Project overview: [`README.md`](README.md)
