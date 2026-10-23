#!/usr/bin/env node
import { readFileSync } from "node:fs";
import process from "node:process";
import { runApp } from "./App.js";
import { detectRepositoryUrl } from "./git.js";
import { loadProject } from "./storage.js";

const VERSION = (JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
) as { version: string }).version;

function help(): void {
  process.stdout.write(`RepoMD CLI

Usage:
  repomd init [github-url]   Analyze a repository and open chat
  repomd chat               Open chat for the saved analysis
  repomd                    Open chat, or initialize when needed

Options:
  --api <url>               RepoMD web API (default: REPOMD_API_URL or http://localhost:3000)
  --version                 Show the installed CLI version
  --help                    Show this help
`);
}

function optionValue(args: string[], option: string): string | undefined {
  const index = args.indexOf(option);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    help();
    return;
  }
  if (args.includes("--version") || args.includes("-v")) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  const first = args[0];
  const command = first === "init" || first === "analyze" || first === "chat" ? first : "default";
  const explicitUrl = args.find((value) => /^https?:\/\/github\.com\//i.test(value));
  const apiUrl = optionValue(args, "--api") || process.env.REPOMD_API_URL || "http://localhost:3000";
  const cwd = process.cwd();
  const initialProject = await loadProject(cwd);
  const forceAnalysis = command === "init" || command === "analyze" || !initialProject;

  let repositoryUrl = explicitUrl;
  if (forceAnalysis && !repositoryUrl) {
    repositoryUrl = await detectRepositoryUrl(cwd).catch(() => undefined);
  }

  await runApp({ apiUrl, cwd, repositoryUrl, initialProject, forceAnalysis });
}

main().catch((error: unknown) => {
  process.stderr.write(`RepoMD: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
