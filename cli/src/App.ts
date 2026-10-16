import { createInterface } from "node:readline/promises";
import process from "node:process";
import { analyzeRepository, askRepository } from "./api.js";
import { getCurrentCommit } from "./git.js";
import { refreshDiagrams, saveProject } from "./storage.js";
import type { StoredProject } from "./types.js";

const ansi = {
  clear: "\u001b[2J\u001b[H",
  green: "\u001b[38;2;32;201;151m",
  cyan: "\u001b[36m",
  yellow: "\u001b[33m",
  red: "\u001b[31m",
  muted: "\u001b[38;2;120;149;139m",
  bold: "\u001b[1m",
  reset: "\u001b[0m",
};

interface AppOptions {
  apiUrl: string;
  cwd: string;
  repositoryUrl?: string;
  initialProject: StoredProject | null;
  forceAnalysis: boolean;
}

function paint(value: string, color: string): string {
  return process.stdout.isTTY ? `${color}${value}${ansi.reset}` : value;
}

function logo(): string {
  return paint([
    "  ____                  __  _______ ",
    " / __ \\___  ____  ____/  |/  / __ \\",
    "/ /_/ / _ \\/ __ \\/ __  /|_/ / / / /",
    "\\ _, _/  __/ /_/ / /_/ /  / / /_/ / ",
    "/_/ |_|\\___/ .___/\\__,_/_/  /_/_____/  ",
    "          /_/   repository intelligence",
  ].join("\n"), ansi.green);
}

function line(width = 68): string {
  return paint("─".repeat(width), ansi.muted);
}

function progressBar(progress: number): string {
  const normalized = Math.max(0, Math.min(100, progress));
  const filled = Math.round(normalized / 5);
  return `${paint("█".repeat(filled), ansi.green)}${paint("░".repeat(20 - filled), ansi.muted)} ${normalized}%`;
}

function drawHeader(project?: StoredProject | null): void {
  if (process.stdout.isTTY) process.stdout.write(ansi.clear);
  process.stdout.write(`${logo()}\n\n${line()}\n`);
  process.stdout.write(`${paint("RepoMD", `${ansi.bold}${ansi.green}`)}  ${paint(project?.data.repoFullName || "repository setup", ansi.muted)}\n`);
  process.stdout.write(`${line()}\n\n`);
}

async function requestRepositoryUrl(question: (prompt: string) => Promise<string>): Promise<string> {
  while (true) {
    const value = (await question(`${paint("GitHub repository URL", ansi.green)}: `)).trim();
    if (/^https?:\/\/github\.com\/[^/]+\/[^/]+/i.test(value)) return value;
    process.stdout.write(`${paint("Enter a full https://github.com/owner/repository URL.", ansi.red)}\n`);
  }
}

async function performAnalysis(options: AppOptions, repositoryUrl: string): Promise<StoredProject> {
  drawHeader();
  let previousLength = 0;
  const data = await analyzeRepository(options.apiUrl, repositoryUrl, (event) => {
    const text = `${event.detail || event.stage}  ${progressBar(event.progress || 0)}`;
    if (process.stdout.isTTY) {
      process.stdout.write(`\r${" ".repeat(previousLength)}\r${text}`);
      previousLength = text.length;
    } else {
      process.stdout.write(`${text}\n`);
    }
  });
  if (process.stdout.isTTY) process.stdout.write("\n");
  const commit = await getCurrentCommit(options.cwd);
  return saveProject(options.cwd, repositoryUrl, commit, data);
}

function printMessage(role: "you" | "repomd" | "notice", content: string): void {
  const color = role === "you" ? ansi.cyan : role === "notice" ? ansi.yellow : ansi.green;
  process.stdout.write(`${paint(role, `${ansi.bold}${color}`)}\n${content.trim()}\n\n`);
}

async function runChat(
  options: AppOptions,
  initial: StoredProject,
  question: (prompt: string) => Promise<string>
): Promise<void> {
  let project = initial;
  drawHeader(project);
  process.stdout.write(`${paint(`${project.data.analyzedFileCount}/${project.data.totalFileCount} files sampled`, ansi.muted)} · ${project.data.analysis.repoSummary.architectureStyle}\n`);
  process.stdout.write(`${paint("Artifacts: .repomd/architecture.svg · .repomd/entry-points.svg · .repomd/report.md", ansi.muted)}\n\n`);
  printMessage("repomd", `Ready. Ask anything about ${project.data.repoFullName}. Type /help for commands.`);

  while (true) {
    const input = (await question(paint("❯ ", ansi.green))).trim();
    if (!input) continue;
    if (input === "/exit" || input === "/quit") return;
    if (input === "/help") {
      printMessage("notice", "/architecture  /entrypoints  /reanalyze  /clear  /exit");
      continue;
    }
    if (input === "/clear") {
      drawHeader(project);
      continue;
    }
    if (input === "/architecture" || input === "/entrypoints") {
      await refreshDiagrams(options.cwd, project);
      printMessage("notice", input === "/architecture"
        ? "Architecture saved to .repomd/architecture.svg"
        : "Entry points saved to .repomd/entry-points.svg");
      continue;
    }
    if (input === "/reanalyze") {
      project = await performAnalysis(options, project.repositoryUrl);
      drawHeader(project);
      printMessage("repomd", "Repository analysis refreshed.");
      continue;
    }

    printMessage("you", input);
    process.stdout.write(`${paint("RepoMD is thinking…", ansi.muted)}\r`);
    try {
      const reply = await askRepository(options.apiUrl, project.data.repoFullName, project.data.analysis, input);
      process.stdout.write(" ".repeat(40) + "\r");
      printMessage("repomd", reply);
    } catch (error) {
      process.stdout.write(" ".repeat(40) + "\r");
      printMessage("notice", error instanceof Error ? error.message : String(error));
    }
  }
}

export async function runApp(options: AppOptions): Promise<void> {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    let project = options.initialProject;
    if (options.forceAnalysis || !project) {
      drawHeader();
      const repositoryUrl = options.repositoryUrl || await requestRepositoryUrl((prompt) => readline.question(prompt));
      try {
        project = await performAnalysis(options, repositoryUrl);
      } catch (error) {
        drawHeader();
        process.stdout.write(`${paint(error instanceof Error ? error.message : String(error), ansi.red)}\n\n`);
        const retryUrl = await requestRepositoryUrl((prompt) => readline.question(prompt));
        project = await performAnalysis(options, retryUrl);
      }
    }
    await runChat(options, project, (prompt) => readline.question(prompt));
  } finally {
    readline.close();
  }
}
