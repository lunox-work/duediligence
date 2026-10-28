#!/usr/bin/env node
// Go and Rust modules, and commands and services in Python, Go and Rust
// (RESULTS.md "Go and Rust", "Commands and services in other languages").
// Home: evidence/languages/ (DUEDILIGENCE_HOME, set here unless given);
// the model steps are evidence/languages/queue.sh.
//
//   node evidence/languages.mjs selftest [--json <file>]
//       no model: a hand-made command and service in each of Python, Go
//       and Rust (`boundary.language`), its TypeScript suites calibrated by
//       script; the reference, the stub, a submission that does not
//       compile and one tuned to the public suite judged; the staged tree's
//       own `npm run build` and `npm test`; every brief rendered; the
//       build's outputs never read as a change; no service left running
//   node evidence/languages.mjs port
//       the seams' two calibrated specs (evidence/seams/specs/: csv-export-
//       http, a service, and patch-apply-cli, a command) written again for
//       each language: the same spec but its interface paragraph, the same
//       public and hidden tests with the TypeScript contract's types moved
//       into the suites, a stub skeleton written by script. calibrate.mjs
//       then writes the reference in the language (queue.sh seams)
//   node evidence/languages.mjs ports    the ported slugs, one per line
//   node evidence/languages.mjs oracle [--concurrency 4]
//       each calibrated patch-apply-cli port's reference, as a command,
//       on the archive's git oracle corpus (as evidence/seams.mjs oracle),
//       case by case against the TypeScript reference's results there
//   node evidence/languages.mjs mutants [slug...] [--max 40]
//       no model: up to --max one-token mutants of each calibrated
//       reference (an operator flipped, a literal moved by one; Python, Go
//       or Rust), each judged by both suites; which suite killed it
//   node evidence/languages.mjs oracle-survivors [--concurrency 4]
//       each patch-apply-cli port's mutant that both suites passed, on the
//       same corpus: whether it answers any real case otherwise than its
//       reference (a bug the suites missed) or none (likely equivalent)
//   node evidence/languages.mjs report  evidence/languages.json

import { spawn, spawnSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE = join(HERE, "..");
// The selftest's fixtures live in a scratch home, set before lib.mjs reads it.
const SELFTEST_HOME = process.argv[2] === "selftest" ? mkdtempSync(join(tmpdir(), "languages-selftest-")) : null;
if (SELFTEST_HOME !== null) process.env.DUEDILIGENCE_HOME = SELFTEST_HOME;
process.env.DUEDILIGENCE_HOME ??= join(HERE, "languages");
const OUT = join(HERE, "languages");
const SUMMARY = join(HERE, "languages.json");
const SEAMS = join(HERE, "seams", "specs");
const ARCHIVE = resolve(process.env.DUEDILIGENCE_ARCHIVE ?? join(PACKAGE, "experiments"));

const lib = await import("../bin/lib.mjs");
const { NATIVE, args, copy, count, discard, emitted, judge, listFiles, log, pool, prompt, readJson, specDir, stage, testsOf, toolchainOf, verdict, workdir, writeJson } = lib;
const { options, rest } = args();
const command = rest[0];
const summary = readJson(SUMMARY, {});
const save = (key, value) => {
  summary[key] = { at: new Date().toISOString(), ...value };
  writeJson(SUMMARY, summary);
};
const node = (script, argv, env = {}) =>
  spawnSync(process.execPath, [join(PACKAGE, script), ...argv], {
    cwd: PACKAGE,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...env },
  });
/** What a boundary runs for a language: the command, or the service's start. */
const RUN = { python: { command: ["python3", "src/cli.py"], service: ["python3", "src/server.py"] }, go: { command: [".bin/task"], service: [".bin/task"] }, rust: { command: ["target/debug/task"], service: ["target/debug/task"] } };
const LANGUAGES = Object.keys(NATIVE);
const SUFFIX = { python: "py", go: "go", rust: "rs" };

// --- selftest ---------------------------------------------------------------

// `add A B` prints A + B; anything but two integers is exit 1 with
// "not a number" on stderr. As a service: GET /add?a=A&b=B answers
// {"sum": A + B}, a bad query 400.
const COMMANDS = {
  python: {
    reference: `import sys\n\nargs = sys.argv[1:]\ntry:\n    a, b = (int(arg, 10) for arg in args)\nexcept ValueError:\n    sys.stderr.write("not a number\\n")\n    sys.exit(1)\nprint(a + b)\n`,
    stub: `import sys\n\nsys.stderr.write("not implemented\\n")\nsys.exit(2)\n`,
    overfit: `print(5)\n`,
    broken: `print(\n`,
  },
  go: {
    reference: `package main\n\nimport (\n\t"fmt"\n\t"os"\n\t"strconv"\n)\n\nfunc main() {\n\tif len(os.Args) != 3 {\n\t\tfmt.Fprintln(os.Stderr, "not a number")\n\t\tos.Exit(1)\n\t}\n\ta, errA := strconv.Atoi(os.Args[1])\n\tb, errB := strconv.Atoi(os.Args[2])\n\tif errA != nil || errB != nil {\n\t\tfmt.Fprintln(os.Stderr, "not a number")\n\t\tos.Exit(1)\n\t}\n\tfmt.Println(a + b)\n}\n`,
    stub: `package main\n\nimport (\n\t"fmt"\n\t"os"\n)\n\nfunc main() {\n\tfmt.Fprintln(os.Stderr, "not implemented")\n\tos.Exit(2)\n}\n`,
    overfit: `package main\n\nimport "fmt"\n\nfunc main() { fmt.Println(5) }\n`,
    broken: `package main\n\nfunc main() {\n`,
  },
  rust: {
    reference: `fn main() {\n    let nums: Vec<Option<i64>> = std::env::args().skip(1).map(|arg| arg.parse().ok()).collect();\n    if nums.len() != 2 || nums.iter().any(|n| n.is_none()) {\n        eprintln!("not a number");\n        std::process::exit(1);\n    }\n    println!("{}", nums[0].unwrap() + nums[1].unwrap());\n}\n`,
    stub: `fn main() {\n    eprintln!("not implemented");\n    std::process::exit(2);\n}\n`,
    overfit: `fn main() {\n    println!("5");\n}\n`,
    broken: `fn main() {\n`,
  },
};
const PY_SERVER = (answer) => `import json, os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse


def answer(target):
${answer}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        status, body = answer(self.path)
        data = body.encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *_):
        pass


ThreadingHTTPServer((os.environ.get("HOST", "127.0.0.1"), int(os.environ["PORT"])), Handler).serve_forever()
`;
const GO_SERVER = (answer) => `package main

import (
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strconv"
)

var _ = strconv.Atoi
var _ = url.Parse

func answer(r *http.Request) (int, string) {
${answer}
}

func main() {
	host := os.Getenv("HOST")
	if host == "" {
		host = "127.0.0.1"
	}
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		status, body := answer(r)
		w.Header().Set("content-type", "application/json")
		w.WriteHeader(status)
		fmt.Fprint(w, body)
	})
	http.ListenAndServe(host+":"+os.Getenv("PORT"), nil)
}
`;
const RS_SERVER = (answer) => `use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;

#[allow(unused_variables)]
fn answer(target: &str) -> (u16, String) {
${answer}
}

fn main() {
    let host = std::env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = std::env::var("PORT").expect("PORT");
    let listener = TcpListener::bind(format!("{host}:{port}")).expect("bind");
    for stream in listener.incoming() {
        let Ok(mut stream) = stream else { continue };
        let mut reader = BufReader::new(stream.try_clone().expect("clone"));
        let mut line = String::new();
        if reader.read_line(&mut line).is_err() { continue; }
        loop {
            let mut header = String::new();
            match reader.read_line(&mut header) {
                Ok(0) | Err(_) => break,
                Ok(_) if header == "\\r\\n" => break,
                Ok(_) => {}
            }
        }
        let (status, body) = answer(line.split(' ').nth(1).unwrap_or("/"));
        let _ = write!(stream, "HTTP/1.1 {status} X\\r\\ncontent-type: application/json\\r\\ncontent-length: {}\\r\\nconnection: close\\r\\n\\r\\n{body}", body.len());
    }
}
`;
const SERVICES = {
  python: {
    reference: PY_SERVER(`    url = urlparse(target)
    if url.path != "/add":
        return 404, ""
    query = parse_qs(url.query)
    try:
        return 200, json.dumps({"sum": int(query["a"][0], 10) + int(query["b"][0], 10)})
    except (KeyError, ValueError):
        return 400, json.dumps({"error": "not a number"})`),
    stub: PY_SERVER(`    return 501, ""`),
    overfit: PY_SERVER(`    return 200, json.dumps({"sum": 5})`),
    broken: `import os\ndef broken(:\n`,
  },
  go: {
    reference: GO_SERVER(`	if r.URL.Path != "/add" {
		return 404, ""
	}
	a, errA := strconv.Atoi(r.URL.Query().Get("a"))
	b, errB := strconv.Atoi(r.URL.Query().Get("b"))
	if errA != nil || errB != nil {
		return 400, \`{"error":"not a number"}\`
	}
	return 200, fmt.Sprintf(\`{"sum":%d}\`, a+b)`),
    stub: GO_SERVER(`	return 501, ""`),
    overfit: GO_SERVER(`	return 200, \`{"sum":5}\``),
    broken: `package main\n\nfunc main() {\n`,
  },
  rust: {
    reference: RS_SERVER(`    let (path, query) = target.split_once('?').unwrap_or((target, ""));
    if path != "/add" { return (404, String::new()); }
    let get = |key: &str| query.split('&').find_map(|pair| pair.strip_prefix(&format!("{key}="))).and_then(|v| v.parse::<i64>().ok());
    match (get("a"), get("b")) {
        (Some(a), Some(b)) => (200, format!("{{\\"sum\\":{}}}", a + b)),
        _ => (400, "{\\"error\\":\\"not a number\\"}".to_string()),
    }`),
    stub: RS_SERVER(`    (501, String::new())`),
    overfit: RS_SERVER(`    (200, "{\\"sum\\":5}".to_string())`),
    broken: `fn main() {\n`,
  },
};
const EXPECT = { reference: "passed", stub: "incomplete", overfit: "overfit", broken: "incomplete" };

const testFile = (head, ...tests) =>
  `import { test } from "node:test";\nimport assert from "node:assert/strict";\n${head}\n${tests.map(([name, body]) => `test(${JSON.stringify(name)}, async () => {\n${body}\n});`).join("\n")}\n`;
const CALL = `import { spawnSync } from "node:child_process";
const call = (...args: string[]) => {
  const [bin, ...argv] = JSON.parse(process.env.BOUNDARY_COMMAND ?? "[]");
  return spawnSync(bin, [...argv, ...args], { encoding: "utf8" });
};`;
const FETCH = `const add = (query: string) => fetch(new URL(\`/add?\${query}\`, process.env.BOUNDARY_URL));`;
const SUITES = {
  command: {
    public: testFile(CALL, ["[happy-1] adds two numbers", '  const run = call("2", "3");\n  assert.equal(run.status, 0);\n  assert.equal(run.stdout, "5\\n");']),
    private: testFile(
      CALL,
      ["[happy-1] adds other numbers", '  const run = call("40", "2");\n  assert.equal(run.status, 0);\n  assert.equal(run.stdout, "42\\n");'],
      ["[unhappy-1] a word is not a number", '  const run = call("two", "3");\n  assert.equal(run.status, 1);\n  assert.match(run.stderr, /not a number/);'],
    ),
  },
  service: {
    public: testFile(FETCH, ["[happy-1] adds two numbers", '  const res = await add("a=2&b=3");\n  assert.equal(res.status, 200);\n  assert.deepEqual(await res.json(), { sum: 5 });']),
    private: testFile(
      FETCH,
      ["[happy-1] adds other numbers", '  const res = await add("a=40&b=2");\n  assert.equal(res.status, 200);\n  assert.deepEqual(await res.json(), { sum: 42 });'],
      ["[unhappy-1] a word is not a number", '  const res = await add("a=two&b=3");\n  assert.equal(res.status, 400);'],
    ),
  },
};
const SPEC = (kind) =>
  `# Add\n\n\`\`\`gherkin\nFeature: Add\n  @happy\n  Scenario: Two numbers add up\n    ${kind === "command" ? 'When I run `add 2 3`\n    Then it prints "5" and a newline and exits 0' : 'When I GET /add?a=2&b=3\n    Then the answer is 200 {"sum": 5}'}\n  @unhappy\n  Scenario: A word is not a number\n    ${kind === "command" ? 'When I run `add two 3`\n    Then it exits 1 with "not a number" on stderr' : "When I GET /add?a=two&b=3\n    Then the answer is 400"}\n\`\`\`\n`;
/** Processes still running whose working directory is a judge tree of a fixture (`<slug>-*` under lib.mjs JUDGE_ROOT). */
function leftovers(slug) {
  const listed = spawnSync("lsof", ["-d", "cwd", "-Fpn"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).stdout ?? "";
  const found = new Set();
  let pid = null;
  for (const line of listed.split("\n")) {
    if (line.startsWith("p")) pid = line.slice(1);
    else if (line.startsWith("n") && line.includes(`${lib.JUDGE_ROOT}/${slug}-`)) found.add(pid);
  }
  return found.size;
}

function selftest() {
  const home = SELFTEST_HOME;
  const env = { DUEDILIGENCE_HOME: home };
  const checks = [];
  const check = (name, ok, detail = {}) => {
    checks.push({ name, ok, ...detail });
    log(`selftest: ${ok ? "ok  " : "WRONG"} ${name}`);
  };
  for (const language of LANGUAGES)
    for (const kind of ["command", "service"]) {
      const slug = `add-${kind}-${SUFFIX[language]}`;
      const spec = join(home, "specs", slug);
      const entry = NATIVE[language].entry[kind];
      const variants = (kind === "command" ? COMMANDS : SERVICES)[language];
      const write = (path, text) => {
        mkdirSync(dirname(join(spec, path)), { recursive: true });
        writeFileSync(join(spec, path), text);
      };
      const boundary =
        kind === "command"
          ? { language, command: RUN[language].command }
          : { language, service: { start: RUN[language].service, healthcheck: "/", readyTimeoutMs: 20_000 } };
      write("toolchain.json", `${JSON.stringify({ name: "exec", boundary })}\n`);
      write("spec.md", SPEC(kind));
      write(`skeleton/${entry}`, variants.stub);
      write(`reference/${entry}`, variants.reference);
      write("tests/public/add.test.ts", SUITES[kind].public);
      write("tests/private/add.test.ts", SUITES[kind].private);

      const calibrated = node("evidence/backends.mjs", ["calibrate", slug, "--force"], env);
      const calibration = readJson(join(spec, "calibration.json"), {});
      check(`${slug}: scripted calibration keeps both hidden tests`, calibrated.status === 0 && calibration.kept?.length === 2, {
        kept: calibration.kept?.length ?? 0,
        ...(calibrated.status === 0 ? {} : { stderr: calibrated.stderr.slice(-2000) }),
      });

      for (const [name, code] of Object.entries(variants)) {
        const src = join(home, "variants", slug, name, "src");
        mkdirSync(dirname(join(src, entry.replace(/^src\//, ""))), { recursive: true });
        writeFileSync(join(src, entry.replace(/^src\//, "")), code);
        const record = join(home, "judged.json");
        rmSync(record, { force: true });
        const started = Date.now();
        node("bin/judge.mjs", [slug, src, "--json", record], env);
        const result = readJson(record, {});
        const left = leftovers(slug);
        const compiles = name !== "broken";
        check(`${slug}: ${name} ${EXPECT[name]}${compiles ? "" : ", not compiled"}, nothing left running`, result.verdict === EXPECT[name] && result.compiled?.public === compiles && left === 0, {
          verdict: result.verdict ?? null,
          compiled: result.compiled ?? null,
          public: result.public,
          hidden: result.hidden,
          seconds: Math.round((Date.now() - started) / 100) / 10,
          leftover: left,
        });
      }

      // A session's tree: its own npm scripts build and run the suite, every brief renders.
      const tree = stage(workdir(`${slug}-tree`), slug, { skeleton: true, publicTests: true });
      const built = spawnSync("npm", ["run", "build"], { cwd: tree, encoding: "utf8" });
      const tested = spawnSync(kind === "command" ? "npm" : process.execPath, kind === "command" ? ["test"] : ["sandbox/boundary.mjs", "--", "npm", "test"], { cwd: tree, encoding: "utf8" });
      check(`${slug}: the tree's npm run build passes on the stub and npm test fails its test`, built.status === 0 && tested.status !== 0 && /not ok|fail/i.test(`${tested.stdout}${tested.stderr}`), {
        build: built.status,
        test: tested.status,
      });
      const outputs = listFiles(tree).filter((path) => !path.startsWith("node_modules/") && NATIVE[language].generated(path));
      check(`${slug}: what the build left (${outputs.length} file(s)) is never a change`, outputs.every((path) => emitted(path, {})), { outputs: outputs.slice(0, 5) });
      discard(tree);
    }
  // Every brief of each toolchain renders with no placeholder left and names the entry.
  const briefs = [];
  for (const language of LANGUAGES)
    for (const kind of ["command", "service"]) {
      const chain = { ...toolchainOf(`add-${kind}-${SUFFIX[language]}`) };
      for (const name of ["skeleton", "spec-from-ticket", "public-tests", "hidden-tests", "reference", "agent"]) {
        const text = prompt(name, chain);
        briefs.push({ language, kind, name, ok: !/\{\{|src\/(cli|server)\.ts|import type/.test(text) && (name === "spec-from-ticket" || text.includes(NATIVE[language].entry[kind])) });
      }
    }
  check("every brief renders, names its entry and no TypeScript contract", briefs.every((brief) => brief.ok), { wrong: briefs.filter((brief) => !brief.ok) });
  rmSync(home, { recursive: true, force: true });
  return { checks, wrong: checks.filter((item) => !item.ok).length };
}

// --- ports of the seams' specs ---------------------------------------------

const BASES = { "csv-export-http": "service", "patch-apply-cli": "command" };
const portSlug = (base, language) => `${base}-${SUFFIX[language]}`;
const PORT_HEADER = {
  "csv-export-http": "The contract: spec.md, and the TypeScript types of the JSON bodies in tests/public/contract.ts.",
  "patch-apply-cli": "The contract: spec.md, \"Interface: a command\", and the TypeScript types of each name's arguments and result in tests/public/boundary.ts.",
};
const comment = (language, text) => text.split("\n").map((line) => `${language === "python" ? "#" : "//"} ${line}`.trimEnd()).join("\n");
/** A stub in the language: the command exits 2, the service answers 501. */
function stubOf(language, kind, header) {
  const top = comment(language, header);
  if (kind === "command")
    return {
      python: `${top}\nimport sys\n\nsys.stderr.write("not implemented\\n")\nsys.exit(2)\n`,
      go: `${top}\npackage main\n\nimport (\n\t"fmt"\n\t"os"\n)\n\nfunc main() {\n\tfmt.Fprintln(os.Stderr, "not implemented")\n\tos.Exit(2)\n}\n`,
      rust: `${top}\nfn main() {\n    eprintln!("not implemented");\n    std::process::exit(2);\n}\n`,
    }[language];
  return {
    python: `${top}\nimport os\nfrom http.server import BaseHTTPRequestHandler, ThreadingHTTPServer\n\n\nclass Handler(BaseHTTPRequestHandler):\n    protocol_version = "HTTP/1.1"\n\n    def answer(self):\n        self.send_response(501)\n        self.send_header("content-length", "0")\n        self.end_headers()\n\n    do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = do_HEAD = do_OPTIONS = answer\n\n    def log_message(self, *_):\n        pass\n\n\nThreadingHTTPServer((os.environ.get("HOST", "127.0.0.1"), int(os.environ["PORT"])), Handler).serve_forever()\n`,
    go: `${top}\npackage main\n\nimport (\n\t"net/http"\n\t"os"\n)\n\nfunc main() {\n\thost := os.Getenv("HOST")\n\tif host == "" {\n\t\thost = "127.0.0.1"\n\t}\n\thttp.ListenAndServe(host+":"+os.Getenv("PORT"), http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {\n\t\tw.WriteHeader(http.StatusNotImplemented)\n\t}))\n}\n`,
    rust: `${top}\nuse std::io::{BufRead, BufReader, Read, Write};\nuse std::net::TcpListener;\n\nfn main() {\n    let host = std::env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string());\n    let port = std::env::var("PORT").expect("PORT");\n    let listener = TcpListener::bind(format!("{host}:{port}")).expect("bind");\n    for stream in listener.incoming() {\n        let Ok(mut stream) = stream else { continue };\n        let mut reader = BufReader::new(stream.try_clone().expect("clone"));\n        let mut length = 0;\n        loop {\n            let mut line = String::new();\n            match reader.read_line(&mut line) {\n                Ok(0) | Err(_) => break,\n                Ok(_) if line == "\\r\\n" => break,\n                Ok(_) => {\n                    if let Some((name, value)) = line.split_once(':') {\n                        if name.eq_ignore_ascii_case("content-length") {\n                            length = value.trim().parse().unwrap_or(0);\n                        }\n                    }\n                }\n            }\n        }\n        let mut body = vec![0; length];\n        let _ = reader.read_exact(&mut body);\n        let _ = stream.write_all(b"HTTP/1.1 501 Not Implemented\\r\\ncontent-length: 0\\r\\nconnection: close\\r\\n\\r\\n");\n    }\n}\n`,
  }[language];
}
/** The TypeScript contract's exported types alone, for the suites to import in place of src/server.ts. */
function contractTypes(server) {
  const lines = server.split("\n");
  const out = [];
  let keep = false;
  let pendingDoc = [];
  for (const line of lines) {
    if (/^\/\*\*/.test(line) || (pendingDoc.length > 0 && !keep && !/^export /.test(line) && !/^\s*$/.test(line))) {
      pendingDoc.push(line);
      if (!/\*\/\s*$/.test(line)) continue;
      continue;
    }
    if (/^export (type|interface) /.test(line)) {
      out.push(...pendingDoc, line);
      pendingDoc = [];
      keep = !/;\s*$/.test(line);
      if (!keep) out.push("");
      continue;
    }
    if (keep) {
      out.push(line);
      if (/^}/.test(line)) {
        keep = false;
        out.push("");
      }
      continue;
    }
    pendingDoc = [];
  }
  return `// The types of src/server.ts in the TypeScript spec (evidence/seams/specs/csv-export-http/),\n// moved here so the suites compile against a service in any language.\n${out.join("\n").trimEnd()}\n`;
}

function port() {
  const slugs = [];
  for (const [base, kind] of Object.entries(BASES))
    for (const language of LANGUAGES) {
      const slug = portSlug(base, language);
      const from = join(SEAMS, base);
      const to = specDir(slug);
      slugs.push(slug);
      if (existsSync(join(to, "calibration.json"))) {
        log(`${slug}: calibrated, left as it is`);
        continue;
      }
      rmSync(to, { recursive: true, force: true });
      mkdirSync(to, { recursive: true });
      const run = RUN[language][kind];
      let spec = readFileSync(join(from, "spec.md"), "utf8");
      if (base === "patch-apply-cli") {
        const before = spec;
        spec = spec
          .replace("`node src/cli.js <name>`", `\`${run.join(" ")} <name>\``)
          .replace("`src/index.ts` describes\neach name's arguments and result as TypeScript types", "`tests/public/boundary.ts` describes\neach name's arguments and result as TypeScript types");
        if (spec === before || spec.includes("src/index.ts") || spec.includes("node src/cli.js")) throw new Error(`${slug}: the interface paragraph did not change as expected`);
      }
      writeFileSync(join(to, "spec.md"), spec);
      const boundary = kind === "command" ? { language, command: run } : { language, service: { ...readJson(join(from, "toolchain.json")).boundary.service, start: run } };
      writeJson(join(to, "toolchain.json"), { name: "exec", boundary });
      for (const suite of ["public", "private"]) {
        copy(join(from, "tests", suite), join(to, "tests", suite));
        if (base !== "csv-export-http") continue;
        writeFileSync(join(to, "tests", suite, "contract.ts"), contractTypes(readFileSync(join(from, "skeleton", "src", "server.ts"), "utf8")));
        for (const file of readdirSync(join(to, "tests", suite)).filter((name) => name.endsWith(".test.ts"))) {
          const path = join(to, "tests", suite, file);
          const text = readFileSync(path, "utf8");
          writeFileSync(path, text.replaceAll('from "../../src/server.js"', 'from "./contract.js"'));
        }
      }
      const entry = NATIVE[language].entry[kind];
      mkdirSync(dirname(join(to, "skeleton", entry)), { recursive: true });
      writeFileSync(join(to, "skeleton", entry), stubOf(language, kind, PORT_HEADER[base]));
      writeJson(join(to, "imported.json"), {
        from: `evidence/seams/specs/${base}`,
        at: new Date().toISOString(),
        heldOut: false,
        why: `A port of the TypeScript spec to ${NATIVE[language].brief.language} by evidence/languages.mjs port: its suites are the TypeScript spec's, published with it.`,
        commitment: null,
        commitmentNote: "No prepared.json, so no hiddenSha256 was recorded before any submission; judge prints the hash it computes and checks nothing.",
      });
      log(`${slug}: ported (${kind}, ${language})`);
    }
  writeJson(join(OUT, "ports.json"), slugs);
}

// --- the git oracle on the patch-apply-cli ports --------------------------------

const ORACLE = join(ARCHIVE, "runs", "git-oracle");
const jsonLines = (path) =>
  readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

/** One case through a built tree's command: what the archive's git-oracle.mjs records, or how it failed. */
function runCase(dir, argv, item, hashFiles) {
  return new Promise((done) => {
    const child = spawn(argv[0], [...argv.slice(1), "applyPatch"], { cwd: dir, stdio: ["pipe", "pipe", "pipe"] });
    const out = [];
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 10_000);
    child.stdout.on("data", (chunk) => out.push(chunk));
    child.stderr.on("data", (chunk) => (err += chunk));
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify([item.files, item.diff]));
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (signal) return done({ id: item.id, timeout: true });
      if (code === 1) return done({ id: item.id, threw: err.slice(0, 120) });
      try {
        const result = JSON.parse(Buffer.concat(out).toString("utf8"));
        done(result && typeof result === "object" && result.files ? { id: item.id, ok: result.ok === true, hash: hashFiles(result.files) } : { id: item.id, bad: true });
      } catch {
        done({ id: item.id, bad: true, exit: code });
      }
    });
  });
}

/** Every oracle case through the command of `slug` built from `src`, sorted by case id; with `stopAfter`, it stops once that many cases time out. */
async function oracleRun(slug, src, limit, stopAfter = Infinity) {
  const { hashFiles } = await import(join(ARCHIVE, "bin", "git-oracle", "hash.mjs"));
  const dir = stage(workdir(`${slug}-oracle`), slug, { spec: false, src });
  const results = [];
  try {
    const built = spawnSync(process.execPath, ["sandbox/build.mjs"], { cwd: dir, encoding: "utf8" });
    if (built.status !== 0) throw new Error(`${slug}: ${src} does not build:\n${built.stderr}`);
    const argv = toolchainOf(slug).boundary.command;
    const running = new Set();
    for await (const line of createInterface({ input: createReadStream(join(ORACLE, "cases.jsonl")) })) {
      if (!line) continue;
      if (results.filter((result) => result.timeout).length >= stopAfter) break;
      const item = JSON.parse(line);
      while (running.size >= limit) await Promise.race(running);
      const job = runCase(dir, argv, item, hashFiles).then((result) => {
        results.push(result);
        running.delete(job);
      });
      running.add(job);
    }
    await Promise.all(running);
  } finally {
    discard(dir);
  }
  return results.sort((a, b) => a.id - b.id);
}

/**
 * The patch-apply-cli ports' mutants that both suites passed, each run on
 * the oracle corpus: one whose answer differs from the reference's on any
 * case is a real bug the suites missed; one that agrees on all 8,842 never
 * shows on real history, most likely an equivalent mutant.
 */
async function oracleSurvivors() {
  const limit = Number(options.concurrency ?? 4);
  const max = Number(options.max ?? 30);
  const out = {};
  for (const language of LANGUAGES) {
    const slug = portSlug("patch-apply-cli", language);
    const record = readJson(join(OUT, "mutants", `${slug}.json`), null);
    if (record === null) continue;
    const reference = join(specDir(slug), "reference", "src");
    const own = new Map(jsonLines(join(OUT, "oracle", `${slug}.jsonl`)).map((item) => [item.id, item]));
    // The sample is deterministic: mutants() chose these sites in this order.
    const chosen = spread(
      listFiles(reference)
        .filter((path) => /\.(py|go|rs)$/.test(path))
        .flatMap((path) => sitesOf(language, readFileSync(join(reference, path), "utf8")).map((site) => ({ path, site }))),
      record.sampled ?? max,
    );
    const rows = [];
    for (const [i, row] of record.rows.entries()) {
      if (row.notBuilt || row.public !== "survived" || row.hidden !== "survived") continue;
      const { path, site } = chosen[i];
      if (path !== row.path || site[3] !== row.label) throw new Error(`${slug}: mutant ${i} is ${path} ${site[3]}, recorded as ${row.path} ${row.label}`);
      const src = mkdtempSync(join(tmpdir(), `${slug}-survivor-`));
      try {
        copy(reference, src);
        const text = readFileSync(join(src, path), "utf8");
        writeFileSync(join(src, path), `${text.slice(0, site[0])}${site[2]}${text.slice(site[0] + site[1])}`);
        const results = await oracleRun(slug, src, limit, 5);
        const differing = results.filter((result) => {
          const theirs = own.get(result.id);
          return !(result.ok === theirs.ok && result.hash === theirs.hash && Boolean(result.threw) === Boolean(theirs.threw) && !result.timeout && !result.bad);
        });
        rows.push({ path, line: row.line, label: row.label, casesDiffering: differing.length, firstDiffering: differing.slice(0, 3).map((result) => result.id) });
        log(`oracle-survivors: ${slug} ${path}:${row.line} ${row.label}: ${differing.length} case(s) differ`);
      } finally {
        rmSync(src, { recursive: true, force: true });
      }
    }
    out[slug] = { survivors: rows.length, differOnRealHistory: rows.filter((row) => row.casesDiffering > 0).length, rows };
  }
  save("oracleSurvivors", out);
}

async function oracle() {
  const limit = Number(options.concurrency ?? 4);
  const git = new Map(jsonLines(join(ORACLE, "git.jsonl")).map((item) => [item.id, item]));
  const flags = new Map(jsonLines(join(ORACLE, "flags.jsonl")).map((item) => [item.id, item]));
  const typescript = new Map(jsonLines(join(HERE, "seams", "oracle", "reference-cli.jsonl")).map((item) => [item.id, item]));
  const what = (x) => (x === undefined ? "missing" : x.timeout ? "timeout" : x.threw ? "threw" : x.bad ? "bad" : x.ok ? "ok" : "rej");
  const sameResult = (a, b) => a && b && a.ok === b.ok && a.hash === b.hash && Boolean(a.threw) === Boolean(b.threw) && !a.timeout && !b.timeout && !a.bad && !b.bad;
  const out = {};
  for (const language of LANGUAGES) {
    const slug = portSlug("patch-apply-cli", language);
    if (readJson(join(specDir(slug), "calibration.json"), null)?.status !== "ok") {
      log(`oracle: ${slug} is not calibrated; skipped`);
      continue;
    }
    const started = Date.now();
    const results = await oracleRun(slug, join(specDir(slug), "reference", "src"), limit);
    const file = join(OUT, "oracle", `${slug}.jsonl`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${results.map((result) => JSON.stringify(result)).join("\n")}\n`);
    const byId = new Map(results.map((item) => [item.id, item]));
    const all = [...git.keys()];
    const judgedSet = all.filter((id) => !flags.get(id).outside && flags.get(id).unique);
    const agreeGit = (ids) => ids.filter((id) => { const mine = byId.get(id); const theirs = git.get(id); return mine && !mine.threw && !mine.timeout && !mine.bad && mine.ok === theirs.ok && mine.hash === theirs.hash; }).length;
    const differing = all.filter((id) => !sameResult(byId.get(id), typescript.get(id)));
    const kinds = {};
    for (const id of differing) {
      const key = `typescript:${what(typescript.get(id))} ${language}:${what(byId.get(id))}`;
      kinds[key] = (kinds[key] ?? 0) + 1;
    }
    out[slug] = {
      cases: results.length,
      gitJudgedSet: { agreed: agreeGit(judgedSet), of: judgedSet.length },
      gitAllCases: { agreed: agreeGit(all), of: all.length },
      sameAsTypeScriptCommand: { same: all.length - differing.length, of: all.length, differing: kinds, firstDiffering: differing.slice(0, 10) },
      minutes: Math.round((Date.now() - started) / 6000) / 10,
      file: `evidence/languages/oracle/${slug}.jsonl`,
    };
    log(`oracle: ${slug} ${JSON.stringify(out[slug])}`);
  }
  save("oracle", { concurrency: limit, ...out });
}

// --- mutants -------------------------------------------------------------------

// evidence/mutation.mjs reads TypeScript's syntax tree; here a mutant is one
// token of the reference changed by text, outside comments and strings: a
// comparison or logical operator flipped, a spaced binary + or - swapped,
// or an integer literal moved by one. Binary operators are matched only
// with a space on each side, as gofmt, rustfmt and black write them, so no
// sign, arrow or generic's angle bracket is taken for one. A mutant that
// no longer builds is left out, as mutation.mjs leaves it out; the rest
// are judged as a submission is.
const OPERATOR_SWAPS = { "<=": "<", ">=": ">", "==": "!=", "!=": "==", "&&": "||", "||": "&&", and: "or", or: "and", "<": "<=", ">": ">=", "+": "-", "-": "+" };
const COMMENT_AND_STRING = {
  python: /#[^\n]*|"""[\s\S]*?"""|'''[\s\S]*?'''|[rbf]*"(?:\\.|[^"\\\n])*"|[rbf]*'(?:\\.|[^'\\\n])*'/g,
  go: /\/\/[^\n]*|\/\*[\s\S]*?\*\/|`[^`]*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g,
  rust: /\/\/[^\n]*|\/\*[\s\S]*?\*\/|r#*"[\s\S]*?"#*|b?"(?:\\.|[^"\\])*"|b?'(?:\\.|[^'\\\n])'/g,
};
/** Every mutation site of `text`: [offset, length, replacement, label]. */
function sitesOf(language, text) {
  const masked = text.replace(COMMENT_AND_STRING[language], (match) => match.replace(/[^\n]/g, " "));
  const sites = [];
  const operators = language === "python" ? / (<=|>=|==|!=|<|>|\+|-|and|or) /g : / (<=|>=|==|!=|&&|\|\||<|>|\+|-) /g;
  for (const match of masked.matchAll(operators)) {
    const op = match[1];
    sites.push([match.index + 1, op.length, OPERATOR_SWAPS[op], `${op} -> ${OPERATOR_SWAPS[op]}`]);
  }
  for (const match of masked.matchAll(/(?<![\w.])\d+(?![\w.])/g)) {
    const value = BigInt(match[0]);
    sites.push([match.index, match[0].length, String(value + 1n), `${match[0]} -> ${value + 1n}`]);
    if (value > 0n) sites.push([match.index, match[0].length, String(value - 1n), `${match[0]} -> ${value - 1n}`]);
  }
  return sites.sort((a, b) => a[0] - b[0]);
}
/** Up to `max` items of `items`, evenly spaced, the same every time. */
const spread = (items, max) => (items.length <= max ? items : Array.from({ length: max }, (_, i) => items[Math.floor((i * items.length) / max)]));

async function mutants(slugs) {
  const max = Number(options.max ?? 40);
  const out = {};
  for (const slug of slugs) {
    const chain = toolchainOf(slug);
    const language = chain.name === "exec" ? chain.boundary.language : chain.name;
    const reference = join(specDir(slug), "reference", "src");
    const calibration = readJson(join(specDir(slug), "calibration.json"), null);
    if (calibration?.status !== "ok" || !existsSync(reference) || COMMENT_AND_STRING[language] === undefined) {
      log(`mutants: ${slug} is not a calibrated Python, Go or Rust spec; skipped`);
      continue;
    }
    const all = listFiles(reference)
      .filter((path) => /\.(py|go|rs)$/.test(path))
      .flatMap((path) => sitesOf(language, readFileSync(join(reference, path), "utf8")).map((site) => ({ path, site })));
    const chosen = spread(all, max);
    const rows = [];
    for (const [i, { path, site }] of chosen.entries()) {
      while (lib.freeMemoryPercent() < 40) await new Promise((done) => setTimeout(done, 5_000));
      const src = mkdtempSync(join(tmpdir(), `${slug}-mutant-`));
      try {
        copy(reference, src);
        const text = readFileSync(join(src, path), "utf8");
        const [at, length, replacement, label] = site;
        writeFileSync(join(src, path), `${text.slice(0, at)}${replacement}${text.slice(at + length)}`);
        const judged = judge(slug, src);
        const row = { path, line: text.slice(0, at).split("\n").length, label };
        if (!judged.public.compiled || !judged.hidden.compiled) row.notBuilt = true;
        else {
          const publicCount = count(judged.public, calibration.publicIds);
          const hiddenCount = count(judged.hidden, calibration.kept);
          row.public = publicCount.passed === publicCount.total ? "survived" : "killed";
          row.hidden = hiddenCount.passed === hiddenCount.total ? "survived" : "killed";
        }
        rows.push(row);
        log(`mutants: ${slug} ${i + 1}/${chosen.length} ${path}:${row.line} ${label} ${row.notBuilt ? "not built" : `public ${row.public}, hidden ${row.hidden}`}`);
      } finally {
        rmSync(src, { recursive: true, force: true });
      }
    }
    const built = rows.filter((row) => !row.notBuilt);
    out[slug] = {
      language,
      sites: all.length,
      sampled: chosen.length,
      built: built.length,
      killedByPublic: built.filter((row) => row.public === "killed").length,
      killedByHiddenOnly: built.filter((row) => row.public === "survived" && row.hidden === "killed").length,
      survivedBoth: built.filter((row) => row.public === "survived" && row.hidden === "survived").length,
      hiddenKills: built.filter((row) => row.hidden === "killed").length,
      survivors: built.filter((row) => row.hidden === "survived").map((row) => `${row.path}:${row.line} ${row.label}${row.public === "killed" ? " (the public suite killed it)" : ""}`),
    };
    writeJson(join(OUT, "mutants", `${slug}.json`), { ...out[slug], rows });
    log(`mutants: ${slug} ${JSON.stringify({ ...out[slug], survivors: out[slug].survivors.length })}`);
  }
  save("mutants", { ...(summary.mutants ?? {}), max, ...out });
}

// --- report -----------------------------------------------------------------

function report() {
  const results = existsSync(join(OUT, "results.jsonl")) ? jsonLines(join(OUT, "results.jsonl")) : [];
  const specs = {};
  for (const slug of ["duration-parse-go", "duration-parse-rs", ...readJson(join(OUT, "ports.json"), [])]) {
    const dir = specDir(slug);
    const calibration = readJson(join(dir, "calibration.json"), null);
    if (calibration === null) continue;
    const generation = readJson(join(dir, "generation.json"), {});
    const sessions = [...Object.values(generation).filter((step) => step && typeof step === "object" && "costUsd" in step), calibration.reference ?? {}];
    const runs = results.filter((row) => row.spec === slug);
    specs[slug] = {
      toolchain: readJson(join(dir, "toolchain.json"), {}),
      public: calibration.publicIds?.length ?? 0,
      hiddenKept: calibration.kept?.length ?? 0,
      hiddenWritten: calibration.hiddenWritten ?? null,
      dropped: (calibration.dropped ?? []).map((item) => item.id ?? item),
      publicFailingOnReference: calibration.publicFailingOnReference ?? [],
      sessionsUsd: Math.round(sessions.reduce((sum, step) => sum + (step.costUsd ?? 0), 0) * 100) / 100,
      runs: runs.map((row) => ({ run: row.run, variant: row.variant, verdict: row.verdict, public: row.public, hidden: row.hidden, failedScenarios: row.failedScenarios, refused: row.refused, peekAttempts: row.peekAttempts, costUsd: row.agent?.costUsd ?? null, minutes: row.agent?.minutes ?? null })),
    };
  }
  save("report", { specs });
  console.log(JSON.stringify(specs, null, 2));
}

if (command === "selftest") {
  const result = selftest();
  if (typeof options.json === "string") writeJson(options.json, result);
  save("selftest", result);
  log(result.wrong === 0 ? "selftest: every check passed" : `selftest: ${result.wrong} check(s) failed`);
  process.exit(result.wrong === 0 ? 0 : 1);
} else if (command === "port") {
  port();
} else if (command === "ports") {
  for (const slug of readJson(join(OUT, "ports.json"), [])) console.log(slug);
} else if (command === "oracle") {
  await oracle();
} else if (command === "oracle-survivors") {
  await oracleSurvivors();
} else if (command === "mutants") {
  await mutants(rest.length > 1 ? rest.slice(1) : ["duration-parse-go", "duration-parse-rs", ...readJson(join(OUT, "ports.json"), [])]);
} else if (command === "report") {
  report();
} else {
  console.error("usage: node evidence/languages.mjs selftest | port | ports | oracle | mutants | report");
  process.exit(1);
}
