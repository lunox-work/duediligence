/** The effect of a rule or a decision: "allow" or "deny". */
export type Effect = "allow" | "deny";

/**
 * A condition on the request: names an attribute, an operator "eq", "neq",
 * "in" or "absent", and a value, or a list of values for "in". The operator
 * is typed as a string because a rule with any other operator is refused.
 */
export interface Condition {
  attribute: string;
  operator: string;
  value?: string | readonly string[];
}

/**
 * An access rule: an id, an effect "allow" or "deny", a subject pattern, an
 * action pattern, a resource pattern, and a list of conditions. The effect
 * is typed as a string because a rule with any other effect is refused.
 *
 * - subject: a subject id, or "role:" followed by a role name, or "*".
 * - action: an exact action, or a prefix ending in "*" that matches any
 *   action starting with the prefix, or "*" alone.
 * - resource: segments joined by "/", where a segment "*" matches exactly
 *   one segment and "**" matches any number of segments, including none.
 */
export interface AccessRule {
  id: string;
  effect: string;
  subject: string;
  action: string;
  resource: string;
  conditions: readonly Condition[];
}

/**
 * A request: a subject id, a list of roles, an action, a resource (segments
 * joined by "/"), and attributes: a map of string names to string values.
 */
export interface AccessRequest {
  subject: string;
  roles: readonly string[];
  action: string;
  resource: string;
  attributes: Readonly<Record<string, string>>;
}

/**
 * A decision: the effect, and the id of the rule that decided it, or null
 * when no rule matched.
 */
export interface Decision {
  effect: Effect;
  ruleId: string | null;
}

/**
 * Evaluates a request against a list of access rules. Deny beats allow, and
 * nothing is allowed that no rule allows; among matching rules of the
 * deciding effect, the first in the list decides.
 *
 * Throws an Error whose message names the rule's id if any rule in the list
 * has a condition operator that is not one of the four, or an effect that is
 * neither "allow" nor "deny".
 */
export function evaluate(
  rules: readonly AccessRule[],
  request: AccessRequest,
): Decision {
  throw new Error("not implemented");
}
