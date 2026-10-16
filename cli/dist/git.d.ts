export declare function normalizeGitHubRemote(remote: string): string;
export declare function detectRepositoryUrl(cwd: string): Promise<string>;
export declare function getCurrentCommit(cwd: string): Promise<string | undefined>;
