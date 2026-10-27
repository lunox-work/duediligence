// Public tests for `satisfies(version, range)`, per spec.md.
//
// spec.md, as written, defines no scenarios (no @happy / @unhappy or other
// kind tags) and does not define the syntax of a kestrel version or range,
// nor which inputs are invalid. Every test here must be keyed to a scenario
// and assert only what the spec states, so there is nothing to assert yet:
// any concrete input/output pair would be invented, not specified.
//
// Add one happy-path test and one boundary test per scenario, keyed
// `[<kind>-<n>]`, once the spec lists its scenarios.

import { test } from "node:test";
import assert from "node:assert/strict";
import { satisfies } from "../../src/index.js";

// Referenced so the build type-checks the imports against the fixed
// interface; no test runs.
void test;
void assert;
const _satisfies: (version: string, range: string) => boolean = satisfies;
void _satisfies;
