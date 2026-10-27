# Home's setup stage and getting-started checklist

Home becomes one page that changes with what a workspace has connected
(ticket #84). The decision of *which* home to show, and what the
getting-started checklist above it says, is made in a new, pure module,
`apps/web/src/features/onboarding/setup.ts`. `useWorkspaceSetup` (outside
this seam) gathers the facts from the cache keys the summarised pages already
use and passes them in as a `SetupFacts`; this module only reads that value.
It imports no React, no query client, no `fetch`, no storage and no clock,
so every behaviour below is checked by calling its exports with a plain
object, the way `test/analysis-labels.test.ts` calls `runDuration`.

The file is new, so no existing export of it changes. Everything outside it
(`useJira`, `withoutJira`, `useJiraBoards`, `useGithub`, `HomeBoard`'s
`readHomeBoard`/`writeHomeBoard`, the removal of `useConnections`) is out of
this spec's scope and keeps the behaviour it has at the starting commit
unless another spec says otherwise.

## Exports

Exactly these, with these signatures (as the ticket gives them):

```ts
export type SetupStage = "barebone" | "jira" | "github" | "both";

export interface SetupFacts {
    readonly jira: {
        readonly available: boolean;   // the server offers Jira at all
        readonly connected: number;    // healthy Jira connections
        readonly broken: number;       // unhealthy ones (need reconnecting)
        readonly boards: number;       // registered boards
    };
    readonly github: {
        readonly available: boolean;   // the server has a GitHub App configured
        readonly connected: number;    // GitHub connections (installations)
        readonly repositories: number; // registered repositories
    };
    readonly proposals: number;        // proposals in the workspace
    readonly bounties: number;         // bounties in the workspace
    readonly canManage: boolean;       // the person is an owner or admin
}

export function setupStage(facts: SetupFacts): SetupStage;

export type SetupStepId = "jira" | "github" | "size";

export interface SetupStep {
    readonly id: SetupStepId;
    readonly done: boolean;
    readonly current: boolean;
}

export function setupSteps(facts: SetupFacts): SetupStep[];

export function setupComplete(facts: SetupFacts): boolean;
```

No other export is added. All three functions are synchronous, total (they
never throw for any value of the declared type) and pure: they do not mutate
`facts`, and equal inputs give equal outputs. `setupSteps` returns a new
array on every call.

## Definitions used by every rule

- A count is **positive** when `count > 0`. Zero, negative numbers and `NaN`
  are not positive; a fractional count above zero (e.g. `0.5`) is positive.
  No input is rejected.
- **Jira is connected** when `jira.available` is `true` **and**
  `jira.connected` is positive. `jira.broken` and `jira.boards` never make
  Jira connected.
- **GitHub is connected** when `github.available` is `true` **and**
  `github.connected` is positive. `github.repositories` never makes GitHub
  connected.
- **Something is sized** when `proposals` is positive **or** `bounties` is
  positive.

```gherkin
Feature: Home's setup stage and getting-started checklist
  setupStage, setupSteps and setupComplete in
  apps/web/src/features/onboarding/setup.ts decide which home a workspace
  sees and what its checklist says, from a SetupFacts value alone.

  Background:
    Given the base facts are:
      | field              | value |
      | jira.available     | true  |
      | jira.connected     | 0     |
      | jira.broken        | 0     |
      | jira.boards        | 0     |
      | github.available   | true  |
      | github.connected   | 0     |
      | github.repositories| 0     |
      | proposals          | 0     |
      | bounties           | 0     |
      | canManage          | true  |
    And each scenario changes only the fields it names

  Rule: setupStage names the tools that are connected: neither is "barebone", Jira alone is "jira", GitHub alone is "github", both is "both"

    @happy
    Scenario Outline: The stage follows the healthy connections
      Given jira.connected is <jira> and github.connected is <github>
      When setupStage is called
      Then it returns "<stage>"

      Examples:
        | jira | github | stage    |
        | 0    | 0      | barebone |
        | 1    | 0      | jira     |
        | 0    | 1      | github   |
        | 1    | 1      | both     |
        | 3    | 2      | both     |

    @boundary
    Scenario Outline: Boards, repositories, proposals and bounties do not change the stage
      Given jira.connected is 1 and jira.boards is <boards>
      And github.repositories is <repositories>
      And proposals is <proposals> and bounties is <bounties>
      When setupStage is called
      Then it returns "jira"

      Examples:
        | boards | repositories | proposals | bounties |
        | 0      | 0            | 0         | 0        |
        | 4      | 0            | 0         | 0        |
        | 0      | 7            | 12        | 3        |

    @boundary
    Scenario: GitHub repositories without a GitHub connection are not a GitHub stage
      Given github.connected is 0 and github.repositories is 5
      When setupStage is called
      Then it returns "barebone"

    @boundary
    Scenario: canManage does not change the stage
      Given canManage is false and jira.connected is 1 and github.connected is 1
      When setupStage is called
      Then it returns "both"

  Rule: Only healthy connections count; a workspace whose Jira sites all need reconnecting is not at the Jira stage

    @unhappy
    Scenario Outline: Broken Jira connections do not make Jira connected
      Given jira.connected is <connected> and jira.broken is <broken>
      And github.connected is <github>
      When setupStage is called
      Then it returns "<stage>"

      Examples:
        | connected | broken | github | stage    |
        | 0         | 2      | 0      | barebone |
        | 0         | 1      | 1      | github   |
        | 1         | 3      | 0      | jira     |

  Rule: A tool the server does not offer is never connected, whatever its counts say

    @unhappy
    Scenario Outline: available false overrides the connection count
      Given jira.available is <jiraAvailable> and jira.connected is <jira>
      And github.available is <githubAvailable> and github.connected is <github>
      When setupStage is called
      Then it returns "<stage>"

      Examples:
        | jiraAvailable | jira | githubAvailable | github | stage    |
        | false         | 2    | true            | 0      | barebone |
        | false         | 2    | true            | 1      | github   |
        | true          | 1    | false           | 4      | jira     |
        | false         | 1    | false           | 1      | barebone |

  Rule: A count is positive only when it is greater than zero; no input is rejected and no call throws

    @boundary
    Scenario Outline: Odd counts are read, not rejected
      Given jira.connected is <jira> and github.connected is <github>
      When setupStage is called
      Then it returns "<stage>" without throwing

      Examples:
        | jira | github | stage    |
        | -1   | 0      | barebone |
        | NaN  | 0      | barebone |
        | 0    | -3     | barebone |
        | 0.5  | 0      | jira     |
        | NaN  | 1      | github   |

    @boundary
    Scenario: Negative and NaN proposal and bounty counts are not sized
      Given proposals is -1 and bounties is NaN
      When setupSteps is called
      Then the "size" step has done false

  Rule: setupSteps lists the checklist in the fixed order jira, github, size, leaving out the steps that do not apply

    The "jira" step is listed when jira.available is true and (Jira is
    connected or canManage is true). The "github" step is listed on the
    same terms with github.available. The "size" step is always listed, so
    the list is never empty. Listed steps keep the order jira, github, size.

    @happy
    Scenario: A fresh workspace a manager can set up lists all three steps
      When setupSteps is called
      Then it returns:
        | id     | done  | current |
        | jira   | false | true    |
        | github | false | false   |
        | size   | false | false   |

    @boundary
    Scenario Outline: A tool the server does not offer has no step
      Given jira.available is <jiraAvailable> and github.available is <githubAvailable>
      When setupSteps is called
      Then the step ids are, in order, <ids>

      Examples:
        | jiraAvailable | githubAvailable | ids               |
        | true          | true            | jira, github, size |
        | false         | true            | github, size       |
        | true          | false           | jira, size         |
        | false         | false           | size               |

    @boundary
    Scenario Outline: Someone who cannot manage the workspace is not asked to connect a tool, but sees one already connected
      Given canManage is false
      And jira.connected is <jira> and github.connected is <github>
      When setupSteps is called
      Then the step ids are, in order, <ids>

      Examples:
        | jira | github | ids               |
        | 0    | 0      | size               |
        | 1    | 0      | jira, size         |
        | 0    | 1      | github, size       |
        | 1    | 1      | jira, github, size |

    @unhappy
    Scenario: A member whose workspace has only broken Jira sites sees no Jira step
      Given canManage is false and jira.connected is 0 and jira.broken is 2
      When setupSteps is called
      Then the step ids are, in order, size

  Rule: A step is done when its outcome holds: jira when Jira is connected, github when GitHub is connected, size when something is sized

    @happy
    Scenario Outline: Each step is done on its own fact
      Given jira.connected is <jira> and github.connected is <github>
      And proposals is <proposals> and bounties is <bounties>
      When setupSteps is called
      Then the steps' done values are jira <jiraDone>, github <githubDone>, size <sizeDone>

      Examples:
        | jira | github | proposals | bounties | jiraDone | githubDone | sizeDone |
        | 0    | 0      | 0         | 0        | false    | false      | false    |
        | 1    | 0      | 0         | 0        | true     | false      | false    |
        | 0    | 1      | 0         | 0        | false    | true       | false    |
        | 0    | 0      | 1         | 0        | false    | false      | true     |
        | 0    | 0      | 0         | 1        | false    | false      | true     |
        | 2    | 1      | 5         | 3        | true     | true       | true     |

    @boundary
    Scenario: Boards and repositories alone complete no step
      Given jira.boards is 3 and github.repositories is 2
      When setupSteps is called
      Then every step has done false

    @unhappy
    Scenario: Broken Jira sites leave the Jira step undone for a manager
      Given jira.connected is 0 and jira.broken is 1
      When setupSteps is called
      Then it returns:
        | id     | done  | current |
        | jira   | false | true    |
        | github | false | false   |
        | size   | false | false   |

  Rule: Exactly one step is current, the first listed step that is not done; when every step is done none is current

    @happy
    Scenario Outline: current moves to the first undone step in list order
      Given jira.connected is <jira> and github.connected is <github> and proposals is <proposals>
      When setupSteps is called
      Then the current step is <current>

      Examples:
        | jira | github | proposals | current |
        | 0    | 0      | 0         | jira    |
        | 1    | 0      | 0         | github  |
        | 1    | 1      | 0         | size    |
        | 0    | 1      | 0         | jira    |
        | 0    | 0      | 1         | jira    |
        | 1    | 0      | 1         | github  |

    @boundary
    Scenario: Sizing before connecting does not move current past an undone step
      Given proposals is 4
      When setupSteps is called
      Then it returns:
        | id     | done  | current |
        | jira   | false | true    |
        | github | false | false   |
        | size   | true  | false   |

    @boundary
    Scenario: A member with nothing connected has the size step current
      Given canManage is false
      When setupSteps is called
      Then it returns:
        | id   | done  | current |
        | size | false | true    |

    @boundary
    Scenario: Every step done leaves none current
      Given jira.connected is 1 and github.connected is 1 and bounties is 1
      When setupSteps is called
      Then it returns:
        | id     | done | current |
        | jira   | true | false   |
        | github | true | false   |
        | size   | true | false   |

  Rule: setupComplete is true exactly when every step setupSteps lists for the same facts is done

    @happy
    Scenario Outline: Completion follows the listed steps
      Given jira.available is <jiraAvailable> and jira.connected is <jira>
      And github.available is <githubAvailable> and github.connected is <github>
      And canManage is <canManage> and proposals is <proposals>
      When setupComplete is called
      Then it returns <complete>

      Examples:
        | jiraAvailable | jira | githubAvailable | github | canManage | proposals | complete |
        | true          | 0    | true            | 0      | true      | 0         | false    |
        | true          | 1    | true            | 1      | true      | 0         | false    |
        | true          | 1    | true            | 0      | true      | 1         | false    |
        | true          | 1    | true            | 1      | true      | 1         | true     |
        | false         | 0    | false           | 0      | true      | 1         | true     |
        | true          | 1    | false           | 0      | true      | 1         | true     |
        | true          | 0    | true            | 0      | false     | 1         | true     |
        | true          | 0    | true            | 0      | false     | 0         | false    |

    @boundary
    Scenario: A hand-written bounty completes the size step as a proposal would
      Given jira.connected is 1 and github.connected is 1 and proposals is 0 and bounties is 1
      When setupComplete is called
      Then it returns true

    @boundary
    Scenario: setupComplete agrees with setupSteps for any facts
      Given any SetupFacts value
      When setupSteps and setupComplete are called with it
      Then setupComplete returns true exactly when every returned step has done true
      And when setupComplete returns true no returned step has current true

  Rule: The functions are pure: they do not mutate their input and return a fresh list each call

    @boundary
    Scenario: The facts are left as they were
      Given a frozen copy (Object.freeze, deeply) of facts with jira.connected 1 and proposals 2
      When setupStage, setupSteps and setupComplete are each called with it
      Then none of them throws
      And the facts still deep-equal their value before the calls

    @boundary
    Scenario: Each setupSteps call returns a new array
      When setupSteps is called twice with the same facts object
      Then the two results deep-equal each other
      And they are not the same array instance
```

These are synchronous functions of one value; calls cannot overlap, so there
is no `@concurrency` scenario. Whatever `useWorkspaceSetup` does while its
reads are still loading is outside this seam.

Decided:
- Which connections count: only `connected` (healthy) ones; `broken` never makes a tool connected or a step done.
- Whether `available: false` with a positive count counts as connected: it does not; the tool is treated as absent.
- Whether boards or repositories affect the stage or steps: they do not; only connections do.
- Odd counts (negative, `NaN`, fractional): read as positive only when `> 0`; nothing is rejected and nothing throws.
- What "size" being done means: `proposals > 0` or `bounties > 0` (a hand-written bounty counts).
- Which steps are listed: a tool's step needs the tool available and either connected or `canManage`; `size` is always listed.
- Step order: fixed `jira`, `github`, `size`, whatever is done.
- Which step is current: the first listed undone one; none when all are done; done-out-of-order steps don't move it.
- What `setupComplete` means: every step `setupSteps` lists is done (so it can't be true with an empty list, since `size` is always listed).
- Whether `canManage` affects the stage: it does not; it only affects which steps are listed.
- Purity: the input isn't mutated, and each `setupSteps` call returns a new array; no concurrency rules, because the functions are synchronous.
