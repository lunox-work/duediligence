/** A step's keyword as written in the file. */
export type StepKeyword = "Given" | "When" | "Then" | "And" | "But" | "*";

/** One step: its keyword as written, its text after the keyword and one space, and its line. */
export interface Step {
  keyword: StepKeyword;
  text: string;
  /** Line number, counting from 1. */
  line: number;
  /** The doc string's lines, with the indentation of the opening quotes removed from each; null if the step has none. */
  docString: string[] | null;
  /** The rows of lines starting with "|", each row's cells trimmed; null if the step has none. */
  table: string[][] | null;
}

/** One scenario: its name, its line, its tags and its steps in order. */
export interface Scenario {
  name: string;
  /** Line number of the "Scenario:" line, counting from 1. */
  line: number;
  /** Tags from the tag lines before this scenario, each as written (for example "@happy"). */
  tags: string[];
  steps: Step[];
}

/** A parsed feature file: the feature's name, its background and its scenarios in file order. */
export interface Feature {
  name: string;
  /** The background's steps, not copied into the scenarios; null if there is no "Background:". */
  background: Step[] | null;
  scenarios: Scenario[];
}

/** The error for a file that is not valid, naming the line where it goes wrong. */
export class ParseError extends Error {
  /** Line number where the file goes wrong, counting from 1. */
  declare readonly line: number;

  /** The message includes "line <n>". */
  constructor(message: string, line: number) {
    super(message);
    this.name = "ParseError";
    Object.defineProperty(this, "line", { value: line, enumerable: true });
  }
}

const STEP_KEYWORDS: readonly StepKeyword[] = ["Given", "When", "Then", "And", "But", "*"];

function fail(message: string, line: number): never {
  throw new ParseError(`${message} at line ${line}`, line);
}

function readStep(content: string, line: number): Step | null {
  for (const keyword of STEP_KEYWORDS) {
    if (content.startsWith(keyword + " ")) {
      return { keyword, text: content.slice(keyword.length + 1), line, docString: null, table: null };
    }
  }
  return null;
}

function readTableRow(content: string): string[] {
  const body = content.trimEnd();
  const inner = body.endsWith("|") && body.length > 1 ? body.slice(1, -1) : body.slice(1);
  return inner.split("|").map((cell) => cell.trim());
}

function stripIndent(raw: string, indent: string): string {
  if (raw.startsWith(indent)) return raw.slice(indent.length);
  let i = 0;
  while (i < indent.length && i < raw.length && (raw[i] === " " || raw[i] === "\t")) i++;
  return raw.slice(i);
}

/**
 * Parses the text of a feature file, whose lines end with "\n" or "\r\n".
 *
 * Throws a ParseError at the offending line when the file has no "Feature:"
 * line before any other content, has a second "Feature:" line, has a step
 * before any "Background:" or "Scenario:", has a line inside a scenario that
 * is none of the recognised forms, has a doc string that is never closed (at
 * the line that opened it), or uses "Scenario Outline:" (saying it is not
 * supported).
 */
export function parseFeature(text: string): Feature {
  const lines = text.split(/\r?\n/);
  let feature: Feature | null = null;
  // "description": after Feature:, before the first Background:, Scenario: or tag line.
  // "header": after the description, before any Background: or Scenario:.
  // "background" / "scenario": inside a block whose steps go to `steps`.
  let state: "start" | "description" | "header" | "background" | "scenario" = "start";
  let steps: Step[] = [];
  let lastStep: Step | null = null;
  let pendingTags: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = lines[i];
    const content = raw.replace(/^[ \t]+/, "");
    const trimmed = content.trimEnd();

    if (trimmed === "" || trimmed.startsWith("#")) continue;

    if (feature === null) {
      if (!trimmed.startsWith("Feature:")) fail('Expected a "Feature:" line before any other content', lineNo);
      feature = { name: trimmed.slice("Feature:".length).trim(), background: null, scenarios: [] };
      state = "description";
      continue;
    }

    if (trimmed.startsWith("Feature:")) fail('Unexpected second "Feature:" line', lineNo);
    if (trimmed.startsWith("Scenario Outline:")) fail('"Scenario Outline:" is not supported', lineNo);

    if (trimmed.startsWith("Scenario:")) {
      steps = [];
      lastStep = null;
      feature.scenarios.push({
        name: trimmed.slice("Scenario:".length).trim(),
        line: lineNo,
        tags: pendingTags,
        steps,
      });
      pendingTags = [];
      state = "scenario";
      continue;
    }

    if (trimmed.startsWith("Background:")) {
      if (state !== "description" && state !== "header") {
        fail('"Background:" must come before the first scenario, and only once', lineNo);
      }
      if (pendingTags.length > 0) fail('Tags cannot be placed on a "Background:"', lineNo);
      steps = [];
      lastStep = null;
      feature.background = steps;
      state = "background";
      continue;
    }

    if (trimmed.startsWith("@")) {
      pendingTags.push(...trimmed.split(/[ \t]+/).filter((tag) => tag !== ""));
      if (state === "description") state = "header";
      continue;
    }

    const step = readStep(content, lineNo);
    if (step !== null) {
      if (state !== "background" && state !== "scenario") {
        fail('Unexpected step before any "Background:" or "Scenario:"', lineNo);
      }
      if (pendingTags.length > 0) fail("Tags must be followed by a scenario", lineNo);
      steps.push(step);
      lastStep = step;
      continue;
    }

    if (state === "description") continue;

    if (trimmed === '"""') {
      if (lastStep === null || lastStep.docString !== null || lastStep.table !== null || pendingTags.length > 0) {
        fail("Unexpected doc string", lineNo);
      }
      const indent = raw.slice(0, raw.length - content.length);
      const docLines: string[] = [];
      let close = -1;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() === '"""') {
          close = j;
          break;
        }
        docLines.push(stripIndent(lines[j], indent));
      }
      if (close === -1) fail("Doc string is never closed", lineNo);
      lastStep.docString = docLines;
      i = close;
      continue;
    }

    if (trimmed.startsWith("|")) {
      if (lastStep === null || lastStep.docString !== null || pendingTags.length > 0) {
        fail("Unexpected table row", lineNo);
      }
      (lastStep.table ??= []).push(readTableRow(trimmed));
      continue;
    }

    fail(`Unexpected line "${trimmed}"`, lineNo);
  }

  if (feature === null) fail('Expected a "Feature:" line', 1);
  return feature;
}
