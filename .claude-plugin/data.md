- **Sent off the machine:** the spec, the ticket it came from and the code
  being judged go to the model backend the person chooses, on their own
  account: a Claude Code session, the Codex CLI, or the Anthropic API with
  their `ANTHROPIC_API_KEY`. `confirm --from` reads a GitHub issue, or a Jira
  issue with `JIRA_BASE_URL`, `JIRA_EMAIL` and `JIRA_API_TOKEN`, from the
  person's own GitHub or Jira. The first run installs the test toolchain from
  npm, and from pip for Python; Go and Rust use the toolchains already
  installed. There is no telemetry.
- **Lunox platform, only when asked:** without an account the CLI is
  unchanged and local. `duediligence login` signs in to Lunox's hosted service
  at platform.lunox.work with a code approved in the browser, and stores a
  workspace API token in `~/.lunox/credentials` on the same machine (mode 600,
  shared with carveout); `logout` deletes it. `login`, `whoami`, `logout`,
  `push` and `ci --platform` are the only commands that talk to the platform.
  The CLI sends the token, its name and version, and, once at sign-in, the
  machine's host name to label the token. `push <slug>` posts a confirmed spec
  as a bounty: the ticket's title and the text of `spec.md`, recorded in
  `specs/<slug>/platform.json` on the same machine. `ci --platform`, in a
  GitHub Actions job that opts in, sends the pull request's changed files with
  the run's GitHub OIDC token (no saved token) to be judged against a
  published version's hidden suite, and reads back the verdict. No other
  spec, ticket, suite or code is uploaded.
- **The bundled `lunox` MCP server:** in Claude Code it talks to
  platform.lunox.work only once the person signs in to it through `/mcp`.
  Its read tools (`list_*`, `get_*`) read the account and the workspace, with
  its bounties, repositories, sandboxes and runs. Its write tools run only
  when the person asks for that action: a bounty posted (title and spec text)
  or imported from a GitHub or Jira issue, a sandbox version built, and an
  implementation's changed files submitted for a verdict. `size_bounty`,
  `prepare` and `retry` start model runs on the platform that count against
  the workspace's monthly token limit. Hidden tests are written and kept on
  the platform and never sent to the session. Confirming decisions, approving
  a price and publishing happen in the platform's web app, not through the
  plugin. The platform's privacy policy is at
  https://platform.lunox.work/privacy.
- **Personal data:** a ticket can name people; it is stored with the spec
  under `~/.duediligence/specs/` on the same machine.
- **Retention:** duediligence itself runs no service. What the model backends
  keep is governed by the person's own agreement with that provider, and what
  the platform keeps of what is sent to it by its privacy policy.
