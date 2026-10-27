// What differs between macOS, Linux and Windows on the host, in one place,
// so the rest reads the same on all three:
//
// - relative paths (manifest keys, test ids, toolchain.json paths, the
//   paths a judge prints) always use "/", whatever the OS writes (`slash`);
// - a command line string goes through the OS shell (`shellSync`): sh on
//   macOS and Linux, cmd.exe on Windows, as npm runs a package's scripts;
// - a command found on PATH honours PATHEXT, and npm's `.cmd` shims run
//   through cmd.exe (`spawnCommand`), since Node refuses to spawn them
//   directly;
// - a process and everything it started is killed by its group on macOS
//   and Linux (it was spawned `detached`) and by `taskkill /T` on Windows,
//   where `detached` would open a console window instead (`GROUP`,
//   `killTree`);
// - a venv keeps its interpreter in bin/ or, on Windows, Scripts/.
//
// Claude Code's OS sandbox (and sandbox-exec, bwrap) exist on macOS and
// Linux only: on Windows the sessions run with the file tools' deny rules
// and the transcript audit, not an OS sandbox (`OS_SANDBOX`, lib.mjs
// `sessionSettings`, backends.mjs `placement`).

import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { delimiter, dirname, extname, isAbsolute, join, sep } from "node:path";

export const WINDOWS = process.platform === "win32";
/** Whether this OS has a sandbox the sessions run under: macOS and Linux. */
export const OS_SANDBOX = process.platform === "darwin" || process.platform === "linux";

/** A relative path with "/" between its parts, on every OS. */
export const slash = (path) => (sep === "/" ? path : path.split(sep).join("/"));
/** `path` is `folder` or inside it; both absolute paths of this OS. */
export const inside = (path, folder) =>
  path === folder || path.startsWith(folder.endsWith(sep) ? folder : `${folder}${sep}`);

/** The interpreter a venv holds, relative to the folder above `.venv`, with "/": `.venv/bin/python` or `.venv/Scripts/python.exe`. */
export const venvBin = (name, venv = ".venv") =>
  WINDOWS ? `${venv}/Scripts/${name}.exe` : `${venv}/bin/${name}`;
/** The folder of a venv's executables, by name: `bin` or `Scripts`. */
export const VENV_BIN_DIR = WINDOWS ? "Scripts" : "bin";
/** The Python that starts a venv: `python3` on macOS and Linux; on Windows `python` (`python3` there is often the Store's stub). */
export const DEFAULT_PYTHON = WINDOWS ? "python" : "python3";

/** The PATH key of an environment: Windows keeps it as `Path`, and two spellings in one environment are undefined. */
export const pathKey = (env) => Object.keys(env).find((key) => key.toUpperCase() === "PATH") ?? "PATH";
/** `env` with `dirs` first on its PATH. */
export function prependPath(env, dirs) {
  const key = pathKey(env);
  return { ...env, [key]: [...dirs, env[key]].filter(Boolean).join(delimiter) };
}

/**
 * The first `name` on PATH, or null: `command -v` on every OS. On Windows
 * each PATHEXT extension is tried, `.exe` and `.cmd` among them; a name
 * with a folder in it is only checked.
 */
export function which(name, env = process.env) {
  const exts = WINDOWS && extname(name) === "" ? (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean) : [""];
  const isFile = (path) => {
    try {
      return statSync(path).isFile();
    } catch {
      return false;
    }
  };
  if (isAbsolute(name) || name.includes("/") || name.includes(sep))
    return exts.map((ext) => `${name}${ext}`).find(isFile) ?? null;
  for (const dir of (env[pathKey(env)] ?? "").split(delimiter).filter(Boolean))
    for (const ext of exts) if (isFile(join(dir, `${name}${ext}`))) return join(dir, `${name}${ext}`);
  return null;
}

/** A command line string through the OS shell: sh on macOS and Linux, cmd.exe on Windows. */
export const shellSync = (command, options = {}) =>
  spawnSync(command, { windowsHide: true, ...options, shell: true });

/** An argument quoted for cmd.exe, when it needs it. */
const cmdQuote = (arg) => (/^[\w@.:/\\=,+-]+$/.test(arg) ? arg : `"${arg.replaceAll('"', '""')}"`);
/**
 * `[bin, argv, options]` to spawn `bin argv` with: unchanged on macOS and
 * Linux; on Windows `bin` found on the PATH of `env`, and npm's `.cmd`
 * shims (npx, npm, pnpm, corepack, node_modules/.bin/vitest) run through
 * cmd.exe with each argument quoted.
 */
export function commandOf(bin, argv, env = process.env) {
  if (!WINDOWS) return [bin, argv, {}];
  const found = which(bin, env);
  if (found === null || !/\.(cmd|bat)$/i.test(found)) return [found ?? bin, argv, { windowsHide: true }];
  return [[cmdQuote(found), ...argv.map(cmdQuote)].join(" "), [], { windowsHide: true, shell: true }];
}
/** `spawnSync(bin, argv, options)` through `commandOf`: npm's shims run on Windows too. */
export function spawnCommand(bin, argv, options = {}) {
  const [file, args, extra] = commandOf(bin, argv, options.env);
  return spawnSync(file, args, { ...options, ...extra });
}

/**
 * Spawn options for a process whose whole tree `killTree` takes down: a
 * process group leader on macOS and Linux; on Windows no console window,
 * and taskkill finds the tree by parent.
 */
export const GROUP = WINDOWS ? { windowsHide: true } : { detached: true };
/** Kills `pid` and everything it started (spawned with `GROUP`); quiet when it is gone. */
export function killTree(pid) {
  if (pid === undefined || pid === null) return;
  if (WINDOWS) {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {}
}

/**
 * Git for Windows' bash, which Claude Code's Bash tool runs on Windows:
 * CLAUDE_CODE_GIT_BASH_PATH, else bin/bash.exe beside the git on PATH.
 * Never System32's bash.exe, which starts WSL. Null when there is none.
 */
export function gitBash() {
  const given = process.env.CLAUDE_CODE_GIT_BASH_PATH;
  if (given && existsSync(given)) return given;
  const git = which("git");
  if (git === null) return null;
  // <Git>/cmd/git.exe or <Git>/bin/git.exe or <Git>/mingw64/bin/git.exe.
  for (let at = dirname(git); dirname(at) !== at; at = dirname(at)) {
    const bash = join(at, "bin", "bash.exe");
    if (existsSync(bash)) return bash;
  }
  return null;
}

/**
 * Text as the transcript audit compares it: on Windows "\" (and JSON's
 * "\\") as "/", Git Bash's `/c/` as `c:/`, and lower case, since a session
 * may name one path in any of those forms. Unchanged elsewhere.
 */
export const comparable = WINDOWS
  ? (text) =>
      text
        .replaceAll("\\\\", "/")
        .replaceAll("\\", "/")
        .replace(/(^|[\s"'=(:;])\/([a-z])\//gi, "$1$2:/")
        .toLowerCase()
  : (text) => text;
