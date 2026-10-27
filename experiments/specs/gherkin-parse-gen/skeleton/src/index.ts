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
    throw new Error("not implemented");
  }
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
  throw new Error("not implemented");
}
