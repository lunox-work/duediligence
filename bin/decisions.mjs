// A spec's `Decided:` items and what confirm.mjs shows beside each, with no
// model and no side effects (importing lib.mjs would seed a home), so
// evidence scripts can read specs through it too.
//
// An item is one list line under the last `Decided:` heading; lines below
// it that do not start a new item continue it. Two optional sub-lines,
// which prompts/spec-from-ticket.md asks the drafter for, are fields, not
// decision text:
//
//   - Units are lowercase only: `3S` is invalid.
//     Ticket: silent.                       (or the ticket sentence, quoted)
//     Instead: accept units in any case.    (the conventional alternative)
//
// `Scenarios: unhappy-1, boundary-2` names the dependent scenarios by key
// and overrides the guess below. Without `Ticket:` the closest ticket
// sentence by shared words is shown, or none when fewer than two words are
// shared; without `Scenarios:` the scenarios that share the item's quoted
// values or code spans (twice a word), title words (twice) or body words,
// two points at least.

const FIELD = /^(ticket|instead|alternative|scenarios):\s*(.*)$/i;

/** The items under the last `Decided:` heading, with their fields: { text, ticket?, instead?, scenarios? }. */
export function decisionItems(text) {
  const headings = [...text.matchAll(/^\W*decided:?\W*$/gim)];
  if (headings.length === 0) return [];
  const last = headings.at(-1);
  const items = [];
  let field = null;
  for (const raw of text.slice(last.index + last[0].length).split("\n")) {
    const line = raw.trim();
    if (line === "") continue;
    const item = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    const sub = items.length > 0 && !item ? line.match(FIELD) : null;
    if (item) {
      items.push({ text: item[1].trim() });
      field = null;
    } else if (sub) {
      field = sub[1].toLowerCase() === "alternative" ? "instead" : sub[1].toLowerCase();
      items.at(-1)[field] = sub[2].trim();
    } else if (items.length > 0) {
      if (field === null) items.at(-1).text += ` ${line}`;
      else items.at(-1)[field] += ` ${line}`;
    } else break;
  }
  return items;
}

/** The decision texts alone (what confirmed.json lists). */
export const decisions = (text) => decisionItems(text).map((item) => item.text);

/**
 * The spec's scenarios with their keys, as the test writers number them
 * (prompts/public-tests.md): the kind tag and the position among scenarios
 * of that kind, in spec order. { key, title, body }.
 */
export function scenarios(text) {
  const block = text.match(/```gherkin\n([\s\S]*?)```/)?.[1] ?? text;
  const lines = block.split("\n");
  const seen = {};
  const found = [];
  let tag = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") continue;
    const tags = line.match(/^(@[\w-]+\s*)+$/);
    if (tags) {
      tag = line.split(/\s+/)[0].slice(1);
      continue;
    }
    const scenario = line.match(/^Scenario(?: Outline| Template)?:\s*(.*)$/);
    if (scenario) {
      const kind = tag ?? "untagged";
      seen[kind] = (seen[kind] ?? 0) + 1;
      found.push({ key: `${kind}-${seen[kind]}`, title: scenario[1].trim(), body: "" });
    } else if (/^(Rule|Feature|Background):/.test(line)) {
      found.push(null);
    } else if (found.at(-1)) found.at(-1).body += `${line}\n`;
    tag = null;
  }
  return found.filter(Boolean);
}

const STOP = new Set(
  "the and for are but not you all any can had her was one our out has his how its may new now see two way who did get let put say she too use that with have this will your from they been were when what which their there would about into than then them these those some such only also each other more most must over same very just like should could where after before while because every does done being here many much once both either neither whether without within between through given returns return returned invalid valid reject rejects rejected error errors result results value values input inputs output scenario scenarios true false null".split(
    " ",
  ),
);
const stem = (word) => word.replace(/(?:ing|ed|es|s)$/, (end) => (word.length - end.length >= 4 ? "" : end));
/** Content words: lowercased, three or more characters, stopwords out, crudely stemmed. */
export const words = (text) =>
  new Set(
    (text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []).filter((w) => w.length >= 3 && !STOP.has(w)).map(stem),
  );
const shared = (a, b) => [...a].filter((w) => b.has(w)).length;

/** A ticket's sentences: its lines without markdown markers, split after `.`, `!` or `?`; the `Source:` line left out. */
export function ticketSentences(ticket) {
  return ticket
    .split("\n")
    .map((line) => line.replace(/^\s*(?:#+|[-*•>]|\d+[.)])\s*/, "").trim())
    .filter((line) => line !== "" && !/^source:/i.test(line))
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z`"(])/))
    .filter((sentence) => words(sentence).size > 0);
}

/** The ticket sentence that shares the most words with `item`, or null below two. */
export function closestSentence(item, sentences) {
  const mine = words(item);
  let best = null;
  for (const sentence of sentences) {
    const score = shared(mine, words(sentence));
    if (score >= 2 && (best === null || score > best.score)) best = { sentence, score };
  }
  return best?.sentence ?? null;
}

/** Quoted values and code spans, which tie an item to a scenario more surely than words. */
const literals = (text) =>
  [...text.matchAll(/`([^`]+)`|"([^"]+)"/g)].map((m) => (m[1] ?? m[2]).trim()).filter((s) => s.length >= 2);

/** Scenarios likely to depend on `item`: named in its `Scenarios:` field, or the best few by shared literals and words. */
export function dependentScenarios(item, all, limit = 4) {
  if (item.scenarios) {
    const keys = item.scenarios.split(/[\s,;]+/).map((key) => key.replace(/[[\]]/g, "")).filter(Boolean);
    return keys.map((key) => all.find((s) => s.key === key) ?? { key, title: "(no such scenario)" });
  }
  const mine = words(item.text);
  const values = literals(item.text);
  return all
    .map((s) => {
      const text = `${s.title}\n${s.body}`;
      const score =
        2 * values.filter((value) => text.includes(value)).length + 2 * shared(mine, words(s.title)) + shared(mine, words(s.body));
      return { ...s, score };
    })
    .filter((s) => s.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * What changed between the items shown at the start of a confirmation and
 * the ones confirmed: identical texts are kept, the rest paired by shared
 * words (an edit), and what is left was added or removed.
 */
export function diffDecisions(before, after) {
  const left = before.filter((text) => !after.includes(text));
  const right = after.filter((text) => !before.includes(text));
  const edited = [];
  for (const from of [...left]) {
    const a = words(from);
    let best = null;
    for (const to of right) {
      const b = words(to);
      const score = shared(a, b) / Math.max(1, Math.min(a.size, b.size));
      if (score >= 0.4 && (best === null || score > best.score)) best = { to, score };
    }
    if (best) {
      edited.push({ from, to: best.to });
      left.splice(left.indexOf(from), 1);
      right.splice(right.indexOf(best.to), 1);
    }
  }
  return { kept: before.length - left.length - edited.length, edited, added: right, removed: left };
}
