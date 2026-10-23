# RepoMD CLI

RepoMD CLI is the terminal interface for the RepoMD web analysis service. The web service keeps the provider keys, uses OpenCode Zen first and Groq as fallback, and performs repository analysis and chat. The CLI detects the current GitHub repository, streams progress, saves local artifacts, and provides an interactive chat.

## Install from this repository

Until the package is published, install the CLI globally from the project root:

```bash
npm install -g ./cli
repomd --version
```

You can remove the local installation with `npm uninstall -g repomd`.

## Install from npm

After the first public release, either install the command globally:

```bash
npm install -g repomd
repomd init
```

Or run it without a permanent installation:

```bash
npx repomd@latest init
```

## Run RepoMD

Run the web service in one terminal:

```bash
cd web
pnpm dev
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

## Package maintainers

Validate and inspect the package without publishing:

```bash
cd cli
npm test
npm pack --dry-run
```

Publishing requires an npm account with permission to claim the `repomd` package:

```bash
npm login
npm publish
```
