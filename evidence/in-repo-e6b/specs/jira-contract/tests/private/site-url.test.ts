/**
 * Hidden contract tests for `trimTrailingSlashes` and `jiraSiteUrlSchema`.
 *
 * Linear time is pinned without reading a clock: every long input below is
 * one a backtracking or repeated-copy implementation takes quadratic time on,
 * so a non-linear implementation shows up as a test that does not finish.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  JIRA_SITE_URL_MESSAGE,
  jiraSiteUrlSchema,
  trimTrailingSlashes,
} from "../../src/index.js";

const SITE = "https://acme.atlassian.net";

function assertRefusedWithSiteUrlMessage(input: string): void {
  const result = jiraSiteUrlSchema.safeParse(input);
  assert.equal(result.success, false, JSON.stringify(input));
  assert.equal(
    result.error?.issues[0]?.message,
    JIRA_SITE_URL_MESSAGE,
    JSON.stringify(input),
  );
}

// ---- trimTrailingSlashes ---------------------------------------------------

// Extends "[happy-1] trimTrailingSlashes removes the trailing run of slashes and keeps the rest".
test("[happy-1] trimTrailingSlashes trims other inputs, keeping inner runs and non-ASCII text before the tail", () => {
  const cases: Array<[string, string]> = [
    ["https://jira.example.com:8443/a/b/c////////", "https://jira.example.com:8443/a/b/c"],
    ["https://acme.atlassian.net//jira//", "https://acme.atlassian.net//jira"],
    ["a//////b/", "a//////b"],
    ["😀/", "😀"],
    ["bücher/é//", "bücher/é"],
    ["\\/", "\\"],
    ["a/ /", "a/ "],
    ["a/\t//", "a/\t"],
    ["?#//", "?#"],
    ["https://acme.atlassian.net/?x=1/", "https://acme.atlassian.net/?x=1"],
  ];
  for (const [input, output] of cases) {
    assert.equal(trimTrailingSlashes(input), output, JSON.stringify(input));
  }
});

// Extends "[happy-1] ..." with a shortcut check: removing just one slash, or a fixed number.
test("[happy-1] trimTrailingSlashes removes every slash of the trailing run, whatever its length", () => {
  for (let n = 1; n <= 40; n += 1) {
    assert.equal(trimTrailingSlashes("a/b" + "/".repeat(n)), "a/b", String(n));
  }
});

// Extends "[boundary-1] trimTrailingSlashes returns strings without a trailing slash unchanged".
test("[boundary-1] trimTrailingSlashes leaves other slash-free tails unchanged", () => {
  for (const input of [
    "https://jira.example.com/jira",
    "///a",
    "a///////////b",
    "😀",
    " ",
    "a/b/c/d/e/f/g.html",
    "https://acme.atlassian.net/?x=1",
  ]) {
    assert.equal(trimTrailingSlashes(input), input, JSON.stringify(input));
  }
});

// Extends "[boundary-2] trimTrailingSlashes turns empty and all-slash strings into the empty string".
test("[boundary-2] trimTrailingSlashes turns all-slash strings of every length up to 64 into the empty string", () => {
  assert.equal(trimTrailingSlashes(""), "");
  for (let n = 1; n <= 64; n += 1) {
    assert.equal(trimTrailingSlashes("/".repeat(n)), "", String(n));
  }
});

// Extends "[boundary-3] trimTrailingSlashes keeps trailing backslashes and whitespace".
test("[boundary-3] trimTrailingSlashes keeps other trailing non-slash characters, after a slash or not", () => {
  for (const input of [
    "https://acme.atlassian.net/\\",
    "https://acme.atlassian.net/\r\n",
    "https://acme.atlassian.net/\u00a0",
    "https://acme.atlassian.net/\u3000",
    "https://acme.atlassian.net/%2F",
    "https://acme.atlassian.net⁄", // FRACTION SLASH
    "https://acme.atlassian.net\u29f8", // BIG SOLIDUS
    "/ ",
    "\\\\\\",
    "/\t",
  ]) {
    assert.equal(trimTrailingSlashes(input), input, JSON.stringify(input));
  }
});

// Extends "[boundary-3] ...": whitespace between two slash runs stops the scan.
test("[boundary-3] trimTrailingSlashes stops at whitespace or a backslash inside the trailing slashes", () => {
  assert.equal(trimTrailingSlashes("https://acme.atlassian.net/ ///"), "https://acme.atlassian.net/ ");
  assert.equal(trimTrailingSlashes("https://acme.atlassian.net//\\//"), "https://acme.atlassian.net//\\");
  assert.equal(trimTrailingSlashes("///\t///"), "///\t");
});

// Extends "[boundary-4] trimTrailingSlashes handles long runs of slashes": a long run
// followed by text and then a trailing slash, which a regex guarded by
// `endsWith("/")` still backtracks on.
test("[boundary-4] trimTrailingSlashes handles a long run of slashes, then text, then a trailing slash", () => {
  const head = SITE + "/".repeat(60_000) + "x";
  assert.equal(trimTrailingSlashes(head + "/"), head);
  const big = "/".repeat(1_000_000) + "x";
  assert.equal(trimTrailingSlashes(big + "///"), big);
});

// Extends "[boundary-4] ...": long runs followed by whitespace or a backslash.
test("[boundary-4] trimTrailingSlashes returns a million slashes followed by whitespace or a backslash unchanged", () => {
  for (const tail of [" ", "\t", "\\"]) {
    const input = "/".repeat(1_000_000) + tail;
    assert.equal(trimTrailingSlashes(input), input, JSON.stringify(tail));
  }
});

// Extends "[boundary-4] ...": many short runs, and two long runs.
test("[boundary-4] trimTrailingSlashes handles many short runs and two long runs", () => {
  const alternating = "x/".repeat(500_000);
  assert.equal(trimTrailingSlashes(alternating), alternating.slice(0, -1));
  const twoRuns = "a" + "/".repeat(1_000_000) + "b";
  assert.equal(trimTrailingSlashes(twoRuns + "/".repeat(1_000_000)), twoRuns);
  assert.equal(trimTrailingSlashes(SITE + "/".repeat(2_000_000)), SITE);
});

// ---- jiraSiteUrlSchema -----------------------------------------------------

// Extends "[happy-2] jiraSiteUrlSchema parses valid site URLs to their slash-free form".
test("[happy-2] jiraSiteUrlSchema parses other valid site URLs to their slash-free form", () => {
  const cases: Array<[string, string]> = [
    ["https://jira.example.com", "https://jira.example.com"],
    ["https://jira.example.com/a/b/c///", "https://jira.example.com/a/b/c"],
    ["https://jira.example.com:8443/", "https://jira.example.com:8443"],
    ["https://beta.atlassian.net//", "https://beta.atlassian.net"],
    ["https://acme.atlassian.net/a%3Fb/", "https://acme.atlassian.net/a%3Fb"],
    ["https://acme.atlassian.net/a%23b", "https://acme.atlassian.net/a%23b"],
  ];
  for (const [input, output] of cases) {
    assert.equal(jiraSiteUrlSchema.parse(input), output, JSON.stringify(input));
  }
});

// Extends "[happy-2] jiraSiteUrlSchema trims tabs and newlines around the URL":
// whitespace is trimmed before the slashes, so slashes inside the padding go too.
test("[happy-2] jiraSiteUrlSchema trims mixed whitespace and then the slashes it uncovered", () => {
  const cases: Array<[string, string]> = [
    ["\r\n\t https://jira.example.com/jira/// \r\n", "https://jira.example.com/jira"],
    ["   https://acme.atlassian.net", "https://acme.atlassian.net"],
    ["https://acme.atlassian.net//\n\n\n", "https://acme.atlassian.net"],
  ];
  for (const [input, output] of cases) {
    assert.equal(jiraSiteUrlSchema.parse(input), output, JSON.stringify(input));
  }
});

// Extends "[boundary-5] jiraSiteUrlSchema keeps host casing as written": the
// cases URL.href would rewrite (dot segments, IDN hosts, uppercase hosts).
test("[boundary-5] jiraSiteUrlSchema keeps dot segments, unicode hosts and casing as written", () => {
  const cases: Array<[string, string]> = [
    ["https://ACME.ATLASSIAN.NET", "https://ACME.ATLASSIAN.NET"],
    ["https://acme.atlassian.net/./jira/", "https://acme.atlassian.net/./jira"],
    ["https://acme.atlassian.net/a/../b//", "https://acme.atlassian.net/a/../b"],
    ["https://bücher.example/", "https://bücher.example"],
    ["https://jira.example.com:443", "https://jira.example.com:443"],
    ["https://Jira.Example.com:8443/Team/Board/", "https://Jira.Example.com:8443/Team/Board"],
  ];
  for (const [input, output] of cases) {
    assert.equal(jiraSiteUrlSchema.parse(input), output, JSON.stringify(input));
  }
});

// Extends "[boundary-6] jiraSiteUrlSchema accepts a site URL ending in 60,000 slashes".
test("[boundary-6] jiraSiteUrlSchema accepts a site URL ending in 1,000,000 slashes, with a path", () => {
  assert.equal(jiraSiteUrlSchema.parse(SITE + "/".repeat(1_000_000)), SITE);
  assert.equal(
    jiraSiteUrlSchema.parse("https://jira.example.com/jira" + "/".repeat(60_000)),
    "https://jira.example.com/jira",
  );
});

// Extends "[boundary-6] ...": a long inner run of slashes ahead of more path is
// the backtracking case, and the URL is still accepted with no length cap.
test("[boundary-6] jiraSiteUrlSchema accepts 60,000 inner slashes followed by a path segment and a slash", () => {
  const inner = SITE + "/".repeat(60_000) + "jira";
  assert.equal(jiraSiteUrlSchema.parse(inner + "/"), inner);
  assert.equal(jiraSiteUrlSchema.parse(inner), inner);
});

// Extends "[unhappy-1] jiraSiteUrlSchema refuses anything but an https URL without
// query or fragment, with one message": strings a `startsWith("https://")`
// check accepts but that are not URLs, schemes that only begin with "https",
// and queries or fragments in other places.
test("[unhappy-1] jiraSiteUrlSchema refuses https-prefixed non-URLs with the site URL message", () => {
  for (const input of ["https://", "https:///", "https://exa mple.com", "https://[bad"]) {
    assertRefusedWithSiteUrlMessage(input);
  }
});

test("[unhappy-1] jiraSiteUrlSchema refuses schemes other than https, including look-alikes, with the site URL message", () => {
  for (const input of [
    "httpss://acme.atlassian.net",
    "https-x://acme.atlassian.net",
    "wss://acme.atlassian.net",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "mailto:dana@example.test",
    "//acme.atlassian.net",
    "  ftp://acme.atlassian.net//  ",
  ]) {
    assertRefusedWithSiteUrlMessage(input);
  }
});

test("[unhappy-1] jiraSiteUrlSchema refuses a ? or # anywhere, with the site URL message", () => {
  for (const input of [
    "https://acme.atlassian.net?",
    "https://acme.atlassian.net#",
    "https://acme.atlassian.net?x=1",
    "https://acme.atlassian.net/jira?project=PROJ",
    "https://acme.atlassian.net/#/board/1",
    "https://acme.atlassian.net/jira/?#",
    "  https://acme.atlassian.net/?  ",
    "https://acme.atlassian.net/#///",
    SITE + "/".repeat(60_000) + "?",
    SITE + "/".repeat(60_000) + "#",
  ]) {
    assertRefusedWithSiteUrlMessage(input);
  }
});

test("[unhappy-1] jiraSiteUrlSchema refuses whitespace-only and slash-only strings with the site URL message", () => {
  for (const input of ["\t\n", " \r\n ", "/", "/////", "  //  "]) {
    assertRefusedWithSiteUrlMessage(input);
  }
});

// Extends "[unhappy-2] jiraSiteUrlSchema refuses non-strings". Each case is set
// against a string the schema accepts, so the refusal is the type, not the URL.
test("[unhappy-2] jiraSiteUrlSchema refuses other non-strings while accepting the site as a string", () => {
  assert.equal(jiraSiteUrlSchema.parse(SITE + "/"), SITE);
  for (const input of [true, false, 0, 1n, {}, [], { href: SITE }, () => SITE]) {
    assert.equal(
      jiraSiteUrlSchema.safeParse(input).success,
      false,
      typeof input,
    );
  }
});

test("[unhappy-2] jiraSiteUrlSchema refuses a URL object whose href it accepts as a string", () => {
  const url = new URL("https://jira.example.com/jira/");
  assert.equal(jiraSiteUrlSchema.parse(url.href), "https://jira.example.com/jira");
  assert.equal(jiraSiteUrlSchema.safeParse(url).success, false);
});
