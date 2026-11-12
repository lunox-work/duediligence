/**
 * Public contract tests for `trimTrailingSlashes` and `jiraSiteUrlSchema`.
 *
 * The spec pins linear time at "under 250 ms of wall time"; these tests read
 * no clock, so they pin the results on the long inputs instead. An input that
 * is a long run of slashes followed by a non-slash is the one a backtracking
 * regex takes quadratic time on, so a non-linear implementation shows up as a
 * test that does not finish.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  JIRA_SITE_URL_MESSAGE,
  jiraSiteUrlSchema,
  trimTrailingSlashes,
} from "../src/index.js";

const SITE = "https://acme.atlassian.net";

// ---- trimTrailingSlashes ---------------------------------------------------

test("[happy-1] trimTrailingSlashes removes the trailing run of slashes and keeps the rest", () => {
  const cases: Array<[string, string]> = [
    ["https://acme.atlassian.net/", "https://acme.atlassian.net"],
    ["https://acme.atlassian.net///", "https://acme.atlassian.net"],
    ["https://jira.example.com/jira/", "https://jira.example.com/jira"],
    ["a/b/c//", "a/b/c"],
  ];
  for (const [input, output] of cases) {
    assert.equal(trimTrailingSlashes(input), output, JSON.stringify(input));
  }
});

test("[happy-1] trimTrailingSlashes keeps leading and inner slashes when it trims a one-character tail", () => {
  assert.equal(trimTrailingSlashes("//x//"), "//x");
  assert.equal(trimTrailingSlashes("x/"), "x");
});

test("[boundary-1] trimTrailingSlashes returns strings without a trailing slash unchanged", () => {
  for (const input of ["https://acme.atlassian.net", "a//b", "/leading", "x"]) {
    assert.equal(trimTrailingSlashes(input), input, JSON.stringify(input));
  }
});

test("[boundary-1] trimTrailingSlashes is a no-op on its own output", () => {
  for (const input of ["https://acme.atlassian.net///", "a/b/c//", "a//b"]) {
    const once = trimTrailingSlashes(input);
    assert.equal(trimTrailingSlashes(once), once, JSON.stringify(input));
  }
});

test("[boundary-2] trimTrailingSlashes turns empty and all-slash strings into the empty string", () => {
  for (const input of ["", "/", "/////"]) {
    assert.equal(trimTrailingSlashes(input), "", JSON.stringify(input));
  }
});

test("[boundary-2] trimTrailingSlashes keeps a single non-slash character before the slashes", () => {
  assert.equal(trimTrailingSlashes(" /"), " ");
  assert.equal(trimTrailingSlashes("x/////"), "x");
});

test("[boundary-3] trimTrailingSlashes keeps trailing backslashes and whitespace", () => {
  for (const input of [
    "https://acme.atlassian.net\\\\",
    "https://acme.atlassian.net/ ",
    "https://acme.atlassian.net/\t",
  ]) {
    assert.equal(trimTrailingSlashes(input), input, JSON.stringify(input));
  }
});

test("[boundary-3] trimTrailingSlashes does not treat slash look-alikes or a trailing newline as slashes", () => {
  for (const input of [
    "https://acme.atlassian.net∕", // DIVISION SLASH
    "https://acme.atlassian.net／", // FULLWIDTH SOLIDUS
    "https://acme.atlassian.net/\n",
  ]) {
    assert.equal(trimTrailingSlashes(input), input, JSON.stringify(input));
  }
});

test("[boundary-4] trimTrailingSlashes handles long runs of slashes", () => {
  assert.equal(trimTrailingSlashes(SITE + "/".repeat(60_000)), SITE);
  assert.equal(trimTrailingSlashes("/".repeat(60_000)), "");
  const followed = SITE + "/".repeat(60_000) + "x";
  assert.equal(trimTrailingSlashes(followed), followed);
  assert.equal(trimTrailingSlashes("/".repeat(1_000_000)), "");
});

test("[boundary-4] trimTrailingSlashes returns a million slashes followed by text unchanged", () => {
  const input = "/".repeat(1_000_000) + "x";
  assert.equal(trimTrailingSlashes(input), input);
});

// ---- jiraSiteUrlSchema -----------------------------------------------------

test("[happy-2] jiraSiteUrlSchema parses valid site URLs to their slash-free form", () => {
  const cases: Array<[string, string]> = [
    ["https://acme.atlassian.net", "https://acme.atlassian.net"],
    ["https://acme.atlassian.net/", "https://acme.atlassian.net"],
    ["https://acme.atlassian.net////", "https://acme.atlassian.net"],
    ["https://jira.example.com/jira/", "https://jira.example.com/jira"],
    ["  https://acme.atlassian.net/  ", "https://acme.atlassian.net"],
  ];
  for (const [input, output] of cases) {
    assert.equal(jiraSiteUrlSchema.parse(input), output, JSON.stringify(input));
  }
});

test("[happy-2] jiraSiteUrlSchema trims tabs and newlines around the URL", () => {
  assert.equal(
    jiraSiteUrlSchema.parse("\thttps://acme.atlassian.net/\n"),
    "https://acme.atlassian.net",
  );
});

test("[boundary-5] jiraSiteUrlSchema keeps host casing as written", () => {
  assert.equal(
    jiraSiteUrlSchema.parse("https://Acme.Atlassian.net/"),
    "https://Acme.Atlassian.net",
  );
});

test("[boundary-5] jiraSiteUrlSchema keeps a default port and path casing as written", () => {
  assert.equal(
    jiraSiteUrlSchema.parse("https://acme.atlassian.net:443/Jira/"),
    "https://acme.atlassian.net:443/Jira",
  );
});

test("[boundary-6] jiraSiteUrlSchema accepts a site URL ending in 60,000 slashes", () => {
  assert.equal(jiraSiteUrlSchema.parse(SITE + "/".repeat(60_000)), SITE);
});

test("[boundary-6] jiraSiteUrlSchema accepts 60,000 trailing slashes inside surrounding whitespace", () => {
  assert.equal(
    jiraSiteUrlSchema.parse("  " + SITE + "/".repeat(60_000) + "  "),
    SITE,
  );
});

test("[unhappy-1] jiraSiteUrlSchema refuses anything but an https URL without query or fragment, with one message", () => {
  for (const input of [
    "",
    "   ",
    "acme.atlassian.net",
    "not a url",
    "http://acme.atlassian.net",
    "ftp://acme.atlassian.net",
    "https://acme.atlassian.net/?x=1",
    "https://acme.atlassian.net/?",
    "https://acme.atlassian.net/#top",
    "https://acme.atlassian.net/#",
  ]) {
    const result = jiraSiteUrlSchema.safeParse(input);
    assert.equal(result.success, false, JSON.stringify(input));
    assert.equal(
      result.error?.issues[0]?.message,
      JIRA_SITE_URL_MESSAGE,
      JSON.stringify(input),
    );
  }
});

test("[unhappy-1] jiraSiteUrlSchema refuses a query, fragment or non-https scheme even after trimming", () => {
  for (const input of [
    "  http://acme.atlassian.net/  ",
    "https://jira.example.com/jira?",
    "https://jira.example.com/jira#",
    "https://acme.atlassian.net/?x=1///",
  ]) {
    const result = jiraSiteUrlSchema.safeParse(input);
    assert.equal(result.success, false, JSON.stringify(input));
    assert.equal(
      result.error?.issues[0]?.message,
      JIRA_SITE_URL_MESSAGE,
      JSON.stringify(input),
    );
  }
});

test("[unhappy-2] jiraSiteUrlSchema refuses non-strings", () => {
  for (const input of [42, null, undefined]) {
    assert.equal(
      jiraSiteUrlSchema.safeParse(input).success,
      false,
      String(input),
    );
  }
});

test("[unhappy-2] jiraSiteUrlSchema refuses a URL object and an array holding a valid URL", () => {
  assert.equal(jiraSiteUrlSchema.safeParse(new URL(SITE)).success, false);
  assert.equal(jiraSiteUrlSchema.safeParse([SITE]).success, false);
});
