import { expect, test } from "vitest";
import { withBase, withoutBase } from "../src/utils";

type Fn = "withBase" | "withoutBase";

const fns: Record<Fn, (input: string, base: string) => string> = {
  withBase,
  withoutBase,
};

const cases: { key: string; fn: Fn; input: string; base: string; out: string }[] =
  [
    // withBase adds the base when it is only a string prefix of the first segment
    { key: "unhappy-1", fn: "withBase", input: "/apiv2", base: "/api", out: "/api/apiv2" },
    { key: "unhappy-1", fn: "withBase", input: "/apiv2", base: "/api/", out: "/api/apiv2" },
    { key: "unhappy-1", fn: "withBase", input: "/apiv2/users", base: "/api/", out: "/api/apiv2/users" },
    { key: "unhappy-1", fn: "withBase", input: "/api-docs", base: "/api", out: "/api/api-docs" },
    { key: "unhappy-1", fn: "withBase", input: "/api.json", base: "/api", out: "/api/api.json" },
    { key: "unhappy-1", fn: "withBase", input: "/api;x", base: "/api", out: "/api/api;x" },
    { key: "unhappy-1", fn: "withBase", input: "/api%2F", base: "/api", out: "/api/api%2F" },
    { key: "unhappy-1", fn: "withBase", input: "/foo/barbaz", base: "/foo/bar", out: "/foo/bar/foo/barbaz" },

    // withBase leaves the input alone when the base ends on a boundary
    { key: "happy-1", fn: "withBase", input: "/api", base: "/api", out: "/api" },
    { key: "happy-1", fn: "withBase", input: "/api/", base: "/api", out: "/api/" },
    { key: "happy-1", fn: "withBase", input: "/api/users", base: "/api", out: "/api/users" },
    { key: "happy-1", fn: "withBase", input: "/api?x=1", base: "/api", out: "/api?x=1" },
    { key: "happy-1", fn: "withBase", input: "/api?", base: "/api", out: "/api?" },
    { key: "happy-1", fn: "withBase", input: "/api#top", base: "/api", out: "/api#top" },
    { key: "happy-1", fn: "withBase", input: "/api#", base: "/api", out: "/api#" },
    { key: "happy-1", fn: "withBase", input: "/foo/bar/baz", base: "/foo/bar", out: "/foo/bar/baz" },
    { key: "happy-1", fn: "withBase", input: "/base", base: "/base/", out: "/base" },
    { key: "happy-1", fn: "withBase", input: "/base/a", base: "/base/", out: "/base/a" },

    // withoutBase leaves the input unchanged when the base is only a string prefix
    { key: "unhappy-2", fn: "withoutBase", input: "/apiv2", base: "/api", out: "/apiv2" },
    { key: "unhappy-2", fn: "withoutBase", input: "/apiv2", base: "/api/", out: "/apiv2" },
    { key: "unhappy-2", fn: "withoutBase", input: "/apiv2/users", base: "/api/", out: "/apiv2/users" },
    { key: "unhappy-2", fn: "withoutBase", input: "/api-docs", base: "/api", out: "/api-docs" },
    { key: "unhappy-2", fn: "withoutBase", input: "/api.json", base: "/api", out: "/api.json" },
    { key: "unhappy-2", fn: "withoutBase", input: "/api;x", base: "/api", out: "/api;x" },
    { key: "unhappy-2", fn: "withoutBase", input: "/api%2F", base: "/api", out: "/api%2F" },
    { key: "unhappy-2", fn: "withoutBase", input: "/foo/barbaz", base: "/foo/bar", out: "/foo/barbaz" },
    { key: "unhappy-2", fn: "withoutBase", input: "https://test.com/apiv2", base: "https://test.com/api", out: "https://test.com/apiv2" },

    // withoutBase removes the base when it ends on a boundary
    { key: "happy-2", fn: "withoutBase", input: "/api", base: "/api", out: "/" },
    { key: "happy-2", fn: "withoutBase", input: "/api/", base: "/api", out: "/" },
    { key: "happy-2", fn: "withoutBase", input: "/api/users", base: "/api", out: "/users" },
    { key: "happy-2", fn: "withoutBase", input: "/api?x=1", base: "/api", out: "/?x=1" },
    { key: "happy-2", fn: "withoutBase", input: "/api?", base: "/api", out: "/?" },
    { key: "happy-2", fn: "withoutBase", input: "/api#top", base: "/api", out: "/#top" },
    { key: "happy-2", fn: "withoutBase", input: "/api#", base: "/api", out: "/#" },
    { key: "happy-2", fn: "withoutBase", input: "/foo/bar/baz", base: "/foo/bar", out: "/baz" },
    { key: "happy-2", fn: "withoutBase", input: "/base", base: "/base/", out: "/" },
    { key: "happy-2", fn: "withoutBase", input: "/base/a", base: "/base/", out: "/a" },
    { key: "happy-2", fn: "withoutBase", input: "https://test.com/api/x", base: "https://test.com/api", out: "/x" },

    // a normalized base that still ends with "/" is already boundary-terminated
    { key: "boundary-1", fn: "withBase", input: "/api/x", base: "/api//", out: "/api/x" },
    { key: "boundary-1", fn: "withBase", input: "/api//x", base: "/api//", out: "/api//x" },
    { key: "boundary-1", fn: "withoutBase", input: "/api/x", base: "/api//", out: "/x" },
    { key: "boundary-1", fn: "withoutBase", input: "/api//x", base: "/api//", out: "/x" },

    // matching is case-sensitive and works on raw characters
    { key: "boundary-2", fn: "withBase", input: "/API/users", base: "/api", out: "/api/API/users" },
    { key: "boundary-2", fn: "withoutBase", input: "/API/users", base: "/api", out: "/API/users" },
    { key: "boundary-2", fn: "withBase", input: "/api%2Fx", base: "/api", out: "/api/api%2Fx" },
    { key: "boundary-2", fn: "withoutBase", input: "/api%2Fx", base: "/api", out: "/api%2Fx" },

    // a backslash after the base is not a boundary
    { key: "boundary-3", fn: "withBase", input: "/api\\x", base: "/api", out: "/api/api\\x" },
    { key: "boundary-3", fn: "withoutBase", input: "/api\\x", base: "/api", out: "/api\\x" },

    // the base must sit at the very start of the input
    { key: "unhappy-3", fn: "withBase", input: "/a/api", base: "/api", out: "/api/a/api" },
    { key: "unhappy-3", fn: "withoutBase", input: "/a/api", base: "/api", out: "/a/api" },
    { key: "unhappy-3", fn: "withBase", input: "api/x", base: "/api", out: "/api/api/x" },
    { key: "unhappy-3", fn: "withoutBase", input: "api/x", base: "/api", out: "api/x" },

    // empty or root base returns the input unchanged
    { key: "boundary-4", fn: "withBase", input: "/apiv2", base: "", out: "/apiv2" },
    { key: "boundary-4", fn: "withBase", input: "/apiv2", base: "/", out: "/apiv2" },
    { key: "boundary-4", fn: "withoutBase", input: "/apiv2", base: "", out: "/apiv2" },
    { key: "boundary-4", fn: "withoutBase", input: "/apiv2", base: "/", out: "/apiv2" },
    { key: "boundary-4", fn: "withoutBase", input: "/test/", base: "/", out: "/test/" },
    { key: "boundary-4", fn: "withoutBase", input: "/?test", base: "/", out: "/?test" },

    // withBase never prefixes an input that has a protocol
    { key: "boundary-5", fn: "withBase", input: "https://test.com", base: "/base/", out: "https://test.com" },
    { key: "boundary-5", fn: "withBase", input: "https://test.com/apiv2", base: "https://test.com/api", out: "https://test.com/apiv2" },
    { key: "boundary-5", fn: "withBase", input: "https://test.com/apiv2", base: "/api", out: "https://test.com/apiv2" },

    // empty or root input
    { key: "boundary-6", fn: "withBase", input: "", base: "/foo", out: "/foo" },
    { key: "boundary-6", fn: "withBase", input: "/", base: "/foo/", out: "/foo" },
    { key: "boundary-6", fn: "withoutBase", input: "", base: "/foo", out: "" },
    { key: "boundary-6", fn: "withoutBase", input: "/", base: "/foo", out: "/" },
    { key: "boundary-6", fn: "withoutBase", input: "/", base: "/foo/", out: "/" },
    { key: "boundary-6", fn: "withoutBase", input: "/bar", base: "/foo", out: "/bar" },
  ];

for (const t of cases) {
  test(
    `[${t.key}] ${t.fn}(${JSON.stringify(t.input)}, ${JSON.stringify(t.base)}) returns ${JSON.stringify(t.out)}`,
    () => {
      expect(fns[t.fn](t.input, t.base)).toBe(t.out);
    },
  );
}
