import { expect, test } from "vitest";
import { parseURL, parseFilename, stringifyParsedURL } from "../../src/parse";

const protocolRelative = Symbol.for("ufo:protocolRelative");

function parsed(input: string, defaultProto?: string) {
  return JSON.parse(JSON.stringify(parseURL(input, defaultProto)));
}

function fileOut(pathname: string, search = "", hash = "", host = "") {
  return { protocol: "file:", auth: "", host, pathname, search, hash };
}

function urlOut(
  protocol: string,
  host: string,
  pathname: string,
  search = "",
  hash = "",
  auth = "",
) {
  return { protocol, auth, host, pathname, search, hash };
}

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const LOWER = "abcdefghijklmnopqrstuvwxyz".split("");

// Rule: With a file protocol, a drive-letter prefix loses its leading slash

// Extends "[happy-1] file:///C:/home/user ..." and the A/z boundary tests: every ASCII letter.
test("[happy-1] every ASCII letter A-Z and a-z is a drive letter in a file: URL", () => {
  for (const letter of [...UPPER, ...LOWER]) {
    expect(parsed(`file:///${letter}:/dir/f.txt`)).toEqual(
      fileOut(`${letter}:/dir/f.txt`),
    );
  }
});

// Extends "[happy-1] file://host/C:/x ...": host with lowercase drive, search and hash.
test("[happy-1] file://srv/q:/a/b?k=v#frag normalizes with a host, search and hash", () => {
  expect(parsed("file://srv/q:/a/b?k=v#frag")).toEqual(
    fileOut("q:/a/b", "?k=v", "#frag", "srv"),
  );
});

// Extends "[happy-1] file://host/C:/x ...": auth and a port do not stop normalization.
test("[happy-1] file://user:pw@host:21/C:/x normalizes with auth and a port", () => {
  expect(parsed("file://user:pw@host:21/C:/x")).toEqual({
    protocol: "file:",
    auth: "user:pw",
    host: "host:21",
    pathname: "C:/x",
    search: "",
    hash: "",
  });
});

// Extends "[happy-1] file:///C:\\x ...": backslashes everywhere, including the one before the drive.
test("[happy-1] file:\\\\\\Y:\\a\\b with only backslashes normalizes to Y:/a/b", () => {
  expect(parsed("file:\\\\\\Y:\\a\\b")).toEqual(fileOut("Y:/a/b"));
});

// Extends "[happy-1] file:///Z:/x?y=1#top ...": a later drive-like segment and hash stay as they are.
test("[happy-1] file:///C:/home/D:/x?q=/E:#/F: drops only the first slash", () => {
  expect(parsed("file:///C:/home/D:/x?q=/E:#/F:")).toEqual(
    fileOut("C:/home/D:/x", "?q=/E:", "#/F:"),
  );
});

// Shortcut: deciding by defaultProto instead of the input's own protocol.
test('[happy-1] file:///C:/x with defaultProto "http://" still normalizes', () => {
  expect(parsed("file:///C:/x", "http://")).toEqual(fileOut("C:/x"));
});

test("[boundary-1] FILE:///c:/x and FiLe:///C:/x are file URLs", () => {
  expect(parsed("FILE:///c:/x")).toEqual(fileOut("c:/x"));
  expect(parsed("FiLe:///C:/x")).toEqual(fileOut("C:/x"));
});

// Extends "[boundary-1] File:///C:/x ...": other casings with search, hash and a host.
test("[boundary-1] fILE://host/Q:/x?a#b with an odd casing normalizes", () => {
  expect(parsed("fILE://host/Q:/x?a#b")).toEqual(
    fileOut("Q:/x", "?a", "#b", "host"),
  );
});

// Extends "[boundary-1] \\0file:///C:/x ...": several NULs with an uppercase protocol.
test("[boundary-1] \\0\\0FILE:///C:/x with several NULs is a file URL", () => {
  expect(parsed("\0\0FILE:///C:/x")).toEqual(fileOut("C:/x"));
});

// Extends "[boundary-2] one leading space ...": more and other kinds of whitespace.
test("[boundary-2] several spaces, newlines and tabs before file: are skipped", () => {
  expect(parsed("   file:///C:/x")).toEqual(fileOut("C:/x"));
  expect(parsed("\r\n\t file:///z:/y")).toEqual(fileOut("z:/y"));
});

// Extends "[boundary-2] ...": whitespace and NUL mixed with an uppercase protocol.
test("[boundary-2] mixed whitespace and NUL before FILE: are skipped", () => {
  expect(parsed(" \0\tFILE:///C:/x?a=1")).toEqual(fileOut("C:/x", "?a=1"));
});

// Extends "[boundary-3] file:///C: ...": other letters, hash only, host.
test("[boundary-3] file:///z: and file:///C:#h give the bare drive letter", () => {
  expect(parsed("file:///z:")).toEqual(fileOut("z:"));
  expect(parsed("file:///C:#h")).toEqual(fileOut("C:", "", "#h"));
});

test("[boundary-3] file://host/C: gives the bare drive letter with the host", () => {
  expect(parsed("file://host/C:")).toEqual(fileOut("C:", "", "", "host"));
});

// Extends "[boundary-4] ...": case is kept for every letter, both ways.
test("[boundary-4] every drive letter keeps its case", () => {
  for (const letter of [...UPPER, ...LOWER]) {
    expect(parseURL(`file:///${letter}:/Data`).pathname).toBe(
      `${letter}:/Data`,
    );
  }
});

test("[boundary-4] FILE:///q:/X with an uppercase protocol keeps the lowercase drive", () => {
  const { pathname } = parseURL("FILE:///q:/X");
  expect(pathname).toBe("q:/X");
  expect(pathname).not.toBe("Q:/X");
});

// Extends "[happy-2] defaultProto \"file://\" normalizes /C:/x": bare drive, later segments.
test('[happy-2] defaultProto "file://" normalizes /c: and keeps later segments', () => {
  expect(parsed("/c:", "file://")).toEqual(fileOut("c:"));
  expect(parsed("/C:/x/D:/y#/E:", "file://")).toEqual(
    fileOut("C:/x/D:/y", "", "#/E:"),
  );
});

test('[happy-2] defaultProto "FILE://" builds a file URL and normalizes', () => {
  expect(parsed("/C:/x", "FILE://")).toEqual(fileOut("C:/x"));
});

test('[happy-2] defaultProto "file://" with a backslash path normalizes', () => {
  expect(parsed("\\C:\\x", "file://")).toEqual(fileOut("C:/x"));
});

// Rule: Without a file protocol, the pathname keeps its leading slash

// Extends "[happy-3] http://test.com/C:/x ...": many protocols and letters.
test("[happy-3] non-file protocols keep the slash before every drive letter", () => {
  for (const proto of ["http:", "https:", "ftp:", "ws:", "wss:", "git+ssh:"]) {
    for (const letter of ["A", "c", "Z", "z"]) {
      expect(parsed(`${proto}//h/${letter}:/x`)).toEqual(
        urlOut(proto, "h", `/${letter}:/x`),
      );
    }
  }
});

test("[happy-3] http://user:pw@h:8080/C:/x?q=1#h keeps /C:/x with auth and port", () => {
  expect(parsed("http://user:pw@h:8080/C:/x?q=1#h")).toEqual(
    urlOut("http:", "h:8080", "/C:/x", "?q=1", "#h", "user:pw"),
  );
});

// Shortcut: looking for "file:" anywhere in the input instead of the protocol.
test("[happy-3] http://h/C:/file:///x mentions file: only in the path and keeps /C:", () => {
  expect(parsed("http://h/C:/file:///x")).toEqual(
    urlOut("http:", "h", "/C:/file:///x"),
  );
});

test("[happy-3] https://h/D:?u=file:///C:/x mentions file: only in the search", () => {
  expect(parsed("https://h/D:?u=file:///C:/x")).toEqual(
    urlOut("https:", "h", "/D:", "?u=file:///C:/x"),
  );
});

// Shortcut: deciding by defaultProto instead of the input's own protocol.
test('[happy-3] http://h/C:/x with defaultProto "file://" keeps /C:/x', () => {
  expect(parsed("http://h/C:/x", "file://")).toEqual(
    urlOut("http:", "h", "/C:/x"),
  );
});

// Extends "[happy-3] http://test.com\\C:\\x ...": several backslashes, uppercase protocol.
test("[happy-3] HTTPS://e.com\\d:\\a\\b keeps /d:/a/b", () => {
  expect(parsed("HTTPS://e.com\\d:\\a\\b")).toEqual(
    urlOut("https:", "e.com", "/d:/a/b"),
  );
});

test("[happy-3] http://e.com/C:/x/D:/y#/E: keeps every drive-like segment", () => {
  expect(parsed("http://e.com/C:/x/D:/y#/E:")).toEqual(
    urlOut("http:", "e.com", "/C:/x/D:/y", "", "#/E:"),
  );
});

// Extends "[boundary-5] //host/C:/x ...": search, hash, auth.
test("[boundary-5] //u@host/D:/x?y=1#z is protocol-relative and keeps /D:/x", () => {
  const result = parseURL("//u@host/D:/x?y=1#z");
  expect(JSON.parse(JSON.stringify(result))).toEqual(
    urlOut("", "host", "/D:/x", "?y=1", "#z", "u"),
  );
  expect(result[protocolRelative]).toBe(true);
});

test("[boundary-5] \\\\host\\C:\\x with backslashes is protocol-relative and keeps /C:/x", () => {
  const result = parseURL("\\\\host\\C:\\x");
  expect(JSON.parse(JSON.stringify(result))).toEqual(
    urlOut("", "host", "/C:/x"),
  );
  expect(result[protocolRelative]).toBe(true);
});

test("[boundary-5] //file/C:/x with a host named file keeps /C:/x", () => {
  const result = parseURL("//file/C:/x");
  expect(JSON.parse(JSON.stringify(result))).toEqual(
    urlOut("", "file", "/C:/x"),
  );
  expect(result[protocolRelative]).toBe(true);
});

// Extends "[boundary-6] defaultProto \"http://\" ...": other protocols and casings.
test('[boundary-6] defaultProto "ftp://" and "HTTP://" keep /z:/x', () => {
  expect(parsed("/z:/x", "ftp://")).toEqual(urlOut("ftp:", "", "/z:/x"));
  expect(parsed("/z:/x", "HTTP://")).toEqual(urlOut("http:", "", "/z:/x"));
});

test('[boundary-6] defaultProto "files://" keeps /C:/x', () => {
  expect(parsed("/C:/x", "files://")).toEqual(urlOut("files:", "", "/C:/x"));
});

test('[boundary-6] defaultProto "//" keeps /C:/x and is protocol-relative', () => {
  const result = parseURL("/C:/x", "//");
  expect(JSON.parse(JSON.stringify(result))).toEqual(urlOut("", "", "/C:/x"));
  expect(result[protocolRelative]).toBe(true);
});

// Extends "[boundary-7] files:///C:/x ..." and "myfile:///C:/x ...": other near misses.
test("[boundary-7] protocols that only resemble file: are not the file protocol", () => {
  for (const proto of [
    "fil:",
    "filex:",
    "file2:",
    "file+x:",
    "file.x:",
    "xfile:",
    "fi:",
    "le:",
    "FILES:",
  ]) {
    expect(parsed(`${proto}///C:/x`)).toEqual(
      urlOut(proto.toLowerCase(), "", "/C:/x"),
    );
  }
});

test("[boundary-7] files://host/c:?q#h keeps /c: with a host, search and hash", () => {
  expect(parsed("files://host/c:?q#h")).toEqual(
    urlOut("files:", "host", "/c:", "?q", "#h"),
  );
});

// Extends "[happy-4] http://test.com/C:/x?y=1#h round-trips ...": other non-file URLs.
test("[happy-4] non-file drive-letter URLs round-trip through stringifyParsedURL", () => {
  for (const input of [
    "https://e.com/a:b",
    "ftp://user:pw@h:21/D:/x/E:/y?q=/F:#/G:",
    "//host/C:/x?y=1#h",
    "ws://h/z:",
    "files:///C:/x",
  ]) {
    expect(stringifyParsedURL(parseURL(input))).toBe(input);
  }
});

test('[happy-4] /C:/x with defaultProto "http://" stringifies to http:///C:/x', () => {
  expect(stringifyParsedURL(parseURL("/C:/x", "http://"))).toBe(
    "http:///C:/x",
  );
});

// Rule: Only a drive letter at the very start of the path is normalized

// Extends "[boundary-8] file:///home/C:/x ...": deeper and last segments, with a host.
test("[boundary-8] file:///a/b/z: and file://host/home/C:/x leave later segments alone", () => {
  expect(parsed("file:///a/b/z:")).toEqual(fileOut("/a/b/z:"));
  expect(parsed("file://host/home/C:/x")).toEqual(
    fileOut("/home/C:/x", "", "", "host"),
  );
});

// Extends "[boundary-8] file:///x?y=/C: ..." and "file:///x#/C: ...": empty path before search or hash.
test("[boundary-8] file://?/C: and file://#/C: leave the search and hash alone", () => {
  expect(parsed("file://?/C:")).toEqual(fileOut("", "?/C:"));
  expect(parsed("file://#/C:")).toEqual(fileOut("", "", "#/C:"));
});

test("[boundary-8] file:///x?a=1&b=/D:#/E:/y leaves both search and hash alone", () => {
  expect(parsed("file:///x?a=1&b=/D:#/E:/y")).toEqual(
    fileOut("/x", "?a=1&b=/D:", "#/E:/y"),
  );
});

test("[boundary-8] file:///?/C: with a root path leaves the search alone", () => {
  expect(parsed("file:///?/C:")).toEqual(fileOut("/", "?/C:"));
});

// Extends "[boundary-8] file:////C:/x ...": more extra slashes, backslashes.
test("[boundary-8] file://///C:/x and file:\\\\\\\\C:\\x keep their extra slashes", () => {
  expect(parsed("file://///C:/x")).toEqual(fileOut("///C:/x"));
  expect(parsed("file:\\\\\\\\C:\\x")).toEqual(fileOut("//C:/x"));
});

test("[boundary-8] file:///./C:/x does not skip a dot segment", () => {
  expect(parsed("file:///./C:/x")).toEqual(fileOut("/./C:/x"));
});

test('[boundary-8] /a/C:/x with defaultProto "file://" leaves the later segment alone', () => {
  expect(parsed("/a/C:/x", "file://")).toEqual(fileOut("/a/C:/x"));
});

// Extends "[unhappy-1] ...": characters next to A-Z and a-z in ASCII, and \w-only characters.
test("[unhappy-1] ASCII characters next to the letters are not drive letters", () => {
  for (const ch of ["@", "[", "\\", "]", "^", "_", "`", "{", "0", "9", "-", "."]) {
    const input = `file:///${ch}:/x`;
    const expected = `/${ch === "\\" ? "/" : ch}:/x`;
    expect(parsed(input)).toEqual(fileOut(expected));
  }
});

// Shortcut: a case-insensitive Unicode match folds these to k and s.
test("[unhappy-1] the Kelvin sign and long s are not drive letters", () => {
  expect(parsed("file:///\u212A:/x")).toEqual(fileOut("/\u212A:/x"));
  expect(parsed("file:///\u017F:/x")).toEqual(fileOut("/\u017F:/x"));
});

test("[unhappy-1] other non-ASCII letters are not drive letters", () => {
  for (const ch of ["Ä", "ß", "Ω", "ж", "ｃ"]) {
    expect(parsed(`file:///${ch}:/x`)).toEqual(fileOut(`/${ch}:/x`));
  }
});

// Extends "[unhappy-1] file:///CD:/x ...": longer letter runs and a later drive segment.
test("[unhappy-1] file:///ABC:/x/D:/y keeps the whole pathname", () => {
  expect(parsed("file:///ABC:/x/D:/y")).toEqual(fileOut("/ABC:/x/D:/y"));
});

// Extends "[unhappy-1] file:///C|/x ...": legacy separator, bare and with a later drive.
test("[unhappy-1] file:///C| and file:///c|/x/D:/y are not normalized", () => {
  expect(parsed("file:///C|")).toEqual(fileOut("/C|"));
  expect(parsed("file:///c|/x/D:/y")).toEqual(fileOut("/c|/x/D:/y"));
});

test("[unhappy-1] other separators after a letter are not drive separators", () => {
  for (const sep of [";", ".", "%3A", "=", " :"]) {
    expect(parsed(`file:///C${sep}/x`)).toEqual(fileOut(`/C${sep}/x`));
  }
});

test("[unhappy-1] file:///1:/x/C:/y and file:///home/x/C: keep the whole pathname", () => {
  expect(parsed("file:///1:/x/C:/y")).toEqual(fileOut("/1:/x/C:/y"));
  expect(parsed("file:///home/x/C:")).toEqual(fileOut("/home/x/C:"));
});

test("[unhappy-1] file:///é:/x/D: keeps the whole pathname", () => {
  expect(parsed("file:///é:/x/D:")).toEqual(fileOut("/é:/x/D:"));
});

// Extends "[boundary-9] file://C:/x ...": other letters, search, auth.
test("[boundary-9] file://z:/x?q#h keeps z: as the host", () => {
  expect(parsed("file://z:/x?q#h")).toEqual(fileOut("/x", "?q", "#h", "z:"));
});

test("[boundary-9] file://u@C:/x keeps C: as the host after auth", () => {
  expect(parsed("file://u@C:/x")).toEqual({
    protocol: "file:",
    auth: "u",
    host: "C:",
    pathname: "/x",
    search: "",
    hash: "",
  });
});

test("[boundary-9] FILE://C:\\x keeps C: as the host", () => {
  expect(parsed("FILE://C:\\x")).toEqual(fileOut("/x", "", "", "C:"));
});

test('[boundary-9] C:/x with defaultProto "file://" keeps C: as the host', () => {
  expect(parsed("C:/x", "file://")).toEqual(fileOut("/x", "", "", "C:"));
});

test("[boundary-9] file://C:/home/D:/x keeps C: as the host and the later segment", () => {
  expect(parsed("file://C:/home/D:/x")).toEqual(
    fileOut("/home/D:/x", "", "", "C:"),
  );
});

// Rule: Inputs outside this change keep their current results

// Extends "[happy-5] data:/C:/x keeps /C:/x": the other special protocols, search and hash stay in the pathname.
test("[happy-5] blob:, data:, javascript: and vbscript: keep the whole rest as pathname", () => {
  expect(parseURL("data:/C:/x?y=/D:#/E:").pathname).toBe("/C:/x?y=/D:#/E:");
  expect(parseURL("javascript:/C:/x").pathname).toBe("/C:/x");
  expect(parseURL("VBScript:/c:").pathname).toBe("/c:");
  expect(parseURL(" blob:/Z:/x").pathname).toBe("/Z:/x");
});

// Extends "[happy-5] /C:/x without a protocol ...": with search and hash.
test("[happy-5] /C:/x?y=/D:#/E: without a protocol keeps its parts", () => {
  expect(parsed("/C:/x?y=/D:#/E:")).toEqual({
    pathname: "/C:/x",
    search: "?y=/D:",
    hash: "#/E:",
  });
});

test("[happy-5] C:\\x and c: without a protocol keep their pathname", () => {
  expect(parseURL("C:\\x").pathname).toBe("C:\\x");
  expect(parseURL("c:").pathname).toBe("c:");
});

test("[happy-5] file:///home/user/a.txt?x#y has no drive letter and keeps its parts", () => {
  expect(parsed("file:///home/user/a.txt?x#y")).toEqual(
    fileOut("/home/user/a.txt", "?x", "#y"),
  );
});

// Extends "[happy-6] file:///C:/x stringifies to file://C:/x": other letters, host, search and hash.
test("[happy-6] file:///z:/a?b#c stringifies to file://z:/a?b#c", () => {
  expect(stringifyParsedURL(parseURL("file:///z:/a?b#c"))).toBe(
    "file://z:/a?b#c",
  );
});

test("[happy-6] file://host/C:/x stringifies to file://hostC:/x", () => {
  expect(stringifyParsedURL(parseURL("file://host/C:/x"))).toBe(
    "file://hostC:/x",
  );
});

test("[happy-6] file:///C:/x/D:/y#/E: stringifies with only the first slash gone", () => {
  expect(stringifyParsedURL(parseURL("file:///C:/x/D:/y#/E:"))).toBe(
    "file://C:/x/D:/y#/E:",
  );
});

// Extends "[happy-7] parseFilename reads a.txt from http://e.com/C:/dir/a.txt".
test("[happy-7] parseFilename reads the last segment for other non-file drive paths", () => {
  expect(parseFilename("https://e.com/z:/a/b.tar.gz", { strict: true })).toBe(
    "b.tar.gz",
  );
  expect(parseFilename("ftp://h/D:/readme", { strict: false })).toBe("readme");
  expect(parseFilename("//host/C:/x.js?y#z", { strict: true })).toBe("x.js");
});

// Shortcut: the old normalization leaves "D:" without a slash, so no segment is found.
test("[happy-7] parseFilename reads a bare drive segment from ftp://h/D: and //host/c:", () => {
  expect(parseFilename("ftp://h/D:", { strict: false })).toBe("D:");
  expect(parseFilename("//host/c:", { strict: false })).toBe("c:");
});

test("[happy-7] parseFilename reads C:.txt from https://e.com/C:.txt in strict mode", () => {
  expect(parseFilename("https://e.com/C:.txt", { strict: true })).toBe(
    "C:.txt",
  );
});

test("[happy-7] parseFilename reads a.txt from file:///C:/dir/a.txt", () => {
  expect(parseFilename("file:///C:/dir/a.txt", { strict: true })).toBe(
    "a.txt",
  );
});
