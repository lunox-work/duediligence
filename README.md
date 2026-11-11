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

## Source

This branch holds only the plugin's files. The CLI, its documentation and the
skills' source are on the main branch of https://github.com/lunox-work/duediligence. License: MIT.
