#!/usr/bin/env node
// The gate between a spec and its tests (SKILL.md, step 2). A spec drafted
// from a ticket decides what the ticket leaves open, and those decisions
// are what the hidden suite will hold the agent to, so bin/prepare.mjs
// generates no suite from a spec.md a person has not confirmed. A
// confirmation is specs/<slug>/confirmed.json: the hash of spec.md, who
// confirmed it, and the `Decided:` items they were shown. Any later edit to
// spec.md voids it. On a repository target (toolchain.json, bin/repo.mjs)
// the seam and the allowed paths are decisions too, and a black-box
// boundary (toolchain.json `boundary`): the hash covers them, they are
// listed with the `Decided:` items, and changing any voids it.
//
//   node bin/confirm.mjs <slug>                 each decision with its context; starts the clock
//   node bin/confirm.mjs <slug> --by <name>     record that <name> confirmed spec.md as it stands
//   node bin/confirm.mjs <slug> --export <file> decisions.md for review in a pull request (`-`: stdout)
//   node bin/confirm.mjs <slug> --from <github issue url | owner/repo#n | jira key | jira url> [--comments] [--body <file>|-] [--force]
//                                               write specs/<slug>/ticket.md from the issue
//
// Beside each decision: the ticket sentence it answers, the conventional
// alternative and the scenarios that depend on it (bin/decisions.mjs says
// where each comes from). Person minutes: the first listing of a spec that
// is not confirmed writes confirming.json { startedAt, drafted }; --by
// records `startedAt`, `at`, `minutes` and `changes` (the decisions edited,
// added or removed since that listing) in confirmed.json, so the drafted
// and the confirmed decisions stay paired. --started <iso> overrides the
// start. Delete confirming.json to restart the clock.
//
// --from: a GitHub issue through `gh issue view` (title, body, state,
// labels); a Jira issue through the REST API with JIRA_BASE_URL (or the
// issue URL's site), JIRA_EMAIL and JIRA_API_TOKEN. Without those, fetch it
// another way (in Claude Code, the Atlassian MCP's getJiraIssue) and pass
// its text with --body: the file is written as given under the source line.
// --comments adds the issue's comments: anyone can write one, so they are
// left out unless asked for. ticket.md is never overwritten without --force.
//
// Exit 0 confirmed (or written), 3 not confirmed, 1 no such spec or an error.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { closestSentence, decisionItems, decisions, dependentScenarios, diffDecisions, scenarios, ticketSentences } from "./decisions.mjs";
import { args, readJson, sha256, specDir, writeJson } from "./lib.mjs";

export { decisions };

/** A repository target's scope decisions from toolchain.json, or null for the bundled template. */
function scopeOf(slug) {
  const config = readJson(join(specDir(slug), "toolchain.json"), {});
  if (config.name !== "repo") return null;
  // A black-box seam's boundary is a decision too; only a spec that has one hashes it, so older confirmations hold.
  return { seam: config.seam ?? [], allowedPaths: config.allowedPaths ?? [], ...(config.boundary ? { boundary: config.boundary } : {}) };
}
/** The scope decisions as `Decided:` lines. */
const scopeLines = (scope) =>
  scope === null
    ? []
    : [
        `Seam (the files the stub writes): ${scope.seam.join(", ") || "none"}`,
        `Allowed paths (what the implementer may change): ${scope.allowedPaths.join(", ")}`,
        ...(scope.boundary ? [`Boundary (what both suites call, never an import): ${JSON.stringify(scope.boundary)}`] : []),
      ];

/**
 * What a confirmation covers: spec.md's hash, and on a repository target
 * the hash of that with the scope decisions.
 */
function hashes(slug) {
  const specHash = sha256(readFileSync(join(specDir(slug), "spec.md")));
  const scope = scopeOf(slug);
  return { specHash, scope, hash: scope === null ? specHash : sha256(JSON.stringify({ spec: specHash, ...scope })) };
}

/** Whether specs/<slug>/spec.md as it stands is the one a person confirmed, and if not, why. */
export function confirmation(slug) {
  const specPath = join(specDir(slug), "spec.md");
  if (!existsSync(specPath)) return { ok: false, reason: `no ${specPath}` };
  const { specHash, scope, hash } = hashes(slug);
  const record = readJson(join(specDir(slug), "confirmed.json"), null);
  if (record === null)
    return { ok: false, hash, specHash, reason: `spec.md ${scope === null ? "has" : "and its scope have"} never been confirmed` };
  if (record.sha256 !== hash)
    return {
      ok: false,
      hash,
      specHash,
      reason: `spec.md ${scope === null ? "" : "or its scope "}changed after ${record.by} confirmed it on ${record.at}`,
    };
  return { ok: true, hash, specHash, record };
}

/** Each decision with what the person needs beside it: { text, ticket, instead, scenarios }. */
export function decisionContext(slug) {
  const dir = specDir(slug);
  const spec = readFileSync(join(dir, "spec.md"), "utf8");
  const ticketPath = join(dir, "ticket.md");
  const sentences = existsSync(ticketPath) ? ticketSentences(readFileSync(ticketPath, "utf8")) : null;
  const all = scenarios(spec);
  const items = [...decisionItems(spec), ...scopeLines(scopeOf(slug)).map((text) => ({ text, scope: true }))];
  return items.map((item) => ({
    text: item.text,
    ticket: item.ticket ?? (sentences === null || item.scope ? null : (closestSentence(item.text, sentences) ?? "silent")),
    ticketGiven: item.ticket !== undefined,
    instead: item.instead ?? null,
    scenarios: item.scope ? [] : dependentScenarios(item, all).map(({ key, title }) => ({ key, title })),
  }));
}

const isSilent = (sentence) => /^silent\.?$/i.test(sentence);
const quote = (sentence) => (isSilent(sentence) ? "silent: decided here" : `"${sentence.replace(/^"|"$/g, "")}"`);
const guessed = (item) => (item.ticketGiven || isSilent(item.ticket) ? "" : " (closest sentence)");
const ticketSource = (slug) =>
  existsSync(join(specDir(slug), "ticket.md"))
    ? (readFileSync(join(specDir(slug), "ticket.md"), "utf8").match(/^Source: (.+)$/m)?.[1] ?? null)
    : null;

/** The decisions as the terminal shows them. */
function listing(context) {
  return context
    .map((item, i) =>
      [
        `${i + 1}. ${item.text}`,
        ...(item.ticket === null ? [] : [`   ticket:    ${quote(item.ticket)}${guessed(item)}`]),
        `   instead:   ${item.instead ?? "(not given: ask what else it could reasonably be)"}`,
        ...(item.scenarios.length === 0 ? [] : [`   scenarios: ${item.scenarios.map((s) => `${s.key} ${s.title}`).join("; ")}`]),
      ].join("\n"),
    )
    .join("\n");
}

/** decisions.md: the spec's decisions, their context and the confirmation, for a pull request. */
export function decisionsMarkdown(slug) {
  const spec = readFileSync(join(specDir(slug), "spec.md"), "utf8");
  const title = spec.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? slug;
  const state = confirmation(slug);
  const record = state.record ?? null;
  const source = ticketSource(slug);
  const lines = [
    `# Decisions: ${title}`,
    "",
    `Spec \`${slug}\`, spec.md sha256 \`${state.specHash.slice(0, 12)}\`.`,
    state.ok
      ? `Confirmed by ${record.by} on ${record.at}${typeof record.minutes === "number" ? ` after ${record.minutes} minutes` : ""}.`
      : `Not confirmed: ${state.reason}.`,
    ...(source === null ? [] : [`Ticket: ${source}.`]),
    "",
    "Tests are written from these decisions: a hidden suite the implementing agent never sees holds the code to them.",
    "",
  ];
  decisionContext(slug).forEach((item, i) => {
    lines.push(`${i + 1}. **${item.text}**`);
    if (item.ticket !== null) lines.push(`   - Ticket: ${quote(item.ticket)}${guessed(item)}`);
    if (item.instead !== null) lines.push(`   - Instead: ${item.instead}`);
    if (item.scenarios.length > 0) lines.push(`   - Scenarios: ${item.scenarios.map((s) => `\`${s.key}\` ${s.title}`).join("; ")}`);
  });
  const changes = state.ok ? record.changes : null;
  if (changes && changes.edited.length + changes.added.length + changes.removed.length > 0) {
    lines.push("", "## Changed in confirmation", "");
    for (const { from, to } of changes.edited) lines.push(`- ${from}`, `  → ${to}`);
    for (const text of changes.added) lines.push(`- Added: ${text}`);
    for (const text of changes.removed) lines.push(`- Removed: ${text}`);
  }
  return `${lines.join("\n")}\n`;
}

// --from ------------------------------------------------------------------

const GITHUB = /^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+)(?:\/issues\/|#)(\d+)\/?$/;
const JIRA_KEY = /^[A-Z][A-Z0-9_]*-\d+$/;
const JIRA_URL = /^(https?:\/\/[^/]+)\/browse\/([A-Z][A-Z0-9_]*-\d+)/;

/** Atlassian Document Format as plain text with Markdown-like markers. */
export function adfText(node, depth = 0) {
  if (node === null || typeof node !== "object") return "";
  const inner = (sep = "") => (Array.isArray(node.content) ? node.content.map((child) => adfText(child, depth + 1)).join(sep) : "");
  switch (node.type) {
    case "text":
      return node.text ?? "";
    case "hardBreak":
      return "\n";
    case "mention":
      return node.attrs?.text ?? "@unknown";
    case "emoji":
      return node.attrs?.shortName ?? "";
    case "inlineCard":
      return node.attrs?.url ?? "";
    case "heading":
      return `${"#".repeat(node.attrs?.level ?? 1)} ${inner()}`;
    case "codeBlock":
      return `\`\`\`\n${inner()}\n\`\`\``;
    case "blockquote":
      return inner("\n\n").replace(/^/gm, "> ");
    case "bulletList":
    case "orderedList":
      return (node.content ?? [])
        .map((item, i) => `${node.type === "bulletList" ? "-" : `${(node.attrs?.order ?? 1) + i}.`} ${adfText(item, depth + 1).replace(/\n/g, "\n  ")}`)
        .join("\n");
    case "listItem":
      return inner("\n");
    case "rule":
      return "---";
    case "doc":
    case "panel":
    case "table":
      return inner("\n\n");
    case "tableRow":
      return `| ${(node.content ?? []).map((cell) => adfText(cell, depth + 1).replace(/\n+/g, " ")).join(" | ")} |`;
    default:
      return inner(node.type === "paragraph" || node.type === "tableCell" || node.type === "tableHeader" ? "" : "\n\n");
  }
}

function fromGitHub(ref, withComments) {
  const [, owner, repo, number] = ref.match(GITHUB);
  const gh = spawnSync("gh", ["issue", "view", number, "--repo", `${owner}/${repo}`, "--json", `number,title,body,url,state,labels${withComments ? ",comments" : ""}`], { encoding: "utf8" });
  if (gh.error) throw new Error("gh is not installed: install the GitHub CLI, or pass the issue's text with --body <file>.");
  if (gh.status !== 0) throw new Error(`gh issue view failed: ${gh.stderr.trim()}`);
  const issue = JSON.parse(gh.stdout);
  const labels = issue.labels.map((label) => label.name);
  return {
    title: issue.title,
    source: issue.url,
    body: issue.body.trim(),
    meta: [`${issue.state.toLowerCase()}`, ...(labels.length > 0 ? [`labels: ${labels.join(", ")}`] : [])].join("; "),
    comments: (issue.comments ?? []).map((c) => ({ author: c.author?.login ?? "unknown", at: c.createdAt, body: c.body.trim() })),
  };
}

async function fromJira(ref, withComments) {
  const url = ref.match(JIRA_URL);
  const key = url ? url[2] : ref;
  const base = (process.env.JIRA_BASE_URL ?? url?.[1] ?? "").replace(/\/+$/, "");
  const { JIRA_EMAIL: email, JIRA_API_TOKEN: token } = process.env;
  if (base === "" || !email || !token)
    throw new Error(
      `No Jira credentials for ${key}: set JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN, or fetch the issue another way (in Claude Code, the Atlassian MCP's getJiraIssue) and pass its summary, description and comments with --body <file>.`,
    );
  const response = await fetch(`${base}/rest/api/3/issue/${key}?fields=summary,description,issuetype,status,labels${withComments ? ",comment" : ""}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`, Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Jira ${key}: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
  const { fields } = await response.json();
  return {
    title: `${key}: ${fields.summary}`,
    source: `${base}/browse/${key}`,
    body: (typeof fields.description === "string" ? fields.description : adfText(fields.description)).trim(),
    meta: [fields.issuetype?.name, fields.status?.name, ...(fields.labels?.length ? [`labels: ${fields.labels.join(", ")}`] : [])].filter(Boolean).join("; "),
    comments: (fields.comment?.comments ?? []).map((c) => ({
      author: c.author?.displayName ?? "unknown",
      at: c.created,
      body: (typeof c.body === "string" ? c.body : adfText(c.body)).trim(),
    })),
  };
}

/** ticket.md from a fetched issue, or from text the caller supplies (`given`). */
function ticketMarkdown(issue) {
  const at = new Date().toISOString().slice(0, 10);
  if (issue.given !== undefined) return `Source: ${issue.source}, given ${at}\n\n${issue.given.trim()}\n`;
  const lines = [`# ${issue.title}`, "", `Source: ${issue.source}, fetched ${at}${issue.meta ? ` (${issue.meta})` : ""}`, "", issue.body || "(no description)"];
  if (issue.comments.length > 0) {
    lines.push("", "## Comments");
    for (const c of issue.comments) lines.push("", `**${c.author}**, ${c.at.slice(0, 10)}:`, "", c.body);
  }
  return `${lines.join("\n")}\n`;
}

async function writeTicket(slug, ref, options) {
  const github = GITHUB.test(ref);
  const jira = JIRA_KEY.test(ref) || JIRA_URL.test(ref);
  if (!github && !jira) throw new Error(`--from takes a GitHub issue URL, owner/repo#n, a Jira key or a Jira issue URL, not "${ref}".`);
  let issue;
  if (typeof options.body === "string") {
    const m = ref.match(GITHUB);
    const source = github ? `https://github.com/${m[1]}/${m[2]}/issues/${m[3]}` : ref;
    issue = { source, given: readFileSync(options.body === "-" ? 0 : options.body, "utf8") };
  } else issue = github ? fromGitHub(ref, options.comments === true) : await fromJira(ref, options.comments === true);
  const text = ticketMarkdown(issue);
  const path = join(specDir(slug), "ticket.md");
  if (existsSync(path) && readFileSync(path, "utf8") !== text && options.force !== true)
    throw new Error(`${path} exists. Pass --force to replace it.`);
  mkdirSync(specDir(slug), { recursive: true });
  writeFileSync(path, text);
  return path;
}

// -------------------------------------------------------------------------

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const { options, rest } = args();
  const [slug] = rest;
  if (slug === undefined) {
    console.error(
      "usage: node bin/confirm.mjs <slug> [--by <name> [--started <iso>] | --export <file>|- | --from <issue url|owner/repo#n|jira key> [--comments] [--body <file>|-] [--force]]",
    );
    process.exit(1);
  }
  if (typeof options.from === "string") {
    try {
      const path = await writeTicket(slug, options.from, options);
      console.log(`${slug}: wrote ${path}. Draft spec.md from it (SKILL.md, step 1).`);
      process.exit(0);
    } catch (error) {
      console.error(`${slug}: ${error.message}`);
      process.exit(1);
    }
  }
  const specPath = join(specDir(slug), "spec.md");
  if (!existsSync(specPath)) {
    console.error(`No ${specPath}.`);
    process.exit(1);
  }
  const { hash, scope } = hashes(slug);
  const decided = [...decisions(readFileSync(specPath, "utf8")), ...scopeLines(scope)];
  const clockPath = join(specDir(slug), "confirming.json");
  if (typeof options.export === "string") {
    const text = decisionsMarkdown(slug);
    if (options.export === "-") process.stdout.write(text);
    else {
      writeFileSync(options.export, text);
      console.log(`${slug}: wrote ${options.export}, ${decided.length} decision(s).`);
    }
  } else if (typeof options.by === "string" && options.by.trim() !== "") {
    const at = new Date();
    const clock = readJson(clockPath, null);
    const open = clock !== null && clock.confirmedAt === undefined ? clock : null;
    const started = typeof options.started === "string" ? new Date(options.started) : open ? new Date(open.startedAt) : null;
    if (started !== null && (Number.isNaN(started.getTime()) || started > at)) {
      console.error(`--started ${options.started}: not a time before now.`);
      process.exit(1);
    }
    const minutes = started === null ? null : Math.round((at - started) / 6000) / 10;
    const changes = open ? diffDecisions(open.drafted, decided) : null;
    writeJson(join(specDir(slug), "confirmed.json"), {
      sha256: hash,
      by: options.by.trim(),
      at: at.toISOString(),
      startedAt: started?.toISOString() ?? null,
      minutes,
      decided,
      ...(open ? { drafted: open.drafted, changes } : {}),
      ...(scope === null ? {} : scope),
    });
    if (open) writeJson(clockPath, { ...open, confirmedAt: at.toISOString() });
    console.log(
      `${slug}: spec.md confirmed by ${options.by.trim()}, ${decided.length} decision(s)` +
        (minutes === null
          ? "; no duration (the decisions were not listed first)."
          : `, ${minutes} min; ${changes ? `${changes.edited.length} edited, ${changes.added.length} added, ${changes.removed.length} removed` : "changes not tracked"}.`),
    );
  } else {
    const state = confirmation(slug);
    if (!state.ok) {
      const clock = readJson(clockPath, null);
      if (clock === null || clock.confirmedAt !== undefined)
        writeJson(clockPath, { startedAt: new Date().toISOString(), specSha256: state.specHash, drafted: decided });
    }
    console.log(
      state.ok
        ? `${slug}: confirmed by ${state.record.by} on ${state.record.at}.`
        : `${slug}: not confirmed: ${state.reason}.`,
    );
    const source = ticketSource(slug);
    if (source !== null) console.log(`Ticket: ${source}`);
    console.log(decided.length === 0 ? "No `Decided:` list in spec.md." : `Decided:\n${listing(decisionContext(slug))}`);
    process.exit(state.ok ? 0 : 3);
  }
}
