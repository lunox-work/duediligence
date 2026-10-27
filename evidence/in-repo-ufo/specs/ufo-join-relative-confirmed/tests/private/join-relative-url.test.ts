import { expect, test } from "vitest";
import { joinRelativeURL } from "../../src/utils";

// Loosely typed view, so falsy arguments can be passed.
const looseJoinRelativeURL = joinRelativeURL as unknown as (
  ...args: unknown[]
) => string;

// Extends "[happy-4] joinRelativeURL joins segments without dot segments"
test("[happy-4] joinRelativeURL joins many inputs with mixed slashes", () => {
  expect(joinRelativeURL("a", "b", "c", "d", "e")).toBe("a/b/c/d/e");
  expect(joinRelativeURL("/a/b", "c/d", "e")).toBe("/a/b/c/d/e");
  expect(joinRelativeURL("a", "/b", "/c")).toBe("a/b/c");
  expect(joinRelativeURL("/a", "b/", "/c", "d")).toBe("/a/b/c/d");
  expect(joinRelativeURL("foo", "./bar")).toBe("foo/bar");
});

// Extends "[happy-4] joinRelativeURL joins onto a bare / base"
test("[happy-4] joinRelativeURL joins several inputs onto a bare / base", () => {
  expect(joinRelativeURL("/", "/a", "/b")).toBe("/a/b");
  expect(joinRelativeURL("/", "./a", "./b", "c")).toBe("/a/b/c");
});

// Extends "[happy-5] joinRelativeURL resolves .. against the previous segment"
test("[happy-5] joinRelativeURL resolves .. across longer paths and several inputs", () => {
  expect(joinRelativeURL("/a/b/c/d", "../../x/y")).toBe("/a/b/x/y");
  expect(joinRelativeURL("a/b/c", "../d", "../e")).toBe("a/b/e");
  expect(joinRelativeURL("a", "b", "..", "c")).toBe("a/c");
});

// Extends "[happy-5] joinRelativeURL resolves .. inside an input and as a whole input"
test("[happy-5] joinRelativeURL resolves several .. inputs and .. inside middle inputs", () => {
  expect(joinRelativeURL("/a", "b", "c", "..", "..")).toBe("/a");
  expect(joinRelativeURL("/a/b", "c/../../d")).toBe("/a/d");
  expect(joinRelativeURL("/a", "b/c/..", "d")).toBe("/a/b/d");
});

// Extends "[happy-6] joinRelativeURL keeps a leading ./ on the first input"
test("[happy-6] joinRelativeURL keeps ./ across more inputs and resolved segments", () => {
  expect(joinRelativeURL("./a", "b", "c")).toBe("./a/b/c");
  expect(joinRelativeURL("./a/b", "../c")).toBe("./a/c");
  expect(joinRelativeURL("./", "a", "b/")).toBe("./a/b/");
  expect(joinRelativeURL("./a", "./b", "../../c")).toBe("./c");
});

// Extends "[happy-6] joinRelativeURL keeps ./ when no segment remains"
test("[happy-6] joinRelativeURL keeps ./ alone after later inputs cancel out", () => {
  expect(joinRelativeURL("./a", "b", "..")).toBe("./a");
  expect(joinRelativeURL("./", "a", "..")).toBe("./");
  expect(joinRelativeURL("./")).toBe("./");
});

// Extends "[boundary-6] joinRelativeURL keeps a leading / when .. goes past the start"
test("[boundary-6] joinRelativeURL keeps / when .. past the start is made up by later segments", () => {
  expect(joinRelativeURL("/a/b/c", "../../../../e")).toBe("/e");
  expect(joinRelativeURL("/a", "..", "..", "b")).toBe("/b");
  expect(joinRelativeURL("/", "../a")).toBe("/a");
  expect(joinRelativeURL("/a", "../../b/")).toBe("/b/");
});

// Extends "[boundary-6] joinRelativeURL keeps the prefix while the net depth is exactly 0"
test("[boundary-6] joinRelativeURL keeps the prefix when net depth ends positive after going negative", () => {
  expect(joinRelativeURL("/a/b", "../../../c/d")).toBe("/c/d");
  expect(joinRelativeURL("./a", "..", "..", "b", "c")).toBe("./b/c");
  expect(joinRelativeURL("/x/../../a")).toBe("/a");
});

// Extends "[boundary-7] joinRelativeURL adds ../ per missing level when depth is negative"
test("[boundary-7] joinRelativeURL adds one ../ per missing level for deeper negatives", () => {
  expect(joinRelativeURL("/a", "../../../../d")).toBe("../../d");
  expect(joinRelativeURL("./", "../../a")).toBe("../a");
  expect(joinRelativeURL("a", "../../../b")).toBe("../b");
  expect(joinRelativeURL("../../../a")).toBe("../../a");
  expect(joinRelativeURL("../..", "a/")).toBe("../a/");
  expect(joinRelativeURL("/a", "../../..", "b/")).toBe("../b/");
});

// Extends "[boundary-7] joinRelativeURL with only .. levels returns the ../ prefix"
test("[boundary-7] joinRelativeURL drops a leading / or ./ when only .. levels remain", () => {
  expect(joinRelativeURL("/", "..")).toBe("../");
  expect(joinRelativeURL("/..")).toBe("../");
  expect(joinRelativeURL("./..")).toBe("../");
  expect(joinRelativeURL("..", "..", "..")).toBe("../../../");
  expect(joinRelativeURL("/a/b", "../../..")).toBe("../");
});

// Extends "[boundary-8] joinRelativeURL counts a .. that removes nothing against later segments"
test("[boundary-8] joinRelativeURL counts several unmatched .. against later segments", () => {
  expect(joinRelativeURL("../../a", "b")).toBe("a/b");
  expect(joinRelativeURL("../a", "../b", "c")).toBe("b/c");
  expect(joinRelativeURL("a", "..", "..", "b")).toBe("b");
  expect(joinRelativeURL("../", "a")).toBe("a");
});

// Extends "[boundary-8] joinRelativeURL net depth of 0 after unmatched .. gives no prefix"
test("[boundary-8] joinRelativeURL net depth of 0 or more after unmatched .. gives no prefix", () => {
  expect(joinRelativeURL("../a/b", "../c")).toBe("a/c");
  expect(joinRelativeURL("../../a", "../b", "c")).toBe("b/c");
  expect(joinRelativeURL("a", "../../../b/c")).toBe("b/c");
});

// Extends "[boundary-9] joinRelativeURL returns an empty string when every segment cancels out"
test("[boundary-9] joinRelativeURL returns an empty string when longer paths cancel out", () => {
  expect(joinRelativeURL("a/b", "../..")).toBe("");
  expect(joinRelativeURL("a", "b", "..", "..")).toBe("");
  expect(joinRelativeURL(".", ".")).toBe("");
  expect(joinRelativeURL("a", "./..")).toBe("");
});

// Extends "[boundary-9] joinRelativeURL keeps only the prefix and trailing slash when segments cancel"
test("[boundary-9] joinRelativeURL keeps only prefix and trailing slash for longer cancelling paths", () => {
  expect(joinRelativeURL("a/b", "../../")).toBe("/");
  expect(joinRelativeURL("/a/b", "../..")).toBe("/");
  expect(joinRelativeURL("a", "..", "/")).toBe("/");
  expect(joinRelativeURL("./a", "../")).toBe("./");
  expect(joinRelativeURL("./.")).toBe("./");
});

// Extends "[boundary-10] joinRelativeURL collapses repeated slashes and . parts"
test("[boundary-10] joinRelativeURL collapses long runs of slashes and . parts", () => {
  expect(joinRelativeURL("a///b////c")).toBe("a/b/c");
  expect(joinRelativeURL("///a")).toBe("/a");
  expect(joinRelativeURL("a/.//./b")).toBe("a/b");
  expect(joinRelativeURL("a//", "//b//")).toBe("a/b/");
  expect(joinRelativeURL("./a/./././b")).toBe("./a/b");
});

// Extends "[boundary-10] joinRelativeURL collapses // including after a protocol"
test("[boundary-10] joinRelativeURL collapses the protocol // and resolves .. after it", () => {
  expect(joinRelativeURL("https://example.com/x/", "../y")).toBe(
    "https:/example.com/y"
  );
  expect(joinRelativeURL("http://x.com/")).toBe("http:/x.com/");
  expect(joinRelativeURL("////")).toBe("/");
});

// Extends "[boundary-11] joinRelativeURL keeps ... and other characters as plain segments"
test("[boundary-11] joinRelativeURL keeps dot-like segments that are not . or ..", () => {
  expect(joinRelativeURL("..a", "b")).toBe("..a/b");
  expect(joinRelativeURL("a", "....", "b")).toBe("a/..../b");
  expect(joinRelativeURL("a", ". ", "b")).toBe("a/. /b");
  expect(joinRelativeURL(".a", ".b")).toBe(".a/.b");
  expect(joinRelativeURL("a", "..\\b")).toBe("a/..\\b");
});

// Extends "[boundary-11] joinRelativeURL treats backslash, query and fragment as part of a segment"
test("[boundary-11] joinRelativeURL splits only on / inside queries, fragments and escapes", () => {
  expect(joinRelativeURL("a.b", "..")).toBe("");
  expect(joinRelativeURL("a%2Fb", "..")).toBe("");
  expect(joinRelativeURL("a\\b/c", "..")).toBe("a\\b");
  expect(joinRelativeURL("/a#h/b", "..")).toBe("/a#h");
  expect(joinRelativeURL("/a?x=1/../b")).toBe("/b");
});

// Extends "[boundary-12] joinRelativeURL keeps the trailing slash of the last input"
test("[boundary-12] joinRelativeURL keeps one trailing slash from the last input", () => {
  expect(joinRelativeURL("a", "b", "c/")).toBe("a/b/c/");
  expect(joinRelativeURL("a", "b//")).toBe("a/b/");
  expect(joinRelativeURL("a", "b/./")).toBe("a/b/");
  expect(joinRelativeURL("a", "./")).toBe("a/");
  expect(joinRelativeURL("/a/b", "../")).toBe("/a/");
  expect(joinRelativeURL("a/b/../")).toBe("a/");
});

// Extends "[boundary-12] joinRelativeURL takes the trailing slash only from the last input"
test("[boundary-12] joinRelativeURL adds no trailing slash when the last input ends otherwise", () => {
  expect(joinRelativeURL("a/", "b/", "c")).toBe("a/b/c");
  expect(joinRelativeURL("a", "b/.")).toBe("a/b");
  expect(joinRelativeURL("/a", "b/", "..")).toBe("/a");
  expect(joinRelativeURL("a/b/..")).toBe("a");
});

// Extends both "[boundary-13]" public tests
test("[boundary-13] joinRelativeURL counts / as the last input", () => {
  expect(joinRelativeURL("a", "/")).toBe("a/");
  expect(joinRelativeURL("/", "/")).toBe("/");
  expect(joinRelativeURL("/", "a", "/")).toBe("/a/");
  expect(joinRelativeURL("./", "/")).toBe("./");
});

// Extends "[unhappy-2] joinRelativeURL drops falsy inputs before choosing first and last"
test("[unhappy-2] joinRelativeURL picks first and last among kept inputs around many falsy ones", () => {
  expect(looseJoinRelativeURL(null, "./", "a")).toBe("./a");
  expect(looseJoinRelativeURL(undefined, "", "/a", "b")).toBe("/a/b");
  expect(looseJoinRelativeURL("a", "b/", null)).toBe("a/b/");
  expect(looseJoinRelativeURL("a", "/", undefined)).toBe("a/");
  expect(looseJoinRelativeURL(undefined, "../a")).toBe("a");
  expect(looseJoinRelativeURL("", "../..", "")).toBe("../../");
  expect(looseJoinRelativeURL("a/", undefined, "", null)).toBe("a/");
  expect(joinRelativeURL("", "", "./x", "", "y/")).toBe("./x/y/");
  expect(joinRelativeURL("", "/", "")).toBe("/");
});

// Extends "[unhappy-2] joinRelativeURL with no or only empty inputs returns an empty string"
test("[unhappy-2] joinRelativeURL with only falsy inputs returns an empty string", () => {
  expect(looseJoinRelativeURL(undefined, null, "")).toBe("");
  expect(looseJoinRelativeURL(null)).toBe("");
});
