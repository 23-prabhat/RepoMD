import type { StoredProject } from "./types.js";
interface AppOptions {
    apiUrl: string;
    cwd: string;
    repositoryUrl?: string;
    initialProject: StoredProject | null;
    forceAnalysis: boolean;
}
export declare function runApp(options: AppOptions): Promise<void>;
export {};
