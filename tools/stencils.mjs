#!/usr/bin/env node
/**
 * Render every library stencil to docs/stencils/ and regenerate the README's stencil tables.
 *
 * The images are the generator's own library items (`buildLibrary`, the same set as
 * library/eip.excalidrawlib). The "use when" text comes from the reference tables:
 * references/spec.md for node kinds and badges, references/notation.md for edges. A kind,
 * badge or edge style missing from those tables is an error, so neither side can drift.
 *
 *     node tools/stencils.mjs          # write docs/stencils/*.svg and the README section
 *     node tools/stencils.mjs --check  # write nothing; exit 1 when anything is stale
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ALIASES,
  BADGES,
  CATALOGUE,
  EDGE_KINDS,
  buildLibrary,
  renderSvg,
} from "../skills/excalidraw-architecture/scripts/eip_excalidraw.mjs";

const SCRIPT = fileURLToPath(import.meta.url);
const ROOT = path.dirname(path.dirname(SCRIPT));
const SKILL = path.join(ROOT, "skills", "excalidraw-architecture");
const README = path.join(ROOT, "README.md");
const OUT = path.join(ROOT, "docs", "stencils");
const START = "<!-- stencils:start -->";
const END = "<!-- stencils:end -->";
const PAD = 12; // white margin around each stencil image
// added to a column's content width: GitHub's cell padding (13px a side) and borders
const CELL_PAD = 28;
// GitHub sets `code` in a 13.6px monospace font (about 0.6em a character) with 0.4em of padding a side
const CODE_CHAR = 8.2;
const CODE_PAD = 11;

const DESCRIPTION = "Render every library stencil to docs/stencils/ and regenerate the README's stencil tables.";

const out = (line) => process.stdout.write(`${line}\n`);
const err = (line) => process.stderr.write(`${line}\n`);

/** A drift, README-markup or reference-text error: the CLI prints it and exits 1. */
class StencilError extends Error {}

const fail = (message) => {
  throw new StencilError(`error: ${message}`);
};

const readText = (file) => fs.readFileSync(file, "utf8").replace(/\r\n?/g, "\n");

/** Non-overlapping occurrences of `needle` in `text`. */
const count = (text, needle) => text.split(needle).length - 1;

/** HTML text: &, < and > escaped. */
const escapeText = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** An HTML attribute value: text escaping plus both quote characters. */
const escapeAttr = (text) => escapeText(text).replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

/** The Markdown tables: [## heading, ### heading, rows] for every table whose rows start with a `code` cell. */
function tables(md) {
  const found = [];
  let h2 = "";
  let h3 = "";
  let rows = [];
  for (const line of [...md.split("\n"), ""]) {
    if (line.startsWith("|")) {
      const cells = line.trim().replace(/^\|+/, "").replace(/\|+$/, "").split("|").map((cell) => cell.trim());
      if (cells[0].startsWith("`")) rows.push(cells);
      continue;
    }
    if (rows.length) {
      found.push([h2, h3, rows]);
      rows = [];
    }
    if (line.startsWith("## ")) [h2, h3] = [line.slice(3).trim(), ""];
    else if (line.startsWith("### ")) h3 = line.slice(4).trim();
  }
  return found;
}

const code = (cell) => cell.trim().replace(/^`+/, "").replace(/`+$/, "");

/** Kind sections [[title, [[kind, use when]]]], badge → use when, edge key → meaning. */
function reference() {
  const spec = tables(readText(path.join(SKILL, "references", "spec.md")));
  const notation = tables(readText(path.join(SKILL, "references", "notation.md")));
  const sections = spec
    .filter(([h2]) => h2 === "Node kinds")
    .map(([, h3, rows]) => [h3, rows.map((r) => [code(r[0]), r[3]])]);
  const badges = new Map();
  for (const [h2, , rows] of spec) {
    if (h2 === "Badges") for (const r of rows) badges.set(code(r[0]), r[2]);
  }
  const edges = new Map();
  for (const [h2, , rows] of notation) {
    if (h2 === "Edges") for (const r of rows) edges.set(r[0].split("+").map(code).join(":"), r[2]);
  }
  const kinds = sections.flatMap(([, rows]) => rows.map(([kind]) => kind));
  const problems = [];
  for (const [what, have, want] of [
    ["node kind", kinds, Object.keys(CATALOGUE)],
    ["badge", [...badges.keys()], Object.keys(BADGES)],
    ["edge style", [...edges.keys()], Object.keys(EDGE_KINDS)],
  ]) {
    const missing = want.filter((k) => !have.includes(k));
    if (missing.length) problems.push(`${what}s without a reference row: ${missing.join(", ")}`);
    const unknown = [...new Set(have)].filter((k) => !want.includes(k)).sort();
    if (unknown.length) problems.push(`reference rows for unknown ${what}s: ${unknown.join(", ")}`);
    const dupes = [...new Set(have)].filter((k) => have.filter((other) => other === k).length > 1).sort();
    if (dupes.length) problems.push(`${what}s with more than one reference row: ${dupes.join(", ")}`);
  }
  if (problems.length) fail(problems.join("\n       "));
  return [sections, badges, edges];
}

function edgeSyntax(key) {
  if (key === "message") return '`"kind": "message"` (the default)';
  if (key.startsWith("message:")) return `\`"type": "${key.split(":")[1]}"\``;
  return `\`"kind": "${key}"\``;
}

/** Markdown `code` spans to <code>, the rest escaped: GitHub does not parse Markdown inside an HTML table. */
function inline(text) {
  const parts = text.split("`");
  if (parts.length % 2 === 0) fail(`unbalanced backticks in reference text: ${text}`);
  return parts.map((part, i) => (i % 2 ? `<code>${escapeText(part)}</code>` : escapeText(part))).join("");
}

/**
 * HTML table with fixed image and name column widths, so GitHub neither shrinks a stencil nor breaks a name.
 *
 * rows: [image tag, image width, name cell markdown, name cell html, text cell html]
 */
function table(head, rows) {
  const imageW = Math.max(...rows.map((r) => r[1])) + CELL_PAD;
  // the longest `code` span in the name column, kept on one line: GitHub breaks code at hyphens and spaces
  const spans = rows.flatMap((r) => r[2].split("`").filter((_, i) => i % 2 === 1));
  const longest = Math.max(...spans.map((span) => [...span].length));
  const nameW = Math.ceil(longest * CODE_CHAR) + CODE_PAD + CELL_PAD;
  const lines = [
    "<table>",
    `<tr><th width="${imageW}">${head[0]}</th><th width="${nameW}">${head[1]}</th><th>${head[2]}</th></tr>`,
  ];
  for (const [img, , , name, text] of rows) lines.push(`<tr><td>${img}</td><td>${name}</td><td>${text}</td></tr>`);
  return [...lines, "</table>", ""];
}

/** Stencil SVGs by file name, and the README text between the markers. */
function render() {
  const [sections, badgeUse, edgeMeans] = reference();
  const items = new Map(buildLibrary().libraryItems.map((item) => [item.id, item]));
  const svgs = new Map();

  const image = (itemId) => {
    const item = items.get(itemId);
    const svg = renderSvg({ elements: item.elements }, PAD);
    svgs.set(`${itemId}.svg`, svg);
    const width = Math.ceil(Number(/width="([\d.]+)"/.exec(svg)[1]));
    const alt = escapeAttr(item.name);
    return [`<img src="docs/stencils/${itemId}.svg" alt="${alt}">`, width];
  };

  const row = (itemId, name, codeText, text) => {
    const [img, width] = image(itemId);
    return [img, width, codeText, `<b>${escapeText(name)}</b><br>${inline(codeText)}`, inline(text)];
  };

  const aliases = new Map();
  for (const [alias, kind] of Object.entries(ALIASES)) {
    if (!aliases.has(kind)) aliases.set(kind, []);
    aliases.get(kind).push(alias);
  }

  const lines = [];
  for (const [title, kinds] of sections) {
    const rows = kinds.map(([kind, use]) =>
      row(
        `eip-${kind}`,
        CATALOGUE[kind].eipName,
        [kind, ...(aliases.get(kind) ?? [])].map((k) => `\`${k}\``).join(" or "),
        use,
      ),
    );
    lines.push(`### ${title}`, "", ...table(["Stencil", "Kind", "Use when"], rows));
  }
  const badgeRows = Object.entries(BADGES).map(([badge, name]) =>
    row(`eip-badge-${badge}`, name, `\`${badge}\``, badgeUse.get(badge)),
  );
  lines.push(
    "### Badges",
    "",
    'Pills on a `service` or `external-system` node, e.g. `"badges": ["idempotent", "competing:3"]`.',
    "",
    ...table(["Stencil", "Badge", "Use when"], badgeRows),
  );
  const edgeRows = Object.entries(EDGE_KINDS).map(([key, style]) =>
    row(`eip-edge-${key.replace(/:/g, "-")}`, style.name, edgeSyntax(key), edgeMeans.get(key)),
  );
  lines.push("### Arrows", "", ...table(["Stencil", "Edge", "Means"], edgeRows));
  return { svgs, section: lines.join("\n").replace(/\n+$/, "") };
}

const PROG = "stencils.mjs";
const USAGE = `usage: ${PROG} [-h] [--check]`;
const HELP = [
  USAGE,
  "",
  DESCRIPTION,
  "",
  "options:",
  "  -h, --help  show this help message and exit",
  "  --check     write nothing; exit 1 when anything is stale",
].join("\n");

class UsageError extends Error {}

function parseArgs(argv) {
  const args = { help: false, check: false };
  for (const tok of argv) {
    if (tok === "-h" || tok === "--help") args.help = true;
    else if (tok === "--check") args.check = true;
    else throw new UsageError(`unrecognized arguments: ${tok}`);
  }
  return args;
}

/** Run the CLI on `argv` (without the node and script paths); returns the exit code. */
export function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    err(USAGE);
    err(`${PROG}: error: ${e.message}`);
    return 2;
  }
  if (args.help) {
    out(HELP);
    return 0;
  }

  let svgs;
  let section;
  try {
    ({ svgs, section } = render());
  } catch (e) {
    if (!(e instanceof StencilError)) throw e;
    err(e.message);
    return 1;
  }

  const readme = readText(README);
  if (count(readme, START) !== 1 || count(readme, END) !== 1) {
    err(`error: README.md needs exactly one ${START} and one ${END}`);
    return 1;
  }
  const startAt = readme.indexOf(START);
  const head = readme.slice(0, startAt);
  const rest = readme.slice(startAt + START.length);
  const endAt = rest.indexOf(END);
  const newReadme = `${head}${START}\n${section}\n${END}${rest.slice(endAt + END.length)}`;

  const stale = newReadme === readme ? [] : [path.relative(ROOT, README)];
  const current =
    fs.existsSync(OUT) && fs.statSync(OUT).isDirectory()
      ? fs.readdirSync(OUT).filter((name) => name.endsWith(".svg"))
      : [];
  for (const [name, svg] of svgs) {
    const target = path.join(OUT, name);
    const stat = fs.statSync(target, { throwIfNoEntry: false });
    if (!stat?.isFile() || readText(target) !== svg) stale.push(path.relative(ROOT, target));
  }
  const extra = current.filter((name) => !svgs.has(name)).sort();
  for (const name of extra) stale.push(path.relative(ROOT, path.join(OUT, name)));

  if (args.check) {
    if (stale.length) {
      err(`stale (run node tools/stencils.mjs):\n  ${stale.join("\n  ")}`);
      return 1;
    }
    out(`ok: ${svgs.size} stencils, README current`);
    return 0;
  }
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, svg] of svgs) fs.writeFileSync(path.join(OUT, name), svg, "utf8");
  for (const name of extra) fs.unlinkSync(path.join(OUT, name));
  fs.writeFileSync(README, newReadme, "utf8");
  out(`wrote ${svgs.size} stencils to ${path.relative(ROOT, OUT)}, README section (${stale.length} files changed)`);
  return 0;
}

const invoked = process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === SCRIPT;
if (invoked) process.exitCode = main();
