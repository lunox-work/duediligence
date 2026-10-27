import { expect, test } from "vitest";
import { withBase, withoutBase } from "../../src/utils";

type Fn = "withBase" | "withoutBase";

const fns: Record<Fn, (input: string, base: string) => string> = {
  withBase,
  withoutBase,
};

// Each case names the public test it extends, where it extends one.
const cases: {
  key: string;
  fn: Fn;
  input: string;
  base: string;
  out: string;
  ext?: [Fn, string, string];
}[] = [
  // a normalized base that still ends with "/" is already boundary-terminated
  { key: "boundary-1", fn: "withBase", input: "/api/xyz/1", base: "/api//", out: "/api/xyz/1", ext: ["withBase", "/api/x", "/api//"] },
  { key: "boundary-1", fn: "withBase", input: "/api/", base: "/api//", out: "/api/", ext: ["withBase", "/api/x", "/api//"] },
  { key: "boundary-1", fn: "withBase", input: "/a/b/cd", base: "/a/b//", out: "/a/b/cd", ext: ["withBase", "/api/x", "/api//"] },
  { key: "boundary-1", fn: "withBase", input: "/api///x", base: "/api//", out: "/api///x", ext: ["withBase", "/api//x", "/api//"] },
  { key: "boundary-1", fn: "withoutBase", input: "/a/b/cd", base: "/a/b//", out: "/cd", ext: ["withoutBase", "/api/x", "/api//"] },
  { key: "boundary-1", fn: "withoutBase", input: "/api/", base: "/api//", out: "/", ext: ["withoutBase", "/api/x", "/api//"] },
  { key: "boundary-1", fn: "withoutBase", input: "/api/?q", base: "/api//", out: "/?q", ext: ["withoutBase", "/api/x", "/api//"] },
  { key: "boundary-1", fn: "withoutBase", input: "/api/#h", base: "/api//", out: "/#h", ext: ["withoutBase", "/api/x", "/api//"] },
  { key: "boundary-1", fn: "withoutBase", input: "/api///x", base: "/api//", out: "//x", ext: ["withoutBase", "/api//x", "/api//"] },
  { key: "boundary-1", fn: "withoutBase", input: "/api//x/y", base: "/api//", out: "/x/y", ext: ["withoutBase", "/api//x", "/api//"] },
  // "/api" does not start with the normalized base "/api/"
  { key: "boundary-1", fn: "withBase", input: "/api", base: "/api//", out: "/api/api" },
  { key: "boundary-1", fn: "withoutBase", input: "/api", base: "/api//", out: "/api" },
  { key: "boundary-1", fn: "withBase", input: "/apix", base: "/api//", out: "/api/apix" },
  { key: "boundary-1", fn: "withoutBase", input: "/apix", base: "/api//", out: "/apix" },
  // "//" normalizes to "/", which ends with "/"
  { key: "boundary-1", fn: "withoutBase", input: "/apiv2", base: "//", out: "/apiv2" },
  { key: "boundary-1", fn: "withBase", input: "/apiv2", base: "//", out: "/apiv2" },

  // matching is case-sensitive and works on raw characters
  { key: "boundary-2", fn: "withBase", input: "/Api", base: "/api", out: "/api/Api", ext: ["withBase", "/API/users", "/api"] },
  { key: "boundary-2", fn: "withBase", input: "/api/x", base: "/API", out: "/API/api/x", ext: ["withBase", "/API/users", "/api"] },
  { key: "boundary-2", fn: "withoutBase", input: "/api/x", base: "/API", out: "/api/x", ext: ["withoutBase", "/API/users", "/api"] },
  { key: "boundary-2", fn: "withoutBase", input: "/Api/x", base: "/api", out: "/Api/x", ext: ["withoutBase", "/API/users", "/api"] },
  { key: "boundary-2", fn: "withoutBase", input: "/ÄPI/x", base: "/äpi", out: "/ÄPI/x", ext: ["withoutBase", "/API/users", "/api"] },
  { key: "boundary-2", fn: "withBase", input: "/api%2fx", base: "/api", out: "/api/api%2fx", ext: ["withBase", "/api%2Fx", "/api"] },
  { key: "boundary-2", fn: "withBase", input: "/a b/x", base: "/a%20b", out: "/a%20b/a b/x", ext: ["withBase", "/api%2Fx", "/api"] },
  { key: "boundary-2", fn: "withoutBase", input: "/api%2fx", base: "/api", out: "/api%2fx", ext: ["withoutBase", "/api%2Fx", "/api"] },
  { key: "boundary-2", fn: "withoutBase", input: "/a b/x", base: "/a%20b", out: "/a b/x", ext: ["withoutBase", "/api%2Fx", "/api"] },
  { key: "boundary-2", fn: "withoutBase", input: "/a%20b/x", base: "/a b", out: "/a%20b/x", ext: ["withoutBase", "/api%2Fx", "/api"] },

  // a backslash after the base is not a boundary
  { key: "boundary-3", fn: "withBase", input: "/a/b\\c", base: "/a/b", out: "/a/b/a/b\\c", ext: ["withBase", "/api\\x", "/api"] },
  { key: "boundary-3", fn: "withBase", input: "/api\\", base: "/api", out: "/api/api\\", ext: ["withBase", "/api\\x", "/api"] },
  { key: "boundary-3", fn: "withoutBase", input: "/a/b\\c", base: "/a/b", out: "/a/b\\c", ext: ["withoutBase", "/api\\x", "/api"] },
  { key: "boundary-3", fn: "withoutBase", input: "/api\\", base: "/api", out: "/api\\", ext: ["withoutBase", "/api\\x", "/api"] },
  { key: "boundary-3", fn: "withoutBase", input: "/api\\x", base: "/api/", out: "/api\\x", ext: ["withoutBase", "/api\\x", "/api"] },

  // the base must sit at the very start of the input
  { key: "unhappy-3", fn: "withBase", input: "/x/y/api/z", base: "/api", out: "/api/x/y/api/z", ext: ["withBase", "/a/api", "/api"] },
  { key: "unhappy-3", fn: "withBase", input: "//api/x", base: "/api", out: "/api//api/x", ext: ["withBase", "/a/api", "/api"] },
  { key: "unhappy-3", fn: "withoutBase", input: "/x/y/api/z", base: "/api", out: "/x/y/api/z", ext: ["withoutBase", "/a/api", "/api"] },
  { key: "unhappy-3", fn: "withoutBase", input: "//api/x", base: "/api", out: "//api/x", ext: ["withoutBase", "/a/api", "/api"] },
  { key: "unhappy-3", fn: "withBase", input: "api", base: "/api", out: "/api/api", ext: ["withBase", "api/x", "/api"] },
  { key: "unhappy-3", fn: "withBase", input: "v1/users", base: "/v1/", out: "/v1/v1/users", ext: ["withBase", "api/x", "/api"] },
  { key: "unhappy-3", fn: "withoutBase", input: "api", base: "/api", out: "api", ext: ["withoutBase", "api/x", "/api"] },
  { key: "unhappy-3", fn: "withoutBase", input: "v1/users", base: "/v1/", out: "v1/users", ext: ["withoutBase", "api/x", "/api"] },

  // empty or root base returns the input unchanged
  { key: "boundary-4", fn: "withBase", input: "api", base: "", out: "api", ext: ["withBase", "/apiv2", ""] },
  { key: "boundary-4", fn: "withBase", input: "", base: "", out: "", ext: ["withBase", "/apiv2", ""] },
  { key: "boundary-4", fn: "withBase", input: "relative/path?x", base: "/", out: "relative/path?x", ext: ["withBase", "/apiv2", "/"] },
  { key: "boundary-4", fn: "withBase", input: "", base: "/", out: "", ext: ["withBase", "/apiv2", "/"] },
  { key: "boundary-4", fn: "withoutBase", input: "api/x", base: "", out: "api/x", ext: ["withoutBase", "/apiv2", ""] },
  { key: "boundary-4", fn: "withoutBase", input: "", base: "", out: "", ext: ["withoutBase", "/apiv2", ""] },
  { key: "boundary-4", fn: "withoutBase", input: "", base: "/", out: "", ext: ["withoutBase", "/apiv2", "/"] },
  { key: "boundary-4", fn: "withoutBase", input: "/a/b/", base: "/", out: "/a/b/", ext: ["withoutBase", "/test/", "/"] },
  { key: "boundary-4", fn: "withoutBase", input: "/#test", base: "/", out: "/#test", ext: ["withoutBase", "/?test", "/"] },
  { key: "boundary-4", fn: "withoutBase", input: "https://x.com/y", base: "", out: "https://x.com/y", ext: ["withoutBase", "/?test", "/"] },

  // withBase never prefixes an input that has a protocol
  { key: "boundary-5", fn: "withBase", input: "http://other.org/x", base: "/base/", out: "http://other.org/x", ext: ["withBase", "https://test.com", "/base/"] },
  { key: "boundary-5", fn: "withBase", input: "ftp://test.com/apiv2", base: "ftp://test.com/api", out: "ftp://test.com/apiv2", ext: ["withBase", "https://test.com/apiv2", "https://test.com/api"] },
  { key: "boundary-5", fn: "withBase", input: "https://test.com:8080/x", base: "https://test.com", out: "https://test.com:8080/x", ext: ["withBase", "https://test.com/apiv2", "https://test.com/api"] },
  { key: "boundary-5", fn: "withBase", input: "https://other.org/api/x", base: "https://test.com/api", out: "https://other.org/api/x", ext: ["withBase", "https://test.com/apiv2", "https://test.com/api"] },
  { key: "boundary-5", fn: "withBase", input: "HTTPS://TEST.COM/apiv2", base: "/api", out: "HTTPS://TEST.COM/apiv2", ext: ["withBase", "https://test.com/apiv2", "/api"] },
  { key: "boundary-5", fn: "withBase", input: "http://test.com/api-docs", base: "/api/", out: "http://test.com/api-docs", ext: ["withBase", "https://test.com/apiv2", "/api"] },

  // empty or root input
  { key: "boundary-6", fn: "withBase", input: "", base: "/a/b/", out: "/a/b", ext: ["withBase", "", "/foo"] },
  { key: "boundary-6", fn: "withBase", input: "", base: "/a/b", out: "/a/b", ext: ["withBase", "", "/foo"] },
  { key: "boundary-6", fn: "withBase", input: "/", base: "/a/b", out: "/a/b", ext: ["withBase", "/", "/foo/"] },
  { key: "boundary-6", fn: "withoutBase", input: "", base: "/a/b/", out: "", ext: ["withoutBase", "", "/foo"] },
  { key: "boundary-6", fn: "withoutBase", input: "/", base: "/a/b", out: "/", ext: ["withoutBase", "/", "/foo"] },
  { key: "boundary-6", fn: "withoutBase", input: "/", base: "/foo//", out: "/", ext: ["withoutBase", "/", "/foo/"] },
  { key: "boundary-6", fn: "withoutBase", input: "/bar/foo", base: "/foo", out: "/bar/foo", ext: ["withoutBase", "/bar", "/foo"] },
  { key: "boundary-6", fn: "withoutBase", input: "/fo", base: "/foo", out: "/fo", ext: ["withoutBase", "/bar", "/foo"] },
];

for (const t of cases) {
  const ext = t.ext
    ? ` (extends public ${t.ext[0]}(${JSON.stringify(t.ext[1])}, ${JSON.stringify(t.ext[2])}))`
    : "";
  test(
    `[${t.key}] ${t.fn}(${JSON.stringify(t.input)}, ${JSON.stringify(t.base)}) returns ${JSON.stringify(t.out)}${ext}`,
    () => {
      expect(fns[t.fn](t.input, t.base)).toBe(t.out);
    },
  );
}
