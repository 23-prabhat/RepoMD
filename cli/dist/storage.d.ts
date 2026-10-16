import type { AnalyzeSuccessResponse, StoredProject } from "./types.js";
export declare const outputDirectoryName = ".repomd";
export declare function saveProject(cwd: string, repositoryUrl: string, analyzedCommit: string | undefined, data: AnalyzeSuccessResponse): Promise<StoredProject>;
export declare function loadProject(cwd: string): Promise<StoredProject | null>;
export declare function refreshDiagrams(cwd: string, project: StoredProject): Promise<void>;
