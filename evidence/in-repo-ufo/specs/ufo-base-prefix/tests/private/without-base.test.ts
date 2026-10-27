import { expect, test } from "vitest";
import { withoutBase } from "../../src/utils";

// Each case names the public test it extends, where it extends one.
const cases: {
  key: string;
  input: string;
  base: string;
  out: string;
  ext?: [string, string];
}[] = [
  // withoutBase leaves the input unchanged when the base is only a string prefix
  { key: "unhappy-2", input: "/apiv10", base: "/api", out: "/apiv10", ext: ["/apiv2", "/api"] },
  { key: "unhappy-2", input: "/application/x", base: "/app", out: "/application/x", ext: ["/apiv2", "/api"] },
  { key: "unhappy-2", input: "/apiapi", base: "/api", out: "/apiapi", ext: ["/apiv2", "/api"] },
  { key: "unhappy-2", input: "/assetsfoo", base: "/assets/", out: "/assetsfoo", ext: ["/apiv2", "/api/"] },
  { key: "unhappy-2", input: "/apiv2/users/42?x=1#h", base: "/api/", out: "/apiv2/users/42?x=1#h", ext: ["/apiv2/users", "/api/"] },
  { key: "unhappy-2", input: "/api_docs", base: "/api", out: "/api_docs", ext: ["/api-docs", "/api"] },
  { key: "unhappy-2", input: "/api~x", base: "/api", out: "/api~x", ext: ["/api-docs", "/api"] },
  { key: "unhappy-2", input: "/api+x", base: "/api", out: "/api+x", ext: ["/api-docs", "/api"] },
  { key: "unhappy-2", input: "/api:x", base: "/api", out: "/api:x", ext: ["/api.json", "/api"] },
  { key: "unhappy-2", input: "/api@x", base: "/api", out: "/api@x", ext: ["/api.json", "/api"] },
  { key: "unhappy-2", input: "/api!", base: "/api", out: "/api!", ext: ["/api.json", "/api"] },
  { key: "unhappy-2", input: "/api x", base: "/api", out: "/api x", ext: ["/api.json", "/api"] },
  { key: "unhappy-2", input: "/apié", base: "/api", out: "/apié", ext: ["/api.json", "/api"] },
  { key: "unhappy-2", input: "/apiX", base: "/api", out: "/apiX", ext: ["/api.json", "/api"] },
  { key: "unhappy-2", input: "/api0", base: "/api", out: "/api0", ext: ["/api.json", "/api"] },
  { key: "unhappy-2", input: "/api,x", base: "/api", out: "/api,x", ext: ["/api;x", "/api"] },
  { key: "unhappy-2", input: "/api=x", base: "/api", out: "/api=x", ext: ["/api;x", "/api"] },
  { key: "unhappy-2", input: "/api&x", base: "/api", out: "/api&x", ext: ["/api;x", "/api"] },
  { key: "unhappy-2", input: "/api$x", base: "/api", out: "/api$x", ext: ["/api;x", "/api"] },
  { key: "unhappy-2", input: "/api(x)", base: "/api", out: "/api(x)", ext: ["/api;x", "/api"] },
  { key: "unhappy-2", input: "/api%3Fx", base: "/api", out: "/api%3Fx", ext: ["/api%2F", "/api"] },
  { key: "unhappy-2", input: "/api%23x", base: "/api", out: "/api%23x", ext: ["/api%2F", "/api"] },
  { key: "unhappy-2", input: "/a/b/c/dd/e", base: "/a/b/c/d", out: "/a/b/c/dd/e", ext: ["/foo/barbaz", "/foo/bar"] },
  { key: "unhappy-2", input: "/foo/bar.html", base: "/foo/bar/", out: "/foo/bar.html", ext: ["/foo/barbaz", "/foo/bar"] },
  { key: "unhappy-2", input: "https://test.com/apiv2/x?y", base: "https://test.com/api/", out: "https://test.com/apiv2/x?y", ext: ["https://test.com/apiv2", "https://test.com/api"] },
  { key: "unhappy-2", input: "https://test.com:8080/x", base: "https://test.com", out: "https://test.com:8080/x", ext: ["https://test.com/apiv2", "https://test.com/api"] },
  { key: "unhappy-2", input: "https://test.com.evil.org/x", base: "https://test.com", out: "https://test.com.evil.org/x", ext: ["https://test.com/apiv2", "https://test.com/api"] },
  { key: "unhappy-2", input: "apix", base: "api", out: "apix" },
  { key: "unhappy-2", input: "/ap", base: "/api", out: "/ap" },

  // withoutBase removes the base when it ends on a boundary
  { key: "happy-2", input: "/a/b/c", base: "/a/b/c", out: "/", ext: ["/api", "/api"] },
  { key: "happy-2", input: "/v2", base: "/v2", out: "/", ext: ["/api", "/api"] },
  { key: "happy-2", input: "/a/b/", base: "/a/b", out: "/", ext: ["/api/", "/api"] },
  { key: "happy-2", input: "/api/", base: "/api/", out: "/", ext: ["/api/", "/api"] },
  { key: "happy-2", input: "/api/users/1/posts", base: "/api", out: "/users/1/posts", ext: ["/api/users", "/api"] },
  { key: "happy-2", input: "/api/api/x", base: "/api", out: "/api/x", ext: ["/api/users", "/api"] },
  { key: "happy-2", input: "/api//x", base: "/api", out: "//x", ext: ["/api/users", "/api"] },
  { key: "happy-2", input: "/app?a=/b&c=d", base: "/app", out: "/?a=/b&c=d", ext: ["/api?x=1", "/api"] },
  { key: "happy-2", input: "/x/y?", base: "/x/y", out: "/?", ext: ["/api?", "/api"] },
  { key: "happy-2", input: "/app#/route/x", base: "/app", out: "/#/route/x", ext: ["/api#top", "/api"] },
  { key: "happy-2", input: "/x/y#", base: "/x/y", out: "/#", ext: ["/api#", "/api"] },
  { key: "happy-2", input: "/a/b/c/d/e", base: "/a/b/c", out: "/d/e", ext: ["/foo/bar/baz", "/foo/bar"] },
  { key: "happy-2", input: "/x/y", base: "/x/y/", out: "/", ext: ["/base", "/base/"] },
  { key: "happy-2", input: "/x/y?q", base: "/x/y/", out: "/?q", ext: ["/base", "/base/"] },
  { key: "happy-2", input: "/x/y/z?q#f", base: "/x/y/", out: "/z?q#f", ext: ["/base/a", "/base/"] },
  { key: "happy-2", input: "https://test.com/api?x=1", base: "https://test.com/api", out: "/?x=1", ext: ["https://test.com/api/x", "https://test.com/api"] },
  { key: "happy-2", input: "https://test.com/api#f", base: "https://test.com/api/", out: "/#f", ext: ["https://test.com/api/x", "https://test.com/api"] },
  { key: "happy-2", input: "https://test.com", base: "https://test.com", out: "/", ext: ["https://test.com/api/x", "https://test.com/api"] },
  { key: "happy-2", input: "https://test.com/a/b", base: "https://test.com", out: "/a/b", ext: ["https://test.com/api/x", "https://test.com/api"] },
  { key: "happy-2", input: "api/x", base: "api", out: "/x" },
  { key: "happy-2", input: "api", base: "api", out: "/" },
  { key: "happy-2", input: "api?x", base: "api", out: "/?x" },
  { key: "happy-2", input: "/café/x", base: "/café", out: "/x" },
  { key: "happy-2", input: "/a%20b/x", base: "/a%20b", out: "/x" },
];

for (const t of cases) {
  const ext = t.ext
    ? ` (extends public withoutBase(${JSON.stringify(t.ext[0])}, ${JSON.stringify(t.ext[1])}))`
    : "";
  test(
    `[${t.key}] withoutBase(${JSON.stringify(t.input)}, ${JSON.stringify(t.base)}) returns ${JSON.stringify(t.out)}${ext}`,
    () => {
      expect(withoutBase(t.input, t.base)).toBe(t.out);
    },
  );
}
