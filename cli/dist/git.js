import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
export function normalizeGitHubRemote(remote) {
    const value = remote.trim();
    const sshMatch = value.match(/^git@github\.com:([^/]+)\/(.+)$/i);
    if (sshMatch)
        return `https://github.com/${sshMatch[1]}/${sshMatch[2].replace(/\.git$/i, "")}`;
    const sshUrlMatch = value.match(/^ssh:\/\/git@github\.com\/([^/]+)\/(.+)$/i);
    if (sshUrlMatch)
        return `https://github.com/${sshUrlMatch[1]}/${sshUrlMatch[2].replace(/\.git$/i, "")}`;
    try {
        const url = new URL(value);
        if (url.hostname.toLowerCase() !== "github.com") {
            throw new Error("The origin remote is not hosted on GitHub.");
        }
        const parts = url.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "").split("/");
        if (parts.length !== 2 || !parts[0] || !parts[1])
            throw new Error("Invalid GitHub remote.");
        return `https://github.com/${parts[0]}/${parts[1]}`;
    }
    catch (error) {
        if (error instanceof Error && error.message.includes("GitHub"))
            throw error;
        throw new Error("Could not understand the Git origin remote.");
    }
}
export async function detectRepositoryUrl(cwd) {
    try {
        const { stdout } = await execFileAsync("git", ["remote", "get-url", "origin"], { cwd });
        return normalizeGitHubRemote(stdout);
    }
    catch {
        throw new Error("No GitHub origin remote was found. Pass a GitHub URL after `repomd init`.");
    }
}
export async function getCurrentCommit(cwd) {
    try {
        const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd });
        return stdout.trim() || undefined;
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=git.js.map