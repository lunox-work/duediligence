import { expect, test } from "vitest";
import { parseURL, parseFilename, stringifyParsedURL } from "../src/parse";

const protocolRelative = Symbol.for("ufo:protocolRelative");

const fileOut = (host: string, pathname: string, search = "", hash = "") => ({
  protocol: "file:",
  auth: "",
  host,
  pathname,
  search,
  hash,
});

// Rule: With a file protocol, a drive-letter slash loses its slash

const happy1 = [
  { input: "file:///C:/home/user", out: fileOut("", "C:/home/user") },
  { input: "file:///c:/x", out: fileOut("", "c:/x") },
  { input: "file:///Z:/x?y=1#top", out: fileOut("", "Z:/x", "?y=1", "#top") },
  { input: "file:///C:\\x", out: fileOut("", "C:/x") },
  { input: "file://host/C:/x", out: fileOut("host", "C:/x") },
];

for (const t of happy1) {
  test(`[happy-1] file: URL with a drive letter first: ${JSON.stringify(t.input)}`, () => {
    expect(JSON.parse(JSON.stringify(parseURL(t.input)))).toEqual(t.out);
  });
}

for (const input of [" file:///C:/x", "\0file:///C:/x"]) {
  test(`[boundary-1] leading whitespace or NUL is skipped: ${JSON.stringify(input)}`, () => {
    expect(JSON.parse(JSON.stringify(parseURL(input)))).toEqual(
      fileOut("", "C:/x"),
    );
  });
}

test("[boundary-2] a bare drive letter with nothing after the colon", () => {
  expect(JSON.parse(JSON.stringify(parseURL("file:///C:")))).toEqual(
    fileOut("", "C:"),
  );
});

test("[boundary-3] the drive letter keeps its case", () => {
  const { pathname } = parseURL("file:///d:/Data");
  expect(pathname).toBe("d:/Data");
  expect(pathname).not.toBe("D:/Data");
});

test('[happy-2] defaultProto "file://" leads to drive-letter normalization', () => {
  expect(JSON.parse(JSON.stringify(parseURL("/C:/x", "file://")))).toEqual(
    fileOut("", "C:/x"),
  );
});

test('[happy-2] defaultProto "file://" with a bare drive letter', () => {
  expect(JSON.parse(JSON.stringify(parseURL("/C:", "file://")))).toEqual(
    fileOut("", "C:"),
  );
});

// Rule: Without a file protocol, the pathname keeps its leading slash

const happy3 = [
  {
    input: "http://test.com/C:/x",
    protocol: "http:",
    host: "test.com",
    pathname: "/C:/x",
    search: "",
  },
  {
    input: "https://e.com/a:b",
    protocol: "https:",
    host: "e.com",
    pathname: "/a:b",
    search: "",
  },
  {
    input: "ftp://h/D:/x",
    protocol: "ftp:",
    host: "h",
    pathname: "/D:/x",
    search: "",
  },
  {
    input: "https://e.com/C:?q=1",
    protocol: "https:",
    host: "e.com",
    pathname: "/C:",
    search: "?q=1",
  },
  {
    input: "http://test.com\\C:\\x",
    protocol: "http:",
    host: "test.com",
    pathname: "/C:/x",
    search: "",
  },
];

for (const t of happy3) {
  test(`[happy-3] non-file URL keeps its drive-letter-like path: ${JSON.stringify(t.input)}`, () => {
    expect(JSON.parse(JSON.stringify(parseURL(t.input)))).toEqual({
      protocol: t.protocol,
      auth: "",
      host: t.host,
      pathname: t.pathname,
      search: t.search,
      hash: "",
    });
  });
}

for (const input of ["FILE:///C:/x", "File:///C:/x"]) {
  test(`[boundary-4] the file protocol is matched case-sensitively: ${JSON.stringify(input)}`, () => {
    expect(JSON.parse(JSON.stringify(parseURL(input)))).toEqual(
      fileOut("", "/C:/x"),
    );
  });
}

test('[boundary-5] defaultProto "FILE://" does not normalize', () => {
  expect(JSON.parse(JSON.stringify(parseURL("/C:/x", "FILE://")))).toEqual(
    fileOut("", "/C:/x"),
  );
});

test("[boundary-6] a protocol-relative URL is not a file URL", () => {
  const parsed = parseURL("//host/C:/x");
  expect(JSON.parse(JSON.stringify(parsed))).toEqual({
    protocol: "",
    auth: "",
    host: "host",
    pathname: "/C:/x",
    search: "",
    hash: "",
  });
  expect((parsed as unknown as Record<symbol, unknown>)[protocolRelative]).toBe(
    true,
  );
});

test('[boundary-7] defaultProto other than "file://" does not normalize', () => {
  expect(JSON.parse(JSON.stringify(parseURL("/C:/x", "http://")))).toEqual({
    protocol: "http:",
    auth: "",
    host: "",
    pathname: "/C:/x",
    search: "",
    hash: "",
  });
});

test('[boundary-8] a protocol that only contains "file" is not the file protocol', () => {
  expect(JSON.parse(JSON.stringify(parseURL("files:///C:/x")))).toEqual({
    protocol: "files:",
    auth: "",
    host: "",
    pathname: "/C:/x",
    search: "",
    hash: "",
  });
});

test("[happy-4] a non-file URL survives a parse/stringify round trip", () => {
  const parsed = parseURL("http://test.com/C:/x?y=1#h");
  expect(stringifyParsedURL(parsed)).toBe("http://test.com/C:/x?y=1#h");
});

test("[happy-4] a non-file URL with a bare drive letter survives a round trip", () => {
  const parsed = parseURL("http://test.com/C:");
  expect(stringifyParsedURL(parsed)).toBe("http://test.com/C:");
});

// Rule: With a file protocol, the first drive-letter slash anywhere after the host is removed

const boundary9 = [
  { input: "file:///home/C:/x", out: fileOut("", "/homeC:/x") },
  { input: "file://host/x/C:/y", out: fileOut("host", "/xC:/y") },
  { input: "file:///x?y=/C:", out: fileOut("", "/x", "?y=C:") },
  { input: "file:///x#/C:", out: fileOut("", "/x", "", "#C:") },
  { input: "file:////C:/x", out: fileOut("", "/C:/x") },
  { input: "file:///x/a:b/C:/y", out: fileOut("", "/xa:b/C:/y") },
];

for (const t of boundary9) {
  test(`[boundary-9] drive-letter-like text elsewhere loses its slash: ${JSON.stringify(t.input)}`, () => {
    expect(JSON.parse(JSON.stringify(parseURL(t.input)))).toEqual(t.out);
  });
}

const unhappy1 = [
  { input: "file:///CD:/x", pathname: "/CD:/x" },
  { input: "file:///1:/x", pathname: "/1:/x" },
  { input: "file:///C|/x", pathname: "/C|/x" },
  { input: "file:///home/x", pathname: "/home/x" },
  { input: "file:///é:/x", pathname: "/é:/x" },
];

for (const t of unhappy1) {
  test(`[unhappy-1] a path with no single-letter drive is not changed: ${JSON.stringify(t.input)}`, () => {
    expect(JSON.parse(JSON.stringify(parseURL(t.input)))).toEqual(
      fileOut("", t.pathname),
    );
  });
}

test("[boundary-10] a drive letter written where the host goes stays the host", () => {
  expect(JSON.parse(JSON.stringify(parseURL("file://C:/x")))).toEqual(
    fileOut("C:", "/x"),
  );
});

// Rule: Inputs outside this change keep their current results

const happy5 = [
  { input: "file:///home/user", pathname: "/home/user" },
  { input: "/C:/x", pathname: "/C:/x" },
  { input: "C:/x", pathname: "C:/x" },
  { input: "data:/C:/x", pathname: "/C:/x" },
];

for (const t of happy5) {
  test(`[happy-5] input with no drive letter or no protocol is unchanged: ${JSON.stringify(t.input)}`, () => {
    expect(parseURL(t.input).pathname).toBe(t.pathname);
  });
}

test("[happy-6] stringifying a file: drive-letter URL is unchanged", () => {
  const parsed = parseURL("file:///C:/x");
  expect(stringifyParsedURL(parsed)).toBe("file://C:/x");
});

test("[happy-6] stringifying a file: bare drive letter URL is unchanged", () => {
  const parsed = parseURL("file:///C:");
  expect(stringifyParsedURL(parsed)).toBe("file://C:");
});

test("[happy-7] parseFilename reads the last segment of a non-file drive-letter path", () => {
  expect(
    parseFilename("http://e.com/C:/dir/a.txt", { strict: true }),
  ).toStrictEqual("a.txt");
});

test("[happy-7] parseFilename reads a bare drive letter as the last segment of a non-file path", () => {
  expect(parseFilename("https://e.com/C:", { strict: false })).toStrictEqual(
    "C:",
  );
});
