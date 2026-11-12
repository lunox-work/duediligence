# Plan: hosted MCP in the plugin, and a library for sandbox-factory

Status: proposal, 2026-11-12. Delete this file when it lands. The platform
side is in `public/sandbox-factory/PLAN.md`; the phases below use its
numbering.

## 1. A library entry for sandbox-factory (its phase 3)

sandbox-factory takes duediligence's rules and prompts. It does not take
the session runner, because its worker has its own agent loop and
evaluator.

- Add `"exports"` to `package.json`: `"."` for the CLI as now, and `"./api"`
  pointing to a new `bin/api.mjs` that re-exports pure functions only:
  - `decisionItems`, `scenarios`, `diffDecisions` (`bin/decisions.mjs`)
  - `hiddenManifest`, `hiddenSha256` (`bin/commitment.mjs`). Split
    `commitment(slug)` and `recordCommitment` so the hash takes a directory
    or a file map and never reads `HOME`.
  - The calibration rule from `bin/calibrate.mjs`, as
    `calibrate({ skeleton, reference })`: given test outcomes, it returns
    `kept` and `dropped` with reasons.
  - The verdict rule from `bin/judge.mjs`, as `verdict(outcomes)`, where
    `outcomes` holds the public and hidden results, the existing suite
    before and after, the changed paths and the allowed paths.
  - `promptPath(name)` for `prompts/spec-from-ticket.md`, `skeleton.md`,
    `public-tests.md`, `hidden-tests.md`, `reference.md` and `repo/*`.
- Nothing in `./api` may spawn a process, read `DUEDILIGENCE_HOME` or touch
  the network. Test this in `test/smoke.mjs` by importing `./api` with
  `HOME` unset.
- Add `bin/api.mjs` and the prompts to `files` (prompts are already
  included).
- **Done when** sandbox-factory's worker can calibrate its smoke fixture by
  calling `calibrate` and reading prompts through `promptPath`, at an
  exact pinned version.

## 2. The MCP server in the plugin (after the platform's phase 1 is live)

- Add `.mcp.json` at the repository root:

  ```json
  {
    "mcpServers": {
      "lunox": {
        "type": "http",
        "url": "https://platform.lunox.work/mcp/duediligence"
      }
    }
  }
  ```

  Claude Code runs the OAuth sign-in on first use (`/mcp`). Without
  sign-in, the CLI skill works exactly as now.

- `scripts/skill.mjs`: add `.mcp.json` to `PLUGIN_FILES`, because the
  `claude-plugin` branch carries only that list. `check` must fail when
  `.mcp.json` is missing, isn't valid JSON, or its URL isn't
  `https://platform.lunox.work/mcp/duediligence`. The generated plugin
  README gains a "Hosted mode" line.
- **Data and privacy.** `.claude-plugin/data.md` and `PRIVACY.md` currently
  say "duediligence runs no service", which would no longer be true. Add a
  section: the CLI is unchanged and local; the bundled `lunox` MCP server is
  Lunox's hosted service, used only after the person signs in; it receives
  the ticket, spec, decisions and submitted code; hidden suites are kept on
  the platform; state retention; and a link to the platform's privacy
  policy, which must exist first.
- **SKILL.md: two modes.**
  - _Local_ (default): the steps as now.
  - _Hosted_, when the `lunox` tools are present and signed in: the hidden
    suite stays on the platform, so the agent is blind by placement, as in
    CI and with no audit. Flow: `post_bounty` and `draft_spec` → give the person
    `confirm_link` (never confirm for them) → `prepare` → `get_handout` →
    implement → `judge`. Until the platform's phase 6, say the hosted tools
    are read-only and use local mode.
- Bump to 0.4.0. Publish npm first, then pack (`skill:pack`), then the
  `plugin-branch`. Agensi zips and skills.sh carry the skill only; mention
  `claude mcp add --transport http lunox <url>` for other clients.
- **Done when** `claude plugin install duediligence@duediligence`, from a
  local marketplace checkout, lists the `lunox` server. `/mcp` signs in
  against production and `list_workspaces` answers. Local mode still passes
  `npm test` with the server signed out.

## 3. The CLI as a platform client (the platform's phases 5–6)

Local mode stays the default, and nothing below runs without `login`.

- `duediligence login` uses the platform's device flow and writes the
  token to `~/.lunox/credentials` (mode 600). carveout reads the same file.
  `logout` revokes the token. `whoami` prints the workspace.
- `duediligence push <slug>` uploads a spec whose decisions were confirmed
  locally (`confirmed.json`) as a bounty with its spec, through
  `POST /orgs/:orgId/specs`. It refuses an unconfirmed spec, as `prepare`
  does now.
- `duediligence prepare <slug> --hosted` runs on the platform, through
  `POST /versions/:vid/prepare`, and pulls back the public suite and
  handout. The hidden suite stays on the platform.
- `duediligence ci --platform` judges a pull request through `POST /judge`
  with the GitHub Actions OIDC token. It needs no seal and no secret. Add a
  `platform: true` input to `.github/workflows/judge.yml` and `action.yml`;
  the seal path stays for workspaces without the platform.
- `duediligence judge --platform <submission>` prints a verdict the
  platform already gave, in the same format as a local verdict.
- HTTP: a small `bin/platform-client.mjs` on `fetch` with no dependency,
  which keeps duediligence at zero runtime dependencies. Its types are
  checked against the platform's `openapi.json` in `test/smoke.mjs`. Send
  the CLI version; on `426`, print the minimum version.
- `.claude-plugin/data.md` and `PRIVACY.md`: `push`, `--hosted` and
  `--platform` send the spec, the ticket and code to the platform.
- **Done when** a spec confirmed locally, then pushed, prepared hosted and
  judged by `ci --platform` on a test repository gives the same verdict as
  judging it locally. No hidden test reaches the machine or the
  transcript.
