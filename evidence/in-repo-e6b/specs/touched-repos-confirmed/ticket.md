# fix(sandbox): fixes from real runs — touched repositories, refused checks, test counts (#132)

- A draft's repository labels are read whatever their case or spacing,
  and a workspace with one briefed repository has its work there even
  when the draft names none (`draft-v9` tells the model the labels are
  the one place it names a repository).
- A refused starter check says where it stopped (rules, names, project,
  types) instead of always "does not compile", and the run log keeps its
  problems, counting a hidden test's without showing them.
- A build or starter run records the descriptor's public test counts on
  the version.

## Interface

The change adds or changes these exports (`…` is a value the ticket does not give):

In `apps/worker/src/tools/sandbox-build.ts`:

```ts
export async function descriptorTestSummary(files: readonly Pick<ArtifactFile, "path" | "absolutePath">[]): Promise<TaskDescriptorDto["testSummary"] | undefined>;
```

In `apps/worker/src/tools/starter-check.ts`:

```ts
export type StarterCheckStage = "rules" | "names" | "project" | "types";

export type StarterCheck = {
    readonly ok: false;
    readonly stage: StarterCheckStage;
    readonly problems: readonly string[];
} | {
    readonly ok: true;
    readonly problems: readonly [
    ];
    readonly project: GeneratedProject;
    readonly starter: StarterSubmission;
};
```

In `apps/worker/src/tools/starter.ts`:

```ts
export function refusedCheckLog(tool: string, stage: StarterCheckStage, problems: readonly string[]): string;
```
