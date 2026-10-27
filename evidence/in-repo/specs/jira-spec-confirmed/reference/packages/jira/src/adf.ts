/**
 * Atlassian Document Format to plain text.
 *
 * REST API v3 sends an issue's `description` as an ADF tree; older endpoints
 * send a plain string. Both become one string of text here, with Markdown-like
 * markers kept for headings, lists, task items, code blocks, blockquotes and
 * tables so the structure survives the flattening.
 *
 * Everything is defensive, like `mapping.ts`: the tree is whatever Jira (or a
 * project's apps) put there, so a member of the wrong type is ignored rather
 * than thrown on, and content nested deeper than `MAX_DEPTH` is dropped. The
 * depth cap also bounds the recursion, so a hostile 100,000-level tree cannot
 * overflow the stack.
 */

/** Content more than this many levels below the root is dropped. */
const MAX_DEPTH = 50;

/** Descriptions longer than this are cut, and marked as cut. */
const MAX_LENGTH = 20_000;

/** An ADF node: any non-null object, read through `type`, `text`, `attrs` and `content`. */
type AdfNode = Readonly<Record<string, unknown>>;

function isNode(value: unknown): value is AdfNode {
  return typeof value === "object" && value !== null;
}

function typeOf(node: AdfNode): string | undefined {
  return typeof node["type"] === "string" ? node["type"] : undefined;
}

function textOf(node: AdfNode): string | undefined {
  return typeof node["text"] === "string" ? node["text"] : undefined;
}

/** The node's `attrs` member, or `undefined` when it is missing or malformed. */
function attr(node: AdfNode, name: string): unknown {
  const attrs = node["attrs"];
  return isNode(attrs) ? attrs[name] : undefined;
}

function stringAttr(node: AdfNode, name: string): string | undefined {
  const value = attr(node, name);
  return typeof value === "string" ? value : undefined;
}

function numberAttr(node: AdfNode, name: string): number | undefined {
  const value = attr(node, name);
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : undefined;
}

/** The node's `content` items that are themselves nodes; non-nodes are skipped. */
function children(node: AdfNode): AdfNode[] {
  const content = node["content"];
  return Array.isArray(content) ? content.filter(isNode) : [];
}

/** The blocks of every child of `node`, which sits at `depth`. */
function childBlocks(node: AdfNode, depth: number): string[] {
  return children(node).flatMap((child) => blocks(child, depth + 1));
}

/** The inline text of every child of `node`, which sits at `depth`, with no separator. */
function childInline(node: AdfNode, depth: number): string {
  return children(node)
    .map((child) => inline(child, depth + 1))
    .join("");
}

/**
 * The blocks a node at `depth` contributes. Blocks are not trimmed or filtered
 * here: that happens once, on the document's final list, so a container keeps
 * its markers even when what it contains is empty or was cut off by depth.
 */
function blocks(node: AdfNode, depth: number): string[] {
  if (depth > MAX_DEPTH) {
    return [];
  }
  switch (typeOf(node)) {
    case "paragraph":
      return [childInline(node, depth)];
    case "heading": {
      const text = childInline(node, depth);
      if (text === "") {
        return [];
      }
      const level = Math.min(6, Math.max(1, numberAttr(node, "level") ?? 1));
      return [`${"#".repeat(level)} ${text}`];
    }
    case "codeBlock":
      return [
        `\`\`\`${stringAttr(node, "language") ?? ""}\n${childInline(node, depth)}\n\`\`\``,
      ];
    case "blockquote":
      return [
        childBlocks(node, depth)
          .map((block) => `> ${block}`)
          .join("\n"),
      ];
    case "bulletList":
      return listBlocks(node, depth, () => "- ");
    case "orderedList": {
      const order = numberAttr(node, "order") ?? 1;
      return listBlocks(node, depth, (index) => `${order + index}. `);
    }
    case "taskList":
      return depth + 1 > MAX_DEPTH
        ? []
        : children(node).map(
            (item) =>
              `${attr(item, "state") === "DONE" ? "- [x] " : "- [ ] "}${childInline(item, depth + 1)}`,
          );
    case "table":
      return depth + 1 > MAX_DEPTH
        ? []
        : children(node).map((row) => tableRow(row, depth + 1));
    case "rule":
      return ["---"];
    case "mediaSingle":
    case "mediaGroup": {
      const count = children(node).length;
      return [count === 1 ? "[media]" : `[media x${count}]`];
    }
    default: {
      const text = textOf(node);
      return text !== undefined && text !== ""
        ? [text]
        : childBlocks(node, depth);
    }
  }
}

/**
 * Each item's blocks, the first behind the item's marker and the rest indented
 * under it, so a nested list lines up beneath its parent item.
 */
function listBlocks(
  list: AdfNode,
  depth: number,
  marker: (index: number) => string,
): string[] {
  // No depth check of its own: an item adds only markers to its children's
  // blocks, and `blocks` already drops those when they are too deep.
  return children(list).flatMap((item, index) =>
    childBlocks(item, depth + 1).map((block, position) =>
      position === 0 ? `${marker(index)}${block}` : `  ${block}`,
    ),
  );
}

/** One table row, at `depth`, as `| a | b |`. */
function tableRow(row: AdfNode, depth: number): string {
  const cells =
    depth + 1 > MAX_DEPTH
      ? []
      : children(row).map((cell) => childBlocks(cell, depth + 1).join(" ").trim());
  return `| ${cells.join(" | ")} |`;
}

/** The inline text of a node at `depth`. Marks and other members are ignored. */
function inline(node: AdfNode, depth: number): string {
  if (depth > MAX_DEPTH) {
    return "";
  }
  switch (typeOf(node)) {
    case "text":
      return textOf(node) ?? childInline(node, depth);
    case "hardBreak":
      return "\n";
    case "mention":
      return stringAttr(node, "text") ?? "@unknown";
    case "emoji":
      // `attrs.text` is the rendered glyph and absent on custom emoji;
      // `shortName` is always there and reads the same everywhere.
      return stringAttr(node, "shortName") ?? "";
    case "inlineCard":
    case "blockCard":
      return stringAttr(node, "url") ?? "";
    case "date":
      return stringAttr(node, "timestamp") ?? "";
    default:
      return childInline(node, depth);
  }
}

/** Cuts text past `MAX_LENGTH`, saying so, so a spec never silently loses its end. */
function capLength(text: string): string {
  return text.length > MAX_LENGTH
    ? `${text.slice(0, MAX_LENGTH)}\n[truncated]`
    : text;
}

/**
 * An issue description as plain text.
 *
 * A string, as older endpoints send it, has every run of non-newline
 * whitespace collapsed to one space and is trimmed. An ADF node is flattened to
 * blocks joined with a blank line, each with its trailing whitespace removed
 * and the empty ones dropped. Anything else is `""`. Either way the result is
 * capped at 20,000 characters.
 */
export function adfToText(document: unknown): string {
  if (typeof document === "string") {
    // A single character class with no nested repetition: linear, nothing to
    // backtrack over.
    return capLength(document.replace(/[^\S\n]+/g, " ").trim());
  }
  if (!isNode(document)) {
    return "";
  }
  return capLength(
    blocks(document, 0)
      .map((block) => block.trimEnd())
      .filter((block) => block !== "")
      .join("\n\n"),
  );
}
