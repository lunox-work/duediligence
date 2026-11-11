# duediligence

Independent, hidden test suites written from the spec for AI coding agents: the agent works against a public suite, a calibrated hidden suite it never sees judges the result.

## Skills

- **duediligence**: Turn a ticket or spec for one module (TypeScript, Python, Go or Rust), or for a change to one package of an existing TypeScript or Python repository, into a public test suite for the implementing agent and a calibrated hidden suite that judges its work, with the spec's decisions confirmed by a person before any test is written. Use when someone wants agent-written code accepted by tests the agent never saw, wants to grade an agent's submission against a spec, or wants to stop trusting an agent's own green test run.

## Install

```sh
claude plugin marketplace add lunox-work/duediligence
claude plugin install duediligence@duediligence
```

## Requirements

- **duediligence**: Node 20.19 or later. Runs the duediligence@0.3.0 CLI from npm, which starts Claude Code, Codex or Anthropic API sessions and installs its test toolchain under ~/.duediligence/ once (network).

## Data

- **Sent off the machine:** the spec, the ticket it came from and the code
  being judged go to the model backend the person chooses, on their own
  account: a Claude Code session, the Codex CLI, or the Anthropic API with
  their `ANTHROPIC_API_KEY`. `confirm --from` reads a GitHub issue, or a Jira
  issue with `JIRA_BASE_URL`, `JIRA_EMAIL` and `JIRA_API_TOKEN`, from the
  person's own GitHub or Jira. The first run installs the test toolchain from
  npm, and from pip for Python; Go and Rust use the toolchains already
  installed. There is no telemetry.
- **Personal data:** a ticket can name people; it is stored with the spec
  under `~/.duediligence/specs/` on the same machine.
- **Retention:** duediligence runs no service. What the model backends keep is
  governed by the person's own agreement with that provider.

## Links

- [Privacy](https://github.com/lunox-work/duediligence/blob/main/PRIVACY.md)
- [Documentation](https://github.com/lunox-work/duediligence#readme)
- [Support](https://github.com/lunox-work/duediligence/issues)

## Source

This branch holds only the plugin's files. The CLI, its documentation and the
skills' source are on the main branch of https://github.com/lunox-work/duediligence. License: MIT.
