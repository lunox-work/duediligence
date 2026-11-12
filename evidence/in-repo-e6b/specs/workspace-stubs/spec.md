# Check slices against published types, and build sandboxes the same way

Until now a slice was type-checked with every package declared untyped, and
a generated sandbox project repeated that by writing a `declare module`
shorthand for every package into `sandbox/ambient.d.ts` (`AMBIENT_PATH`),
even for the approved packages it really installs. With #130 the worker
checks a slice against the published types of the registry packages it can
install. It keeps the repository's own workspace packages, and anything
else it cannot install, stubbed as untyped. The contract records the
outcome in `CompilationResult`. In `packages/core`, this change:

- bumps the slice and sandbox-build tool versions;
- exports the Node global declarations both checks share;
- lets `ambientDeclarations` leave installed packages to their own types;
- makes `generateProject` leave out the shorthand for each approved package
  the slice was checked against with its published types;
- exports the registry-version test `resolveScope` already uses;
- widens `CompilationResult` with two optional fields.

Everything below is pure. Nothing reads a clock, a file, a network or any
shared state. No export mutates its arguments, and two calls with equal
arguments return equal results, so overlapping calls cannot interfere.

## Exports

`packages/core/src/analysis.ts`

```ts
export const SLICE_TOOL_VERSION = "slice@4";            // was "slice@3"
export const SANDBOX_BUILD_RUN_VERSION = "sandbox_build@9"; // was "sandbox_build@8"
```

`toolVersionOf` keeps its behaviour and so returns the new values for
`"slice"` and `"sandbox_build"`. Every other tool version constant stays as it
is: `GRAPHIFY_TOOL_VERSION`, `ABSTRACTIONS_TOOL_VERSION`,
`DATA_MODEL_TOOL_VERSION`, `DOCUMENTS_TOOL_VERSION`, `BRIEF_TOOL_VERSION`,
`SCOPE_TOOL_VERSION`, `FIXTURES_TOOL_VERSION` and `STARTER_TOOL_VERSION`.

`packages/core/src/sandbox/project.ts`

```ts
export const NODE_GLOBAL_DECLARATIONS: readonly string[];

export function ambientDeclarations(
  packages: readonly string[],
  modules: PackageModules = { specifiers: [], text: "" },
  installed: ReadonlySet<string> = new Set(),
): string;
```

`PackageModules` stays as it is. `generateProject` changes only in the text
of its `AMBIENT_PATH` file, as the rules below describe. Its other files,
blockers, rewrites and descriptor stay as they are. All other exports of the
module also stay as they are, including `projectCompilerOptions`, `tsconfigFor`
and `AMBIENT_PATH`.

`packages/core/src/sandbox/provenance.ts`

```ts
export function isRegistryVersion(version: string): boolean;
```

`resolveScope` keeps its behaviour. Its "not a registry version" check is
now `!isRegistryVersion(item.version)`, so it accepts and rejects exactly
the versions the private `REGISTRY_RANGE` test did. `packageNameOf` and the
module's other exports stay as they are.

`packages/core/src/slice/manifest.ts`

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
    /** Package names declared untyped for the check: workspace packages and any it could not install types for. */
    readonly shimmedPackages: readonly string[];
    /** Errors only an untyped package raises, left out of `diagnostics` and `ok`. Absent before `slice@4`. */
    readonly untypedPackageErrors?: CompilationResult["diagnostics"];
    /** Packages checked against their published types, by name and the version whose types were read. Absent before `slice@4`. */
    readonly typedPackages?: readonly {
        readonly name: string;
        readonly version: string;
    }[];
}
```

The worker fills these fields. Core does not compute them. The only reader
in core is `generateProject`, which reads `typedPackages`.
`renderBoundaryMarkdown`, `renderPublicSurfaceMarkdown`, `boundarySummary`
and `sliceReadiness` keep their behaviour and ignore both new fields.

## Exact texts

`NODE_GLOBAL_DECLARATIONS` has these 16 entries, in this order. They are
the lines `ambientDeclarations` writes today between `declare module
"node:*";` and the first package line:

```
declare var process: any;
declare var Buffer: any;
declare var global: any;
declare var globalThis: any;
declare var require: any;
declare var module: any;
declare var exports: any;
declare var __dirname: string;
declare var __filename: string;
declare var console: any;
declare function setTimeout(handler: (...args: any[]) => void, ms?: number, ...args: any[]): any;
declare function clearTimeout(handle: any): void;
declare function setInterval(handler: (...args: any[]) => void, ms?: number, ...args: any[]): any;
declare function clearInterval(handle: any): void;
declare function queueMicrotask(callback: () => void): void;
declare function structuredClone<T>(value: T): T;
```

The array is not frozen at runtime, like the repository's other exported
constant arrays, and callers must not change it.

`UNTYPED_HEADER`, used when `installed` is empty, is today's header,
byte for byte:

```
// The same declarations the slice was type-checked against: Node's
// modules and globals untyped, and every package untyped. The project
// installs its approved packages for real; their own types are not
// consulted, so a contribution is checked against the slice's contract.
```

`TYPED_HEADER`, used when `installed` has at least one name, whether or not
that name is in `packages`:

```
// The same declarations the slice was type-checked against: Node's
// modules and globals untyped, and every package untyped but those the
// project installs and the slice was checked against: they keep their
// own published types.
```

These two headers are internal and not exported. They are named here only
so the scenarios can refer to them.

`ambientDeclarations(packages, modules, installed)` returns the following
lines joined with `"\n"`, then one `"\n"`, then `modules.text` exactly as
given:

1. the header lines (`UNTYPED_HEADER` or `TYPED_HEADER`);
2. `declare module "node:*";`;
3. every entry of `NODE_GLOBAL_DECLARATIONS`, in order;
4. for each distinct name in `packages`, sorted by UTF-16 code unit (the
   module's `compare`), and skipping any name in `installed`:
   - `declare module "<name>";`, but only when `modules.specifiers` does not
     contain `<name>`;
   - then `declare module "<name>/*";`.

Names are written exactly as given, with no escaping, as today.
`modules.text` is never parsed or filtered. A module the text declares for
an installed package stays in the text.

```gherkin
Feature: Slices checked against published types, and projects built the same way

  Background:
    Given "H_untyped" stands for the 4 lines of UNTYPED_HEADER
    And "H_typed" stands for the 4 lines of TYPED_HEADER
    And "NODE" stands for the line 'declare module "node:*";' followed by the 16 entries of NODE_GLOBAL_DECLARATIONS

  Rule: The slice and sandbox-build tool versions are bumped; the rest stay

    @happy
    Scenario: The bumped versions are what toolVersionOf reports
      When toolVersionOf is called with each tool
      Then it returns:
        | tool            | version                    |
        | slice           | slice@4                    |
        | sandbox_build   | sandbox_build@9            |
        | graphify        | graphifyy@0.4.18+driver-1  |
        | abstractions    | abstractions@3             |
        | data_model      | data_model@1               |
        | documents       | documents@1                |
        | brief           | brief@1                    |
        | scope           | scope@5                    |
        | fixtures        | fixtures@3                 |
        | sandbox_starter | sandbox_starter@4          |
      And SLICE_TOOL_VERSION is "slice@4"
      And SANDBOX_BUILD_RUN_VERSION is "sandbox_build@9"

  Rule: NODE_GLOBAL_DECLARATIONS is the fixed list of Node globals

    @happy
    Scenario: The list holds the 16 declarations in order
      When NODE_GLOBAL_DECLARATIONS is read
      Then it has 16 entries
      And entry 0 is "declare var process: any;"
      And entry 9 is "declare var console: any;"
      And entry 15 is "declare function structuredClone<T>(value: T): T;"
      And no entry starts with "declare module"
      And no entry contains a newline

    @boundary
    Scenario: The ambient file writes the list right after the node:* module
      When ambientDeclarations is called with packages []
      Then the lines after the header are 'declare module "node:*";' and then the 16 entries of NODE_GLOBAL_DECLARATIONS, with nothing between them

  Rule: With nothing installed, ambientDeclarations writes exactly what it wrote before

    @happy
    Scenario: Every package is declared untyped by shorthand and wildcard
      When ambientDeclarations is called with packages ["zod", "@acme/shared", "zod"]
      Then the result is H_untyped, NODE and these lines, joined by "\n" and followed by "\n":
        | line                                 |
        | declare module "@acme/shared";       |
        | declare module "@acme/shared/*";     |
        | declare module "zod";                |
        | declare module "zod/*";              |

    @boundary
    Scenario: No packages gives only the header and Node's declarations
      When ambientDeclarations is called with packages []
      Then the result is H_untyped and NODE, joined by "\n", followed by "\n"

    @happy
    Scenario: A declared module replaces its shorthand but keeps its wildcard
      Given modules with specifiers ["@acme/shared"] and text 'declare module "@acme/shared" {\n  export type Task = any;\n}\n'
      When ambientDeclarations is called with packages ["@acme/shared", "zod"] and those modules
      Then the result has no line 'declare module "@acme/shared";'
      And it has the lines 'declare module "@acme/shared/*";', 'declare module "zod";' and 'declare module "zod/*";'
      And it ends with the modules' text exactly

    @boundary
    Scenario: An explicitly empty installed set is the same as leaving it out
      When ambientDeclarations is called with packages ["zod"], the default modules and installed new Set()
      Then the result equals ambientDeclarations(["zod"])

  Rule: An installed package gets no untyped declaration, so its own types apply

    @happy
    Scenario: Only the packages not installed are declared
      When ambientDeclarations is called with packages ["lodash", "zod", "pg"], the default modules and installed {"zod"}
      Then the result is H_typed, NODE and these lines, joined by "\n" and followed by "\n":
        | line                          |
        | declare module "lodash";      |
        | declare module "lodash/*";    |
        | declare module "pg";          |
        | declare module "pg/*";        |
      And it contains no line naming "zod"

    @boundary
    Scenario Outline: The header depends only on whether installed is empty
      When ambientDeclarations is called with packages <packages> and installed <installed>
      Then the header is <header>
      And the package lines are <lines>

      Examples:
        | packages  | installed | header    | lines                                            |
        | ["zod"]   | {}        | H_untyped | declare module "zod"; / declare module "zod/*";  |
        | ["zod"]   | {"zod"}   | H_typed   | none                                             |
        | ["zod"]   | {"left"}  | H_typed   | declare module "zod"; / declare module "zod/*";  |
        | []        | {"zod"}   | H_typed   | none                                             |

    @boundary
    Scenario: Installed names match whole package names, case and all
      When ambientDeclarations is called with packages ["@acme/sdk", "Zod"] and installed {"@acme", "zod"}
      Then the result has the lines 'declare module "@acme/sdk";', 'declare module "@acme/sdk/*";', 'declare module "Zod";' and 'declare module "Zod/*";'

    @boundary
    Scenario: A module text for an installed package is still appended as given
      Given modules with specifiers ["zod"] and text 'declare module "zod" {\n  export const z: any;\n}\n'
      When ambientDeclarations is called with packages ["zod"], those modules and installed {"zod"}
      Then the result has no line 'declare module "zod";' and no line 'declare module "zod/*";'
      And it ends with the modules' text exactly

    @boundary
    Scenario: The arguments are not mutated and repeated calls agree
      Given packages ["zod", "pg"] and installed {"zod"}
      When ambientDeclarations is called twice with them
      Then both results are equal
      And packages is still ["zod", "pg"] and installed still holds only "zod"

  Rule: generateProject treats an approved package checked against its published types as installed

    # "installed" = the names of dependencies with kind "package", resolution
    # "approved-package" and a non-null version (the ones written to the project's
    # package.json dependencies), kept only where contract.compilation.typedPackages
    # has an entry with that name. Versions are not compared. An absent
    # typedPackages counts as [].

    @happy
    Scenario: A typed approved package loses its shorthand; an untyped one keeps it
      Given dependencies:
        | name   | kind    | version | resolution       |
        | zod    | package | ^3.22.0 | approved-package |
        | lodash | package | 4.17.21 | approved-package |
        | pg     | package | ^8.11.0 | runtime-mock     |
      And contract.compilation.typedPackages is [{ name: "zod", version: "3.22.4" }]
      When generateProject is called
      Then the file at AMBIENT_PATH starts with H_typed
      And it has no line 'declare module "zod";' and no line 'declare module "zod/*";'
      And it has the lines 'declare module "lodash";', 'declare module "lodash/*";', 'declare module "pg";' and 'declare module "pg/*";'
      And package.json's dependencies are still { "lodash": "4.17.21", "pg": "file:mocks/pg", "zod": "^3.22.0" }

    @boundary
    Scenario: A contract without typedPackages builds the ambient file as before
      Given the same dependencies and a contract whose compilation has no typedPackages field
      When generateProject is called
      Then the file at AMBIENT_PATH starts with H_untyped
      And it has the lines 'declare module "zod";' and 'declare module "zod/*";'
      And its text equals ambientDeclarations(["lodash", "pg", "zod", ...the bare names of knownSpecifiers], input.packageModules) with no installed set

    @boundary
    Scenario: An empty typedPackages is the same as an absent one
      Given contract.compilation.typedPackages is []
      When generateProject is called
      Then the file at AMBIENT_PATH equals the one generated when typedPackages is absent

    @boundary
    Scenario Outline: Only approved, pinned packages can count as installed
      Given a dependency "<name>" of kind "package" with version <version> and resolution "<resolution>"
      And contract.compilation.typedPackages is [{ name: "<name>", version: "1.0.0" }]
      When generateProject is called
      Then the file at AMBIENT_PATH <has> the line 'declare module "<declared>/*";'

      Examples:
        | name       | version | resolution       | declared    | has          |
        | zod        | "1.0.0" | approved-package | zod         | does not have |
        | stripe     | "*"     | runtime-mock     | stripe      | has          |
        | @acme/sdk  | null    | approved-package | @acme/sdk   | does not have |

    # In the third row, the approved package with a null version is neither
    # installed nor mocked, so it was never among the ambient packages, as before.

  Rule: isRegistryVersion accepts only what the public registry resolves

    # True exactly when version is non-empty and every character is one of
    # 0-9 A-Z a-z . - + ^ ~ < > = | * and the space (U+0020). Anything else is
    # false, never an exception.

    @happy
    Scenario Outline: Semver versions, ranges and dist-tags are registry versions
      When isRegistryVersion is called with "<version>"
      Then it returns true

      Examples:
        | version              |
        | 3.22.4               |
        | ^1.2.0               |
        | ~1.2                 |
        | >=1.0.0 <2.0.0       |
        | 1.x \|\| 2.x         |
        | *                    |
        | latest               |
        | 1.0.0-beta.1+build.5 |

    @unhappy
    Scenario Outline: Protocols, paths, aliases and shorthands are not
      When isRegistryVersion is called with "<version>"
      Then it returns false

      Examples:
        | version                          |
        | workspace:*                      |
        | npm:zod@3.22.4                   |
        | file:../shared                   |
        | link:../shared                   |
        | git+https://github.com/a/b.git   |
        | github:acme/widgets              |
        | acme/widgets                     |
        | https://example.com/pkg.tgz      |
        | 1.0.0_beta                       |

    @boundary
    Scenario Outline: Empty and whitespace edge cases
      When isRegistryVersion is called with <version>
      Then it returns <result>

      Examples:
        | version      | result |
        | ""           | false  |
        | " "          | true   |
        | "1.2.3\n"    | false  |
        | "\t1.2.3"    | false  |

    @unhappy
    Scenario: resolveScope still refuses to install a pin that is not a registry version
      Given a required package "zod" pinned to "npm:zod@3.22.4", registry source "public", not a workspace package
      And the owner's choice for "zod" is "approved-package"
      When resolveScope is called
      Then its dependency "zod" has resolution "unresolved" and detail "Not a registry version: a URL, a path or an alias."
      And its blockers include { code: "dependency_unresolved", detail: "zod is pinned to npm:zod@3.22.4, which is not a registry version." }

    @happy
    Scenario: resolveScope still approves a registry pin
      Given a required package "zod" pinned to "^3.22.0" with registry source "public"
      When resolveScope is called with no choices
      Then its dependency "zod" has resolution "approved-package"

  Rule: CompilationResult takes the new fields as optional, and the views ignore them

    @happy
    Scenario: A slice@3 compilation result is still a CompilationResult
      Given { attempted: true, ok: true, diagnostics: [], shimmedPackages: ["pg"] }
      Then it type-checks as a CompilationResult with untypedPackageErrors and typedPackages undefined

    @happy
    Scenario: A slice@4 result carries typed packages and untyped-package errors
      Given a CompilationResult with:
        | field                | value                                                                                   |
        | attempted            | true                                                                                    |
        | ok                   | true                                                                                    |
        | diagnostics          | []                                                                                      |
        | shimmedPackages      | ["@acme/shared"]                                                                        |
        | untypedPackageErrors | [{ file: "src/app.ts", line: 4, code: "TS2347", message: "Untyped function calls may not accept type arguments." }] |
        | typedPackages        | [{ name: "zod", version: "3.22.4" }]                                                    |
      Then it type-checks as a CompilationResult

    @boundary
    Scenario: The boundary markdown renders the same with or without the new fields
      Given a contract whose compilation is { attempted: true, ok: true, diagnostics: [], shimmedPackages: ["pg"] }
      And the same contract with untypedPackageErrors and typedPackages from the slice@4 example added
      When renderBoundaryMarkdown is called with each and the same manifest
      Then both results are equal
      And both contain "The included files and stubs type-check together, with `pg` declared as untyped packages."

    @boundary
    Scenario: Untyped-package errors do not appear in a failed compilation's list
      Given a compilation { attempted: true, ok: false, diagnostics: [{ file: "src/a.ts", line: 3, code: "TS2322", message: "Bad." }], shimmedPackages: [] } with untypedPackageErrors [{ file: "src/b.ts", line: 9, code: "TS2347", message: "Untyped." }]
      When renderBoundaryMarkdown is called
      Then the Compilation section lists "- `src/a.ts`:3 TS2322: Bad."
      And the result does not contain "TS2347"
```

## Decided:

- The Node globals list excludes `declare module "node:*";` and holds today's 16 globals in today's order.
  - Ticket: "export const NODE_GLOBAL_DECLARATIONS: readonly string[] = …;"
  - Instead: include the `node:*` module line, or use the worker shim's shorter 9-line list.
- `NODE_GLOBAL_DECLARATIONS` is not frozen at runtime.
  - Ticket: silent.
  - Instead: `Object.freeze` it.
- An installed package gets neither its shorthand nor its `/*` wildcard.
  - Ticket: "export function ambientDeclarations(packages: readonly string[], modules: PackageModules = { specifiers: [], text: "" }, installed: ReadonlySet<string> = new Set()): string;"
  - Instead: drop only the shorthand and keep the wildcard for subpaths.
- `installed` is matched against whole names as given, case-sensitively, with no `packageNameOf` folding.
  - Ticket: silent.
  - Instead: normalise both sides with `packageNameOf`.
- `modules.text` is appended verbatim, even when it declares an installed package.
  - Ticket: silent.
  - Instead: parse the text and drop the blocks of installed specifiers.
- With `installed` empty the output is byte-identical to today's, header included. Any non-empty `installed` switches to a fixed second header.
  - Ticket: silent.
  - Instead: always write one new header, or leave the header unchanged in both cases.
- `generateProject` treats as installed only the approved, pinned packages named in `contract.compilation.typedPackages`. Versions are not compared, and an absent list means none.
  - Ticket: silent.
  - Instead: treat every approved package as installed, whatever the slice was checked against.
- `isRegistryVersion` is exactly the current `REGISTRY_RANGE` test: `""` is false, `" "` is true, and there is no trimming.
  - Ticket: "export function isRegistryVersion(version: string): boolean;"
  - Instead: trim the input and treat empty or blank as `*`, or reject blank too.
- `resolveScope` keeps its behaviour and calls `isRegistryVersion` in place of the private regex.
  - Ticket: silent.
  - Instead: also let `isRegistryVersion` refuse workspace packages, or the versions themselves.
- `untypedPackageErrors` means errors only an untyped package raises, left out of `diagnostics` and `ok`.
  - Ticket: "readonly untypedPackageErrors?: CompilationResult["diagnostics"];"
  - Instead: the diagnostics of a second check run with every package untyped.
- `typedPackages[].version` is the version whose published types were read, not the repository's pin.
  - Ticket: "readonly typedPackages?: readonly { readonly name: string; readonly version: string; }[];"
  - Instead: the range the repository's `package.json` pins.
- The boundary markdown and summary do not render `typedPackages` or `untypedPackageErrors`.
  - Ticket: silent.
  - Instead: add a "checked against published types" line and an "errors not counted" list to the Compilation section.
- Only `SLICE_TOOL_VERSION` and `SANDBOX_BUILD_RUN_VERSION` change. `STARTER_TOOL_VERSION` stays at `sandbox_starter@4`, because the starter's call, which passes no `installed`, produces the same bytes as before.
  - Ticket: "export const SLICE_TOOL_VERSION = "slice@4"; export const SANDBOX_BUILD_RUN_VERSION = "sandbox_build@9";"
  - Instead: bump the starter version too.
- Every export stays pure, and overlapping calls share no state, so there are no `@concurrency` scenarios.
  - Ticket: silent.
  - Instead: specify caching or memoised shared declarations.
