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

const OPERATORS = new Set(["eq", "neq", "in", "absent"]);

function validate(rule: AccessRule): void {
  if (rule.effect !== "allow" && rule.effect !== "deny") {
    throw new Error(`rule ${rule.id}: unknown effect "${rule.effect}"`);
  }
  for (const condition of rule.conditions) {
    if (!OPERATORS.has(condition.operator)) {
      throw new Error(
        `rule ${rule.id}: unknown condition operator "${condition.operator}"`,
      );
    }
  }
}

function matchesSubject(pattern: string, request: AccessRequest): boolean {
  if (pattern === "*") return true;
  if (pattern.startsWith("role:")) {
    return request.roles.includes(pattern.slice("role:".length));
  }
  return pattern === request.subject;
}

function matchesAction(pattern: string, action: string): boolean {
  if (pattern.endsWith("*")) return action.startsWith(pattern.slice(0, -1));
  return pattern === action;
}

function matchesSegments(
  pattern: readonly string[],
  p: number,
  segments: readonly string[],
  s: number,
): boolean {
  if (p === pattern.length) return s === segments.length;
  if (pattern[p] === "**") {
    for (let i = s; i <= segments.length; i++) {
      if (matchesSegments(pattern, p + 1, segments, i)) return true;
    }
    return false;
  }
  if (s === segments.length) return false;
  if (pattern[p] !== "*" && pattern[p] !== segments[s]) return false;
  return matchesSegments(pattern, p + 1, segments, s + 1);
}

function matchesResource(pattern: string, resource: string): boolean {
  return matchesSegments(pattern.split("/"), 0, resource.split("/"), 0);
}

function holds(
  condition: Condition,
  attributes: Readonly<Record<string, string>>,
): boolean {
  const present = Object.prototype.hasOwnProperty.call(
    attributes,
    condition.attribute,
  );
  if (condition.operator === "absent") return !present;
  if (!present) return false;
  const actual = attributes[condition.attribute];
  switch (condition.operator) {
    case "eq":
      return actual === condition.value;
    case "neq":
      return actual !== condition.value;
    case "in":
      return Array.isArray(condition.value) && condition.value.includes(actual);
    default:
      return false;
  }
}

function matches(rule: AccessRule, request: AccessRequest): boolean {
  return (
    matchesSubject(rule.subject, request) &&
    matchesAction(rule.action, request.action) &&
    matchesResource(rule.resource, request.resource) &&
    rule.conditions.every((c) => holds(c, request.attributes))
  );
}

/** The number of segments in a resource pattern that are neither "*" nor "**". */
function specificity(resource: string): number {
  return resource.split("/").filter((s) => s !== "*" && s !== "**").length;
}

/**
 * Evaluates a request against a list of access rules. The most specific
 * matching rule decides, where specificity is the number of literal segments
 * in the resource pattern; among equally specific matching rules, deny beats
 * allow, and among those of the deciding effect, the first in the list
 * decides. Nothing is allowed that no rule allows.
 *
 * Throws an Error whose message names the rule's id if any rule in the list
 * has a condition operator that is not one of the four, or an effect that is
 * neither "allow" nor "deny".
 */
export function evaluate(
  rules: readonly AccessRule[],
  request: AccessRequest,
): Decision {
  rules.forEach(validate);
  let best: AccessRule | null = null;
  let bestSpecificity = -1;
  for (const rule of rules) {
    if (!matches(rule, request)) continue;
    const s = specificity(rule.resource);
    if (
      s > bestSpecificity ||
      (s === bestSpecificity && rule.effect === "deny" && best!.effect === "allow")
    ) {
      best = rule;
      bestSpecificity = s;
    }
  }
  if (best === null) return { effect: "deny", ruleId: null };
  return { effect: best.effect as Effect, ruleId: best.id };
}
