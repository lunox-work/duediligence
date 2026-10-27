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
  throw new Error("not implemented");
}
