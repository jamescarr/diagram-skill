#!/usr/bin/env python3
"""Render every library stencil to docs/stencils/ and regenerate the README's stencil tables.

The images are the generator's own library items (`build_library`, the same set as
library/eip.excalidrawlib). The "use when" text comes from the reference tables:
references/spec.md for node kinds and badges, references/notation.md for edges. A kind,
badge or edge style missing from those tables is an error, so neither side can drift.

    python3 tools/stencils.py          # write docs/stencils/*.svg and the README section
    python3 tools/stencils.py --check  # write nothing; exit 1 when anything is stale
"""

import argparse
import html
import importlib.util
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILL = ROOT / "skills" / "excalidraw-architecture"
README = ROOT / "README.md"
OUT = ROOT / "docs" / "stencils"
START, END = "<!-- stencils:start -->", "<!-- stencils:end -->"
PAD = 12  # white margin around each stencil image
# added to a table's widest image for its image column: GitHub's cell padding (13px a side) and borders
CELL_PAD = 28


def _load_generator():
    spec = importlib.util.spec_from_file_location("eip_excalidraw", SKILL / "scripts" / "eip_excalidraw.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module  # dataclasses resolve annotations through sys.modules
    spec.loader.exec_module(module)
    return module


def _tables(md: str) -> list[tuple[str, str, list[list[str]]]]:
    """(## heading, ### heading, rows) for every table whose rows start with a `code` cell."""
    out: list[tuple[str, str, list[list[str]]]] = []
    h2 = h3 = ""
    rows: list[list[str]] = []
    for line in md.splitlines() + [""]:
        if line.startswith("|"):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if cells[0].startswith("`"):
                rows.append(cells)
            continue
        if rows:
            out.append((h2, h3, rows))
            rows = []
        if line.startswith("## "):
            h2, h3 = line[3:].strip(), ""
        elif line.startswith("### "):
            h3 = line[4:].strip()
    return out


def _code(cell: str) -> str:
    return cell.strip().strip("`")


def _reference(eip) -> tuple[list[tuple[str, list[tuple[str, str]]]], dict[str, str], dict[str, str]]:
    """Kind sections [(title, [(kind, use when)])], badge → use when, edge key → meaning."""
    spec = _tables((SKILL / "references" / "spec.md").read_text(encoding="utf-8"))
    notation = _tables((SKILL / "references" / "notation.md").read_text(encoding="utf-8"))
    sections = [(h3, [(_code(r[0]), r[3]) for r in rows]) for h2, h3, rows in spec if h2 == "Node kinds"]
    badges = {_code(r[0]): r[2] for h2, _, rows in spec if h2 == "Badges" for r in rows}
    edges = {
        ":".join(_code(part) for part in r[0].split("+")): r[2]
        for h2, _, rows in notation
        if h2 == "Edges"
        for r in rows
    }
    kinds = [k for _, rows in sections for k, _ in rows]
    problems = []
    for what, have, want in (
        ("node kind", kinds, eip.CATALOGUE),
        ("badge", list(badges), eip.BADGES),
        ("edge style", list(edges), eip.EDGE_KINDS),
    ):
        if missing := [k for k in want if k not in have]:
            problems.append(f"{what}s without a reference row: {', '.join(missing)}")
        if unknown := sorted(set(have) - set(want)):
            problems.append(f"reference rows for unknown {what}s: {', '.join(unknown)}")
        if dupes := sorted({k for k in have if have.count(k) > 1}):
            problems.append(f"{what}s with more than one reference row: {', '.join(dupes)}")
    if problems:
        sys.exit("error: " + "\n       ".join(problems))
    return sections, badges, edges


def _edge_syntax(key: str) -> str:
    if key == "message":
        return '`"kind": "message"` (the default)'
    if key.startswith("message:"):
        return f'`"type": "{key.split(":", 1)[1]}"`'
    return f'`"kind": "{key}"`'


def _html(text: str) -> str:
    """Markdown `code` spans to <code>, the rest escaped: GitHub does not parse Markdown inside an HTML table."""
    parts = text.split("`")
    if len(parts) % 2 == 0:
        sys.exit(f"error: unbalanced backticks in reference text: {text}")
    return "".join(
        f"<code>{html.escape(p, quote=False)}</code>" if i % 2 else html.escape(p, quote=False)
        for i, p in enumerate(parts)
    )


def _table(head: tuple[str, str, str], rows: list[tuple[str, int, str, str]]) -> list[str]:
    """HTML table whose image column is as wide as its widest image, so GitHub cannot shrink the stencils."""
    width = max(w for _, w, _, _ in rows) + CELL_PAD
    out = ["<table>", f'<tr><th width="{width}">{head[0]}</th><th>{head[1]}</th><th>{head[2]}</th></tr>']
    out += [f"<tr><td>{img}</td><td>{name}</td><td>{text}</td></tr>" for img, _, name, text in rows]
    return [*out, "</table>", ""]


def _render(eip) -> tuple[dict[str, str], str]:
    """Stencil SVGs by file name, and the README text between the markers."""
    sections, badge_use, edge_means = _reference(eip)
    items = {item["id"]: item for item in eip.build_library()["libraryItems"]}
    svgs: dict[str, str] = {}

    def image(item_id: str) -> tuple[str, int]:
        item = items[item_id]
        svg = eip.render_svg({"elements": item["elements"]}, pad=PAD)
        svgs[f"{item_id}.svg"] = svg
        width = math.ceil(float(re.search(r'width="([\d.]+)"', svg)[1]))
        alt = html.escape(item["name"])
        return f'<img src="docs/stencils/{item_id}.svg" alt="{alt}">', width

    def row(item_id: str, name: str, code: str, text: str) -> tuple[str, int, str, str]:
        img, width = image(item_id)
        return img, width, f"<b>{html.escape(name, quote=False)}</b><br>{_html(code)}", _html(text)

    aliases: dict[str, list[str]] = {}
    for alias, kind in eip.ALIASES.items():
        aliases.setdefault(kind, []).append(alias)
    lines: list[str] = []
    for title, kinds in sections:
        rows = [
            row(
                f"eip-{kind}",
                eip.CATALOGUE[kind].eip_name,
                " or ".join(f"`{k}`" for k in [kind, *aliases.get(kind, [])]),
                use,
            )
            for kind, use in kinds
        ]
        lines += [f"### {title}", "", *_table(("Stencil", "Kind", "Use when"), rows)]
    rows = [row(f"eip-badge-{b}", name, f"`{b}`", badge_use[b]) for b, name in eip.BADGES.items()]
    lines += [
        "### Badges",
        "",
        'Pills on a `service` or `external-system` node, e.g. `"badges": ["idempotent", "competing:3"]`.',
        "",
        *_table(("Stencil", "Badge", "Use when"), rows),
    ]
    rows = [
        row(f"eip-edge-{key.replace(':', '-')}", style.name, _edge_syntax(key), edge_means[key])
        for key, style in eip.EDGE_KINDS.items()
    ]
    lines += ["### Arrows", "", *_table(("Stencil", "Edge", "Means"), rows)]
    return svgs, "\n".join(lines).rstrip("\n")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="write nothing; exit 1 when anything is stale")
    args = parser.parse_args(argv)

    svgs, section = _render(_load_generator())
    readme = README.read_text(encoding="utf-8")
    if readme.count(START) != 1 or readme.count(END) != 1:
        sys.exit(f"error: README.md needs exactly one {START} and one {END}")
    head, rest = readme.split(START)
    new_readme = f"{head}{START}\n{section}\n{END}{rest.split(END, 1)[1]}"

    stale = [str(README.relative_to(ROOT))] if new_readme != readme else []
    current = {p.name for p in OUT.glob("*.svg")} if OUT.is_dir() else set()
    for name, svg in svgs.items():
        path = OUT / name
        if not path.is_file() or path.read_text(encoding="utf-8") != svg:
            stale.append(str(path.relative_to(ROOT)))
    extra = sorted(current - set(svgs))
    stale += [str((OUT / name).relative_to(ROOT)) for name in extra]

    if args.check:
        if stale:
            print("stale (run python3 tools/stencils.py):\n  " + "\n  ".join(stale), file=sys.stderr)
            return 1
        print(f"ok: {len(svgs)} stencils, README current")
        return 0
    OUT.mkdir(parents=True, exist_ok=True)
    for name, svg in svgs.items():
        (OUT / name).write_text(svg, encoding="utf-8")
    for name in extra:
        (OUT / name).unlink()
    README.write_text(new_readme, encoding="utf-8")
    print(f"wrote {len(svgs)} stencils to {OUT.relative_to(ROOT)}, README section ({len(stale)} files changed)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
