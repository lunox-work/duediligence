import { expect, test } from "vitest";
import { joinRelativeURL, joinURL, withBase } from "../src/utils";

// Loosely typed views, so falsy and missing arguments can be passed.
const looseJoinURL = joinURL as unknown as (...args: unknown[]) => string;
const looseJoinRelativeURL = joinRelativeURL as unknown as (
  ...args: unknown[]
) => string;

// joinURL

test("[happy-1] joinURL joins plain segments with one slash", () => {
  expect(joinURL("a", "b")).toBe("a/b");
  expect(joinURL("a", "b", "c")).toBe("a/b/c");
  expect(joinURL("/a")).toBe("/a");
  expect(joinURL("a/b", "c/d")).toBe("a/b/c/d");
  expect(joinURL("http://x.com", "b")).toBe("http://x.com/b");
});

test("[happy-1] joinURL does not double the slash between parts", () => {
  expect(joinURL("a", "b/", "c")).toBe("a/b/c");
  expect(joinURL("a", "b/", "/c")).toBe("a/b/c");
  expect(joinURL("/", "/b")).toBe("/b");
  expect(joinURL("a/", "b")).toBe("a/b");
  expect(joinURL("http://x.com/", "/b")).toBe("http://x.com/b");
});

test("[happy-2] joinURL keeps a trailing slash on the last input", () => {
  expect(joinURL("a", "b/")).toBe("a/b/");
});

test("[happy-2] joinURL keeps the trailing slash after stripping a leading one", () => {
  expect(joinURL("a", "/b/")).toBe("a/b/");
  expect(joinURL("/", "./foo/")).toBe("/foo/");
});

test("[happy-3] joinURL removes a leading ./ or / from inputs after the first", () => {
  expect(joinURL("./", "a")).toBe("./a");
  expect(joinURL("./a", "./b")).toBe("./a/b");
  expect(joinURL("a/", "./b")).toBe("a/b");
  expect(joinURL("/", "./foo")).toBe("/foo");
  expect(joinURL("/", "./foo", "bar")).toBe("/foo/bar");
});

test("[happy-3] joinURL with a bare ./ input adds only the separator", () => {
  expect(joinURL("/", "./")).toBe("/");
  expect(joinURL("a", "./")).toBe("a/");
});

test("[boundary-1] joinURL removes only one leading slash", () => {
  expect(joinURL("a", "//b")).toBe("a//b");
});

test("[boundary-1] joinURL removes only one leading ./ and keeps the rest as written", () => {
  expect(joinURL("a", "././b")).toBe("a/./b");
  expect(joinURL("a", "/./b")).toBe("a/./b");
  expect(joinURL("a", "b//c")).toBe("a/b//c");
});

test("[boundary-2] joinURL does not resolve ..", () => {
  expect(joinURL("/a", "../b")).toBe("/a/../b");
  expect(joinURL("/a/b/c", "../../d")).toBe("/a/b/c/../../d");
});

test("[boundary-2] joinURL keeps a bare . or .. input", () => {
  expect(joinURL("a", "..")).toBe("a/..");
  expect(joinURL("a", ".")).toBe("a/.");
});

test("[boundary-3] joinURL appends after a query", () => {
  expect(joinURL("/a?x=1", "b")).toBe("/a?x=1/b");
});

test("[boundary-3] joinURL appends after a fragment", () => {
  expect(joinURL("/a#h", "b")).toBe("/a#h/b");
});

test("[boundary-4] joinURL skips empty inputs after base", () => {
  expect(joinURL("a", "")).toBe("a");
  expect(joinURL("", "")).toBe("");
});

test("[boundary-4] joinURL skips / inputs after base", () => {
  expect(joinURL("a", "/")).toBe("a");
  expect(joinURL("a/", "/")).toBe("a/");
  expect(joinURL("/a", "/")).toBe("/a");
  expect(joinURL("a", "/", "b")).toBe("a/b");
});

test("[boundary-5] joinURL keeps base / alone", () => {
  expect(joinURL("/")).toBe("/");
});

test("[boundary-5] joinURL keeps base / when every further input is skipped", () => {
  expect(joinURL("/", "/")).toBe("/");
  expect(joinURL("/", "")).toBe("/");
});

test("[unhappy-1] joinURL with a missing base uses the first kept input unchanged", () => {
  expect(looseJoinURL(undefined, "a", "b")).toBe("a/b");
  expect(looseJoinURL(undefined, "./")).toBe("./");
  expect(joinURL("", "/a")).toBe("/a");
  expect(looseJoinURL(null, "/a")).toBe("/a");
});

test("[unhappy-1] joinURL with no arguments or only an empty base returns an empty string", () => {
  expect(looseJoinURL()).toBe("");
  expect(joinURL("")).toBe("");
  expect(looseJoinURL(undefined)).toBe("");
});

// joinRelativeURL

test("[happy-4] joinRelativeURL joins segments without dot segments", () => {
  expect(joinRelativeURL("a", "b")).toBe("a/b");
  expect(joinRelativeURL("/a")).toBe("/a");
  expect(joinRelativeURL("a", "/b")).toBe("a/b");
  expect(joinRelativeURL("/", "a")).toBe("/a");
  expect(joinRelativeURL("a", "b/", "c")).toBe("a/b/c");
  expect(joinRelativeURL("a", "b/", "/c")).toBe("a/b/c");
});

test("[happy-4] joinRelativeURL joins onto a bare / base", () => {
  expect(joinRelativeURL("/", "/b")).toBe("/b");
  expect(joinRelativeURL("/", "./foo")).toBe("/foo");
  expect(joinRelativeURL("/", "./foo", "bar")).toBe("/foo/bar");
});

test("[happy-5] joinRelativeURL resolves .. against the previous segment", () => {
  expect(joinRelativeURL("/a", "../b")).toBe("/b");
  expect(joinRelativeURL("/a/b/c", "../../d")).toBe("/a/d");
  expect(joinRelativeURL("/a", "../b", "./c")).toBe("/b/c");
});

test("[happy-5] joinRelativeURL resolves .. inside an input and as a whole input", () => {
  expect(joinRelativeURL("/a/b", "./c/../d")).toBe("/a/b/d");
  expect(joinRelativeURL("/a", "b", "..")).toBe("/a");
});

test("[happy-6] joinRelativeURL keeps a leading ./ on the first input", () => {
  expect(joinRelativeURL("./", "a")).toBe("./a");
  expect(joinRelativeURL("./a", "./b")).toBe("./a/b");
  expect(joinRelativeURL("./a")).toBe("./a");
  expect(joinRelativeURL("./a", "../b")).toBe("./b");
});

test("[happy-6] joinRelativeURL keeps ./ when no segment remains", () => {
  expect(joinRelativeURL("./", "./")).toBe("./");
  expect(joinRelativeURL("./a", "..")).toBe("./");
});

test("[boundary-6] joinRelativeURL keeps a leading / when .. goes past the start", () => {
  expect(joinRelativeURL("/a", "../../d")).toBe("/d");
  expect(joinRelativeURL("/a", ".././../d")).toBe("/d");
  expect(joinRelativeURL("/a", "..")).toBe("/");
});

test("[boundary-6] joinRelativeURL keeps the prefix while the net depth is exactly 0", () => {
  expect(joinRelativeURL("/a/b", "../../../d")).toBe("/d");
  expect(joinRelativeURL("./a", "../../b")).toBe("./b");
});

test("[boundary-7] joinRelativeURL adds ../ per missing level when depth is negative", () => {
  expect(joinRelativeURL("/a", "../../../d")).toBe("../d");
  expect(joinRelativeURL("/a", "../../../d/")).toBe("../d/");
  expect(joinRelativeURL("../a", "./../../b")).toBe("../b");
  expect(joinRelativeURL("../a", "../../../b")).toBe("../../b");
  expect(joinRelativeURL("../a", "../../../../b")).toBe("../../../b");
});

test("[boundary-7] joinRelativeURL with only .. levels returns the ../ prefix", () => {
  expect(joinRelativeURL("./a", "../..")).toBe("../");
  expect(joinRelativeURL("..")).toBe("../");
  expect(joinRelativeURL("../")).toBe("../");
});

test("[boundary-8] joinRelativeURL counts a .. that removes nothing against later segments", () => {
  expect(joinRelativeURL("../a")).toBe("a");
  expect(joinRelativeURL("../a", "b")).toBe("a/b");
  expect(joinRelativeURL("../a", "../b")).toBe("b");
});

test("[boundary-8] joinRelativeURL net depth of 0 after unmatched .. gives no prefix", () => {
  expect(joinRelativeURL("../a", "./../b")).toBe("b");
  expect(joinRelativeURL("../a/", "../b")).toBe("b");
  expect(joinRelativeURL("a/b/../../..", "c")).toBe("c");
});

test("[boundary-9] joinRelativeURL returns an empty string when every segment cancels out", () => {
  expect(joinRelativeURL("a", "..")).toBe("");
  expect(joinRelativeURL(".")).toBe("");
  expect(joinRelativeURL(".", "a")).toBe("a");
});

test("[boundary-9] joinRelativeURL keeps only the prefix and trailing slash when segments cancel", () => {
  expect(joinRelativeURL("a", "../")).toBe("/");
  expect(joinRelativeURL("/a", "../")).toBe("/");
});

test("[boundary-10] joinRelativeURL collapses repeated slashes and . parts", () => {
  expect(joinRelativeURL("a//b")).toBe("a/b");
  expect(joinRelativeURL("a/./b")).toBe("a/b");
  expect(joinRelativeURL("a/", "/b/", "c//")).toBe("a/b/c/");
});

test("[boundary-10] joinRelativeURL collapses // including after a protocol", () => {
  expect(joinRelativeURL("//")).toBe("/");
  expect(joinRelativeURL("http://x.com", "b")).toBe("http:/x.com/b");
});

test("[boundary-11] joinRelativeURL keeps ... and other characters as plain segments", () => {
  expect(joinRelativeURL("a", "...", "b")).toBe("a/.../b");
  expect(joinRelativeURL("/a b", "c")).toBe("/a b/c");
});

test("[boundary-11] joinRelativeURL treats backslash, query and fragment as part of a segment", () => {
  expect(joinRelativeURL("a\\b", "..")).toBe("");
  expect(joinRelativeURL("/a?x=1", "../b")).toBe("/b");
  expect(joinRelativeURL("/a#h", "../b")).toBe("/b");
});

test("[boundary-12] joinRelativeURL keeps the trailing slash of the last input", () => {
  expect(joinRelativeURL("a/")).toBe("a/");
  expect(joinRelativeURL("a", "b/")).toBe("a/b/");
  expect(joinRelativeURL("/a", "./b/")).toBe("/a/b/");
  expect(joinRelativeURL("/", "./foo/")).toBe("/foo/");
  expect(joinRelativeURL("/", "a/")).toBe("/a/");
});

test("[boundary-12] joinRelativeURL takes the trailing slash only from the last input", () => {
  expect(joinRelativeURL("a", "b", "/")).toBe("a/b/");
  expect(joinRelativeURL("/a", "b", "../")).toBe("/a/");
  expect(joinRelativeURL("a/", "b")).toBe("a/b");
});

test("[boundary-13] joinRelativeURL with only / returns /", () => {
  expect(joinRelativeURL("/")).toBe("/");
});

test("[boundary-13] joinRelativeURL counts / as the first input", () => {
  expect(joinRelativeURL("/", "./")).toBe("/");
});

test("[unhappy-2] joinRelativeURL drops falsy inputs before choosing first and last", () => {
  expect(joinRelativeURL("", "/a")).toBe("/a");
  expect(looseJoinRelativeURL(undefined, "./a")).toBe("./a");
  expect(looseJoinRelativeURL(null, "/a", undefined)).toBe("/a");
  expect(joinRelativeURL("a/", "")).toBe("a/");
  expect(joinRelativeURL("a", "b", "")).toBe("a/b");
  expect(joinRelativeURL("a", "", "b/")).toBe("a/b/");
});

test("[unhappy-2] joinRelativeURL with no or only empty inputs returns an empty string", () => {
  expect(joinRelativeURL()).toBe("");
  expect(joinRelativeURL("")).toBe("");
  expect(joinRelativeURL("", "")).toBe("");
});

// withBase

test("[happy-7] withBase joins input onto base", () => {
  expect(withBase("/bar", "/foo")).toBe("/foo/bar");
  expect(withBase("", "/foo")).toBe("/foo");
});

test("[happy-7] withBase returns input that already starts with base", () => {
  expect(withBase("/base", "/base/")).toBe("/base");
});

test("[boundary-14] withBase does not resolve .. in the input", () => {
  expect(withBase("../bar", "/foo")).toBe("/foo/../bar");
});

test("[boundary-14] withBase does not resolve .. with a trailing-slash base", () => {
  expect(withBase("../bar", "/foo/")).toBe("/foo/../bar");
});

test("[boundary-15] withBase with input / adds no trailing slash", () => {
  expect(withBase("/", "/foo/")).toBe("/foo");
});

test("[boundary-15] withBase with input / and a base without trailing slash", () => {
  expect(withBase("/", "/foo")).toBe("/foo");
});
