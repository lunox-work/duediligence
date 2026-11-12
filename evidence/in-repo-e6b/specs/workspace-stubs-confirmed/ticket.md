# fix(slice): stub workspace packages and check slices against published types (#130)



## Interface

The change adds or changes these exports (`…` is a value the ticket does not give):

In `packages/core/src/analysis.ts`:

```ts
export const SLICE_TOOL_VERSION = "slice@4";

export const SANDBOX_BUILD_RUN_VERSION = "sandbox_build@9";
```

In `packages/core/src/sandbox/project.ts`:

```ts
export const NODE_GLOBAL_DECLARATIONS: readonly string[] = …;

export function ambientDeclarations(packages: readonly string[], modules: PackageModules = { specifiers: [], text: "" }, installed: ReadonlySet<string> = new Set()): string;
```

In `packages/core/src/sandbox/provenance.ts`:

```ts
export function isRegistryVersion(version: string): boolean;
```

In `packages/core/src/slice/manifest.ts`:

```ts
export interface CompilationResult {
    readonly attempted: boolean;
    readonly ok: boolean;
    readonly diagnostics: readonly {
        readonly file: string | null;
        readonly line: number | null;
        readonly code: string;
        readonly message: string;
    }[];
    readonly shimmedPackages: readonly string[];
    readonly untypedPackageErrors?: CompilationResult["diagnostics"];
    readonly typedPackages?: readonly {
        readonly name: string;
        readonly version: string;
    }[];
}
```
