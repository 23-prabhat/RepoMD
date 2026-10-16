# RepoMD CLI

RepoMD CLI is the terminal interface for the RepoMD web analysis service. The web service keeps the provider keys, uses OpenCode Zen first and Groq as fallback, and performs repository analysis and chat. The CLI detects the current GitHub repository, streams progress, saves local artifacts, and provides an interactive chat.

## Personal setup

Run the web service in one terminal:

```bash
cd web
pnpm dev
```

Install and build the CLI in another terminal:

```bash
cd cli
pnpm install
pnpm build
pnpm link --global
```

From any GitHub repository:

```bash
repomd init
```

The first run analyzes the repository, writes `.repomd/analysis.json`, `.repomd/report.md`, `.repomd/architecture.svg`, and `.repomd/entry-points.svg`, then opens chat. Later, use `repomd` or `repomd chat` to reopen the saved analysis.

To use another API deployment:

```bash
REPOMD_API_URL=https://your-repomd.example repomd init
```
