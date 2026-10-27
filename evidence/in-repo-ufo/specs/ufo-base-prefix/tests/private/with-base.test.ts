import { expect, test } from "vitest";
import { withBase } from "../../src/utils";

// Each case names the public test it extends, where it extends one.
const cases: {
  key: string;
  input: string;
  base: string;
  out: string;
  ext?: [string, string];
}[] = [
  // withBase adds the base when it is only a string prefix of the first segment
  { key: "unhappy-1", input: "/apiv10", base: "/api", out: "/api/apiv10", ext: ["/apiv2", "/api"] },
  { key: "unhappy-1", input: "/application", base: "/app", out: "/app/application", ext: ["/apiv2", "/api"] },
  { key: "unhappy-1", input: "/v1x", base: "/v1", out: "/v1/v1x", ext: ["/apiv2", "/api"] },
  { key: "unhappy-1", input: "/apiapi", base: "/api", out: "/api/apiapi", ext: ["/apiv2", "/api"] },
  { key: "unhappy-1", input: "/apix/y", base: "/api/", out: "/api/apix/y", ext: ["/apiv2", "/api/"] },
  { key: "unhappy-1", input: "/assetsfoo", base: "/assets/", out: "/assets/assetsfoo", ext: ["/apiv2", "/api/"] },
  { key: "unhappy-1", input: "/apiv2/users/42?x=1#h", base: "/api/", out: "/api/apiv2/users/42?x=1#h", ext: ["/apiv2/users", "/api/"] },
  { key: "unhappy-1", input: "/api_docs", base: "/api", out: "/api/api_docs", ext: ["/api-docs", "/api"] },
  { key: "unhappy-1", input: "/api~x", base: "/api", out: "/api/api~x", ext: ["/api-docs", "/api"] },
  { key: "unhappy-1", input: "/api+x", base: "/api", out: "/api/api+x", ext: ["/api-docs", "/api"] },
  { key: "unhappy-1", input: "/api:x", base: "/api", out: "/api/api:x", ext: ["/api.json", "/api"] },
  { key: "unhappy-1", input: "/api@x", base: "/api", out: "/api/api@x", ext: ["/api.json", "/api"] },
  { key: "unhappy-1", input: "/api!", base: "/api", out: "/api/api!", ext: ["/api.json", "/api"] },
  { key: "unhappy-1", input: "/api x", base: "/api", out: "/api/api x", ext: ["/api.json", "/api"] },
  { key: "unhappy-1", input: "/apié", base: "/api", out: "/api/apié", ext: ["/api.json", "/api"] },
  { key: "unhappy-1", input: "/apiX", base: "/api", out: "/api/apiX", ext: ["/api.json", "/api"] },
  { key: "unhappy-1", input: "/api0", base: "/api", out: "/api/api0", ext: ["/api.json", "/api"] },
  { key: "unhappy-1", input: "/api,x", base: "/api", out: "/api/api,x", ext: ["/api;x", "/api"] },
  { key: "unhappy-1", input: "/api=x", base: "/api", out: "/api/api=x", ext: ["/api;x", "/api"] },
  { key: "unhappy-1", input: "/api&x", base: "/api", out: "/api/api&x", ext: ["/api;x", "/api"] },
  { key: "unhappy-1", input: "/api$x", base: "/api", out: "/api/api$x", ext: ["/api;x", "/api"] },
  { key: "unhappy-1", input: "/api(x)", base: "/api", out: "/api/api(x)", ext: ["/api;x", "/api"] },
  { key: "unhappy-1", input: "/api*", base: "/api", out: "/api/api*", ext: ["/api;x", "/api"] },
  { key: "unhappy-1", input: "/api'x", base: "/api", out: "/api/api'x", ext: ["/api;x", "/api"] },
  { key: "unhappy-1", input: "/api%3Fx", base: "/api", out: "/api/api%3Fx", ext: ["/api%2F", "/api"] },
  { key: "unhappy-1", input: "/api%23x", base: "/api", out: "/api/api%23x", ext: ["/api%2F", "/api"] },
  { key: "unhappy-1", input: "/a/b/c/dd/e", base: "/a/b/c/d", out: "/a/b/c/d/a/b/c/dd/e", ext: ["/foo/barbaz", "/foo/bar"] },
  { key: "unhappy-1", input: "/foo/bar-baz/qux", base: "/foo/bar", out: "/foo/bar/foo/bar-baz/qux", ext: ["/foo/barbaz", "/foo/bar"] },
  { key: "unhappy-1", input: "/foo/bar.html", base: "/foo/bar/", out: "/foo/bar/foo/bar.html", ext: ["/foo/barbaz", "/foo/bar"] },
  { key: "unhappy-1", input: "apix", base: "api", out: "api/apix" },
  { key: "unhappy-1", input: "/ap", base: "/api", out: "/api/ap" },

  // withBase leaves the input alone when the base ends on a boundary
  { key: "happy-1", input: "/v2", base: "/v2", out: "/v2", ext: ["/api", "/api"] },
  { key: "happy-1", input: "/a/b/c", base: "/a/b/c", out: "/a/b/c", ext: ["/api", "/api"] },
  { key: "happy-1", input: "/app/", base: "/app", out: "/app/", ext: ["/api/", "/api"] },
  { key: "happy-1", input: "/api/", base: "/api/", out: "/api/", ext: ["/api/", "/api"] },
  { key: "happy-1", input: "/api/users/1/posts?x#y", base: "/api", out: "/api/users/1/posts?x#y", ext: ["/api/users", "/api"] },
  { key: "happy-1", input: "/api//x", base: "/api", out: "/api//x", ext: ["/api/users", "/api"] },
  { key: "happy-1", input: "/api/api", base: "/api", out: "/api/api", ext: ["/api/users", "/api"] },
  { key: "happy-1", input: "/app?a=1&b=/c", base: "/app", out: "/app?a=1&b=/c", ext: ["/api?x=1", "/api"] },
  { key: "happy-1", input: "/x/y?", base: "/x/y", out: "/x/y?", ext: ["/api?", "/api"] },
  { key: "happy-1", input: "/app#/route", base: "/app", out: "/app#/route", ext: ["/api#top", "/api"] },
  { key: "happy-1", input: "/x/y#", base: "/x/y", out: "/x/y#", ext: ["/api#", "/api"] },
  { key: "happy-1", input: "/a/b/c/d/e", base: "/a/b/c", out: "/a/b/c/d/e", ext: ["/foo/bar/baz", "/foo/bar"] },
  { key: "happy-1", input: "/x/y", base: "/x/y/", out: "/x/y", ext: ["/base", "/base/"] },
  { key: "happy-1", input: "/x/y?q", base: "/x/y/", out: "/x/y?q", ext: ["/base", "/base/"] },
  { key: "happy-1", input: "/x/y/z?q#f", base: "/x/y/", out: "/x/y/z?q#f", ext: ["/base/a", "/base/"] },
  { key: "happy-1", input: "api/x", base: "api", out: "api/x" },
  { key: "happy-1", input: "/café/x", base: "/café", out: "/café/x" },
  { key: "happy-1", input: "/a%20b/x", base: "/a%20b", out: "/a%20b/x" },
];

for (const t of cases) {
  const ext = t.ext
    ? ` (extends public withBase(${JSON.stringify(t.ext[0])}, ${JSON.stringify(t.ext[1])}))`
    : "";
  test(
    `[${t.key}] withBase(${JSON.stringify(t.input)}, ${JSON.stringify(t.base)}) returns ${JSON.stringify(t.out)}${ext}`,
    () => {
      expect(withBase(t.input, t.base)).toBe(t.out);
    },
  );
}
