import { expect, test } from "vitest";
import { joinURL } from "../../src/utils";

// Loosely typed view, so falsy and missing arguments can be passed.
const looseJoinURL = joinURL as unknown as (...args: unknown[]) => string;

// Extends "[happy-1] joinURL joins plain segments with one slash"
test("[happy-1] joinURL keeps a protocol base as written and joins many segments", () => {
  expect(joinURL("https://example.com/api", "v1", "users")).toBe(
    "https://example.com/api/v1/users"
  );
  expect(joinURL("http://x.com")).toBe("http://x.com");
  expect(joinURL("http://x.com/")).toBe("http://x.com/");
  expect(joinURL("http://x.com/a/", "b")).toBe("http://x.com/a/b");
  expect(joinURL("a", "b", "c", "d", "e", "f")).toBe("a/b/c/d/e/f");
  expect(joinURL("/a/b", "c/d", "e/f")).toBe("/a/b/c/d/e/f");
  expect(joinURL("a b", "c d")).toBe("a b/c d");
});

// Extends "[happy-1] joinURL does not double the slash between parts"
test("[happy-1] joinURL adds exactly one slash between many slash-edged parts", () => {
  expect(joinURL("http://x.com/", "/b", "/c")).toBe("http://x.com/b/c");
  expect(joinURL("a", "b/", "/c/", "d")).toBe("a/b/c/d");
  expect(joinURL("/", "/b", "/c")).toBe("/b/c");
  expect(joinURL("a/", "b/", "c")).toBe("a/b/c");
});

// Extends both "[happy-2]" public tests
test("[happy-2] joinURL keeps the trailing slash of the last input after a protocol base", () => {
  expect(joinURL("http://x.com", "b/")).toBe("http://x.com/b/");
  expect(joinURL("http://x.com/", "/b/")).toBe("http://x.com/b/");
  expect(joinURL("a", "b", "c/")).toBe("a/b/c/");
  expect(joinURL("a", "b/", "c/")).toBe("a/b/c/");
  expect(joinURL("/", "/a/b/")).toBe("/a/b/");
  expect(joinURL("./a", "./b/")).toBe("./a/b/");
  expect(joinURL("a", "b/c/")).toBe("a/b/c/");
});

// Extends "[happy-3] joinURL removes a leading ./ or / from inputs after the first"
test("[happy-3] joinURL keeps a relative base and strips one leading ./ or / from each later input", () => {
  expect(joinURL("../a", "./b")).toBe("../a/b");
  expect(joinURL("../a", "/b")).toBe("../a/b");
  expect(joinURL("a", "./b", "/c", "./d")).toBe("a/b/c/d");
  expect(joinURL("http://x.com", "./b", "/c")).toBe("http://x.com/b/c");
  expect(joinURL("/", "./a", "./b/")).toBe("/a/b/");
  expect(joinURL("./", "./b")).toBe("./b");
});

// Extends "[happy-3] joinURL with a bare ./ input adds only the separator"
test("[happy-3] joinURL with a bare ./ input between others adds only one separator", () => {
  expect(joinURL("a", "./", "b")).toBe("a/b");
  expect(joinURL("a/", "./")).toBe("a/");
  expect(joinURL("http://x.com", "./")).toBe("http://x.com/");
});

// Extends "[boundary-1] joinURL removes only one leading slash"
test("[boundary-1] joinURL removes only one of several leading slashes", () => {
  expect(joinURL("a", "///b")).toBe("a///b");
  expect(joinURL("a/", "//b")).toBe("a//b");
  expect(joinURL("a", "//")).toBe("a//");
  expect(joinURL("http://x.com", "//b")).toBe("http://x.com//b");
});

// Extends "[boundary-1] joinURL removes only one leading ./ and keeps the rest as written"
test("[boundary-1] joinURL checks ./ first and keeps what follows it as written", () => {
  expect(joinURL("a", ".//b")).toBe("a//b");
  expect(joinURL("a", ".//")).toBe("a//");
  expect(joinURL("a", "./../b")).toBe("a/../b");
  expect(joinURL("a", "././")).toBe("a/./");
  expect(joinURL("a", "/./")).toBe("a/./");
});

test("[boundary-1] joinURL keeps doubled slashes inside base and inputs", () => {
  expect(joinURL("a//", "b")).toBe("a//b");
  expect(joinURL("a", "b//", "c")).toBe("a/b//c");
  expect(joinURL("a//b")).toBe("a//b");
});

// Extends both "[boundary-2]" public tests
test("[boundary-2] joinURL keeps . and .. segments anywhere", () => {
  expect(joinURL("/a/b/c", "../../../../e")).toBe("/a/b/c/../../../../e");
  expect(joinURL("a", "./..")).toBe("a/..");
  expect(joinURL("a", "..", "b")).toBe("a/../b");
  expect(joinURL("/a", "./b/../c")).toBe("/a/b/../c");
  expect(joinURL("a", "../")).toBe("a/../");
});

test("[boundary-2] joinURL keeps . and .. in base", () => {
  expect(joinURL("..", "a")).toBe("../a");
  expect(joinURL("a/..", "b")).toBe("a/../b");
  expect(joinURL(".", "a")).toBe("./a");
  expect(joinURL("..")).toBe("..");
});

// Extends "[boundary-3] joinURL appends after a query"
test("[boundary-3] joinURL appends after a query that contains slashes", () => {
  expect(joinURL("/a?u=http://h", "b")).toBe("/a?u=http://h/b");
  expect(joinURL("/a?q=a//b", "c")).toBe("/a?q=a//b/c");
  expect(joinURL("http://x.com?x=1", "b")).toBe("http://x.com?x=1/b");
  expect(joinURL("/a?x=1", "b", "c")).toBe("/a?x=1/b/c");
  expect(joinURL("/a?x=1", "?y=2")).toBe("/a?x=1/?y=2");
});

// Extends "[boundary-3] joinURL appends after a fragment"
test("[boundary-3] joinURL appends after a fragment without resolving dots", () => {
  expect(joinURL("/a#h", "../b")).toBe("/a#h/../b");
  expect(joinURL("/a", "#h")).toBe("/a/#h");
  expect(joinURL("/a#//h", "b")).toBe("/a#//h/b");
});

// Extends "[boundary-4] joinURL skips / inputs after base"
test("[boundary-4] joinURL skips a trailing / input and repeated skipped inputs", () => {
  expect(joinURL("a", "b", "/")).toBe("a/b");
  expect(joinURL("a", "/", "", "/")).toBe("a");
  expect(joinURL("http://x.com", "/")).toBe("http://x.com");
  expect(joinURL("a", "", "/", "b/")).toBe("a/b/");
  expect(joinURL("a/", "", "/")).toBe("a/");
});

// Extends "[boundary-4] joinURL skips empty inputs after base"
test("[boundary-4] joinURL skips empty and falsy inputs between others", () => {
  expect(joinURL("a", "", "", "b", "")).toBe("a/b");
  expect(looseJoinURL("a", undefined, "b", null, "/")).toBe("a/b");
  expect(looseJoinURL("http://x.com", null, "b")).toBe("http://x.com/b");
});

// Extends both "[boundary-5]" public tests. The spec keeps today's result here.
test("[boundary-5] joinURL keeps base / when many further inputs are skipped", () => {
  expect(joinURL("/", "/", "/")).toBe("/");
  expect(joinURL("/", "", "/", "")).toBe("/");
  expect(looseJoinURL("/", undefined, null)).toBe("/");
});

// Extends "[unhappy-1] joinURL with a missing base uses the first kept input unchanged"
test("[unhappy-1] joinURL with an empty base uses the first kept input without stripping it", () => {
  expect(joinURL("", "//a")).toBe("//a");
  expect(joinURL("", "/", "a")).toBe("a");
  expect(looseJoinURL(undefined, "", "/", "./x")).toBe("./x");
  expect(looseJoinURL(undefined, "http://x.com", "b")).toBe("http://x.com/b");
  expect(looseJoinURL(null, "../a", "b")).toBe("../a/b");
  expect(joinURL("", "a/", "./b")).toBe("a/b");
  expect(joinURL("", "./", "a")).toBe("./a");
});

// Extends "[unhappy-1] joinURL with no arguments or only an empty base returns an empty string"
test("[unhappy-1] joinURL with a missing base and only skipped inputs returns an empty string", () => {
  expect(looseJoinURL(undefined, "/")).toBe("");
  expect(joinURL("", "/", "")).toBe("");
  expect(looseJoinURL(null)).toBe("");
  expect(looseJoinURL(null, "", undefined)).toBe("");
});
