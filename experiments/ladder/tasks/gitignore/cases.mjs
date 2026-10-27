// Rule-tagged inputs for the gitignore task. Each set is one .gitignore
// and the file paths asked about under it, built to exercise one rule of
// rules.json with paths on both sides of it; names are drawn from small
// pools so that unrelated patterns also match now and then. Expected
// answers come from git, never from here (oracle.mjs).

export const SETS_PER_RULE = 10;

const DIRS = ["src", "lib", "app", "build", "docs", "out", "tmp", "vendor", "logs", "cache", "dist", "pkg"];
const FILES = ["main.c", "util.js", "notes.txt", "app.log", "debug.log", "keep.txt", "readme.md", "data.json", "a.out", "x.tmp", "index.ts", "error.log"];
const EXTS = ["log", "txt", "js", "tmp", "md", "json"];
const STEMS = ["alpha", "beta", "core", "data", "east", "fig", "gold", "main"];

const templates = {
  // Blank lines and `#` comments match nothing; `\#` starts a literal `#`;
  // a line with leading space is not a comment.
  R1: (r) => {
    const [a, b, c] = r.pickN(FILES, 3);
    const d = r.pick(DIRS);
    return {
      lines: [`#${a}`, "", b, `\\#${c}`, ` #${a}`, "   "],
      paths: [`#${a}`, a, b, `${d}/${b}`, `#${c}`, c, ` #${a}`, `${d}/#${a}`],
    };
  },
  // Trailing spaces are dropped unless escaped with a backslash.
  R2: (r) => {
    const [a, b] = r.pickN(FILES, 2);
    const d = r.pick(DIRS);
    return {
      lines: [`${a}   `, `${b}\\ `],
      paths: [a, `${a} `, `${d}/${a}`, b, `${b} `, `${d}/${b} `],
    };
  },
  // `!` re-includes what an earlier pattern excluded; order matters; `\!` is literal.
  R3: (r) => {
    const ext = r.pick(EXTS);
    const [keep, other, lit] = r.pickN(STEMS, 3).map((s) => `${s}.${ext}`);
    const d = r.pick(DIRS);
    const order = r.bool();
    return {
      lines: order ? [`*.${ext}`, `!${keep}`, `\\!${lit}`] : [`!${keep}`, `*.${ext}`, `\\!${lit}`],
      paths: [keep, other, `${d}/${keep}`, `${d}/${other}`, `!${lit}`, lit, `${d}/!${lit}`],
    };
  },
  // A file cannot be re-included when a parent directory is excluded.
  R4: (r) => {
    const [d, e] = r.pickN(DIRS, 2);
    const [f, g] = r.pickN(FILES, 2);
    const variants = [
      [[`${d}/`, `!${d}/${f}`], [`${d}/${f}`, `${d}/${g}`, `${e}/${f}`]],
      [[`${d}/*`, `!${d}/${f}`], [`${d}/${f}`, `${d}/${g}`, `${e}/${f}`]],
      [[d, `!${d}/${f}`, `!${f}`], [`${d}/${f}`, `${d}/${g}`, f, `${e}/${f}`]],
      [[`/${d}/*`, `!/${d}/${e}/`, `/${d}/${e}/*`, `!/${d}/${e}/${f}`], [`${d}/${e}/${f}`, `${d}/${e}/${g}`, `${d}/${g}`, `${e}/${f}`]],
      [[`${d}/`, `!${d}/`, `${d}/${e}/`, `!${d}/${e}/${f}`], [`${d}/${f}`, `${d}/${e}/${f}`, `${d}/${e}/${g}`]],
    ];
    const [lines, paths] = r.pick(variants);
    return { lines, paths };
  },
  // A trailing `/` matches directories only, and everything inside them.
  R5: (r) => {
    const [n, x] = r.pickN(DIRS, 2);
    const f = r.pick(FILES);
    return {
      lines: [`${n}/`],
      paths: [n, `${n}2/${f}`, `${n}/${f}`, `${x}/${n}/${f}`, `${x}/${n}`, `${x}/${n}/${x}/${f}`],
    };
  },
  // A slash at the start or in the middle anchors a pattern to the root;
  // otherwise it matches at any depth.
  R6: (r) => {
    const [d, x] = r.pickN(DIRS, 2);
    const [f, g] = r.pickN(FILES, 2);
    const variants = [
      [[`/${f}`], [f, `${d}/${f}`, `${x}/${d}/${f}`]],
      [[`${d}/${f}`], [`${d}/${f}`, `${x}/${d}/${f}`, f, `${d}/${x}/${f}`]],
      [[f], [f, `${d}/${f}`, `${x}/${d}/${f}`, g]],
      [[`/${d}/`], [`${d}/${f}`, `${x}/${d}/${f}`, `${d}/${x}/${g}`]],
      [[`${d}/${x}/`], [`${d}/${x}/${f}`, g, `${x}/${f}`, `${x}/${d}/${x}/${g}`]],
    ];
    const [lines, paths] = r.pick(variants);
    return { lines, paths };
  },
  // `*`, `?` and `[...]` never match `/`; `[!...]` negates a set; `\` makes the next character literal.
  R7: (r) => {
    const d = r.pick(DIRS);
    const [s, t] = r.pickN(STEMS, 2);
    const ext = r.pick(EXTS);
    const variants = [
      [[`*.${ext}`], [`${s}.${ext}`, `${d}/${t}.${ext}`, `${s}.${ext}.bak`, `${s}${ext}`]],
      [[`${d}/*.${ext}`], [`${d}/${s}.${ext}`, `${d}/${t}/${s}.${ext}`, `${s}.${ext}`]],
      [[`?.${ext}`], [`a.${ext}`, `ab.${ext}`, `${d}/b.${ext}`, `.${ext}`]],
      [[`[ab]*`], [`apple`, `berry`, `cherry`, `${d}/able`]],
      [[`${s}[0-3]`], [`${s}0`, `${s}3`, `${s}4`, `${s}`]],
      [[`[!a]x`], [`bx`, `ax`, `xx`, `${d}/cx`]],
      [[`\\*.${ext}`], [`*.${ext}`, `${s}.${ext}`]],
      [[`${s}\\?`], [`${s}?`, `${s}a`]],
      [[`${d}?${s}`], [`${d}/${s}`, `${d}_${s}`, `${d}-${s}`]],
      [[`${d}*`], [`${d}x/${s}`, `${d}/${s}`, `x${d}`, `${d}.${ext}`]],
    ];
    const [lines, paths] = r.pick(variants);
    return { lines, paths };
  },
  // `**/` leading, `/**` trailing and `/**/` inside span directories;
  // any other `**` is an ordinary `*`.
  R8: (r) => {
    const [d, e, x] = r.pickN(DIRS, 3);
    const f = r.pick(FILES);
    const s = r.pick(STEMS);
    const variants = [
      [[`**/${f}`], [f, `${d}/${f}`, `${d}/${e}/${f}`]],
      [[`**/${d}/${f}`], [`${d}/${f}`, `${x}/${d}/${f}`, `${d}/${x}/${f}`]],
      [[`${d}/**`], [`${d}/${f}`, `${d}/${e}/${f}`, `${x}/${d}/${f}`]],
      [[`${d}/**/${f}`], [`${d}/${f}`, `${d}/${e}/${f}`, `${d}/${e}/${x}/${f}`, `${x}/${d}/${f}`]],
      [[`${s}**x`], [`${s}x`, `${s}abx`, `${d}/${s}zx`, `${s}y`]],
      [[`${d}/**${s}`], [`${d}/${s}`, `${d}/a${s}`, `${d}/${e}/${s}`]],
      [[`**`], [f, `${d}/${f}`]],
      [[`${d}/**/`], [`${d}/${f}`, `${d}/${e}/${f}`, `${x}/${f}`]],
    ];
    const [lines, paths] = r.pick(variants);
    return { lines, paths };
  },
  // The last matching pattern decides, whichever way it goes.
  R9: (r) => {
    const ext = r.pick(EXTS);
    const [a, b] = r.pickN(STEMS, 2);
    const d = r.pick(DIRS);
    const f = r.pick(FILES);
    const variants = [
      [[`*.${ext}`, `!${a}*.${ext}`, `${a}1*.${ext}`], [`${a}1.${ext}`, `${a}2.${ext}`, `${b}.${ext}`]],
      [[`!${f}`, f], [f, `${d}/${f}`]],
      [[d, `!${d}`], [`${d}/${f}`, `${d}x`]],
      [[`${d}/`, `!${d}`, `${d}/`], [`${d}/${f}`]],
      [[f, `!/${f}`], [f, `${d}/${f}`]],
    ];
    const [lines, paths] = r.pick(variants);
    return { lines, paths };
  },
  // A pattern without a slash also matches a directory of that name at any
  // depth, and so everything inside it.
  R10: (r) => {
    const [n, x, y] = r.pickN(DIRS, 3);
    const f = r.pick(FILES);
    return {
      lines: [n],
      paths: [`${n}/${f}`, `${x}/${n}/${f}`, `${x}/${y}/${n}/${y}/${f}`, `${x}/${n}x/${f}`, `${x}/${y}/${f}`],
    };
  },
};

/** Paths that are files: one that is also a directory of another path is dropped. */
function consistent(paths) {
  const unique = [...new Set(paths)].filter((p) => p !== "" && !p.startsWith("/") && !p.endsWith("/"));
  return unique.filter((p) => !unique.some((q) => q.startsWith(`${p}/`)));
}

export function generate(rng) {
  const sets = [];
  for (const [rule, template] of Object.entries(templates))
    for (let i = 0; i < SETS_PER_RULE; i += 1) {
      const { lines, paths } = template(rng);
      sets.push({ rule, gitignore: `${lines.join("\n")}\n`, paths: consistent(paths) });
    }
  return sets;
}
