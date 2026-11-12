- **Sent off the machine:** the spec, the ticket it came from and the code
  being judged go to the model backend the person chooses, on their own
  account: a Claude Code session, the Codex CLI, or the Anthropic API with
  their `ANTHROPIC_API_KEY`. `confirm --from` reads a GitHub issue, or a Jira
  issue with `JIRA_BASE_URL`, `JIRA_EMAIL` and `JIRA_API_TOKEN`, from the
  person's own GitHub or Jira. The first run installs the test toolchain from
  npm, and from pip for Python; Go and Rust use the toolchains already
  installed. There is no telemetry.
- **Lunox platform, only after sign-in:** without an account the CLI is
  unchanged and local. `duediligence login` signs in to Lunox's hosted service
  at platform.lunox.work with a code approved in the browser, and stores a
  workspace API token in `~/.lunox/credentials` on the same machine (mode 600,
  shared with carveout); `logout` deletes it. `login`, `whoami` and `logout`
  are the only commands that talk to the platform; in Claude Code, so does the
  plugin's bundled `lunox` MCP server, once the person signs in to it through
  `/mcp`. For now both only read the account and the workspace, with its
  bounties, repositories, sandboxes and runs. The CLI sends the token, its
  name and version, and, once at sign-in, the machine's host name to label
  the token. No spec, ticket, suite or code is uploaded. The platform's
  privacy policy is at https://platform.lunox.work/privacy.
- **Personal data:** a ticket can name people; it is stored with the spec
  under `~/.duediligence/specs/` on the same machine.
- **Retention:** duediligence itself runs no service. What the model backends
  keep is governed by the person's own agreement with that provider, and what
  the platform keeps after sign-in by its privacy policy.
