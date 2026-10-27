# Reverse alias resolution: `reverseResolveAlias`

`src/utils.ts` (published as `pathe/utils`) can already turn an aliased path
into a real path with `resolveAlias(path, aliases)`. This change adds the
reverse: given a real path and the same alias map, `reverseResolveAlias`
returns every aliased spelling of that path. For example, with
`{ "~": "/root", "~assets": "/root/some/dir" }` the path
`/root/some/dir/smth.jpg` becomes `["~assets/smth.jpg", "~/some/dir/smth.jpg"]`.

## Exports

New export from `src/utils.ts`:

```ts
export function reverseResolveAlias(path: string, aliases: Record<string, string>): string[];
```

- The function is synchronous and pure. It never throws for string inputs
  and never mutates `aliases`. It returns a new array on every call.
- No new types or constants are exported.
- `normalizeAliases`, `resolveAlias` and `filename` keep their current
  signatures and behaviour. `src/index.ts` (the `pathe` entry) is unchanged
  and does not re-export the new function.

## Algorithm (normative)

1. If `path` is `""`, return `[]`.
2. Let `P = normalize(path)` (from `src/path.ts`: backslashes become `/`,
   the drive letter is upper-cased, `.`/`..` segments and repeated slashes
   are collapsed, and a trailing slash is kept).
3. Let `A = normalizeAliases(aliases)`. Go through the entries `[key, target]`
   of `A` in the order `Object.entries(A)` gives them:
   - If `target` is `""`, skip it.
   - Let `T = normalize(target)` with one trailing `/` removed (so `"/"`
     becomes `""` and `"/src/"` becomes `"/src"`).
   - The alias matches when `P` starts with `T` (case-sensitive) and the
     character of `P` at index `T.length` is `/` or doesn't exist (end of
     string).
   - On a match the candidate is `join(key, P.slice(T.length))`, using
     `join` from `src/path.ts`.
   - If the candidate is already in the result, skip it.
4. Sort the result by string length, shortest first. This sort is stable,
   so candidates of equal length keep the order from step 3.

```gherkin
Feature: reverseResolveAlias turns a real path back into its aliased forms

  Background:
    Given the alias map "fixture" is
      | alias          | target                  |
      | @foo/bar       | @foo/bar/dist/index.mjs |
      | @foo/bar/utils | @foo/bar/dist/utils.mjs |
      | @              | /root                   |
      | bingpot        | @/bingpot/index.ts      |
      | test           | @bingpot/index.ts       |
      | ~              | /root/index.js          |
      | ~/             | /src                    |
      | ~win           | C:/root/index.js        |
      | ~win/          | C:/src                  |

  Rule: An alias matches when the path equals its target or continues it past a "/"; the alias then replaces the target

    @happy
    Scenario Outline: Each normalised target maps back to its aliases
      When reverseResolveAlias("<path>", fixture) is called
      Then the result is <result>

      Examples:
        | path                    | result                                  |
        | @foo/bar/dist/index.mjs | ["@foo/bar"]                            |
        | @foo/bar/dist/utils.mjs | ["@foo/bar/utils"]                      |
        | /root                   | ["@"]                                   |
        | /root/bingpot/index.ts  | ["bingpot", "@/bingpot/index.ts"]       |
        | @bingpot/index.ts       | ["test"]                                |
        | /root/index.js          | ["~", "@/index.js"]                     |
        | /src                    | ["~/"]                                  |
        | C:/root/index.js        | ["~win"]                                |
        | C:/src                  | ["~win/"]                               |

    @happy
    Scenario Outline: The rest of the path is joined after the alias
      When reverseResolveAlias("<path>", fixture) is called
      Then the result is <result>

      Examples:
        | path           | result            |
        | /src/foo/bar   | ["~/foo/bar"]     |
        | C:/src/foo/bar | ["~win/foo/bar"]  |
        | /root/a/b.ts   | ["@/a/b.ts"]      |

    @happy
    Scenario: Every matching alias is returned
      Given the alias map { "~": "/root", "~assets": "/root/some/dir" }
      When reverseResolveAlias("/root/some/dir/smth.jpg", aliases) is called
      Then the result is ["~assets/smth.jpg", "~/some/dir/smth.jpg"]

    @boundary
    Scenario Outline: A target only matches at a segment boundary
      When reverseResolveAlias("<path>", fixture) is called
      Then the result is <result>

      Examples:
        | path         | result |
        | /srcfoo/bar  | []     |
        | /rootfoo     | []     |
        | /root2/x.js  | []     |

    @boundary
    Scenario Outline: The root target "/" matches every absolute path
      Given the alias map { "r": "/" }
      When reverseResolveAlias("<path>", aliases) is called
      Then the result is <result>

      Examples:
        | path  | result     |
        | /a/b  | ["r/a/b"]  |
        | /     | ["r/"]     |
        | a/b   | []         |

    @boundary
    Scenario: A path that is already aliased is not matched against targets
      Given the alias map { "~": "/x" }
      When reverseResolveAlias("~/y", aliases) is called
      Then the result is []

  Rule: When nothing matches, the result is an empty array, not the input path

    @unhappy
    Scenario Outline: Paths outside every alias target give []
      When reverseResolveAlias("<path>", fixture) is called
      Then the result is []

      Examples:
        | path       |
        | foo/bar.js |
        | ./bar.js   |
        | /other/x   |

    @unhappy
    Scenario: An empty path gives []
      When reverseResolveAlias("", fixture) is called
      Then the result is []

    @unhappy
    Scenario: An empty alias map gives []
      When reverseResolveAlias("/x/y", {}) is called
      Then the result is []

    @unhappy
    Scenario: Matching is case-sensitive apart from the drive letter
      When reverseResolveAlias("/ROOT/a", fixture) is called
      Then the result is []

    @unhappy
    Scenario: An alias with an empty target is ignored
      Given the alias map { "e": "", "~": "/x" }
      When reverseResolveAlias("/x/y", aliases) is called
      Then the result is ["~/y"]

  Rule: The input path and every target are normalised with normalize() before they are compared

    @happy
    Scenario Outline: Windows separators and a lower-case drive letter in the path are normalised
      When reverseResolveAlias("<path>", fixture) is called
      Then the result is <result>

      Examples:
        | path             | result            |
        | C:\src\foo\bar   | ["~win/foo/bar"]  |
        | c:/src/foo       | ["~win/foo"]      |

    @happy
    Scenario Outline: Dot segments and repeated slashes in the path are resolved before matching
      When reverseResolveAlias("<path>", fixture) is called
      Then the result is <result>

      Examples:
        | path                | result               |
        | /root/./index.js    | ["~", "@/index.js"]  |
        | /src//foo           | ["~/foo"]            |
        | /root/../etc/passwd | []                   |

    @happy
    Scenario Outline: Targets are normalised the same way
      Given the alias map { "<alias>": "<target>" }
      When reverseResolveAlias("<path>", aliases) is called
      Then the result is <result>

      Examples:
        | alias | target  | path   | result    |
        | w     | C:\x    | C:\x\y | ["w/y"]   |
        | w     | C:\x    | /x/y   | []        |
        | k     | /x/./   | /x/y   | ["k/y"]   |
        | k     | /z/../x | /x/y   | ["k/y"]   |

    @happy
    Scenario: Targets are first resolved against each other by normalizeAliases
      Given the alias map { "@": "/root", "bingpot": "@/bingpot/index.ts" }
      When reverseResolveAlias("/root/bingpot/index.ts", aliases) is called
      Then the result is ["bingpot", "@/bingpot/index.ts"]

  Rule: Trailing slashes on a target don't matter, but a trailing slash on the path is kept

    @boundary
    Scenario Outline: A target with a trailing slash also matches the bare directory
      Given the alias map { "t": "/x/" }
      When reverseResolveAlias("<path>", aliases) is called
      Then the result is <result>

      Examples:
        | path | result   |
        | /x   | ["t"]    |
        | /x/  | ["t/"]   |
        | /x/y | ["t/y"]  |

    @boundary
    Scenario Outline: A trailing slash on the path is kept in the result
      When reverseResolveAlias("<path>", fixture) is called
      Then the result is <result>

      Examples:
        | path           | result          |
        | /root/         | ["@/"]          |
        | /src/foo/bar/  | ["~/foo/bar/"]  |
        | /src/          | ["~/"]          |

    @boundary
    Scenario: The alias is used as written, including its own trailing slash
      Given the alias map { "~/": "/src" }
      When reverseResolveAlias("/src", aliases) is called
      Then the result is ["~/"]

  Rule: Results are unique and sorted shortest first; results of equal length keep normalizeAliases order

    @happy
    Scenario: More specific aliases come first because they give shorter results
      Given the alias map { "@": "/p", "@a": "/p/a", "@b": "/p/a/b" }
      When reverseResolveAlias("/p/a/b/c", aliases) is called
      Then the result is ["@b/c", "@a/b/c", "@/a/b/c"]

    @boundary
    Scenario: Results of equal length keep the alias map's order
      Given the alias map { "b": "/x", "a": "/x" }
      When reverseResolveAlias("/x/y", aliases) is called
      Then the result is ["b/y", "a/y"]

    @boundary
    Scenario: Two aliases that produce the same result appear once
      Given the alias map { "~": "/x", "~/": "/x" }
      When reverseResolveAlias("/x/y", aliases) is called
      Then the result is ["~/y"]

  Rule: The alias map is never changed and repeated calls give equal results

    @happy
    Scenario: A frozen alias map is accepted and left unchanged
      Given the alias map Object.freeze({ "~": "/x" })
      When reverseResolveAlias("/x/y", aliases) is called
      Then the result is ["~/y"]
      And the alias map still equals { "~": "/x" }

    @happy
    Scenario: An already-normalised map gives the same result as the raw map
      When reverseResolveAlias("/src/foo", fixture) is called
      And reverseResolveAlias("/src/foo", normalizeAliases(fixture)) is called
      Then both results are ["~/foo"]
      And the two results are different array instances

  Rule: Existing exports keep their behaviour

    @happy
    Scenario Outline: resolveAlias is unchanged
      When resolveAlias("<path>", fixture) is called
      Then the result is "<result>"

      Examples:
        | path         | result        |
        | ~/foo/bar    | /src/foo/bar  |
        | ~win/foo/bar | C:/src/foo/bar |
        | foo/bar.js   | foo/bar.js    |
```

Decided:
- If nothing matches, the result is `[]`. The input path is not returned.
  - Ticket: silent.
  - Instead: return `[path]`, mirroring `resolveAlias`, which returns the input unchanged.
- The function returns every matching alias, not just the best one.
  - Ticket: silent.
  - Instead: return only the most specific match (the signature's `string[]` already rules out a single string).
- Results are sorted by length, shortest first. Ties keep the order from `normalizeAliases`.
  - Ticket: silent.
  - Instead: longest first, or the order the aliases were found in.
- Duplicate results are removed, and the first one is kept.
  - Ticket: silent.
  - Instead: keep one entry per matching alias, even when two are identical.
- The input path and the targets are compared after `normalize()`, which resolves `.`/`..`, repeated slashes, backslashes and the drive letter.
  - Ticket: silent.
  - Instead: normalise only the input with `normalizeWindowsPath`, as `resolveAlias` does, and leave targets as given.
- A target matches only at a segment boundary: the next character is `/` or the path ends.
  - Ticket: silent.
  - Instead: plain string-prefix matching.
- A trailing slash on a target is ignored, so `/x/` matches `/x`. A trailing slash on the path is kept in the result.
  - Ticket: silent.
  - Instead: a target ending in `/` matches only paths that contain that slash, as `resolveAlias` does for alias keys.
- Matching is case-sensitive, except for the drive letter, which `normalize` upper-cases.
  - Ticket: silent.
  - Instead: case-insensitive matching on Windows-style paths.
- An empty path returns `[]`, and aliases with an empty target are skipped.
  - Ticket: silent.
  - Instead: treat `""` as a prefix of every path.
- The alias is put in front exactly as written, including any trailing slash, and the result goes through `join` (so `"~/"` + `""` gives `"~/"`).
  - Ticket: silent.
  - Instead: strip trailing slashes from the alias in the output.
- Targets are resolved against each other with `normalizeAliases` before matching. Targets are otherwise matched literally, and are not resolved back through other aliases.
  - Ticket: silent.
  - Instead: also return chains of aliases, e.g. `@/bingpot/index.ts` → `bingpot`.
- The function is not re-exported from `src/index.ts`.
  - Ticket: silent.
  - Instead: also export it from the main `pathe` entry.
