# feat(analysis): analyze repository snapshots with a private Graphify worker (#68)

## feat(analysis): analyze repository snapshots with a private Graphify worker

## Interface

The change adds or changes these exports (`…` is a value the ticket does not give):

In `packages/core/src/analysis.ts`:

```ts
export const ANALYSIS_STATUSES = [
    "queued",
    "running",
    "succeeded",
    "failed",
] as const;

export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

export const ANALYSIS_ERROR_CODES = [
    "too_large",
    "too_many_files",
    "source_unavailable",
    "tool_failed",
    "tool_timeout",
    "upload_failed",
    "worker_lost",
    "cancelled",
] as const;

export type AnalysisErrorCode = (typeof ANALYSIS_ERROR_CODES)[number];

export const ARTIFACT_KINDS = [
    "graph_json",
    "graph_html",
    "report_md",
    "wiki_page",
    "manifest",
    "other",
] as const;

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export const GRAPHIFY_TOOL_VERSION = "graphifyy@0.4.18+driver-1";

export interface AnalysisParams {
    readonly deadlineMinutes: number;
}

export function expiredAnalysis(attempt: number, maxAttempts: number): {
    status: "queued" | "failed";
    attempt: number;
};

export function canonicalJson(value: unknown): string;
```
