/** A ticket with a key, a title and a list of acceptance criteria, each a string. */
export interface Ticket {
  /** Uppercase letters and digits starting with a letter, a "-", then digits, such as "PAY-123". */
  key: string;
  title: string;
  criteria: string[];
}

/** The generated feature file: its path in the task's `.spec` folder and its text. */
export interface FeatureFile {
  /** ".spec/" followed by the key and ".feature". */
  path: string;
  text: string;
}

/**
 * Writes a ticket's acceptance criteria as a feature file, one scenario per
 * criterion, or a TODO feature when the ticket has no criteria.
 *
 * Throws an error naming the key when the key is not uppercase letters and
 * digits, a "-" and digits, or saying the title is empty when the title is
 * empty once cleaned.
 */
export function generateFeatureFile(ticket: Ticket): FeatureFile {
  if (!KEY_PATTERN.test(ticket.key)) {
    throw new Error(`Invalid ticket key "${ticket.key}": expected uppercase letters and digits starting with a letter, a "-", then digits`);
  }
  const title = collapseWhitespace(ticket.title);
  if (title === "") {
    throw new Error(`The title of ticket ${ticket.key} is empty`);
  }

  const path = `.spec/${ticket.key}.feature`;
  const criteria = ticket.criteria.map(cleanCriterion).filter((criterion) => criterion !== "");
  if (criteria.length === 0) {
    return { path, text: `Feature: ${title}\n\n  # TODO: ${ticket.key} has no acceptance criteria yet.\n` };
  }

  const seen = new Map<string, number>();
  let text = `Feature: ${title}\n`;
  for (const criterion of criteria) {
    const count = (seen.get(criterion) ?? 0) + 1;
    seen.set(criterion, count);
    const scenarioTitle = count === 1 ? criterion : `${criterion} (${count})`;
    text += `\n  Scenario: ${scenarioTitle}\n`;
    for (const step of toSteps(criterion)) text += `    ${step}\n`;
  }
  return { path, text };
}

const KEY_PATTERN = /^[A-Z][A-Z0-9]*-[0-9]+$/;
const LIST_MARKER = /^(?:[-*]|\d+[.)]|\[[ xX]\])(?: |$)/;
const KEYWORDS = new Map(["Given", "When", "Then", "And", "But"].map((k) => [k.toLowerCase(), k]));
const OPENING_KEYWORDS = new Set(["given", "when", "then"]);

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function cleanCriterion(criterion: string): string {
  return collapseWhitespace(collapseWhitespace(criterion).replace(LIST_MARKER, ""));
}

/** Splits a criterion written as steps at its keywords, or makes a plain criterion one Then step. */
function toSteps(criterion: string): string[] {
  const words = criterion.split(" ");
  if (!OPENING_KEYWORDS.has(words[0].toLowerCase())) {
    return [`Then ${lowercaseFirst(criterion, words[0])}`];
  }
  const steps: string[][] = [];
  for (const word of words) {
    const keyword = KEYWORDS.get(word.toLowerCase());
    if (keyword !== undefined) steps.push([keyword]);
    else steps[steps.length - 1].push(word);
  }
  return steps.map((step) => step.join(" "));
}

/** Lowercases the first character unless the first word is an acronym or contains a digit. */
function lowercaseFirst(criterion: string, firstWord: string): string {
  if (/^\p{Lu}{2,}$/u.test(firstWord) || /\p{Nd}/u.test(firstWord)) return criterion;
  const [first, ...rest] = criterion;
  return first.toLowerCase() + rest.join("");
}
