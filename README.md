# diagram-skill

Excalidraw architecture diagrams in Hohpe & Woolf Enterprise Integration Patterns notation, generated from a small JSON spec by a stdlib-only Python script: a preview SVG, strict layout checks, and a real Excalidraw PNG export. It is packaged as the Agent Skill `excalidraw-architecture`, so a coding agent can draw, check and fix a diagram on its own.

![Order flow example](skills/excalidraw-architecture/examples/order-flow.svg)

A real-world set drawn with it: the [ankusa diagrams](https://github.com/jamescarr/ankusa/tree/main/docs/diagrams).

## Install

### Any agent (npx skills)

```sh
# into the current project; prompts for which agents to install for
npx skills add jamescarr/diagram-skill

# globally, for one agent
npx skills add jamescarr/diagram-skill -g -a claude-code -y
```

`-a` also takes `codex`, `cursor`, `opencode`, `gemini-cli`, `github-copilot`, … and installs into that agent's skills directory (`~/.claude/skills/`, `~/.agents/skills/`, `~/.cursor/skills/`, …).

### Claude Code plugin

```sh
claude plugin marketplace add jamescarr/diagram-skill
claude plugin install diagram-skill@jamescarr-skills
```

The skill is then `/diagram-skill:excalidraw-architecture`.

### omp

```sh
git clone https://github.com/jamescarr/diagram-skill ~/src/diagram-skill
ln -s ~/src/diagram-skill/skills/excalidraw-architecture ~/.omp/agent/skills/excalidraw-architecture
```

For one project only, `npx skills add jamescarr/diagram-skill` puts it in `.agents/skills/`, which omp loads.

### Manual

Clone as above, then symlink or `cp -r` `skills/excalidraw-architecture` into `~/.claude/skills/`, `~/.agents/skills/` (Codex and other `.agents`-based agents), or a project's `.claude/skills/` or `.agents/skills/`.

## Requirements

- Building a diagram: python3 >= 3.12, stdlib only.
- `--png`: node >= 22, Chrome or Chromium (`CHROME` overrides the lookup), and network access to esm.sh.

## Use

```sh
# the node kinds, endpoint badges, edge kinds and aliases the spec accepts
python3 skills/excalidraw-architecture/scripts/eip_excalidraw.py kinds

# write <name>.excalidraw and <name>.svg; --png adds an Excalidraw-rendered PNG
python3 skills/excalidraw-architecture/scripts/eip_excalidraw.py build <name>.spec.json --png

# validate and lay out without writing; warnings fail the run
python3 skills/excalidraw-architecture/scripts/eip_excalidraw.py build <name>.spec.json --check --strict
```

The agent workflow (inventory, level, spec, build, look, fix) is in [`SKILL.md`](skills/excalidraw-architecture/SKILL.md); the spec format is in [`references/spec.md`](skills/excalidraw-architecture/references/spec.md). The stencils are also a library, [`library/eip.excalidrawlib`](skills/excalidraw-architecture/library/eip.excalidrawlib), which you can load into excalidraw.com to draw by hand.

## Develop

```sh
uv sync
uv run pytest -q
uv run agentskills validate skills/excalidraw-architecture
claude plugin validate .
```

## License

MIT
