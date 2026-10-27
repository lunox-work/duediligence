/** How a licence expression fares: permitted, copyleft, or impossible to tell. */
export type Verdict = "pass" | "copyleft" | "unknown";

type Node =
  | { kind: "licence"; id: string }
  | { kind: "and" | "or"; left: Node; right: Node };

const OPERATORS = new Set(["AND", "OR", "WITH"]);
const IDENTIFIER = /^(?:DocumentRef-[A-Za-z0-9.-]+:)?[A-Za-z0-9.-]+\+?$/;

/** Splits an expression into parentheses and words; null when a word holds characters SPDX does not allow. */
function tokenize(expression: string): string[] | null {
  const tokens = expression.replace(/[()]/g, " $& ").trim().split(/\s+/).filter((token) => token !== "");
  for (const token of tokens) {
    if (token !== "(" && token !== ")" && !OPERATORS.has(token) && !IDENTIFIER.test(token)) return null;
  }
  return tokens;
}

/**
 * Parses an SPDX expression, where WITH binds tightest, then AND, then OR, and parentheses group.
 * Returns null when the expression does not parse.
 */
function parse(expression: string): Node | null {
  const tokens = tokenize(expression);
  if (tokens === null || tokens.length === 0) return null;
  let position = 0;

  const isIdentifier = (token: string | undefined): token is string =>
    token !== undefined && token !== "(" && token !== ")" && !OPERATORS.has(token);

  function parseOr(): Node | null {
    let left = parseAnd();
    while (left !== null && tokens![position] === "OR") {
      position++;
      const right = parseAnd();
      if (right === null) return null;
      left = { kind: "or", left, right };
    }
    return left;
  }

  function parseAnd(): Node | null {
    let left = parsePrimary();
    while (left !== null && tokens![position] === "AND") {
      position++;
      const right = parsePrimary();
      if (right === null) return null;
      left = { kind: "and", left, right };
    }
    return left;
  }

  function parsePrimary(): Node | null {
    const token = tokens![position];
    if (token === "(") {
      position++;
      const inner = parseOr();
      if (inner === null || tokens![position] !== ")") return null;
      position++;
      return inner;
    }
    if (!isIdentifier(token)) return null;
    position++;
    if (tokens![position] === "WITH") {
      position++;
      if (!isIdentifier(tokens![position])) return null;
      position++;
    }
    return { kind: "licence", id: token };
  }

  const tree = parseOr();
  return tree !== null && position === tokens.length ? tree : null;
}

/** Judges one licence identifier; an exception attached with WITH does not change it. */
function judgeIdentifier(id: string): Verdict {
  const lower = id.toLowerCase();
  if (lower === "unlicensed" || id.includes("LicenseRef-")) return "unknown";
  if (lower.startsWith("gpl") || lower.startsWith("agpl")) return "copyleft";
  return "pass";
}

/** OR passes when any alternative passes; AND is copyleft when any part is copyleft. */
function judgeNode(node: Node): Verdict {
  if (node.kind === "licence") return judgeIdentifier(node.id);
  const left = judgeNode(node.left);
  const right = judgeNode(node.right);
  if (node.kind === "or") {
    if (left === "pass" || right === "pass") return "pass";
    if (left === "unknown" || right === "unknown") return "unknown";
    return "copyleft";
  }
  if (left === "copyleft" || right === "copyleft") return "copyleft";
  if (left === "unknown" || right === "unknown") return "unknown";
  return "pass";
}

/** Judges a licence expression, which is unknown when it is empty, a "SEE LICENSE IN" note, or does not parse. */
export function judgeExpression(expression: string): Verdict {
  if (/^SEE LICEN[SC]E IN\b/i.test(expression.trim())) return "unknown";
  const tree = parse(expression);
  return tree === null ? "unknown" : judgeNode(tree);
}
