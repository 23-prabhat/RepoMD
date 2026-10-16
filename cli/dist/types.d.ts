export interface FolderEntry {
    path: string;
    purpose: string;
}
export interface EntryPointPrimary {
    file: string;
    description: string;
    executionFlow: string[];
}
export interface EntryPointSecondary {
    file: string;
    description: string;
}
export interface DependencyEdge {
    from: string;
    to: string;
    uses: string;
}
export interface CriticalFile {
    file: string;
    reason: string;
    category: string;
}
export interface ExecutionFlowStep {
    step: number;
    layer: string;
    file: string;
    description: string;
}
export interface AnalysisResult {
    folderStructure: FolderEntry[];
    entryPoints: {
        primary: EntryPointPrimary;
        secondary: EntryPointSecondary[];
    };
    dependencyMap: DependencyEdge[];
    criticalFiles: CriticalFile[];
    executionFlow: ExecutionFlowStep[];
    repoSummary: {
        description: string;
        techStack: {
            languages: string[];
            frameworks: string[];
            databases: string[];
            tools: string[];
        };
        architectureStyle: string;
        keyDecisions: string[];
    };
}
export interface AnalyzeSuccessResponse {
    ok: true;
    repoFullName: string;
    repoUrl: string;
    analyzedFileCount: number;
    totalFileCount: number;
    treeTruncated: boolean;
    analysis: AnalysisResult;
}
export interface ProgressEvent {
    stage: string;
    progress?: number;
    detail?: string;
    error?: string;
    code?: string;
    data?: AnalyzeSuccessResponse;
}
export interface StoredProject {
    version: 1;
    repositoryUrl: string;
    analyzedCommit?: string;
    generatedAt: string;
    data: AnalyzeSuccessResponse;
}
export interface ChatMessage {
    role: "user" | "assistant" | "system";
    content: string;
}
