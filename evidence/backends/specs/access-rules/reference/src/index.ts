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
  for (const rule of rules) validate(rule);

  let firstAllow: AccessRule | null = null;
  for (const rule of rules) {
    if (!matches(rule, request)) continue;
    if (rule.effect === "deny") return { effect: "deny", ruleId: rule.id };
    if (firstAllow === null) firstAllow = rule;
  }
  if (firstAllow !== null) return { effect: "allow", ruleId: firstAllow.id };
  return { effect: "deny", ruleId: null };
}

const OPERATORS: readonly string[] = ["eq", "neq", "in", "absent"];

function validate(rule: AccessRule): void {
  if (rule.effect !== "allow" && rule.effect !== "deny") {
    throw new Error(`rule ${rule.id} has an unknown effect: ${JSON.stringify(rule.effect)}`);
  }
  for (const condition of rule.conditions) {
    if (!OPERATORS.includes(condition.operator)) {
      throw new Error(
        `rule ${rule.id} has an unknown condition operator: ${JSON.stringify(condition.operator)}`,
      );
    }
  }
}

function matches(rule: AccessRule, request: AccessRequest): boolean {
  return (
    subjectMatches(rule.subject, request) &&
    actionMatches(rule.action, request.action) &&
    resourceMatches(rule.resource, request.resource) &&
    rule.conditions.every((condition) => conditionHolds(condition, request.attributes))
  );
}

function subjectMatches(pattern: string, request: AccessRequest): boolean {
  if (pattern === "*") return true;
  if (pattern.startsWith("role:")) return request.roles.includes(pattern.slice("role:".length));
  return pattern === request.subject;
}

function actionMatches(pattern: string, action: string): boolean {
  if (pattern.endsWith("*")) return action.startsWith(pattern.slice(0, -1));
  return pattern === action;
}

function resourceMatches(pattern: string, resource: string): boolean {
  const pat = pattern.split("/");
  const res = resource.split("/");
  // reachable[j]: the pattern segments consumed so far can match res[0..j).
  let reachable: boolean[] = new Array<boolean>(res.length + 1).fill(false);
  reachable[0] = true;
  for (const segment of pat) {
    const next: boolean[] = new Array<boolean>(res.length + 1).fill(false);
    if (segment === "**") {
      let any = false;
      for (let j = 0; j <= res.length; j++) {
        any = any || reachable[j];
        next[j] = any;
      }
    } else {
      for (let j = 0; j < res.length; j++) {
        if (reachable[j] && (segment === "*" || segment === res[j])) next[j + 1] = true;
      }
    }
    reachable = next;
  }
  return reachable[res.length];
}

function conditionHolds(
  condition: Condition,
  attributes: Readonly<Record<string, string>>,
): boolean {
  const present = Object.hasOwn(attributes, condition.attribute);
  if (condition.operator === "absent") return !present;
  if (!present) return false;
  const actual = attributes[condition.attribute];
  const { value } = condition;
  switch (condition.operator) {
    case "eq":
      return typeof value === "string" && actual === value;
    case "neq":
      return typeof value === "string" && actual !== value;
    case "in":
      return Array.isArray(value) && value.includes(actual);
    default:
      return false;
  }
}
