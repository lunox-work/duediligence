# feat: report and attest the commit each build came from (#29)



## Interface

The change adds or changes these exports (`…` is a value the ticket does not give):

In `packages/shared/src/build-info.ts`:

```ts
export const UNKNOWN_BUILD = "unknown";

export const buildInfoSchema = …;

export type BuildInfoDto = z.infer<typeof buildInfoSchema>;

export const versionResponseSchema = …;

export const unknownBuildInfo: BuildInfoDto = …;

export function formatVersion(info: BuildInfoDto): string;

export function isIdentified(info: BuildInfoDto): boolean;

export function commitUrl(info: BuildInfoDto): string | undefined;

export function sameBuild(a: BuildInfoDto, b: BuildInfoDto): boolean;

export function buildBanner(name: string, info: BuildInfoDto): string;
```
