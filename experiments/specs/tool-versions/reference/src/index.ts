/** A file from a repository's root: its path and its text. */
export interface RepoFile {
  path: string;
  text: string;
}

/** A tool whose version can be pinned in `.tool-versions`. */
export type Tool = "nodejs" | "python" | "golang";

/** An exact version together with the file it was read from, such as ".nvmrc" or "package.json". */
export interface SourcedVersion {
  version: string;
  source: string;
}

/** A disagreement for one tool: the version chosen from the first source, and the differing exact versions ignored from later sources. */
export interface Conflict {
  tool: Tool;
  chosen: SourcedVersion;
  ignored: SourcedVersion[];
}

/** What was detected from a repository's root files. */
export interface ToolchainResult {
  /** The version each pinned tool is pinned to; a tool no source states exactly is not a key at all. */
  pins: Partial<Record<Tool, string>>;
  /** One entry per tool whose sources disagree. */
  conflicts: Conflict[];
  /** Paths of files that could not be read as their format, such as "package.json" that is not valid JSON. */
  unreadable: string[];
  /** The text of `.tool-versions`; the property is omitted when no tool is pinned. */
  toolVersions?: string;
}

const TOOLS: Tool[] = ["nodejs", "python", "golang"];

const EXACT_VERSION = /^\d+(?:\.\d+){0,2}$/;

function exact(value: unknown): string | undefined {
  return typeof value === "string" && EXACT_VERSION.test(value) ? value : undefined;
}

/** The first line that is not empty and does not start with "#", without surrounding whitespace. */
function versionFileValue(text: string): string | undefined {
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    return line;
  }
  return undefined;
}

function dropLeadingV(value: string | undefined): string | undefined {
  return value?.startsWith("v") ? value.slice(1) : value;
}

function field(obj: unknown, outer: string, inner: string): unknown {
  if (typeof obj !== "object" || obj === null) return undefined;
  const sub = (obj as Record<string, unknown>)[outer];
  if (typeof sub !== "object" || sub === null) return undefined;
  return (sub as Record<string, unknown>)[inner];
}

function pyprojectVersion(text: string): string | undefined {
  for (const raw of text.split("\n")) {
    const match = /^\s*requires-python\s*=\s*(["'])(.*)\1\s*$/.exec(raw.replace(/\r$/, ""));
    if (!match) continue;
    const value = match[2];
    return value.startsWith("==") ? exact(value.slice(2)) : undefined;
  }
  return undefined;
}

function goModVersions(text: string): { toolchain?: string; go?: string } {
  const result: { toolchain?: string; go?: string } = {};
  for (const raw of text.split("\n")) {
    const words = raw.trim().split(/\s+/);
    if (words.length !== 2) continue;
    const [directive, value] = words;
    if (directive === "toolchain" && result.toolchain === undefined && value.startsWith("go")) {
      result.toolchain = exact(value.slice(2));
    } else if (directive === "go" && result.go === undefined) {
      result.go = exact(value);
    }
  }
  return result;
}

/**
 * Detect the toolchain a repository declares from the files at its root
 * (paths containing "/" are ignored) and produce the `.tool-versions` text.
 */
export function detectToolchain(files: RepoFile[]): ToolchainResult {
  const root = new Map<string, string>();
  for (const file of files) {
    if (file.path.includes("/") || root.has(file.path)) continue;
    root.set(file.path, file.text);
  }

  const unreadable: string[] = [];
  const read = (path: string) => root.get(path);

  let packageJson: unknown;
  const packageText = read("package.json");
  if (packageText !== undefined) {
    try {
      packageJson = JSON.parse(packageText);
    } catch {
      unreadable.push("package.json");
    }
  }

  const versionFile = (path: string, stripV: boolean): string | undefined => {
    const text = read(path);
    if (text === undefined) return undefined;
    const value = versionFileValue(text);
    return exact(stripV ? dropLeadingV(value) : value);
  };

  const runtimeText = read("runtime.txt");
  const runtimeMatch = runtimeText === undefined ? null : /^python-(.*)$/.exec(runtimeText.trim());
  const pyprojectText = read("pyproject.toml");
  const goModText = read("go.mod");
  const goMod = goModText === undefined ? {} : goModVersions(goModText);

  // Each source's exact version, or undefined when it holds none, in the order tried.
  const sources: Record<Tool, [string, string | undefined][]> = {
    nodejs: [
      [".nvmrc", versionFile(".nvmrc", true)],
      [".node-version", versionFile(".node-version", true)],
      ["package.json", exact(field(packageJson, "volta", "node"))],
      ["package.json", exact(field(packageJson, "engines", "node"))],
    ],
    python: [
      [".python-version", versionFile(".python-version", false)],
      ["runtime.txt", runtimeMatch ? exact(runtimeMatch[1]) : undefined],
      ["pyproject.toml", pyprojectText === undefined ? undefined : pyprojectVersion(pyprojectText)],
    ],
    golang: [
      ["go.mod", goMod.toolchain],
      ["go.mod", goMod.go],
    ],
  };

  const pins: Partial<Record<Tool, string>> = {};
  const conflicts: Conflict[] = [];
  for (const tool of TOOLS) {
    const found: SourcedVersion[] = sources[tool]
      .filter((entry): entry is [string, string] => entry[1] !== undefined)
      .map(([source, version]) => ({ version, source }));
    if (found.length === 0) continue;
    const [chosen, ...rest] = found;
    pins[tool] = chosen.version;
    const ignored = rest.filter((s) => s.version !== chosen.version);
    if (ignored.length > 0) conflicts.push({ tool, chosen, ignored });
  }

  const result: ToolchainResult = { pins, conflicts, unreadable };
  const lines = TOOLS.filter((tool) => pins[tool] !== undefined).map((tool) => `${tool} ${pins[tool]}\n`);
  if (lines.length > 0) result.toolVersions = lines.join("");
  return result;
}
