import { expect, test } from "vitest";
import { parseURL, parseFilename, stringifyParsedURL } from "../src/parse";

const protocolRelative = Symbol.for("ufo:protocolRelative");

function parsed(input: string, defaultProto?: string) {
  return JSON.parse(JSON.stringify(parseURL(input, defaultProto)));
}

function fileOut(pathname: string, search = "", hash = "", host = "") {
  return { protocol: "file:", auth: "", host, pathname, search, hash };
}

// Rule: With a file protocol, a drive-letter prefix loses its leading slash

test("[happy-1] file:///C:/home/user drops the slash before the drive letter", () => {
  expect(parsed("file:///C:/home/user")).toEqual(fileOut("C:/home/user"));
});

test("[happy-1] file:///c:/x drops the slash before a lowercase drive letter", () => {
  expect(parsed("file:///c:/x")).toEqual(fileOut("c:/x"));
});

test("[happy-1] file:///Z:/x?y=1#top keeps search and hash", () => {
  expect(parsed("file:///Z:/x?y=1#top")).toEqual(
    fileOut("Z:/x", "?y=1", "#top"),
  );
});

test("[happy-1] file:///C:\\x replaces the backslash and drops the slash", () => {
  expect(parsed("file:///C:\\x")).toEqual(fileOut("C:/x"));
});

test("[happy-1] file://host/C:/x normalizes the drive letter with a host", () => {
  expect(parsed("file://host/C:/x")).toEqual(fileOut("C:/x", "", "", "host"));
});

test("[happy-1] boundary: file:///A:/ with the first letter and a trailing slash", () => {
  expect(parsed("file:///A:/")).toEqual(fileOut("A:/"));
});

test("[happy-1] boundary: file:///z:/x with the last lowercase letter", () => {
  expect(parsed("file:///z:/x")).toEqual(fileOut("z:/x"));
});

test("[boundary-1] FILE:///C:/x is a file URL", () => {
  expect(parsed("FILE:///C:/x")).toEqual(fileOut("C:/x"));
});

test("[boundary-1] File:///C:/x is a file URL", () => {
  expect(parsed("File:///C:/x")).toEqual(fileOut("C:/x"));
});

test("[boundary-1] \\0file:///C:/x is a file URL", () => {
  expect(parsed("\0file:///C:/x")).toEqual(fileOut("C:/x"));
});

test("[boundary-1] fIlE:///C:/x with mixed case is a file URL", () => {
  expect(parsed("fIlE:///C:/x")).toEqual(fileOut("C:/x"));
});

test("[boundary-2] one leading space before file: is skipped", () => {
  expect(parsed(" file:///C:/x")).toEqual(fileOut("C:/x"));
});

test("[boundary-2] a leading tab and space before file: are skipped", () => {
  expect(parsed("\t file:///C:/x")).toEqual(fileOut("C:/x"));
});

test("[boundary-3] file:///C: gives the bare drive letter", () => {
  expect(parsed("file:///C:")).toEqual(fileOut("C:"));
});

test("[boundary-3] file:///C:?q=1#h gives the bare drive letter with search and hash", () => {
  expect(parsed("file:///C:?q=1#h")).toEqual(fileOut("C:", "?q=1", "#h"));
});

test("[boundary-4] file:///d:/Data keeps the lowercase drive letter", () => {
  const { pathname } = parseURL("file:///d:/Data");
  expect(pathname).toBe("d:/Data");
  expect(pathname).not.toBe("D:/Data");
});

test("[boundary-4] file:///D:/data keeps the uppercase drive letter", () => {
  const { pathname } = parseURL("file:///D:/data");
  expect(pathname).toBe("D:/data");
  expect(pathname).not.toBe("d:/data");
});

test('[happy-2] defaultProto "file://" normalizes /C:/x', () => {
  expect(parsed("/C:/x", "file://")).toEqual(fileOut("C:/x"));
});

test('[happy-2] boundary: defaultProto "file://" normalizes /z:/a?b=1#c', () => {
  expect(parsed("/z:/a?b=1#c", "file://")).toEqual(
    fileOut("z:/a", "?b=1", "#c"),
  );
});

// Rule: Without a file protocol, the pathname keeps its leading slash

test("[happy-3] http://test.com/C:/x keeps /C:/x", () => {
  expect(parsed("http://test.com/C:/x")).toEqual({
    protocol: "http:",
    auth: "",
    host: "test.com",
    pathname: "/C:/x",
    search: "",
    hash: "",
  });
});

test("[happy-3] https://e.com/a:b keeps /a:b", () => {
  expect(parsed("https://e.com/a:b")).toEqual({
    protocol: "https:",
    auth: "",
    host: "e.com",
    pathname: "/a:b",
    search: "",
    hash: "",
  });
});

test("[happy-3] ftp://h/D:/x keeps /D:/x", () => {
  expect(parsed("ftp://h/D:/x")).toEqual({
    protocol: "ftp:",
    auth: "",
    host: "h",
    pathname: "/D:/x",
    search: "",
    hash: "",
  });
});

test("[happy-3] https://e.com/C:?q=1 keeps /C: and the search", () => {
  expect(parsed("https://e.com/C:?q=1")).toEqual({
    protocol: "https:",
    auth: "",
    host: "e.com",
    pathname: "/C:",
    search: "?q=1",
    hash: "",
  });
});

test("[happy-3] http://test.com\\C:\\x replaces backslashes and keeps /C:/x", () => {
  expect(parsed("http://test.com\\C:\\x")).toEqual({
    protocol: "http:",
    auth: "",
    host: "test.com",
    pathname: "/C:/x",
    search: "",
    hash: "",
  });
});

test("[happy-3] boundary: HTTP://test.com/c:#h with an uppercase protocol keeps /c:", () => {
  expect(parsed("HTTP://test.com/c:#h")).toEqual({
    protocol: "http:",
    auth: "",
    host: "test.com",
    pathname: "/c:",
    search: "",
    hash: "#h",
  });
});

test("[boundary-5] //host/C:/x is protocol-relative and keeps /C:/x", () => {
  const result = parseURL("//host/C:/x");
  expect(JSON.parse(JSON.stringify(result))).toEqual({
    protocol: "",
    auth: "",
    host: "host",
    pathname: "/C:/x",
    search: "",
    hash: "",
  });
  expect(result[protocolRelative]).toBe(true);
});

test("[boundary-5] //host/c: is protocol-relative and keeps /c:", () => {
  const result = parseURL("//host/c:");
  expect(JSON.parse(JSON.stringify(result))).toEqual({
    protocol: "",
    auth: "",
    host: "host",
    pathname: "/c:",
    search: "",
    hash: "",
  });
  expect(result[protocolRelative]).toBe(true);
});

test('[boundary-6] defaultProto "http://" keeps /C:/x', () => {
  expect(parsed("/C:/x", "http://")).toEqual({
    protocol: "http:",
    auth: "",
    host: "",
    pathname: "/C:/x",
    search: "",
    hash: "",
  });
});

test('[boundary-6] defaultProto "https://" keeps /C:', () => {
  expect(parsed("/C:", "https://")).toEqual({
    protocol: "https:",
    auth: "",
    host: "",
    pathname: "/C:",
    search: "",
    hash: "",
  });
});

test("[boundary-7] files:///C:/x is not the file protocol", () => {
  expect(parsed("files:///C:/x")).toEqual({
    protocol: "files:",
    auth: "",
    host: "",
    pathname: "/C:/x",
    search: "",
    hash: "",
  });
});

test("[boundary-7] myfile:///C:/x is not the file protocol", () => {
  expect(parsed("myfile:///C:/x")).toEqual({
    protocol: "myfile:",
    auth: "",
    host: "",
    pathname: "/C:/x",
    search: "",
    hash: "",
  });
});

test("[happy-4] http://test.com/C:/x?y=1#h round-trips through stringifyParsedURL", () => {
  expect(stringifyParsedURL(parseURL("http://test.com/C:/x?y=1#h"))).toBe(
    "http://test.com/C:/x?y=1#h",
  );
});

test("[happy-4] boundary: //host/c: round-trips through stringifyParsedURL", () => {
  expect(stringifyParsedURL(parseURL("//host/c:"))).toBe("//host/c:");
});

// Rule: Only a drive letter at the very start of the path is normalized

test("[boundary-8] file:///home/C:/x leaves a later segment alone", () => {
  expect(parsed("file:///home/C:/x")).toEqual(fileOut("/home/C:/x"));
});

test("[boundary-8] file:///x?y=/C: leaves the search alone", () => {
  expect(parsed("file:///x?y=/C:")).toEqual(fileOut("/x", "?y=/C:"));
});

test("[boundary-8] file:///x#/C: leaves the hash alone", () => {
  expect(parsed("file:///x#/C:")).toEqual(fileOut("/x", "", "#/C:"));
});

test("[boundary-8] file:////C:/x checks only one leading slash", () => {
  expect(parsed("file:////C:/x")).toEqual(fileOut("//C:/x"));
});

test("[boundary-8] file:///C:/home/D:/x#/E: normalizes only the first drive letter", () => {
  expect(parsed("file:///C:/home/D:/x#/E:")).toEqual(
    fileOut("C:/home/D:/x", "", "#/E:"),
  );
});

test("[unhappy-1] file:///CD:/x with two letters is not normalized", () => {
  expect(parsed("file:///CD:/x")).toEqual(fileOut("/CD:/x"));
});

test("[unhappy-1] file:///1:/x with a digit is not normalized", () => {
  expect(parsed("file:///1:/x")).toEqual(fileOut("/1:/x"));
});

test("[unhappy-1] file:///C|/x with the legacy separator is not normalized", () => {
  expect(parsed("file:///C|/x")).toEqual(fileOut("/C|/x"));
});

test("[unhappy-1] file:///home/x without a drive letter is not normalized", () => {
  expect(parsed("file:///home/x")).toEqual(fileOut("/home/x"));
});

test("[unhappy-1] file:///é:/x with a non-ASCII letter is not normalized", () => {
  expect(parsed("file:///é:/x")).toEqual(fileOut("/é:/x"));
});

test("[unhappy-1] boundary: file:///:/x with no letter and file:///C/x with no colon are not normalized", () => {
  expect(parsed("file:///:/x")).toEqual(fileOut("/:/x"));
  expect(parsed("file:///C/x")).toEqual(fileOut("/C/x"));
});

test("[boundary-9] file://C:/x keeps C: as the host", () => {
  expect(parsed("file://C:/x")).toEqual(fileOut("/x", "", "", "C:"));
});

test("[boundary-9] file://c: keeps c: as the host with an empty pathname", () => {
  expect(parsed("file://c:")).toEqual(fileOut("", "", "", "c:"));
});

// Rule: Inputs outside this change keep their current results

test("[happy-5] file:///home/user keeps /home/user", () => {
  expect(parseURL("file:///home/user").pathname).toBe("/home/user");
});

test("[happy-5] /C:/x without a protocol keeps /C:/x", () => {
  expect(parseURL("/C:/x").pathname).toBe("/C:/x");
});

test("[happy-5] C:/x without a protocol keeps C:/x", () => {
  expect(parseURL("C:/x").pathname).toBe("C:/x");
});

test("[happy-5] data:/C:/x keeps /C:/x", () => {
  expect(parseURL("data:/C:/x").pathname).toBe("/C:/x");
});

test("[happy-5] boundary: blob:/c: and /c: keep their leading slash", () => {
  expect(parseURL("blob:/c:").pathname).toBe("/c:");
  expect(parseURL("/c:").pathname).toBe("/c:");
});

test("[happy-6] file:///C:/x stringifies to file://C:/x", () => {
  expect(stringifyParsedURL(parseURL("file:///C:/x"))).toBe("file://C:/x");
});

test("[happy-6] boundary: FILE:///C:?y=1#h stringifies to file://C:?y=1#h", () => {
  expect(stringifyParsedURL(parseURL("FILE:///C:?y=1#h"))).toBe(
    "file://C:?y=1#h",
  );
});

test("[happy-7] parseFilename reads a.txt from http://e.com/C:/dir/a.txt", () => {
  expect(parseFilename("http://e.com/C:/dir/a.txt", { strict: true })).toBe(
    "a.txt",
  );
});

test("[happy-7] boundary: parseFilename reads C: from http://e.com/C: but nothing from file:///C:", () => {
  expect(parseFilename("http://e.com/C:", { strict: false })).toBe("C:");
  expect(parseFilename("file:///C:", { strict: false })).toBeUndefined();
});
