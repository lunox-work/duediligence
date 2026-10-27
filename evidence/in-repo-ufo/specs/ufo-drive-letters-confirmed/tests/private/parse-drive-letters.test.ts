import { expect, test } from "vitest";
import { parseURL, parseFilename, stringifyParsedURL } from "../../src/parse";

const protocolRelative = Symbol.for("ufo:protocolRelative");

const fileOut = (host: string, pathname: string, search = "", hash = "") => ({
  protocol: "file:",
  auth: "",
  host,
  pathname,
  search,
  hash,
});

const urlOut = (
  protocol: string,
  host: string,
  pathname: string,
  search = "",
  hash = "",
  auth = "",
) => ({ protocol, auth, host, pathname, search, hash });

// Rule: With a file protocol, a drive-letter slash loses its slash

// Scenario table, as written in the spec.
const happy1 = [
  { input: "file:///C:/home/user", out: fileOut("", "C:/home/user") },
  { input: "file:///c:/x", out: fileOut("", "c:/x") },
  { input: "file:///Z:/x?y=1#top", out: fileOut("", "Z:/x", "?y=1", "#top") },
  { input: "file:///C:\\x", out: fileOut("", "C:/x") },
  { input: "file://host/C:/x", out: fileOut("host", "C:/x") },
];

for (const t of happy1) {
  test(`[happy-1] spec example: ${JSON.stringify(t.input)}`, () => {
    expect(JSON.parse(JSON.stringify(parseURL(t.input)))).toEqual(t.out);
  });
}

// Extends public "[happy-1] file: URL with a drive letter first": other
// letters, backslashes throughout, auth, ports, search and hash together.
const happy1More = [
  { input: "file:///A:/", out: fileOut("", "A:/") },
  { input: "file:///a:/b/c/d.txt", out: fileOut("", "a:/b/c/d.txt") },
  { input: "file:///z:/x", out: fileOut("", "z:/x") },
  {
    input: "file:\\\\\\C:\\Users\\me\\a.txt",
    out: fileOut("", "C:/Users/me/a.txt"),
  },
  { input: "file://host\\D:\\y", out: fileOut("host", "D:/y") },
  { input: "file://srv:8080/E:/share", out: fileOut("srv:8080", "E:/share") },
  {
    input: "file:///Q:/x/y?a=1&b=2#frag",
    out: fileOut("", "Q:/x/y", "?a=1&b=2", "#frag"),
  },
  { input: "file:///C:/x#h", out: fileOut("", "C:/x", "", "#h") },
];

for (const t of happy1More) {
  test(`[happy-1] file: URL with a drive letter first, more inputs: ${JSON.stringify(t.input)}`, () => {
    expect(JSON.parse(JSON.stringify(parseURL(t.input)))).toEqual(t.out);
  });
}

test("[happy-1] file: URL with auth before the host keeps auth and normalizes the drive", () => {
  expect(JSON.parse(JSON.stringify(parseURL("file://user@host/C:/x")))).toEqual(
    { ...fileOut("host", "C:/x"), auth: "user" },
  );
});

test("[happy-1] file: URL with a drive letter is not flagged protocol-relative", () => {
  const parsed = parseURL("file:///C:/x");
  expect(parsed.pathname).toBe("C:/x");
  expect((parsed as unknown as Record<symbol, unknown>)[protocolRelative]).toBe(
    false,
  );
});

// Extends public "[boundary-1] leading whitespace or NUL is skipped": tabs,
// newlines and mixed runs, which `trim()` or a single-character skip miss.
const boundary1 = [
  { input: " file:///C:/x", out: fileOut("", "C:/x") },
  { input: "\0file:///C:/x", out: fileOut("", "C:/x") },
  { input: "\tfile:///C:/x", out: fileOut("", "C:/x") },
  { input: "\n\r file:///C:/x", out: fileOut("", "C:/x") },
  { input: "\0\0 \tfile:///C:/x", out: fileOut("", "C:/x") },
  { input: " \0 file:///d:/y?z#w", out: fileOut("", "d:/y", "?z", "#w") },
  { input: "   file://host/C:/x", out: fileOut("host", "C:/x") },
];

for (const t of boundary1) {
  test(`[boundary-1] leading whitespace or NUL before file: is skipped: ${JSON.stringify(t.input)}`, () => {
    expect(JSON.parse(JSON.stringify(parseURL(t.input)))).toEqual(t.out);
  });
}

// Extends public "[boundary-2] a bare drive letter": other letters, with a
// host, and with search or hash right after the colon.
const boundary2 = [
  { input: "file:///C:", out: fileOut("", "C:") },
  { input: "file:///z:", out: fileOut("", "z:") },
  { input: "file://host/C:", out: fileOut("host", "C:") },
  { input: "file:///C:?q=1", out: fileOut("", "C:", "?q=1") },
  { input: "file:///C:#top", out: fileOut("", "C:", "", "#top") },
  { input: " file:///C:", out: fileOut("", "C:") },
];

for (const t of boundary2) {
  test(`[boundary-2] a bare drive letter with nothing after the colon: ${JSON.stringify(t.input)}`, () => {
    expect(JSON.parse(JSON.stringify(parseURL(t.input)))).toEqual(t.out);
  });
}

// Extends public "[boundary-3] the drive letter keeps its case": both cases,
// and the case of the rest of the path is kept too.
const boundary3 = [
  { input: "file:///d:/Data", pathname: "d:/Data", not: "D:/Data" },
  { input: "file:///a:/B/c", pathname: "a:/B/c", not: "A:/B/c" },
  { input: "file:///Q:/x", pathname: "Q:/x", not: "q:/x" },
  { input: "file://host/m:/N", pathname: "m:/N", not: "M:/N" },
];

for (const t of boundary3) {
  test(`[boundary-3] the drive letter keeps its case: ${JSON.stringify(t.input)}`, () => {
    const { pathname } = parseURL(t.input);
    expect(pathname).toBe(t.pathname);
    expect(pathname).not.toBe(t.not);
  });
}

// Extends public "[happy-2] defaultProto file://": search and hash, a host
// from the input, a lowercase drive.
const happy2 = [
  { input: "/C:/x", out: fileOut("", "C:/x") },
  { input: "/c:/x?y=1#z", out: fileOut("", "c:/x", "?y=1", "#z") },
  { input: "host/C:/x", out: fileOut("host", "C:/x") },
  { input: "/D:\\a\\b", out: fileOut("", "D:/a/b") },
];

for (const t of happy2) {
  test(`[happy-2] defaultProto "file://" leads to drive-letter normalization: ${JSON.stringify(t.input)}`, () => {
    expect(JSON.parse(JSON.stringify(parseURL(t.input, "file://")))).toEqual(
      t.out,
    );
  });
}

test('[happy-2] defaultProto "http://" is ignored when the input is already a file: URL', () => {
  expect(
    JSON.parse(JSON.stringify(parseURL("file:///C:/x", "http://"))),
  ).toEqual(fileOut("", "C:/x"));
});

// Rule: Without a file protocol, the pathname keeps its leading slash

const happy3 = [
  {
    input: "http://test.com/C:/x",
    out: urlOut("http:", "test.com", "/C:/x"),
  },
  { input: "https://e.com/a:b", out: urlOut("https:", "e.com", "/a:b") },
  { input: "ftp://h/D:/x", out: urlOut("ftp:", "h", "/D:/x") },
  {
    input: "https://e.com/C:?q=1",
    out: urlOut("https:", "e.com", "/C:", "?q=1"),
  },
  {
    input: "http://test.com\\C:\\x",
    out: urlOut("http:", "test.com", "/C:/x"),
  },
];

for (const t of happy3) {
  test(`[happy-3] spec example: ${JSON.stringify(t.input)}`, () => {
    expect(JSON.parse(JSON.stringify(parseURL(t.input)))).toEqual(t.out);
  });
}

// Extends public "[happy-3] non-file URL keeps its drive-letter-like path":
// protocols outside any short list, later segments, search, hash, auth,
// ports, uppercase protocols and leading whitespace.
const happy3More = [
  { input: "ws://h/C:/x", out: urlOut("ws:", "h", "/C:/x") },
  { input: "s3://bucket/C:/x", out: urlOut("s3:", "bucket", "/C:/x") },
  {
    input: "custom-proto://h/z:/x",
    out: urlOut("custom-proto:", "h", "/z:/x"),
  },
  {
    input: "https://e.com/x/C:/y",
    out: urlOut("https:", "e.com", "/x/C:/y"),
  },
  {
    input: "http://h/x?y=/C:",
    out: urlOut("http:", "h", "/x", "?y=/C:"),
  },
  {
    input: "http://h/x#/C:",
    out: urlOut("http:", "h", "/x", "", "#/C:"),
  },
  {
    input: "http://test.com/C:/x#/D:",
    out: urlOut("http:", "test.com", "/C:/x", "", "#/D:"),
  },
  {
    input: "http://h:8080/C:/x",
    out: urlOut("http:", "h:8080", "/C:/x"),
  },
  {
    input: "http://user:pw@h/C:/x",
    out: urlOut("http:", "h", "/C:/x", "", "", "user:pw"),
  },
  {
    input: "HTTP://test.com/C:/x",
    out: urlOut("http:", "test.com", "/C:/x"),
  },
  {
    input: " \0http://test.com/c:/x",
    out: urlOut("http:", "test.com", "/c:/x"),
  },
  {
    input: "https://e.com/C:/D:/x",
    out: urlOut("https:", "e.com", "/C:/D:/x"),
  },
];

for (const t of happy3More) {
  test(`[happy-3] non-file URL keeps its drive-letter-like path, more inputs: ${JSON.stringify(t.input)}`, () => {
    expect(JSON.parse(JSON.stringify(parseURL(t.input)))).toEqual(t.out);
  });
}

test('[happy-3] defaultProto "file://" is ignored when the input already has an http: protocol', () => {
  expect(
    JSON.parse(JSON.stringify(parseURL("http://test.com/C:/x", "file://"))),
  ).toEqual(urlOut("http:", "test.com", "/C:/x"));
});

// Extends public "[boundary-4] the file protocol is matched case-sensitively":
// every other mixed-case spelling, with leading whitespace, with a host.
const boundary4 = [
  { input: "FILE:///C:/x", out: fileOut("", "/C:/x") },
  { input: "File:///C:/x", out: fileOut("", "/C:/x") },
  { input: "fILE:///C:/x", out: fileOut("", "/C:/x") },
  { input: "filE:///C:/x", out: fileOut("", "/C:/x") },
  { input: "fiLe:///c:/x", out: fileOut("", "/c:/x") },
  { input: " FILE:///C:/x", out: fileOut("", "/C:/x") },
  { input: "FILE://host/C:/x", out: fileOut("host", "/C:/x") },
  { input: "FILE:///C:", out: fileOut("", "/C:") },
  { input: "FILE:///x#/C:", out: fileOut("", "/x", "", "#/C:") },
];

for (const t of boundary4) {
  test(`[boundary-4] the file protocol is matched case-sensitively: ${JSON.stringify(t.input)}`, () => {
    expect(JSON.parse(JSON.stringify(parseURL(t.input)))).toEqual(t.out);
  });
}

// Extends public "[boundary-5] defaultProto FILE:// does not normalize".
const boundary5 = [
  { proto: "FILE://", input: "/C:/x", out: fileOut("", "/C:/x") },
  { proto: "File://", input: "/C:/x", out: fileOut("", "/C:/x") },
  { proto: "fIle://", input: "/d:/y?q", out: fileOut("", "/d:/y", "?q") },
  { proto: "FILE://", input: "host/C:/x", out: fileOut("host", "/C:/x") },
];

for (const t of boundary5) {
  test(`[boundary-5] defaultProto ${JSON.stringify(t.proto)} does not normalize: ${JSON.stringify(t.input)}`, () => {
    expect(JSON.parse(JSON.stringify(parseURL(t.input, t.proto)))).toEqual(
      t.out,
    );
  });
}

// Extends public "[boundary-6] a protocol-relative URL is not a file URL":
// backslashes, lowercase drive, search and hash, a bare drive.
const boundary6 = [
  { input: "//host/C:/x", out: urlOut("", "host", "/C:/x") },
  { input: "\\\\host\\C:\\x", out: urlOut("", "host", "/C:/x") },
  { input: "//h/c:/x?y=1#h", out: urlOut("", "h", "/c:/x", "?y=1", "#h") },
  { input: "//host/C:", out: urlOut("", "host", "/C:") },
  { input: "//host/x/C:/y", out: urlOut("", "host", "/x/C:/y") },
];

for (const t of boundary6) {
  test(`[boundary-6] a protocol-relative URL is not a file URL: ${JSON.stringify(t.input)}`, () => {
    const parsed = parseURL(t.input);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(t.out);
    expect(
      (parsed as unknown as Record<symbol, unknown>)[protocolRelative],
    ).toBe(true);
  });
}

// Extends public "[boundary-7] defaultProto other than file:// does not
// normalize": other protocols, and "//" which builds a protocol-relative URL.
const boundary7 = [
  { proto: "http://", input: "/C:/x", out: urlOut("http:", "", "/C:/x") },
  { proto: "https://", input: "/D:/y", out: urlOut("https:", "", "/D:/y") },
  {
    proto: "ftp://",
    input: "host/c:/x?q#h",
    out: urlOut("ftp:", "host", "/c:/x", "?q", "#h"),
  },
  { proto: "files://", input: "/C:/x", out: urlOut("files:", "", "/C:/x") },
];

for (const t of boundary7) {
  test(`[boundary-7] defaultProto ${JSON.stringify(t.proto)} does not normalize: ${JSON.stringify(t.input)}`, () => {
    expect(JSON.parse(JSON.stringify(parseURL(t.input, t.proto)))).toEqual(
      t.out,
    );
  });
}

test('[boundary-7] defaultProto "//" builds a protocol-relative URL that does not normalize', () => {
  const parsed = parseURL("/C:/x", "//");
  expect(JSON.parse(JSON.stringify(parsed))).toEqual(urlOut("", "", "/C:/x"));
  expect((parsed as unknown as Record<symbol, unknown>)[protocolRelative]).toBe(
    true,
  );
});

// Extends public "[boundary-8] a protocol that only contains file": protocols
// that start with, end with, or extend "file".
const boundary8 = [
  { input: "files:///C:/x", out: urlOut("files:", "", "/C:/x") },
  { input: "xfile:///C:/x", out: urlOut("xfile:", "", "/C:/x") },
  { input: "myfile:///C:/x", out: urlOut("myfile:", "", "/C:/x") },
  { input: "file+ssh:///C:/x", out: urlOut("file+ssh:", "", "/C:/x") },
  { input: "file.x://h/D:/y", out: urlOut("file.x:", "h", "/D:/y") },
  { input: "file-x:///c:", out: urlOut("file-x:", "", "/c:") },
  { input: "fil:///C:/x", out: urlOut("fil:", "", "/C:/x") },
];

for (const t of boundary8) {
  test(`[boundary-8] a protocol other than exactly file: is not the file protocol: ${JSON.stringify(t.input)}`, () => {
    expect(JSON.parse(JSON.stringify(parseURL(t.input)))).toEqual(t.out);
  });
}

test("[happy-4] a non-file URL survives a parse/stringify round trip", () => {
  const parsed = parseURL("http://test.com/C:/x?y=1#h");
  expect(stringifyParsedURL(parsed)).toBe("http://test.com/C:/x?y=1#h");
});

// Extends public "[happy-4] a non-file URL survives a round trip": auth, port,
// drive-letter text in later segments, search and hash, other protocols.
const happy4 = [
  {
    input: "https://u:p@e.com:8080/a:b/C:/x?q=/D:#/E:",
    out: "https://u:p@e.com:8080/a:b/C:/x?q=/D:#/E:",
  },
  { input: "ftp://h/z:", out: "ftp://h/z:" },
  { input: "ws://h/c:/x", out: "ws://h/c:/x" },
  { input: "//host/C:/x?y#z", out: "//host/C:/x?y#z" },
  { input: "https://e.com/x/Y:/z", out: "https://e.com/x/Y:/z" },
  { input: "FILE://host/C:/x", out: "file://host/C:/x" },
];

for (const t of happy4) {
  test(`[happy-4] a non-file URL survives a parse/stringify round trip: ${JSON.stringify(t.input)}`, () => {
    expect(stringifyParsedURL(parseURL(t.input))).toBe(t.out);
  });
}

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
  test(`[boundary-9] spec example: ${JSON.stringify(t.input)}`, () => {
    expect(JSON.parse(JSON.stringify(parseURL(t.input)))).toEqual(t.out);
  });
}

// Extends public "[boundary-9] drive-letter-like text elsewhere loses its
// slash": deeper segments, only the first match, search before hash, extra
// leading slashes, backslashes.
const boundary9More = [
  { input: "file:///a/b/z:/c", out: fileOut("", "/a/bz:/c") },
  { input: "file:///C:/x/D:/y", out: fileOut("", "C:/x/D:/y") },
  { input: "file:///C:/D:", out: fileOut("", "C:/D:") },
  { input: "file:///x/y:/z:/w", out: fileOut("", "/xy:/z:/w") },
  { input: "file:///x?a=1&b=/D:", out: fileOut("", "/x", "?a=1&b=D:") },
  { input: "file:///x?q#/C:", out: fileOut("", "/x", "?q", "#C:") },
  {
    input: "file:///x?y=/C:#/D:",
    out: fileOut("", "/x", "?y=C:", "#/D:"),
  },
  { input: "file:///x#a/C:/D:", out: fileOut("", "/x", "", "#aC:/D:") },
  { input: "file://///C:/x", out: fileOut("", "//C:/x") },
  { input: "file:///home\\C:\\x", out: fileOut("", "/homeC:/x") },
  { input: "file:///x?/C:", out: fileOut("", "/x", "?C:") },
];

for (const t of boundary9More) {
  test(`[boundary-9] drive-letter-like text elsewhere in a file: URL, more inputs: ${JSON.stringify(t.input)}`, () => {
    expect(JSON.parse(JSON.stringify(parseURL(t.input)))).toEqual(t.out);
  });
}

test("[unhappy-1] spec examples: a path with no single-letter drive is not changed", () => {
  for (const [input, pathname] of [
    ["file:///CD:/x", "/CD:/x"],
    ["file:///1:/x", "/1:/x"],
    ["file:///C|/x", "/C|/x"],
    ["file:///home/x", "/home/x"],
    ["file:///é:/x", "/é:/x"],
  ]) {
    expect(JSON.parse(JSON.stringify(parseURL(input)))).toEqual(
      fileOut("", pathname),
    );
  }
});

// Extends public "[unhappy-1] a path with no single-letter drive is not
// changed": ASCII characters between "Z" and "a" (caught by `[A-z]`),
// Unicode letters that `/[a-z]/iu` would match, other non-ASCII letters,
// lowercase `|`, no colon, a different separator.
const unhappy1 = [
  { input: "file:///_:/x", pathname: "/_:/x" },
  { input: "file:///`:/x", pathname: "/`:/x" },
  { input: "file:///[:/x", pathname: "/[:/x" },
  { input: "file:///^:/x", pathname: "/^:/x" },
  { input: "file:///\u212A:/x", pathname: "/\u212A:/x" },
  { input: "file:///\u017F:/x", pathname: "/\u017F:/x" },
  { input: "file:///Ω:/x", pathname: "/Ω:/x" },
  { input: "file:///\uFF23:/x", pathname: "/\uFF23:/x" },
  { input: "file:///9:/x", pathname: "/9:/x" },
  { input: "file:///c|/x", pathname: "/c|/x" },
  { input: "file:///C/x", pathname: "/C/x" },
  { input: "file:///C;/x", pathname: "/C;/x" },
  { input: "file:///ab:/x", pathname: "/ab:/x" },
  { input: "file:///x/CD:/y", pathname: "/x/CD:/y" },
  { input: "file:///:/x", pathname: "/:/x" },
  { input: "file:///C", pathname: "/C" },
];

for (const t of unhappy1) {
  test(`[unhappy-1] a path with no single-letter drive is not changed: ${JSON.stringify(t.input)}`, () => {
    expect(JSON.parse(JSON.stringify(parseURL(t.input)))).toEqual(
      fileOut("", t.pathname),
    );
  });
}

// Extends public "[boundary-10] a drive letter written where the host goes":
// lowercase, nothing after it, a later drive-letter slash in the path.
const boundary10 = [
  { input: "file://C:/x", out: fileOut("C:", "/x") },
  { input: "file://c:/x", out: fileOut("c:", "/x") },
  { input: "file://C:", out: fileOut("C:", "") },
  { input: "file://C:/x?y#z", out: fileOut("C:", "/x", "?y", "#z") },
  { input: "file://C:/D:/x", out: fileOut("C:", "D:/x") },
];

for (const t of boundary10) {
  test(`[boundary-10] a drive letter written where the host goes stays the host: ${JSON.stringify(t.input)}`, () => {
    expect(JSON.parse(JSON.stringify(parseURL(t.input)))).toEqual(t.out);
  });
}

// Rule: Inputs outside this change keep their current results

// Extends public "[happy-5] input with no drive letter or no protocol is
// unchanged": the other script protocols, uppercase script protocols, the
// parsePath fallback with search and hash, file: URLs without a drive.
const happy5 = [
  { input: "file:///home/user", out: fileOut("", "/home/user") },
  { input: "file://host/a/b?x#y", out: fileOut("host", "/a/b", "?x", "#y") },
  { input: "/C:/x", out: { pathname: "/C:/x", search: "", hash: "" } },
  { input: "C:/x", out: { pathname: "C:/x", search: "", hash: "" } },
  { input: "c:/x", out: { pathname: "c:/x", search: "", hash: "" } },
  {
    input: "/C:/x?y=/D:#/E:",
    out: { pathname: "/C:/x", search: "?y=/D:", hash: "#/E:" },
  },
  { input: "/a/C:/b", out: { pathname: "/a/C:/b", search: "", hash: "" } },
  {
    input: "data:/C:/x",
    out: {
      protocol: "data:",
      pathname: "/C:/x",
      href: "data:/C:/x",
      auth: "",
      host: "",
      search: "",
      hash: "",
    },
  },
  {
    input: "blob:/C:/x",
    out: {
      protocol: "blob:",
      pathname: "/C:/x",
      href: "blob:/C:/x",
      auth: "",
      host: "",
      search: "",
      hash: "",
    },
  },
  {
    input: "javascript:/C:",
    out: {
      protocol: "javascript:",
      pathname: "/C:",
      href: "javascript:/C:",
      auth: "",
      host: "",
      search: "",
      hash: "",
    },
  },
  {
    input: "VBSCRIPT:/D:/x",
    out: {
      protocol: "vbscript:",
      pathname: "/D:/x",
      href: "VBSCRIPT:/D:/x",
      auth: "",
      host: "",
      search: "",
      hash: "",
    },
  },
];

for (const t of happy5) {
  test(`[happy-5] input with no drive letter or no protocol is unchanged: ${JSON.stringify(t.input)}`, () => {
    expect(JSON.parse(JSON.stringify(parseURL(t.input)))).toEqual(t.out);
  });
}

// Extends public "[happy-6] stringifying a file: drive-letter URL is
// unchanged": hosts, search, hash, lowercase drive.
const happy6 = [
  { input: "file:///C:/x", out: "file://C:/x" },
  { input: "file:///c:/x?y#z", out: "file://c:/x?y#z" },
  { input: "file://host/C:/x", out: "file://hostC:/x" },
  { input: "file:///D:\\a\\b", out: "file://D:/a/b" },
];

for (const t of happy6) {
  test(`[happy-6] stringifying a file: drive-letter URL is unchanged: ${JSON.stringify(t.input)}`, () => {
    expect(stringifyParsedURL(parseURL(t.input))).toBe(t.out);
  });
}

test("[happy-7] parseFilename reads the last segment of a non-file drive-letter path", () => {
  expect(
    parseFilename("http://e.com/C:/dir/a.txt", { strict: true }),
  ).toStrictEqual("a.txt");
});

// Extends public "[happy-7] parseFilename reads the last segment": a filename
// that is itself the drive-letter segment (the old pathname had no "/" before
// it), other protocols, strict and non-strict.
const happy7 = [
  { input: "http://e.com/C:.txt", strict: true, out: "C:.txt" },
  { input: "http://e.com/C:.txt", strict: false, out: "C:.txt" },
  { input: "ftp://h/D:/a/b.tar.gz", strict: true, out: "b.tar.gz" },
  { input: "https://e.com/d:", strict: false, out: "d:" },
  { input: "https://e.com/x/Y:", strict: false, out: "Y:" },
  { input: "//host/C:", strict: false, out: "C:" },
  { input: "http://e.com/C:", strict: true, out: undefined },
];

for (const t of happy7) {
  test(`[happy-7] parseFilename on a non-file drive-letter path: ${JSON.stringify(t.input)} strict=${t.strict}`, () => {
    expect(parseFilename(t.input, { strict: t.strict })).toStrictEqual(t.out);
  });
}
