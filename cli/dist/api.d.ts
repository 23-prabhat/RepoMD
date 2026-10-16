import type { AnalysisResult, AnalyzeSuccessResponse, ProgressEvent } from "./types.js";
export declare function analyzeRepository(baseUrl: string, repositoryUrl: string, onProgress: (event: ProgressEvent) => void): Promise<AnalyzeSuccessResponse>;
export declare function askRepository(baseUrl: string, repoFullName: string, analysis: AnalysisResult, message: string): Promise<string>;
