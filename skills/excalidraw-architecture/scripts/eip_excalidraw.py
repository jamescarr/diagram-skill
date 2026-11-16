#!/usr/bin/env python3
"""Excalidraw diagrams in Enterprise Integration Patterns notation, generated from a JSON spec.

    eip_excalidraw.py build SPEC [-o OUT.excalidraw] [--svg OUT.svg | --no-svg] [--png [OUT.png]] [--check] [--strict]
    eip_excalidraw.py lib [-o library/eip.excalidrawlib] [--svg library/eip.svg]
    eip_excalidraw.py kinds

Exit codes: 0 ok, 1 layout warnings with --strict, 2 spec errors, 3 PNG export
failed (the .excalidraw scene was already written).

Stdlib only. The spec format is documented in ../references/spec.md.
"""

from __future__ import annotations

import argparse
import copy
import heapq
import json
import math
import re
import shlex
import shutil
import subprocess
import sys
import textwrap
import zlib
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
SOURCE = "https://github.com/jamescarr/diagram-skill"

INK = "#1e1e1e"
MUTED = "#5c5f66"
GREY = "#868e96"
RED = "#c92a2a"
WHITE = "#ffffff"
FRAME_STROKE = "#bbb"
LANE_LINE = "#ced4da"
TRANSPARENT = "transparent"

FONTS = {"excalifont": 5, "helvetica": 2, "cascadia": 3}

MARGIN = 40
TITLE_H = 48
COL_GAP = 120
ROW_GAP = 40
SHADOW_GAP = 16
FRAME_PAD = 24
FRAME_PAD_TOP = 44
FRAME_NAME_H = 20
LEGEND_GAP = 60
FAN_STEP = 14
ORTHO_STEP = 8
BAND_PAD = 16
ARROWHEAD = 25  # Excalidraw's "arrow" head length; it shrinks to half the final segment when that is shorter
STACK_STEP = 6  # offset of each card stacked behind a competing-consumers node
LOOP_OFFSET = 40
LOOP_STEP = 24
LEGEND_COLS = 4
LEGEND_CELL = (220, 48)
LIB_CELL = (260, 140)
LIB_CREATED = 1700000000000


# --------------------------------------------------------------------------- catalogue


@dataclass(frozen=True)
class Kind:
    """One node kind: drawing family, Hohpe & Woolf name, icon recipe, pipe tag."""

    family: str
    eip_name: str
    glyph: str = ""
    tag: str | None = None
    fill: str | None = None
    dashed: bool = False
    caption_y: int | None = None


@dataclass(frozen=True)
class EdgeStyle:
    """Stroke and arrowheads for one edge kind (or message type)."""

    name: str
    stroke: str
    width: int
    style: str
    start: str | None
    end: str | None
    marker: str | None = None


FAMILY_FILL = {
    "component": "#d3f9d8",
    "message": WHITE,
    "pipe": "#dee2e6",
    "app": "#fff3bf",
    "cylinder": "#d0ebff",
    "actor": "#e7f5ff",
    "note": "#fff9db",
}
PIPE_CAP_FILL = "#f1f3f5"

# Glyph mini-notation, coordinates relative to the node origin (see references/notation.md):
#   R|E|D x y w h fill      rectangle | ellipse | diamond ("-" = transparent)
#   L (x,y)(x,y)...         open line; start=/end= arrowheads turn it into an unbound arrow
#   P (x,y)... fill         closed polygon
#   A (x,y)(x,y)            black mini arrow;  G (x,y)(x,y) grey incoming arrow
#   T x y size "text"       text centred on (x, y)
# Any primitive takes stroke=#hex.
_DOTS = "E 37 29 6 6 #1e1e1e; E 61 15 6 6 #1e1e1e; E 61 29 6 6 #1e1e1e; E 61 43 6 6 #1e1e1e"
_STUBS = "L (64,18)(84,18); L (64,32)(84,32); L (64,46)(84,46)"
_ROUTER = f"L (12,32)(40,32); L (40,32)(64,18); {_STUBS}; {_DOTS}"
_RECIPIENTS = f"L (12,32)(40,32); L (40,32)(64,18); L (40,32)(64,32); L (40,32)(64,46); {_STUBS}; {_DOTS}"
_PROCESS = (
    "E 43 6 10 10 #ffffff; L (48,16)(48,22); D 40 22 16 12 #ffffff; L (48,34)(48,40); "
    "L (19,40)(77,40); L (19,40)(19,46); L (77,40)(77,46); "
    "R 10 46 18 10 #ffffff; R 39 46 18 10 #ffffff; R 68 46 18 10 #ffffff"
)
_ENDPOINT = "G (6,32)(44,32); R 56 22 20 20 #ffffff"
_FAN_FROM_40 = "L (40,32)(66,16); L (40,32)(66,32); L (40,32)(66,48)"
_FAN_FROM_46 = "L (46,32)(66,16); L (46,32)(66,32); L (46,32)(66,48)"
_PERFORMERS = "D 66 11 10 10 #1e1e1e; D 66 27 10 10 #1e1e1e; D 66 43 10 10 #1e1e1e"
_CONTENT_FILTER = "R 12 20 24 24 #ffffff; A (40,32)(64,32); R 68 26 12 12 #ffffff"
_LOLLIPOP = "E 30 6 20 20 #adb5bd; L (40,26)(40,44)(48,44); R 48 36 16 16 #ffffff"
_MINI_CYLINDER_AT_10 = "E 10 36 20 8 #d0ebff; R 10 24 20 16 #d0ebff; E 10 20 20 8 #d0ebff"
_MINI_CYLINDER_AT_66 = "E 66 36 20 8 #d0ebff; R 66 24 20 16 #d0ebff; E 66 20 20 8 #d0ebff"
_BOTH = "start=arrow end=arrow"

CATALOGUE: dict[str, Kind] = {
    # participants
    "service": Kind("app", "Application", fill="#fff3bf"),
    "external-system": Kind("app", "External system", fill="#f8f9fa", dashed=True),
    "actor": Kind("actor", "Actor"),
    "datastore": Kind("cylinder", "Data store", fill="#d0ebff"),
    "message-store": Kind("cylinder", "Message Store", fill="#dee2e6"),
    "schema-registry": Kind("cylinder", "Schema Registry", glyph='T 70 8 12 "{ }"', fill="#e5dbff"),
    "note": Kind("note", "Note"),
    # channels
    "channel": Kind("pipe", "Message Channel"),
    "p2p-channel": Kind("pipe", "Point-to-Point Channel", tag="P2P"),
    "pubsub-channel": Kind("pipe", "Publish-Subscribe Channel", tag="PUB-SUB"),
    "datatype-channel": Kind("pipe", "Datatype Channel", tag="TYPE"),
    "dead-letter-channel": Kind(
        "pipe",
        "Dead Letter Channel",
        glyph="P (84,42)(96,42)(104,50)(104,62)(96,70)(84,70)(76,62)(76,50) #ff6b6b stroke=#c92a2a",
        tag="DLQ",
        caption_y=78,
    ),
    "invalid-message-channel": Kind(
        "pipe",
        "Invalid Message Channel",
        glyph='P (90,42)(102,68)(78,68) #ffd43b; T 90 58 11 "!"',
        tag="INVALID",
        caption_y=76,
    ),
    "message-bus": Kind(
        "pipe",
        "Message Bus",
        glyph=f"L (30,-16)(30,-2) {_BOTH}; L (90,-16)(90,-2) {_BOTH}; L (150,-16)(150,-2) {_BOTH}; L (90,38)(90,52)",
        tag="BUS",
        caption_y=58,
    ),
    "control-bus": Kind("pipe", "Control Bus", tag="CONTROL", dashed=True),
    # routing
    "content-based-router": Kind("component", "Content-Based Router", _ROUTER),
    "message-filter": Kind("component", "Message Filter", "P (24,14)(72,14)(53,34)(53,52)(43,52)(43,34) #adb5bd"),
    "dynamic-router": Kind("component", "Dynamic Router", f"{_ROUTER}; R 70 48 18 10 #ffec99"),
    "recipient-list": Kind("component", "Recipient List", _RECIPIENTS),
    "splitter": Kind(
        "component",
        "Splitter",
        "R 18 25 14 14 #ffffff; A (36,32)(56,32); R 62 12 12 12 #ffffff; R 62 26 12 12 #ffffff; R 62 40 12 12 #ffffff",
    ),
    "aggregator": Kind(
        "component",
        "Aggregator",
        "R 22 12 12 12 #ffffff; R 22 26 12 12 #ffffff; R 22 40 12 12 #ffffff; A (40,32)(60,32); R 64 25 14 14 #ffffff",
    ),
    "resequencer": Kind(
        "component",
        "Resequencer",
        "R 12 14 10 10 #ffffff; R 26 30 10 10 #ffffff; R 14 44 10 10 #ffffff; A (40,32)(54,32); "
        "R 58 27 10 10 #ffffff; R 70 27 10 10 #ffffff; R 82 27 10 10 #ffffff",
    ),
    "composed-message-processor": Kind(
        "component",
        "Composed Message Processor",
        "R 8 26 12 12 #ffffff; A (22,32)(34,32); R 40 12 10 10 #ffffff; R 40 27 10 10 #ffffff; "
        "R 40 42 10 10 #ffffff; A (54,32)(66,32); R 72 26 12 12 #ffffff",
    ),
    "scatter-gather": Kind(
        "component",
        "Scatter-Gather",
        "E 9 29 6 6 #1e1e1e; L (12,32)(34,18); L (12,32)(34,32); L (12,32)(34,46); "
        "D 30 13 10 10 #1e1e1e; D 30 27 10 10 #1e1e1e; D 30 41 10 10 #1e1e1e; "
        "L (40,18)(80,32); L (40,32)(80,32); L (40,46)(80,32); E 80 29 6 6 #1e1e1e",
    ),
    "routing-slip": Kind(
        "component",
        "Routing Slip",
        "L (22,32)(32,32); L (44,32)(54,32); L (66,32)(76,32); "
        "R 10 26 12 12 #ffffff; R 32 26 12 12 #ffffff; R 54 26 12 12 #ffffff; R 76 26 12 12 #ffffff",
    ),
    "process-manager": Kind("component", "Process Manager", _PROCESS),
    "saga": Kind("component", "Saga (Process Manager)", _PROCESS),
    "message-broker": Kind(
        "component",
        "Message Broker",
        "L (48,26)(48,14); L (48,38)(48,50); L (38,30)(22,22); L (58,30)(74,22); L (38,34)(22,44); "
        "L (58,34)(74,44); R 38 26 20 12 #d3f9d8; R 41 6 14 8 #ffec99; R 8 16 14 8 #ffec99; "
        "R 74 16 14 8 #ffec99; R 8 42 14 8 #ffec99; R 74 42 14 8 #ffec99; R 41 50 14 8 #ffec99",
    ),
    # transformation
    "message-translator": Kind(
        "component",
        "Message Translator",
        "R 18 22 20 20 #ffffff; R 58 22 20 20 #ffffff; L (36,24)(60,40); L (36,40)(60,24)",
    ),
    "envelope-wrapper": Kind(
        "component", "Envelope Wrapper", "R 30 19 36 26 #ffec99; L (30,19)(48,34); L (66,19)(48,34)"
    ),
    "content-enricher": Kind(
        "component", "Content Enricher", "R 16 26 12 12 #ffffff; A (32,32)(56,32); R 60 20 24 24 #ffffff"
    ),
    "content-filter": Kind("component", "Content Filter", _CONTENT_FILTER),
    "claim-check": Kind(
        "component",
        "Claim Check",
        f"{_CONTENT_FILTER}; E 66 46 8 8 -; L (74,50)(88,50); L (84,50)(84,55)",
    ),
    "normalizer": Kind(
        "component",
        "Normalizer",
        "E 12 10 10 10 #ffffff; D 24 22 10 10 #ffffff; P (12,46)(22,46)(17,36) #ffffff; "
        "A (40,32)(58,32); R 66 25 14 14 #ffffff",
    ),
    # endpoints
    "message-endpoint": Kind("component", "Message Endpoint", _ENDPOINT),
    "messaging-gateway": Kind(
        "component",
        "Messaging Gateway",
        "G (6,32)(40,32); P (46,22)(60,16)(60,48)(46,42) #c5f6fa; R 66 16 14 32 #c5f6fa",
    ),
    "messaging-mapper": Kind(
        "component",
        "Messaging Mapper",
        "L (30,17)(66,32); L (30,32)(66,47); L (30,47)(66,17); "
        "R 20 12 10 10 #ffffff; R 20 27 10 10 #ffffff; R 20 42 10 10 #ffffff; "
        "R 66 12 10 10 #ffffff; R 66 27 10 10 #ffffff; R 66 42 10 10 #ffffff",
    ),
    "transactional-client": Kind(
        "component", "Transactional Client", 'G (6,32)(40,32); R 50 20 30 24 #ffffff; T 65 32 12 "TX"'
    ),
    "polling-consumer": Kind("component", "Polling Consumer", "G (6,32)(40,32); E 44 20 24 24 -; D 68 28 8 8 #1e1e1e"),
    "event-driven-consumer": Kind(
        "component", "Event-Driven Consumer", "G (6,32)(40,32); L (40,32)(70,32); D 70 27 10 10 #1e1e1e"
    ),
    "competing-consumers": Kind("component", "Competing Consumers", f"G (6,32)(40,32); {_FAN_FROM_40}; {_PERFORMERS}"),
    "message-dispatcher": Kind(
        "component",
        "Message Dispatcher",
        f"G (6,32)(32,32); {_FAN_FROM_46}; R 34 26 12 12 #ffffff; {_PERFORMERS}",
    ),
    "selective-consumer": Kind(
        "component",
        "Selective Consumer",
        "G (6,32)(30,32); P (34,22)(54,22)(47,32)(47,42)(41,42)(41,32) #adb5bd; R 64 24 16 16 #ffffff",
    ),
    "durable-subscriber": Kind("component", "Durable Subscriber", f"{_ENDPOINT}; E 6 4 12 12 -; R 4 10 16 12 #adb5bd"),
    "idempotent-receiver": Kind(
        "component", "Idempotent Receiver", f'{_ENDPOINT}; E 4 4 16 16 #ffffff; T 12 12 11 "1"'
    ),
    "service-activator": Kind(
        "component",
        "Service Activator",
        "G (6,32)(34,32); L (44,32)(70,32); D 34 27 10 10 #1e1e1e; D 70 27 10 10 #ffffff",
    ),
    "channel-adapter": Kind(
        "component",
        "Channel Adapter",
        f"R 6 10 20 44 #ffec99; P (32,10)(52,16)(52,48)(32,54) #c5f6fa; L (56,32)(72,32) {_BOTH}; "
        "R 76 24 14 16 #adb5bd",
    ),
    "messaging-bridge": Kind(
        "component",
        "Messaging Bridge",
        "L (8,50)(20,30)(36,16)(60,16)(76,30)(88,50); L (8,50)(88,50); L (24,50)(24,26); "
        "L (40,50)(40,16); L (56,50)(56,16); L (72,50)(72,26)",
    ),
    # system management
    "wire-tap": Kind("component", "Wire Tap", "L (12,28)(84,28); A (48,30)(48,50); E 45 25 6 6 #1e1e1e"),
    "detour": Kind(
        "component",
        "Detour",
        "L (12,32)(40,32); L (40,32)(84,32); L (40,32)(62,14); L (62,14)(84,14); "
        "E 37 29 6 6 #1e1e1e; R 58 44 20 10 #ffec99",
    ),
    "message-history": Kind(
        "message",
        "Message History",
        f"{_LOLLIPOP}; L (68,16)(88,16); L (68,26)(88,26); L (68,36)(88,36)",
    ),
    "smart-proxy": Kind(
        "component",
        "Smart Proxy",
        "G (6,24)(36,24); R 38 14 20 36 #ffffff; A (58,24)(88,24); A (88,42)(58,42); "
        "L (36,42)(6,42) end=triangle; E 42 52 12 6 #adb5bd",
    ),
    "test-message": Kind("message", "Test Message", f'{_LOLLIPOP}; T 56 44 11 "T"'),
    "channel-purger": Kind(
        "component",
        "Channel Purger",
        "R 14 26 56 14 #dee2e6; E 66 26 8 14 #f1f3f5; L (78,20)(90,44) stroke=#c92a2a; L (90,20)(78,44) stroke=#c92a2a",
    ),
    # messages
    "message": Kind("message", "Message", _LOLLIPOP),
    "command-message": Kind("message", "Command Message", f'{_LOLLIPOP}; T 56 44 11 "C"'),
    "document-message": Kind("message", "Document Message", f'{_LOLLIPOP}; T 56 44 11 "D"'),
    "event-message": Kind("message", "Event Message", f'{_LOLLIPOP}; T 56 44 11 "E"'),
    # transactional messaging
    "outbox": Kind(
        "component",
        "Transactional Outbox",
        f"{_MINI_CYLINDER_AT_10}; A (34,32)(56,32); R 60 26 26 12 #dee2e6; E 82 26 8 12 #f1f3f5",
    ),
    "inbox": Kind(
        "component",
        "Transactional Inbox",
        f"R 10 26 26 12 #dee2e6; E 32 26 8 12 #f1f3f5; A (40,32)(62,32); {_MINI_CYLINDER_AT_66}",
    ),
}

ALIASES = {
    "message-router": "content-based-router",
    "queue": "p2p-channel",
    "topic": "pubsub-channel",
    "dlq": "dead-letter-channel",
    "db": "datastore",
    "external": "external-system",
}

BADGES = {
    "gateway": "Messaging Gateway",
    "mapper": "Messaging Mapper",
    "activator": "Service Activator",
    "tx": "Transactional Client",
    "outbox": "Transactional Outbox",
    "inbox": "Transactional Inbox",
    "polling": "Polling Consumer",
    "event-driven": "Event-Driven Consumer",
    "competing": "Competing Consumers",
    "dispatcher": "Message Dispatcher",
    "selective": "Selective Consumer",
    "durable": "Durable Subscriber",
    "idempotent": "Idempotent Receiver",
    "adapter": "Channel Adapter",
    "bulkhead": "Bulkhead",
    "retry": "Retry",
    "circuit-breaker": "Circuit Breaker",
}

EDGE_KINDS: dict[str, EdgeStyle] = {
    "message": EdgeStyle("Message", INK, 2, "solid", None, "arrow"),
    "message:command": EdgeStyle("Command Message", INK, 2, "solid", None, "triangle", "«C»"),
    "message:event": EdgeStyle("Event Message", INK, 2, "solid", None, "arrow", "«E»"),
    "message:document": EdgeStyle("Document Message", INK, 2, "solid", None, "arrow", "«D»"),
    "message:reply": EdgeStyle("Reply (Request-Reply)", INK, 2, "dashed", None, "arrow", "«R»"),
    "rpc": EdgeStyle("Synchronous call (RPC)", INK, 1, "solid", None, "arrow"),
    "data": EdgeStyle("Data access", INK, 1, "dotted", None, "arrow"),
    "tap": EdgeStyle("Wire Tap copy", INK, 1, "dotted", "circle", "arrow"),
    "dlq": EdgeStyle("Dead letter route", RED, 1, "dashed", None, "arrow"),
    "control": EdgeStyle("Control Bus command", GREY, 1, "dashed", None, "bar"),
}
EDGE_KIND_NAMES = tuple(k for k in EDGE_KINDS if ":" not in k)
MESSAGE_TYPES = tuple(k.split(":", 1)[1] for k in EDGE_KINDS if ":" in k)
ROUTES = ("straight", "ortho", "below", "above")
LINE_STYLES = ("solid", "dashed", "dotted")
GROUP_KINDS = ("context", "broker", "deployment")

TOP_KEYS = ("title", "style", "legend", "lanes", "nodes", "edges", "groups")
STYLE_KEYS = ("font", "sketchy")
NODE_KEYS = ("id", "kind", "label", "sub", "badges", "tags", "group", "lane", "col", "row", "shadow", "attach", "link")
EDGE_KEYS = (
    "from", "to", "kind", "type", "message", "label", "seq", "route",
    "correlation", "reply_to", "ttl", "sequence", "style", "color",
)  # fmt: skip
GROUP_KEYS = ("id", "label", "kind")

_ID_RE = re.compile(r"^[A-Za-z0-9_.:-]+$")
_HEX_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
_COMPETING_RE = re.compile(r"^competing:([1-9][0-9]*)$")
_POINT_RE = re.compile(r"\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)")


class SpecError(Exception):
    """The spec is invalid; `errors` holds one message per problem."""

    def __init__(self, errors: list[str]):
        super().__init__("\n".join(errors))
        self.errors = list(errors)


class ExportError(Exception):
    """The PNG export failed; the scene was already written."""


# --------------------------------------------------------------------------- spec validation


def load_spec(path) -> dict:
    p = Path(path)
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SpecError([f"{p}: invalid JSON: {exc}"]) from None
    except OSError as exc:
        raise SpecError([f"{p}: {exc.strerror}"]) from None


def validate(spec) -> list[str]:
    return _normalize(spec)[1]


def _is_int(v) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def _family(kind: str | None) -> str | None:
    k = CATALOGUE.get(kind) if kind else None
    return k.family if k else None


def _normalize(spec) -> tuple[dict | None, list[str]]:
    """Resolve aliases, apply defaults and collect every validation error."""
    errors: list[str] = []
    if not isinstance(spec, dict):
        return None, ["spec must be a JSON object"]
    errors += [f"unknown key '{k}' in spec" for k in spec if k not in TOP_KEYS]

    title = spec.get("title")
    if title is not None and not isinstance(title, str):
        errors.append("title must be a string")
    style = spec.get("style", {})
    font, sketchy = "excalifont", True
    if not isinstance(style, dict):
        errors.append("style must be an object")
    else:
        errors += [f"unknown key '{k}' in style" for k in style if k not in STYLE_KEYS]
        font = style.get("font", "excalifont")
        if font not in FONTS:
            errors.append(f"unknown font '{font}'")
        sketchy = style.get("sketchy", True)
        if not isinstance(sketchy, bool):
            errors.append("style.sketchy must be true or false")
    legend = spec.get("legend", True)
    if not isinstance(legend, bool):
        errors.append("legend must be true or false")
    lanes = spec.get("lanes", [])
    if not isinstance(lanes, list) or not all(isinstance(x, str) and x for x in lanes):
        errors.append("lanes must be a list of names")
        lanes = []
    elif len(set(lanes)) != len(lanes):
        errors.append("lanes must be unique")

    groups: list[dict] = []
    group_ids: set[str] = set()
    raw_groups = spec.get("groups", [])
    if not isinstance(raw_groups, list):
        errors.append("groups must be a list")
        raw_groups = []
    for i, g in enumerate(raw_groups):
        if not isinstance(g, dict):
            errors.append(f"groups[{i}] must be an object")
            continue
        errors += [f"unknown key '{k}' in groups[{i}]" for k in g if k not in GROUP_KEYS]
        gid = g.get("id")
        if not isinstance(gid, str) or not _ID_RE.match(gid):
            errors.append(f"groups[{i}]: missing or invalid id")
            continue
        if gid in group_ids:
            errors.append(f"duplicate group id '{gid}'")
        group_ids.add(gid)
        gkind = g.get("kind", "context")
        if gkind not in GROUP_KINDS:
            errors.append(f"group '{gid}': unknown kind '{gkind}'")
        label = g.get("label", gid)
        if not isinstance(label, str):
            errors.append(f"group '{gid}': label must be a string")
        groups.append({"id": gid, "label": label, "kind": gkind})

    raw_nodes = spec.get("nodes", [])
    if not isinstance(raw_nodes, list):
        errors.append("nodes must be a list")
        raw_nodes = []
    nodes: list[dict] = []
    kinds: dict[str, str | None] = {}
    for i, raw in enumerate(raw_nodes):
        if not isinstance(raw, dict):
            errors.append(f"nodes[{i}] must be an object")
            continue
        errors += [f"unknown key '{k}' in nodes[{i}]" for k in raw if k not in NODE_KEYS]
        nid = raw.get("id")
        if not isinstance(nid, str) or not _ID_RE.match(nid):
            errors.append(f"nodes[{i}]: missing or invalid id")
            continue
        if nid in kinds:
            errors.append(f"duplicate node id '{nid}'")
            continue
        raw_kind = raw.get("kind")
        kind = ALIASES.get(raw_kind, raw_kind) if isinstance(raw_kind, str) else None
        if kind not in CATALOGUE:
            errors.append(f"unknown kind '{raw_kind}' for node '{nid}'")
            kind = None
        kinds[nid] = kind
        nodes.append({"raw": raw, "id": nid, "kind": kind})

    pins: dict[tuple[int, int], str] = {}
    out_nodes = []
    for n in nodes:
        raw, nid, kind = n["raw"], n["id"], n["kind"]
        fam = _family(kind)
        label = raw.get("label")
        if label is None and fam in ("message", "note"):
            label = CATALOGUE[kind].eip_name
        if label is None and kind is not None:
            errors.append(f"node '{nid}': missing label")
        elif label is not None and not isinstance(label, str):
            errors.append(f"node '{nid}': label must be a string")
        for key in ("sub", "link"):
            if key in raw and not isinstance(raw[key], str):
                errors.append(f"node '{nid}': {key} must be a string")
        badges = raw.get("badges", [])
        if "badges" in raw:
            if not isinstance(badges, list) or not all(isinstance(b, str) for b in badges):
                errors.append(f"node '{nid}': badges must be a list of strings")
                badges = []
            elif fam is not None and fam != "app":
                errors.append(f"badges not allowed on kind '{kind}'")
            else:
                for b in badges:
                    if b not in BADGES and not _COMPETING_RE.match(b):
                        errors.append(f"unknown badge '{b}' on node '{nid}'")
        tags = raw.get("tags", [])
        if "tags" in raw:
            if not isinstance(tags, list) or not all(isinstance(t, str) for t in tags):
                errors.append(f"node '{nid}': tags must be a list of strings")
                tags = []
            elif fam is not None and fam != "pipe":
                errors.append(f"tags not allowed on kind '{kind}'")
        group = raw.get("group")
        if group is not None and group not in group_ids:
            errors.append(f"node '{nid}': unknown group '{group}'")
        lane = raw.get("lane")
        if lane is not None and lane not in lanes:
            errors.append(f"node '{nid}': unknown lane '{lane}'")
        for key in ("col", "row"):
            if key in raw and (not _is_int(raw[key]) or raw[key] < 0):
                errors.append(f"node '{nid}': {key} must be a non-negative integer")
        if "row" in raw and lanes:
            errors.append(f"node '{nid}': row cannot be used with lanes; use lane")
        shadow, attach = raw.get("shadow"), raw.get("attach")
        if shadow is not None:
            if shadow not in kinds:
                errors.append(f"node '{nid}': unknown shadow target '{shadow}'")
            elif _family(kinds[shadow]) != "pipe" and kinds[shadow] is not None:
                errors.append(f"node '{nid}': shadow target '{shadow}' is not a channel")
        if attach is not None:
            if kind is not None and kind != "note":
                errors.append(f"node '{nid}': attach is only valid for kind 'note'")
            if attach not in kinds:
                errors.append(f"node '{nid}': unknown attach target '{attach}'")
        if shadow is not None and attach is not None:
            errors.append(f"node '{nid}': use either shadow or attach, not both")
        parent = shadow if shadow is not None else attach
        if parent is not None and ("col" in raw or "row" in raw):
            errors.append(f"node '{nid}': col/row cannot be combined with shadow/attach")
        if parent is not None and parent in kinds:
            praw = next(m["raw"] for m in nodes if m["id"] == parent)
            if praw.get("shadow") is not None or praw.get("attach") is not None:
                errors.append(f"node '{nid}': '{parent}' is itself attached to another node")
        if _is_int(raw.get("col")) and _is_int(raw.get("row")) and not lanes:
            cell = (raw["col"], raw["row"])
            if cell in pins:
                errors.append(f"nodes '{pins[cell]}' and '{nid}' both pinned to col {cell[0]} row {cell[1]}")
            else:
                pins[cell] = nid
        out_nodes.append(
            {
                "id": nid,
                "kind": kind,
                "label": label if isinstance(label, str) else "",
                "sub": raw.get("sub") if isinstance(raw.get("sub"), str) else None,
                "badges": list(badges) if isinstance(badges, list) else [],
                "tags": list(tags) if isinstance(tags, list) else [],
                "group": group,
                "lane": lane if lane is not None else (lanes[0] if lanes else None),
                "col": raw.get("col"),
                "row": raw.get("row"),
                "parent": parent,
                "shadow": shadow is not None,
                "link": raw.get("link") if isinstance(raw.get("link"), str) else None,
            }
        )

    raw_edges = spec.get("edges", [])
    if not isinstance(raw_edges, list):
        errors.append("edges must be a list")
        raw_edges = []
    out_edges = []
    for i, raw in enumerate(raw_edges):
        if not isinstance(raw, dict):
            errors.append(f"edges[{i}] must be an object")
            continue
        errors += [f"unknown key '{k}' in edges[{i}]" for k in raw if k not in EDGE_KEYS]
        for end in ("from", "to"):
            if end not in raw:
                errors.append(f"edge {i}: missing '{end}'")
            elif raw[end] not in kinds:
                errors.append(f"edge {i}: unknown node '{raw[end]}'")
        if raw.get("from") is not None and raw.get("from") == raw.get("to"):
            errors.append(f"edge {i}: from and to are the same node '{raw['from']}'")
        ekind = raw.get("kind", "message")
        if ekind not in EDGE_KIND_NAMES:
            errors.append(f"edge {i}: unknown edge kind '{ekind}'")
        etype = raw.get("type")
        if etype is not None:
            if ekind != "message":
                errors.append(f"edge {i}: type '{etype}' only valid for kind 'message'")
            elif etype not in MESSAGE_TYPES:
                errors.append(f"edge {i}: unknown message type '{etype}'")
        if "route" in raw and raw["route"] not in ROUTES:
            errors.append(f"edge {i}: unknown route '{raw['route']}'")
        if "style" in raw and raw["style"] not in LINE_STYLES:
            errors.append(f"edge {i}: unknown style '{raw['style']}'")
        if "color" in raw and not (isinstance(raw["color"], str) and _HEX_RE.match(raw["color"])):
            errors.append(f"edge {i}: invalid color '{raw['color']}'")
        if "seq" in raw and not _is_int(raw["seq"]):
            errors.append(f"edge {i}: seq must be an integer")
        for key in ("correlation", "sequence"):
            if key in raw and not isinstance(raw[key], bool):
                errors.append(f"edge {i}: {key} must be true or false")
        for key in ("message", "label", "ttl"):
            if key in raw and not isinstance(raw[key], str):
                errors.append(f"edge {i}: {key} must be a string")
        reply_to = raw.get("reply_to")
        if reply_to is not None and _family(kinds.get(reply_to)) != "pipe":
            errors.append(f"reply_to '{reply_to}' is not a channel (edge {i})")
        key = ekind if etype is None else f"{ekind}:{etype}"
        out_edges.append({**raw, "index": i, "key": key})

    if errors:
        return None, errors
    return {
        "title": title,
        "font": FONTS[font],
        "rough": 1 if sketchy else 0,
        "legend": legend,
        "lanes": lanes,
        "groups": groups,
        "nodes": out_nodes,
        "edges": out_edges,
    }, []


# --------------------------------------------------------------------------- element emitters


def _seed(eid: str) -> int:
    return (zlib.crc32(eid.encode()) & 0x7FFFFFFF) or 1


def _el(eid, etype, x, y, w, h, *, stroke=INK, bg=TRANSPARENT, sw=1, ss="solid", rough=0, roundness=None,
        groups=(), link=None, **extra) -> dict:  # fmt: skip
    seed = _seed(eid)
    el = {
        "id": eid,
        "type": etype,
        "x": x,
        "y": y,
        "width": w,
        "height": h,
        "angle": 0,
        "strokeColor": stroke,
        "backgroundColor": bg,
        "fillStyle": "solid",
        "strokeWidth": sw,
        "strokeStyle": ss,
        "roughness": rough,
        "opacity": 100,
        "groupIds": list(groups),
        "frameId": None,
        "index": None,
        "roundness": roundness,
        "seed": seed,
        "version": 1,
        "versionNonce": seed,
        "isDeleted": False,
        "boundElements": [],
        "updated": 1,
        "link": link,
        "locked": False,
    }
    el.update(extra)
    return el


def _text_size(lines: list[str], size: float, font: int) -> tuple[int, int]:
    factor = 0.62 if font == 3 else 0.6
    width = max((len(line) for line in lines), default=0) * size * factor
    return math.ceil(width), math.ceil(len(lines) * size * 1.25)


def _wrap(text: str, width: int) -> list[str]:
    lines: list[str] = []
    for para in text.split("\n"):
        lines += textwrap.wrap(para, width, break_long_words=False, break_on_hyphens=False) or [""]
    return lines


def _text(eid, lines, x, y, size, font, *, align="center", valign="top", container=None, color=INK, groups=()):
    w, h = _text_size(lines, size, font)
    s = "\n".join(lines)
    return _el(eid, "text", x, y, w, h, stroke=color, groups=groups, text=s, fontSize=size, fontFamily=font,
               textAlign=align, verticalAlign=valign, containerId=container, originalText=s, autoResize=True,
               lineHeight=1.25)  # fmt: skip


def _centred_text(eid, lines, cx, y, size, font, **kw):
    w, _ = _text_size(lines, size, font)
    return _text(eid, lines, cx - w / 2, y, size, font, **kw)


def _bound_text(box, eid, lines, size, font, groups, *, align="center", valign="middle"):
    """Text inside a container: emitted right after it, linked both ways."""
    w, h = _text_size(lines, size, font)
    x = box["x"] + box["width"] / 2 - w / 2 if align == "center" else box["x"] + 5
    y = box["y"] + box["height"] / 2 - h / 2 if valign == "middle" else box["y"] + 5
    box["boundElements"].append({"type": "text", "id": eid})
    return _text(eid, lines, x, y, size, font, align=align, valign=valign, container=box["id"], groups=groups)


def _linear(eid, etype, pts, *, stroke=INK, bg=TRANSPARENT, sw=1, ss="solid", rough=0, start=None, end=None,
            groups=(), polygon=False, start_binding=None, end_binding=None):  # fmt: skip
    x0, y0 = pts[0]
    rel = [[px - x0, py - y0] for px, py in pts]
    xs, ys = [p[0] for p in rel], [p[1] for p in rel]
    extra = {
        "points": rel,
        "startBinding": start_binding,
        "endBinding": end_binding,
        "startArrowhead": start,
        "endArrowhead": end,
    }
    if etype == "arrow":
        extra["elbowed"] = False
    else:
        extra["polygon"] = polygon
    return _el(eid, etype, x0, y0, max(xs) - min(xs), max(ys) - min(ys), stroke=stroke, bg=bg, sw=sw, ss=ss,
               rough=rough, groups=groups, **extra)  # fmt: skip


_SHAPES = {"R": "rectangle", "E": "ellipse", "D": "diamond"}


def _parse_glyph(src: str):
    prims = []
    for part in src.split(";"):
        if not part.strip():
            continue
        op, *args = shlex.split(part)
        pos, opts = [], {}
        for tok in args:
            if "=" in tok and tok.split("=", 1)[0] in ("stroke", "start", "end"):
                k, v = tok.split("=", 1)
                opts[k] = v
            else:
                pos.append(tok)
        prims.append((op, pos, opts))
    return prims


def _glyph(src: str, base: str, k: int, dx: float, dy: float, font: int, groups) -> tuple[list[dict], int]:
    """Icon primitives: stroke 1, roughness 0, sharp corners."""
    out = []
    for op, pos, opts in _parse_glyph(src):
        eid = f"{base}:i{k}"
        k += 1
        stroke = opts.get("stroke", INK)
        if op in _SHAPES:
            x, y, w, h = (float(v) for v in pos[:4])
            fill = pos[4] if len(pos) > 4 else "-"
            bg = TRANSPARENT if fill == "-" else fill
            out.append(_el(eid, _SHAPES[op], x + dx, y + dy, w, h, stroke=stroke, bg=bg, groups=groups))
        elif op == "T":
            cx, cy, size, s = float(pos[0]) + dx, float(pos[1]) + dy, int(pos[2]), pos[3]
            w, h = _text_size([s], size, font)
            out.append(_text(eid, [s], cx - w / 2, cy - h / 2, size, font, valign="middle", groups=groups))
        else:
            pts = [(float(a) + dx, float(b) + dy) for a, b in _POINT_RE.findall(pos[0])]
            if op == "P":
                if pts[0] != pts[-1]:
                    pts.append(pts[0])
                bg = TRANSPARENT if pos[1] == "-" else pos[1]
                out.append(_linear(eid, "line", pts, stroke=stroke, bg=bg, polygon=True, groups=groups))
            elif op == "A":
                out.append(_linear(eid, "arrow", pts, stroke=stroke, end="arrow", groups=groups))
            elif op == "G":
                out.append(_linear(eid, "arrow", pts, stroke=GREY, sw=2, end="triangle", groups=groups))
            else:
                start, end = opts.get("start"), opts.get("end")
                etype = "arrow" if start or end else "line"
                out.append(_linear(eid, etype, pts, stroke=stroke, start=start, end=end, groups=groups))
    return out, k


def _badge_text(badge: str) -> str:
    m = _COMPETING_RE.match(badge)
    return f"competing ×{m.group(1)}" if m else badge


def _badge_name(badge: str) -> str:
    return BADGES["competing" if _COMPETING_RE.match(badge) else badge]


def _stack_cards(badges) -> int:
    """Cards drawn behind a competing-consumers node: one per extra instance, at most two."""
    for b in badges:
        if b == "competing":
            return 2
        m = _COMPETING_RE.match(b)
        if m:
            return min(int(m.group(1)), 3) - 1
    return 0


def _pill(eid, text, x, font, groups) -> tuple[list[dict], float]:
    w, h = _text_size([text], 11, font)
    pw = w + 12
    pill = _el(eid, "rectangle", x, -9, pw, 18, bg=WHITE, roundness={"type": 3}, groups=groups)
    label = _text(f"{eid}:t", [text], x + pw / 2 - w / 2, -h / 2, 11, font, valign="middle", groups=groups)
    return [pill, label], pw


@dataclass
class Drawn:
    """A node drawn at its local origin."""

    els: list[dict]
    box: dict
    shape: str = "rect"
    radius: float = 0.0
    right_extra: float = 0.0
    bottom_extra: float = 0.0
    caption: tuple[float, float] | None = None
    margin: float = 10.0


def _draw_node(base, gid, kind_name, label, sub, badges, tags, font, rough, *, bare=False, link=None) -> Drawn:
    """Emit one node: under-parts, bindable box, bound label, over-parts, glyph, tag, badges, caption, sub."""
    kind = CATALOGUE[kind_name]
    fam = kind.family
    fill = kind.fill or FAMILY_FILL[fam]
    ss = "dashed" if kind.dashed else "solid"
    groups = [gid]
    els: list[dict] = []
    k = 0
    shape, radius, right_extra, bottom_extra = "rect", 0.0, 0.0, 0.0
    caption_lines: list[str] = []

    if fam in ("component", "message"):
        box = _el(base, "rectangle", 0, 0, 96, 64, bg=fill, sw=2, ss=ss, rough=rough, groups=groups, link=link)
        els.append(box)
        icons, k = _glyph(kind.glyph, base, k, 0, 0, font, groups)
        els += icons
        cx, cap_y = 48, kind.caption_y or 72
        caption_lines = _wrap(label, 20)
    elif fam == "pipe":
        tag_text = " · ".join(([kind.tag] if kind.tag else []) + list(tags))
        tw, th = _text_size([tag_text], 11, font)
        w = max(168, 10 + tw + 22) if tag_text else 168
        box = _el(base, "rectangle", 0, 0, w, 36, bg=fill, sw=2, ss=ss, rough=rough, groups=groups, link=link)
        els.append(box)
        els.append(_el(f"{base}:i{k}", "ellipse", w - 12, 0, 24, 36, bg=PIPE_CAP_FILL, sw=2, rough=rough,
                       groups=groups))  # fmt: skip
        k += 1
        total = w + 12
        icons, k = _glyph(kind.glyph, base, k, (total - 180) / 2, 0, font, groups)
        els += icons
        if tag_text:
            els.append(_text(f"{base}:tag", [tag_text], 10, 18 - th / 2, 11, font, align="left", valign="middle",
                             groups=groups))  # fmt: skip
        cx, cap_y = total / 2, kind.caption_y or 44
        right_extra = 12
        caption_lines = _wrap(label, 20)
    elif fam == "app":
        lines = [] if bare else _wrap(label, 22)
        tw, th = _text_size(lines, 16, font)
        pills = [] if bare else [_badge_text(b) for b in badges]
        pill_ws = [_text_size([p], 11, font)[0] + 12 for p in pills]
        w = max(180, tw + 32, 24 + sum(pw + 6 for pw in pill_ws))
        h = max(72, th + 20)
        cards = 0 if bare else _stack_cards(badges)
        for i in range(cards, 0, -1):  # farthest first, so the front box draws on top
            off = i * STACK_STEP
            els.append(_el(f"{base}:s{i}", "rectangle", off, off, w, h, bg=fill, sw=2, ss=ss, rough=rough,
                           roundness={"type": 3}, groups=groups))  # fmt: skip
        box = _el(base, "rectangle", 0, 0, w, h, bg=fill, sw=2, ss=ss, rough=rough, roundness={"type": 3},
                  groups=groups, link=link)  # fmt: skip
        els.append(box)
        right_extra = bottom_extra = cards * STACK_STEP
        if lines:
            els.append(_bound_text(box, f"{base}:lbl", lines, 16, font, groups))
        x = 12.0
        for i, text in enumerate(pills):
            pill_els, pw = _pill(f"{base}:b{i}", text, x, font, groups)
            els += pill_els
            x += pw + 6
        radius = min(w, h) * 0.25 if min(w, h) <= 128 else 32
        cx, cap_y = w / 2, h + 8 + bottom_extra
    elif fam == "cylinder":
        lines = [] if bare else _wrap(label, 16)
        tw, th = _text_size(lines, 14, font)
        w = max(140, tw + 24)
        body_h = max(64, th + 16)
        els.append(_el(f"{base}:i{k}", "ellipse", 0, body_h, w, 16, bg=fill, sw=2, rough=rough, groups=groups))
        k += 1
        box = _el(base, "rectangle", 0, 8, w, body_h, bg=fill, sw=2, rough=rough, groups=groups, link=link)
        els.append(box)
        if lines:
            els.append(_bound_text(box, f"{base}:lbl", lines, 14, font, groups))
        els.append(_el(f"{base}:i{k}", "ellipse", 0, 0, w, 16, bg=fill, sw=2, rough=rough, groups=groups))
        k += 1
        icons, k = _glyph(kind.glyph, base, k, (w - 140) / 2, 0, font, groups)
        els += icons
        cx, cap_y = w / 2, body_h + 24
    elif fam == "actor":
        lines = [] if bare else _wrap(label, 12)
        tw, th = _text_size(lines, 14, font)
        w = max(140, math.ceil(tw * 1.42) + 24)
        h = max(64, math.ceil(th * 1.42) + 16)
        box = _el(base, "ellipse", 0, 0, w, h, bg=fill, sw=2, rough=rough, groups=groups, link=link)
        els.append(box)
        if lines:
            els.append(_bound_text(box, f"{base}:lbl", lines, 14, font, groups))
        shape = "ellipse"
        cx, cap_y = w / 2, h + 8
    else:  # note
        lines = [] if bare else _wrap(label, 28)
        tw, _ = _text_size(lines, 12, font)
        w = max(160, tw + 16)
        h = len(lines) * 15 + 16 if lines else 46
        box = _el(base, "rectangle", 0, 0, w, h, bg=fill, rough=rough, groups=groups, link=link)
        els.append(box)
        if lines:
            els.append(_bound_text(box, f"{base}:lbl", lines, 12, font, groups, align="left", valign="top"))
        cx, cap_y = w / 2, h + 8

    below: list[dict] = []
    y = cap_y
    if not bare and caption_lines and caption_lines != [""]:
        below.append(_centred_text(f"{base}:cap", caption_lines, cx, y, 14, font, groups=groups))
        y += below[-1]["height"] + 2
    if not bare and sub:
        below.append(_centred_text(f"{base}:sub", _wrap(sub, 26), cx, y, 12, font, color=MUTED, groups=groups))
    els += below
    caption = (min(t["x"] for t in below), max(t["x"] + t["width"] for t in below)) if below else None
    margin = 5.0 if fam == "pipe" else 6.0 if fam in ("component", "message") else max(10.0, radius)
    return Drawn(els, box, shape, radius, right_extra, bottom_extra, caption, margin)


# --------------------------------------------------------------------------- geometry helpers


def _bbox(el) -> tuple[float, float, float, float]:
    if "points" in el:
        xs = [el["x"] + p[0] for p in el["points"]]
        ys = [el["y"] + p[1] for p in el["points"]]
        return min(xs), min(ys), max(xs), max(ys)
    return el["x"], el["y"], el["x"] + el["width"], el["y"] + el["height"]


def _union(boxes) -> tuple[float, float, float, float]:
    boxes = list(boxes)
    return (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))


def _overlaps(a, b) -> bool:
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def _expand(r, d):
    return (r[0] - d, r[1] - d, r[2] + d, r[3] + d)


def _segment_hits(p, q, r) -> bool:
    """Liang-Barsky: does segment p-q intersect rectangle r?"""
    dx, dy = q[0] - p[0], q[1] - p[1]
    t0, t1 = 0.0, 1.0
    for pp, qq in ((-dx, p[0] - r[0]), (dx, r[2] - p[0]), (-dy, p[1] - r[1]), (dy, r[3] - p[1])):
        if pp == 0:
            if qq < 0:
                return False
            continue
        t = qq / pp
        if pp < 0:
            t0 = max(t0, t)
        else:
            t1 = min(t1, t)
        if t0 > t1:
            return False
    return True


def _shift(els, dx, dy):
    for el in els:
        el["x"] += dx
        el["y"] += dy


def _round(v: float) -> int:
    return int(math.floor(v + 0.5))


def _finalize(els):
    """Integer coordinates everywhere; linear sizes recomputed from rounded points."""
    for el in els:
        el["x"], el["y"] = _round(el["x"]), _round(el["y"])
        if "points" in el:
            pts = [[_round(px), _round(py)] for px, py in el["points"]]
            el["points"] = pts
            el["width"] = max(p[0] for p in pts) - min(p[0] for p in pts)
            el["height"] = max(p[1] for p in pts) - min(p[1] for p in pts)
        else:
            el["width"], el["height"] = _round(el["width"]), _round(el["height"])


def _scale(els, s: float):
    """Scale elements about the origin; text keeps its centre and gets a font size of at least 9."""
    for el in els:
        el["x"] *= s
        el["y"] *= s
        el["width"] *= s
        el["height"] *= s
        if "points" in el:
            el["points"] = [[px * s, py * s] for px, py in el["points"]]
        if el["type"] == "text":
            cx, cy = el["x"] + el["width"] / 2, el["y"] + el["height"] / 2
            size = max(9, math.floor(el["fontSize"] * s))
            w, h = _text_size(el["text"].split("\n"), size, el["fontFamily"])
            if el["textAlign"] != "left":
                el["x"] = cx - w / 2
            el["y"] = cy - h / 2
            el["fontSize"], el["width"], el["height"] = size, w, h


def _label_anchor(pts) -> tuple[float, float]:
    """Where Excalidraw centres an arrow label: middle point, or middle of the middle segment."""
    n = len(pts)
    if n % 2:
        return pts[n // 2]
    i = n // 2 - 1
    return ((pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2)


def _edge_lines(e: dict) -> list[str]:
    marker = EDGE_KINDS[e["key"]].marker
    head = e.get("message") or e.get("label") or ""
    first = " ".join(p for p in (marker, head) if p)
    if e.get("seq") is not None:
        first = f"{e['seq']}. {first}".rstrip()
    lines = [first] if first else []
    if e.get("message") and e.get("label"):
        lines.append(e["label"])
    notes = []
    if e.get("reply_to"):
        notes.append(f"reply-to: {e['reply_to']}")
    if e.get("correlation"):
        notes.append("corr-id")
    if e.get("ttl"):
        notes.append(f"ttl {e['ttl']}")
    if e.get("sequence"):
        notes.append("seq#")
    if notes:
        # pack annotations onto lines of at most ~24 characters so request-reply labels stay narrow
        packed = [notes[0]]
        for note in notes[1:]:
            joined = f"{packed[-1]} · {note}"
            if len(joined) > 24:
                packed.append(note)
            else:
                packed[-1] = joined
        lines += packed
    return lines


def _stack_offsets(edges) -> tuple[dict[int, float], float]:
    """Distances of stacked loop lines (below/above) from the content edge, plus total depth."""
    offsets: dict[int, float] = {}
    cur, prev_h = None, 0.0
    for e in edges:
        h = e.th
        cur = LOOP_OFFSET + h / 2 if cur is None else cur + max(LOOP_STEP, prev_h / 2 + h / 2 + 8)
        offsets[e.idx] = cur
        prev_h = h
    return offsets, (cur + prev_h / 2 + 8 if cur is not None else 0.0)


# --------------------------------------------------------------------------- builder


@dataclass
class _Node:
    id: str
    idx: int
    spec: dict
    drawn: Drawn
    slot: tuple
    bcx: float
    bcy: float
    rel: tuple = (0.0, 0.0)
    combined: tuple = ()
    ox: float = 0.0
    oy: float = 0.0


@dataclass
class _Edge:
    idx: int
    src: str
    dst: str
    key: str
    spec: dict
    route: str = "straight"
    sides: tuple | None = None
    gap: int = 0
    band: int = 0
    band_dir: int = 1
    label_gap: int | None = None
    lines: list = field(default_factory=list)
    tw: int = 0
    th: int = 0
    ends: list = field(default_factory=lambda: [None, None])
    binding_gaps: list = field(default_factory=lambda: [1, 1])
    points: list = field(default_factory=list)
    label_box: tuple | None = None


class _Builder:
    def __init__(self, spec: dict):
        self.spec = spec
        self.font = spec["font"]
        self.rough = spec["rough"]
        self.warnings: list[str] = []
        self.nodes: dict[str, _Node] = {}
        for i, n in enumerate(spec["nodes"]):
            d = _draw_node(f"n:{n['id']}", f"grp:{n['id']}", n["kind"], n["label"], n["sub"], n["badges"],
                           n["tags"], self.font, self.rough, link=n["link"])  # fmt: skip
            b = d.box
            self.nodes[n["id"]] = _Node(n["id"], i, n, d, _union(_bbox(el) for el in d.els),
                                        b["x"] + b["width"] / 2, b["y"] + b["height"] / 2)  # fmt: skip
        self.roots = [n["id"] for n in spec["nodes"] if not n["parent"]]
        self.children = {r: [n["id"] for n in spec["nodes"] if n["parent"] == r] for r in self.roots}
        self.edges = [_Edge(e["index"], e["from"], e["to"], e["key"], e) for e in spec["edges"]]
        base = len(self.edges)
        for n in spec["nodes"]:
            if n["shadow"]:
                spec_edge = {"from": n["parent"], "to": n["id"], "kind": "dlq", "key": "dlq", "index": base}
                self.edges.append(_Edge(base, n["parent"], n["id"], "dlq", spec_edge))
                base += 1
        self.frames: dict[str, tuple] = {}

    def root(self, nid: str) -> str:
        return self.nodes[nid].spec["parent"] or nid

    # ---- layout

    def run(self) -> tuple[dict, list[str]]:
        self._fold_children()
        self._columns()
        self._rows()
        self._routes()
        self._place()
        self._attach()
        self._check()
        return self._assemble(), self.warnings

    def _fold_children(self):
        for r in self.roots:
            n = self.nodes[r]
            x0, y0, x1, bottom = n.slot
            for cid in self.children[r]:
                c = self.nodes[cid]
                dx = n.bcx - c.bcx
                dy = bottom + SHADOW_GAP - c.slot[1]
                c.rel = (dx, dy)
                x0, x1 = min(x0, c.slot[0] + dx), max(x1, c.slot[2] + dx)
                bottom = c.slot[3] + dy
            n.combined = (x0, y0, x1, bottom)

    def _layer_edges(self):
        out = []
        for e in self.edges:
            a, b = self.root(e.src), self.root(e.dst)
            if a == b:
                continue
            if e.key == "message:reply":
                a, b = b, a
            out.append((e.idx, a, b))
        return out

    def _columns(self):
        lay = self._layer_edges()
        succ = {r: [] for r in self.roots}
        for ei, a, b in lay:
            succ[a].append((ei, b))
        state: dict[str, int] = {}
        back: set[int] = set()

        def dfs(u):
            state[u] = 1
            for ei, v in succ[u]:
                if state.get(v) == 1:
                    back.add(ei)
                elif not state.get(v):
                    dfs(v)
            state[u] = 2

        sys.setrecursionlimit(max(1000, 4 * len(self.roots) + 100))
        for r in self.roots:
            if not state.get(r):
                dfs(r)
        preds = {r: [] for r in self.roots}
        indeg = {r: 0 for r in self.roots}
        kept = defaultdict(list)
        for ei, a, b in lay:
            if ei in back:
                continue
            preds[b].append(a)
            kept[a].append(b)
            indeg[b] += 1
        heap = [(self.nodes[r].idx, r) for r in self.roots if indeg[r] == 0]
        heapq.heapify(heap)
        self.col: dict[str, int] = {}
        while heap:
            _, u = heapq.heappop(heap)
            pin = self.nodes[u].spec["col"]
            self.col[u] = pin if pin is not None else max((self.col[p] + 1 for p in preds[u]), default=0)
            for v in kept[u]:
                indeg[v] -= 1
                if indeg[v] == 0:
                    heapq.heappush(heap, (self.nodes[v].idx, v))
        self.ncols = max(self.col.values(), default=-1) + 1
        self.nbrs = defaultdict(set)
        for _, a, b in lay:
            self.nbrs[a].add(b)
            self.nbrs[b].add(a)

    def _rows(self):
        by_col = defaultdict(list)
        for r in self.roots:
            by_col[self.col[r]].append(r)
        self.row: dict[str, int] = {}
        lanes = self.spec["lanes"]
        if lanes:
            self.lane_rows: list[tuple[int, int]] = []
            depth = defaultdict(int)
            sub: dict[str, tuple[int, int]] = {}
            for c in sorted(by_col):
                for u in by_col[c]:
                    li = lanes.index(self.nodes[u].spec["lane"])
                    sub[u] = (li, depth[(c, li)])
                    depth[(c, li)] += 1
            index = {}
            for li in range(len(lanes)):
                for kk in range(max([1] + [d for (c, l2), d in depth.items() if l2 == li])):
                    index[(li, kk)] = len(self.lane_rows)
                    self.lane_rows.append((li, kk))
            for u, s in sub.items():
                self.row[u] = index[s]
            self.nrows = len(self.lane_rows)
            return
        pins = {r: self.nodes[r].spec["row"] for r in self.roots if self.nodes[r].spec["row"] is not None}
        for members in by_col.values():
            self._assign(members, {u: float(i) for i, u in enumerate(members)}, pins)
        for left_to_right in (True, False):
            for c in sorted(by_col, reverse=not left_to_right):
                keys = {}
                for u in by_col[c]:
                    nb = [self.row[v] for v in self.nbrs[u] if (self.col[v] < c if left_to_right else self.col[v] > c)]
                    keys[u] = sum(nb) / len(nb) if nb else float(self.row[u])
                self._assign(by_col[c], keys, pins)
        low = min(self.row.values(), default=0)
        if not pins:
            for u in self.row:
                self.row[u] -= low
        self.nrows = max(self.row.values(), default=-1) + 1

    def _assign(self, members, keys, pins):
        """Rows near each node's barycentre; pinned rows are exact, collisions push down."""
        taken = {pins[u] for u in members if u in pins}
        for u in members:
            if u in pins:
                self.row[u] = pins[u]
        prev = -1
        for u in sorted((u for u in members if u not in pins), key=lambda u: (keys[u], self.nodes[u].idx)):
            r = max(prev + 1, math.ceil(keys[u] - 0.5))
            while r in taken:
                r += 1
            self.row[u] = r
            prev = r

    def _routes(self):
        for e in self.edges:
            a, b = self.root(e.src), self.root(e.dst)
            cs, ct = self.col[a], self.col[b]
            route = e.spec.get("route")
            if route is None:
                if a == b or cs == ct:
                    route = "straight"
                elif ct > cs:
                    # a shadow/attached endpoint sits below its row's axis, so only roots can go straight
                    level = self.row[a] == self.row[b] and a == e.src and b == e.dst
                    route = "straight" if level else "ortho"
                else:
                    route = "ortho" if cs - ct == 1 else "below"
            e.route = route
            if route == "straight":
                e.sides = None if cs == ct else (("right", "left") if ct > cs else ("left", "right"))
            elif route == "ortho":
                if ct > cs:
                    e.sides, e.gap = ("right", "left"), cs
                elif ct < cs:
                    e.sides, e.gap = ("left", "right"), cs - 1
                else:
                    e.sides, e.gap = ("right", "right"), cs
            elif route == "below":
                e.sides = ("bottom", "bottom")
            else:
                e.sides = ("top", "top")
            e.lines = _edge_lines(e.spec)
            e.tw, e.th = _text_size(e.lines, 14, self.font) if e.lines else (0, 0)
            if e.sides and e.sides[0] in ("left", "right") and e.sides[1] != e.sides[0]:
                e.label_gap = ct - 1 if ct > cs else ct
        # vertical bands: forward verticals hug the left of their gap, backward ones the right
        self.n_fwd, self.n_back = defaultdict(int), defaultdict(int)
        by_gap = defaultdict(list)
        for e in self.edges:
            if e.route == "ortho":
                by_gap[(e.gap, e.sides[0] == "left")].append(e)
        for (g, backward), lst in by_gap.items():
            lst.sort(key=self._ortho_key)
            for i, e in enumerate(lst):
                e.band, e.band_dir = i, -1 if backward else 1
            (self.n_back if backward else self.n_fwd)[g] = len(lst)
        self.below_off, self.below_depth = _stack_offsets([e for e in self.edges if e.route == "below"])
        self.above_off, self.above_depth = _stack_offsets([e for e in self.edges if e.route == "above"])

    def _band_widths(self, g: int) -> tuple[float, float]:
        fwd = BAND_PAD + ORTHO_STEP * (self.n_fwd[g] - 1) if self.n_fwd[g] else 0.0
        back = BAND_PAD + ORTHO_STEP * (self.n_back[g] - 1) if self.n_back[g] else 0.0
        return fwd, back

    def _ortho_key(self, e: _Edge):
        """Order inside a band (index 0 nearest the edge's source) so that turns do not cross."""
        rs, rt = self.row[self.root(e.src)], self.row[self.root(e.dst)]
        up = rt < rs
        return (0 if e.sides[1] != e.sides[0] else 1, 0 if up else 1, rs if up else -rs, e.idx)

    def _place(self):
        gap_w = [float(COL_GAP)] * max(self.ncols, 1)
        for g in range(len(gap_w)):
            fwd, back = self._band_widths(g)
            gap_w[g] = max(gap_w[g], fwd + back + 24)
        # widest label per gap and direction; a gap carrying labels both ways (request and reply)
        # puts each label against its own target, so it must hold both side by side
        self.label_w: dict[tuple[int, bool], float] = defaultdict(float)
        for e in self.edges:
            g = e.label_gap
            if e.lines and g is not None and 0 <= g < len(gap_w):
                key = (g, e.sides[0] == "right")
                self.label_w[key] = max(self.label_w[key], e.tw)
        for g in range(len(gap_w)):
            fwd, back = self._band_widths(g)
            right, left = self.label_w[(g, True)], self.label_w[(g, False)]
            # each label direction also keeps clear of the arrowhead in front of its own target
            labels = right + left + 48 + 2 * ARROWHEAD if right and left else max(right, left) + 32 + ARROWHEAD
            gap_w[g] = max(gap_w[g], fwd + back + labels)
        row_gap = [float(ROW_GAP)] * max(self.nrows, 1)
        for _ in range(12):
            self._coords(gap_w, row_gap)
            if not self._separate_frames(gap_w, row_gap):
                break

    def _coords(self, gap_w, row_gap):
        left, right = defaultdict(float), defaultdict(float)
        up, down = defaultdict(float), defaultdict(float)
        for r in self.roots:
            n = self.nodes[r]
            x0, y0, x1, y1 = n.combined
            c, w = self.col[r], self.row[r]
            left[c], right[c] = max(left[c], n.bcx - x0), max(right[c], x1 - n.bcx)
            up[w], down[w] = max(up[w], n.bcy - y0), max(down[w], y1 - n.bcy)
        lanes = self.spec["lanes"]
        gutter = (max(_text_size([lane], 14, self.font)[0] for lane in lanes) + 24) if lanes else 0
        has_frames = any(any(n.spec["group"] == g["id"] for n in self.nodes.values()) for g in self.spec["groups"])
        x = MARGIN + gutter + (FRAME_PAD if has_frames else 0)
        self.x0, self.colw = [], []
        for c in range(self.ncols):
            self.x0.append(x)
            self.colw.append(left[c] + right[c])
            x += left[c] + right[c] + gap_w[c]
        self.gap_w = list(gap_w)
        top = MARGIN + (TITLE_H if self.spec["title"] else 0)
        top += max(FRAME_PAD_TOP + FRAME_NAME_H if has_frames else 0, self.above_depth)
        self.rows_top = top
        self.y0, self.rowh = [], []
        y = top
        for w in range(self.nrows):
            if lanes and up[w] + down[w] == 0:
                up[w] = down[w] = 20
            self.y0.append(y)
            self.rowh.append(up[w] + down[w])
            y += up[w] + down[w] + row_gap[w]
        self.row_gap = list(row_gap)
        for r in self.roots:
            n = self.nodes[r]
            c, w = self.col[r], self.row[r]
            n.ox = self.x0[c] + left[c] - n.bcx
            n.oy = self.y0[w] + up[w] - n.bcy
            for cid in self.children[r]:
                ch = self.nodes[cid]
                ch.ox, ch.oy = n.ox + ch.rel[0], n.oy + ch.rel[1]
        self.frames = {}
        for g in self.spec["groups"]:
            members = [n for n in self.nodes.values() if n.spec["group"] == g["id"]]
            if not members:
                continue
            x0, y0, x1, y1 = _union(self.slot_abs(n.id) for n in members)
            rows = [self.row[self.root(n.id)] for n in members]
            cols = [self.col[self.root(n.id)] for n in members]
            self.frames[g["id"]] = (x0 - FRAME_PAD, y0 - FRAME_PAD_TOP, x1 + FRAME_PAD, y1 + FRAME_PAD,
                                    min(rows), max(rows), min(cols), max(cols))  # fmt: skip

    def _separate_frames(self, gap_w, row_gap) -> bool:
        """Widen one row or column gap when two frames with disjoint rows/columns overlap."""
        ids = list(self.frames)
        for i, a_id in enumerate(ids):
            for b_id in ids[i + 1 :]:
                a, b = self.frames[a_id], self.frames[b_id]
                if not _overlaps(a[:4], b[:4]):
                    continue
                if a[5] < b[4] or b[5] < a[4]:
                    upper, lower = (a, b) if a[5] < b[4] else (b, a)
                    row_gap[upper[5]] += upper[3] - lower[1] + FRAME_NAME_H + 8
                    return True
                if a[7] < b[6] or b[7] < a[6]:
                    lft, rgt = (a, b) if a[7] < b[6] else (b, a)
                    gap_w[lft[7]] += lft[2] - rgt[0] + 16
                    return True
        return False

    # ---- absolute geometry

    def slot_abs(self, nid: str):
        n = self.nodes[nid]
        return (n.slot[0] + n.ox, n.slot[1] + n.oy, n.slot[2] + n.ox, n.slot[3] + n.oy)

    def box_abs(self, nid: str):
        n = self.nodes[nid]
        b = n.drawn.box
        return (b["x"] + n.ox, b["y"] + n.oy, b["width"], b["height"])

    def _side_range(self, nid: str, side: str) -> tuple[float, float]:
        n = self.nodes[nid]
        x, y, w, h = self.box_abs(nid)
        m = n.drawn.margin
        if side in ("left", "right"):
            return (y + m, y + h - m) if h > 2 * m else (y + h / 2, y + h / 2)
        return (x + m, x + w - m) if w > 2 * m else (x + w / 2, x + w / 2)

    def _bottom_base(self, nid: str, lo: float, hi: float) -> float:
        """Bottom attach x in [lo, hi] that avoids the node's own caption when there is room beside it."""
        n = self.nodes[nid]
        centre = min(hi, max(lo, self.box_abs(nid)[0] + self.box_abs(nid)[2] / 2))
        if n.drawn.caption is None:
            return centre
        c0, c1 = n.drawn.caption[0] + n.ox - 6, n.drawn.caption[1] + n.ox + 6
        if c0 > lo:
            return (lo + min(c0, hi)) / 2
        if c1 < hi:
            return (max(c1, lo) + hi) / 2
        return centre

    def _side_point(self, nid: str, side: str, along: float) -> tuple[tuple[float, float], float]:
        n = self.nodes[nid]
        x, y, w, h = self.box_abs(nid)
        if n.drawn.shape == "ellipse":
            a, b = w / 2, h / 2
            cx, cy = x + a, y + b
            if side in ("left", "right"):
                d = a * math.sqrt(max(0.0, 1 - ((along - cy) / b) ** 2))
                return ((cx - d - 1 if side == "left" else cx + d + 1), along), 1
            d = b * math.sqrt(max(0.0, 1 - ((along - cx) / a) ** 2))
            return (along, cy - d - 1 if side == "top" else cy + d + 1), 1
        if side == "left":
            return (x - 1, along), 1
        if side == "right":
            return (x + w + n.drawn.right_extra + 1, along), 1 + n.drawn.right_extra
        if side == "top":
            return (along, y - 1), 1
        return (along, y + h + n.drawn.bottom_extra + 1), 1 + n.drawn.bottom_extra

    def _attach(self):
        groups = defaultdict(list)
        for e in self.edges:
            if e.sides is None:
                sy = self.box_abs(e.src)[1]
                ty = self.box_abs(e.dst)[1]
                e.sides = ("bottom", "top") if sy < ty else ("top", "bottom")
            for which, nid, other in ((0, e.src, e.dst), (1, e.dst, e.src)):
                side = e.sides[which]
                ox, oy, ow, oh = self.box_abs(other)
                coord = oy + oh / 2 if side in ("left", "right") else ox + ow / 2
                groups[(nid, side)].append((coord, e.idx, which, e))
        for (nid, side), lst in sorted(groups.items(), key=lambda kv: (self.nodes[kv[0][0]].idx, kv[0][1])):
            lst.sort(key=lambda t: (t[0], t[1], t[2]))
            lo, hi = self._side_range(nid, side)
            x, y, w, h = self.box_abs(nid)
            if side in ("top", "bottom") and len(lst) == 1 and lst[0][3].route == "straight":
                # vertical edge: keep the attach x inside the partner's facing side so the line stays vertical
                e = lst[0][3]
                partner = e.dst if lst[0][2] == 0 else e.src
                plo, phi = self._side_range(partner, "top" if side == "bottom" else "bottom")
                if max(lo, plo) <= min(hi, phi):
                    lo, hi = max(lo, plo), min(hi, phi)
            if side == "bottom":
                base = self._bottom_base(nid, lo, hi)
            elif side in ("left", "right"):
                base = y + h / 2
            else:
                base = min(hi, max(lo, x + w / 2))
            k = len(lst)
            step, start = 0.0, base
            if k > 1:
                # spread ends; labels sitting on runs at this side need room between their neighbours
                runs = [e.th for _, _, which, e in lst
                        if e.lines and (e.route == "straight" or (which == 1 and e.label_gap is not None))]  # fmt: skip
                want = max(FAN_STEP, max(runs) + 4 if len(runs) > 1 else (runs[0] / 2 + 6 if runs else 0))
                step = max(0.0, min(want, (hi - lo) / (k - 1)))
                aligned = [i for i, t in enumerate(lst) if abs(t[0] - base) < 1]
                start = base - (aligned[0] if aligned else (k - 1) / 2) * step
            start = max(lo, min(start, hi - (k - 1) * step))
            for i, (_, _, which, e) in enumerate(lst):
                along = start + i * step
                e.ends[which], e.binding_gaps[which] = self._side_point(nid, side, along)
        bottoms = [self.slot_abs(n)[3] for n in self.nodes] + [f[3] for f in self.frames.values()]
        if self.nrows:
            bottoms.append(self.y0[-1] + self.rowh[-1])
        self.bottom = max(bottoms, default=MARGIN)
        for e in self.edges:
            self._polyline(e)

    def _within(self, nid, side, v) -> bool:
        lo, hi = self._side_range(nid, side)
        return lo - 0.5 <= v <= hi + 0.5

    def _gap_bounds(self, g: int) -> tuple[float, float]:
        left = self.x0[g] + self.colw[g]
        return left, left + self.gap_w[g]

    def _label_window(self, e: _Edge, pts: list) -> list:
        """Centre the label on the final horizontal run, clear of the gap's vertical bands and the arrowhead.

        Excalidraw centres a label on the middle point (odd count) or the middle segment (even count),
        so collinear points are inserted to make the middle point the window centre.
        """
        g = e.label_gap
        if not e.lines or g is None or not 0 <= g < self.ncols or len(pts) not in (2, 4):
            return pts
        a, q = pts[-2], pts[-1]
        if abs(a[1] - q[1]) >= 1:
            return pts
        y, d = q[1], (1 if q[0] > a[0] else -1)
        left, right = self._gap_bounds(g)
        fwd, back = self._band_widths(g)
        lo = max(min(a[0], q[0]), left + fwd) + 8
        hi = min(max(a[0], q[0]), right - back) - 8
        # Excalidraw draws the arrowhead over the last ARROWHEAD px before the target
        if d > 0:
            hi -= ARROWHEAD
        else:
            lo += ARROWHEAD
        if hi - lo < 4:
            return pts
        cx = (lo + hi) / 2
        both = self.label_w[(g, True)] and self.label_w[(g, False)]
        if both and hi - lo > e.tw:
            cx = hi - e.tw / 2 if d > 0 else lo + e.tw / 2
        if len(pts) == 2:
            # keep plain 2-point arrows (they stay straight when a node is dragged) unless a band of
            # verticals, the arrowhead or an opposing label shares the default, mid-run label position
            mid = (a[0] + q[0]) / 2
            span = (mid - e.tw / 2 - 4, mid + e.tw / 2 + 4)
            bands = [(left, left + fwd)] if fwd else []
            bands += [(right - back, right)] if back else []
            bands.append((q[0] - ARROWHEAD, q[0]) if d > 0 else (q[0], q[0] + ARROWHEAD))
            if not both and not any(b0 < span[1] and span[0] < b1 for b0, b1 in bands):
                return pts
            if d * (cx - a[0]) <= 2 or d * (q[0] - cx) <= 2:
                return pts
            return [a, [cx, y], q]
        # 7 points: the label sits on the middle point; the two after it stay under the label, so the
        # final segment runs from there to the target and is long enough for a full-size arrowhead
        if d * (cx - a[0]) <= 2 or d * (q[0] - cx) <= 4:
            return pts
        return [pts[0], pts[1], a, [cx, y], [cx + d, y], [cx + 2 * d, y], q]

    def _polyline(self, e: _Edge):
        p, q = list(e.ends[0]), list(e.ends[1])
        s_side, t_side = e.sides
        if e.route == "straight":
            ranges = (self._side_range(e.src, s_side), self._side_range(e.dst, t_side))
            lo, hi = max(r[0] for r in ranges), min(r[1] for r in ranges)
            if lo <= hi + 0.5:
                # keep the line axis-parallel: one shared coordinate inside both facing sides
                axis = 1 if s_side in ("left", "right") else 0
                ref = q[0] if s_side == "top" else p[axis]
                v = min(max(ref, lo), hi)
                p = list(self._side_point(e.src, s_side, v)[0])
                q = list(self._side_point(e.dst, t_side, v)[0])
            pts = [p, q]
            if s_side in ("left", "right") and abs(p[1] - q[1]) < 1:
                pts = self._label_window(e, pts)
        elif e.route == "ortho":
            left, right = self._gap_bounds(e.gap)
            step = ORTHO_STEP * e.band
            mx = left + BAND_PAD + step if e.band_dir > 0 else right - BAND_PAD - step
            pts = [p, q] if abs(p[1] - q[1]) < 1 else [p, [mx, p[1]], [mx, q[1]], q]
            pts = self._label_window(e, pts)
        elif e.route == "below":
            ly = self.bottom + self.below_off[e.idx]
            pts = [p, [p[0], ly], [q[0], ly], q]
        else:
            ly = self.rows_top - self.above_off[e.idx]
            pts = [p, [p[0], ly], [q[0], ly], q]
        e.points = [[_round(px), _round(py)] for px, py in pts]
        if e.lines:
            ax, ay = _label_anchor(e.points)
            e.label_box = (ax - e.tw / 2, ay - e.th / 2, ax + e.tw / 2, ay + e.th / 2)

    def _check(self):
        order = [n["id"] for n in self.spec["nodes"]]
        for e in self.edges:
            ends = (e.src, e.dst)
            segs = list(zip(e.points, e.points[1:], strict=False))
            for nid in order:
                if nid in ends:
                    continue
                if any(_segment_hits(a, b, _expand(self.slot_abs(nid), 4)) for a, b in segs):
                    self.warnings.append(f"edge {e.idx} ({e.src} -> {e.dst}) crosses node '{nid}'")
            (x0, y0), (x1, y1) = e.points[-2], e.points[-1]
            if (run := math.hypot(x1 - x0, y1 - y0)) < ARROWHEAD:
                self.warnings.append(f"edge {e.idx} ({e.src} -> {e.dst}) ends in a {run:.0f}px segment: "
                                     "its arrowhead shrinks")  # fmt: skip
            if e.label_box:
                for nid in order:
                    if nid not in ends and _overlaps(e.label_box, self.slot_abs(nid)):
                        self.warnings.append(f"label of edge {e.idx} overlaps node '{nid}'")
        for g in self.spec["groups"]:
            if g["id"] not in self.frames:
                self.warnings.append(f"group '{g['id']}' has no members")
                continue
            rect = self.frames[g["id"]][:4]
            for nid in order:
                if self.nodes[nid].spec["group"] != g["id"] and _overlaps(rect, self.slot_abs(nid)):
                    self.warnings.append(f"frame '{g['id']}' encloses non-member node '{nid}'")
        ids = list(self.frames)
        for i, a in enumerate(ids):
            for b in ids[i + 1 :]:
                if _overlaps(self.frames[a][:4], self.frames[b][:4]):
                    self.warnings.append(f"frames '{a}' and '{b}' overlap")

    # ---- output

    def _assemble(self) -> dict:
        els: list[dict] = []
        font = self.font
        if self.spec["title"]:
            els.append(_text("title", [self.spec["title"]], MARGIN, MARGIN, 28, font, align="left"))
        lanes = self.spec["lanes"]
        right_edge = (self.x0[-1] + self.colw[-1]) if self.ncols else MARGIN
        if lanes:
            for li, name in enumerate(lanes):
                rows = [i for i, (l2, _) in enumerate(self.lane_rows) if l2 == li]
                top = self.y0[rows[0]]
                bottom = self.y0[rows[-1]] + self.rowh[rows[-1]]
                els.append(_text(f"lane:{li}", [name], MARGIN, top, 14, font, align="left", color=MUTED))
                if li < len(lanes) - 1:
                    ly = bottom + self.row_gap[rows[-1]] / 2
                    els.append(_linear(f"lane:{li}:line", "line", [(MARGIN, ly), (right_edge, ly)], stroke=LANE_LINE,
                                       ss="dotted"))  # fmt: skip
        labels = {g["id"]: g["label"] for g in self.spec["groups"]}
        for gid, f in self.frames.items():
            els.append(_el(f"g:{gid}", "frame", f[0], f[1], f[2] - f[0], f[3] - f[1], stroke=FRAME_STROKE, sw=2,
                           name=labels[gid]))  # fmt: skip
        ordered = self.roots + [n["id"] for n in self.spec["nodes"] if n["parent"]]
        for nid in ordered:
            n = self.nodes[nid]
            group = n.spec["group"]
            frame_id = f"g:{group}" if group in self.frames else None
            _shift(n.drawn.els, n.ox, n.oy)
            for el in n.drawn.els:
                el["frameId"] = frame_id
            els += n.drawn.els
        for e in self.edges:
            els += self._arrow(e)
        if self.spec["legend"] and self.nodes:
            els += self._legend(self.bottom + self.below_depth + LEGEND_GAP)
        _finalize(els)
        return {
            "type": "excalidraw",
            "version": 2,
            "source": SOURCE,
            "elements": els,
            "appState": {"viewBackgroundColor": "#ffffff"},
            "files": {},
        }

    def _arrow(self, e: _Edge) -> list[dict]:
        style = EDGE_KINDS[e.key]
        src_box, dst_box = self.nodes[e.src].drawn.box, self.nodes[e.dst].drawn.box
        aid = f"e:{e.idx}"
        arrow = _linear(aid, "arrow", e.points, stroke=e.spec.get("color") or style.stroke, sw=style.width,
                        ss=e.spec.get("style") or style.style, rough=self.rough, start=style.start, end=style.end,
                        start_binding={"elementId": src_box["id"], "focus": 0, "gap": e.binding_gaps[0]},
                        end_binding={"elementId": dst_box["id"], "focus": 0, "gap": e.binding_gaps[1]})  # fmt: skip
        src_box["boundElements"].append({"type": "arrow", "id": aid})
        dst_box["boundElements"].append({"type": "arrow", "id": aid})
        g1, g2 = self.nodes[e.src].spec["group"], self.nodes[e.dst].spec["group"]
        frame_id = f"g:{g1}" if g1 is not None and g1 == g2 and g1 in self.frames else None
        arrow["frameId"] = frame_id
        out = [arrow]
        if e.lines:
            x0, y0, _, _ = e.label_box
            label = _text(f"{aid}:lbl", e.lines, x0, y0, 14, self.font, valign="middle", container=aid)
            label["frameId"] = frame_id
            arrow["boundElements"].append({"type": "text", "id": label["id"]})
            out.append(label)
        return out

    def _legend(self, top: float) -> list[dict]:
        kinds = {n["kind"] for n in self.spec["nodes"]}
        badges = []
        for n in self.spec["nodes"]:
            for b in n["badges"]:
                name = "competing" if _COMPETING_RE.match(b) else b
                if name not in badges:
                    badges.append(name)
        keys = {e.key for e in self.edges}
        entries = [_legend_kind(k, self.font) for k in CATALOGUE if k in kinds]
        entries += [_legend_badge(b, self.font) for b in BADGES if b in badges]
        entries += [_legend_edge(k, self.font) for k in EDGE_KINDS if k in keys]
        return _legend_frame("legend", entries, MARGIN, top, self.font)


def _entry(name: str, glyph_els: list[dict], font: int, eid: str) -> tuple[list[dict], float, float]:
    """Glyph at the left, name in 12px to its right; local coordinates start at (0, 0)."""
    x0, y0, x1, y1 = _union(_bbox(el) for el in glyph_els)
    _shift(glyph_els, -x0, -y0)
    gw, gh = x1 - x0, y1 - y0
    tw, th = _text_size([name], 12, font)
    h = max(gh, th)
    _shift(glyph_els, 0, (h - gh) / 2)
    text = _text(f"{eid}:name", [name], gw + 10, (h - th) / 2, 12, font, align="left", valign="middle")
    return glyph_els + [text], gw + 10 + tw, h


def _legend_kind(kind: str, font: int):
    base = f"legend:{kind}"
    d = _draw_node(base, base, kind, "", None, [], [], font, 0, bare=True)
    _scale(d.els, 0.5)
    return _entry(CATALOGUE[kind].eip_name, d.els, font, base)


def _legend_badge(badge: str, font: int):
    base = f"legend:badge:{badge}"
    els, _ = _pill(base, _badge_text(badge), 0, font, [base])
    return _entry(f"— {BADGES[badge]}", els, font, base)


def _legend_edge(key: str, font: int):
    style = EDGE_KINDS[key]
    base = f"legend:edge:{key}"
    arrow = _linear(base, "arrow", [(0, 8), (60, 8)], stroke=style.stroke, sw=style.width, ss=style.style,
                    start=style.start, end=style.end, groups=[base])  # fmt: skip
    name = f"{style.name} {style.marker}" if style.marker else style.name
    return _entry(name, [arrow], font, base)


def _legend_frame(fid_base: str, entries, x: float, top: float, font: int) -> list[dict]:
    cell_w = max(LEGEND_CELL[0], max(w for _, w, _ in entries) + 24)
    cell_h = max(LEGEND_CELL[1], max(h for _, _, h in entries) + 8)
    cols = min(LEGEND_COLS, len(entries))
    rows = math.ceil(len(entries) / LEGEND_COLS)
    frame_id = f"{fid_base}:frame"
    frame = _el(frame_id, "frame", x, top, 2 * FRAME_PAD + cols * cell_w - 24, 2 * FRAME_PAD + rows * cell_h,
                stroke=FRAME_STROKE, sw=2, name="Legend")  # fmt: skip
    out = [frame]
    for i, (els, _, h) in enumerate(entries):
        cx = x + FRAME_PAD + (i % LEGEND_COLS) * cell_w
        cy = top + FRAME_PAD + (i // LEGEND_COLS) * cell_h + (cell_h - h) / 2
        _shift(els, cx, cy)
        for el in els:
            el["frameId"] = frame_id
        out += els
    return out


def build(spec) -> tuple[dict, list[str]]:
    norm, errors = _normalize(spec)
    if errors:
        raise SpecError(errors)
    return _Builder(norm).run()


# --------------------------------------------------------------------------- preview SVG

_SVG_FONTS = {
    5: "Virgil, 'Segoe Print', 'Comic Sans MS', cursive",
    1: "Virgil, 'Segoe Print', 'Comic Sans MS', cursive",
    2: "Helvetica, Arial, sans-serif",
    3: "'Cascadia Code', Menlo, monospace",
}


def _n(v: float) -> str:
    v = float(v)
    if v.is_integer():
        return str(int(v))
    return f"{v:.2f}".rstrip("0").rstrip(".")


def _esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def _paint(el, fill=True) -> str:
    attrs = [f'stroke="{el["strokeColor"]}"', f'stroke-width="{_n(el["strokeWidth"])}"']
    dash = {"dashed": "8 6", "dotted": "2 4"}.get(el.get("strokeStyle"))
    if dash:
        attrs.append(f'stroke-dasharray="{dash}"')
    bg = el.get("backgroundColor", TRANSPARENT)
    attrs.append(f'fill="{bg if fill and bg != TRANSPARENT else "none"}"')
    if el.get("opacity", 100) != 100:
        attrs.append(f'opacity="{_n(el["opacity"] / 100)}"')
    return " ".join(attrs)


def _svg_heads(el, pts) -> list[str]:
    out = []
    color, sw = el["strokeColor"], _n(el["strokeWidth"])
    for head, tip, prev in ((el.get("startArrowhead"), pts[0], pts[1]), (el.get("endArrowhead"), pts[-1], pts[-2])):
        if not head:
            continue
        ang = math.atan2(tip[1] - prev[1], tip[0] - prev[0])
        if head in ("circle", "dot"):
            out.append(f'<circle cx="{_n(tip[0])}" cy="{_n(tip[1])}" r="3" fill="{color}"/>')
        elif head == "bar":
            dx, dy = 5 * math.sin(ang), -5 * math.cos(ang)
            out.append(f'<line x1="{_n(tip[0] + dx)}" y1="{_n(tip[1] + dy)}" x2="{_n(tip[0] - dx)}" '
                       f'y2="{_n(tip[1] - dy)}" stroke="{color}" stroke-width="{sw}"/>')  # fmt: skip
        elif head == "triangle":
            wings = (math.pi / 6, -math.pi / 6)
            a = [(tip[0] - 12 * math.cos(ang + s), tip[1] - 12 * math.sin(ang + s)) for s in wings]
            pts_s = " ".join(f"{_n(px)},{_n(py)}" for px, py in [tip, *a])
            out.append(f'<polygon points="{pts_s}" fill="{color}" stroke="{color}" stroke-width="1"/>')
        else:
            for s in (math.pi / 6, -math.pi / 6):
                bx, by = tip[0] - 10 * math.cos(ang + s), tip[1] - 10 * math.sin(ang + s)
                out.append(f'<line x1="{_n(tip[0])}" y1="{_n(tip[1])}" x2="{_n(bx)}" y2="{_n(by)}" '
                           f'stroke="{color}" stroke-width="{sw}"/>')  # fmt: skip
    return out


def _svg_text(el, by_id) -> list[str]:
    out = []
    x, y, w, h = el["x"], el["y"], el["width"], el["height"]
    container = by_id.get(el.get("containerId"))
    if container is not None and container["type"] == "arrow":
        out.append(f'<rect x="{_n(x)}" y="{_n(y)}" width="{_n(w)}" height="{_n(h)}" fill="#ffffff"/>')
    size = el["fontSize"]
    lh = size * el.get("lineHeight", 1.25)
    align = el.get("textAlign", "left")
    anchor, ax = {"center": ("middle", x + w / 2), "right": ("end", x + w)}.get(align, ("start", x))
    family = _esc(_SVG_FONTS.get(el.get("fontFamily"), _SVG_FONTS[2]))
    spans = "".join(
        f'<tspan x="{_n(ax)}" y="{_n(y + i * lh + (lh - size) / 2)}">{_esc(line)}</tspan>'
        for i, line in enumerate(el["text"].split("\n"))
    )
    out.append(f'<text font-size="{_n(size)}" font-family="{family}" fill="{el["strokeColor"]}" '
               f'text-anchor="{anchor}" dominant-baseline="hanging">{spans}</text>')  # fmt: skip
    return out


def _svg_el(el, by_id) -> list[str]:
    t = el["type"]
    x, y, w, h = el["x"], el["y"], el["width"], el["height"]
    if t == "rectangle":
        rx = ""
        if el.get("roundness"):
            r = min(w, h) * 0.25
            if el["roundness"].get("type") == 3 and min(w, h) > 128:
                r = 32
            rx = f' rx="{_n(r)}"'
        return [f'<rect x="{_n(x)}" y="{_n(y)}" width="{_n(w)}" height="{_n(h)}"{rx} {_paint(el)}/>']
    if t == "ellipse":
        return [f'<ellipse cx="{_n(x + w / 2)}" cy="{_n(y + h / 2)}" rx="{_n(w / 2)}" ry="{_n(h / 2)}" {_paint(el)}/>']
    if t == "diamond":
        pts = [(x + w / 2, y), (x + w, y + h / 2), (x + w / 2, y + h), (x, y + h / 2)]
        return [f'<polygon points="{" ".join(f"{_n(a)},{_n(b)}" for a, b in pts)}" {_paint(el)}/>']
    if t in ("line", "arrow"):
        pts = [(x + px, y + py) for px, py in el["points"]]
        s = " ".join(f"{_n(a)},{_n(b)}" for a, b in pts)
        if el.get("polygon"):
            return [f'<polygon points="{s}" {_paint(el)}/>']
        out = [f'<polyline points="{s}" {_paint(el, fill=False)}/>']
        return out + (_svg_heads(el, pts) if t == "arrow" and len(pts) > 1 else [])
    if t == "text":
        return _svg_text(el, by_id)
    if t == "frame":
        return [
            f'<rect x="{_n(x)}" y="{_n(y)}" width="{_n(w)}" height="{_n(h)}" rx="8" stroke="{FRAME_STROKE}" '
            f'stroke-width="2" fill="none"/>',
            f'<text x="{_n(x)}" y="{_n(y - 6)}" font-size="14" font-family="{_esc(_SVG_FONTS[2])}" '
            f'fill="#999">{_esc(el.get("name") or "Frame")}</text>',
        ]
    return []


def render_svg(scene: dict) -> str:
    """Deterministic layout preview: shapes, arrows, text and frames in array order (roughness ignored)."""
    els = [el for el in scene.get("elements", []) if not el.get("isDeleted")]
    by_id = {el["id"]: el for el in els}
    boxes = []
    for el in els:
        b = _bbox(el)
        boxes.append((b[0], b[1] - FRAME_NAME_H, b[2], b[3]) if el["type"] == "frame" else b)
    x0, y0, x1, y1 = _union(boxes) if boxes else (0, 0, 0, 0)
    vx, vy, vw, vh = x0 - 40, y0 - 40, x1 - x0 + 80, y1 - y0 + 80
    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{_n(vx)} {_n(vy)} {_n(vw)} {_n(vh)}" '
        f'width="{_n(vw)}" height="{_n(vh)}">',
        f'<rect x="{_n(vx)}" y="{_n(vy)}" width="{_n(vw)}" height="{_n(vh)}" fill="#ffffff"/>',
    ]
    for el in els:
        out += _svg_el(el, by_id)
    out.append("</svg>")
    return "\n".join(out) + "\n"


# --------------------------------------------------------------------------- library


def _lib_item(item_id: str, name: str, els: list[dict]) -> dict:
    _finalize(els)
    return {"id": item_id, "status": "unpublished", "created": LIB_CREATED, "name": name, "elements": els}


def build_library() -> dict:
    """One item per kind, badge and edge style; ids are unique across items."""
    font, rough = FONTS["excalifont"], 1
    items = []
    for kind, k in CATALOGUE.items():
        base = f"lib:{kind}"
        d = _draw_node(base, base, kind, k.eip_name, None, [], [], font, rough)
        items.append(_lib_item(f"eip-{kind}", k.eip_name, d.els))
    for badge, name in BADGES.items():
        base = f"lib:badge-{badge}"
        d = _draw_node(base, base, "service", "Service", None, [badge], [], font, rough)
        items.append(_lib_item(f"eip-badge-{badge}", name, d.els))
    for key, style in EDGE_KINDS.items():
        slug = key.replace(":", "-")
        base = f"lib:edge-{slug}"
        a = _el(f"{base}:a", "rectangle", 0, 0, 96, 64, bg=WHITE, sw=2, rough=rough, groups=[base])
        b = _el(f"{base}:b", "rectangle", 256, 0, 96, 64, bg=WHITE, sw=2, rough=rough, groups=[base])
        aid = f"{base}:arrow"
        arrow = _linear(aid, "arrow", [(97, 32), (255, 32)], stroke=style.stroke, sw=style.width, ss=style.style,
                        rough=rough, start=style.start, end=style.end, groups=[base],
                        start_binding={"elementId": a["id"], "focus": 0, "gap": 1},
                        end_binding={"elementId": b["id"], "focus": 0, "gap": 1})  # fmt: skip
        a["boundElements"].append({"type": "arrow", "id": aid})
        b["boundElements"].append({"type": "arrow", "id": aid})
        els = [a, b, arrow]
        if style.marker:
            w, h = _text_size([style.marker], 14, font)
            label = _text(f"{base}:lbl", [style.marker], 176 - w / 2, 32 - h / 2, 14, font, valign="middle",
                          container=aid, groups=[base])  # fmt: skip
            arrow["boundElements"].append({"type": "text", "id": label["id"]})
            els.append(label)
        items.append(_lib_item(f"eip-edge-{slug}", style.name, els))
    return {"type": "excalidrawlib", "version": 2, "source": SOURCE, "libraryItems": items}


def library_preview(lib: dict) -> dict:
    """Scene with every library item placed in a 4-column grid; badge and edge items get a name caption."""
    items = lib["libraryItems"]
    bounds = [_union(_bbox(el) for el in item["elements"]) for item in items]
    cell_w = max(LIB_CELL[0], max(b[2] - b[0] for b in bounds) + 40)
    cell_h = max(LIB_CELL[1], max(b[3] - b[1] for b in bounds) + 60)
    font = FONTS["excalifont"]
    els = []
    for i, (item, b) in enumerate(zip(items, bounds, strict=True)):
        cx = MARGIN + (i % 4) * cell_w + cell_w / 2
        top = MARGIN + (i // 4) * cell_h + 20
        dx, dy = cx - (b[0] + b[2]) / 2, top - b[1]
        copies = copy.deepcopy(item["elements"])
        _shift(copies, dx, dy)
        els += copies
        if item["id"].startswith(("eip-badge-", "eip-edge-")):
            els.append(_centred_text(f"preview:{item['id']}", [item["name"]], cx, b[3] + dy + 10, 12, font,
                                     color=MUTED))  # fmt: skip
    _finalize(els)
    return {
        "type": "excalidraw",
        "version": 2,
        "source": SOURCE,
        "elements": els,
        "appState": {"viewBackgroundColor": "#ffffff"},
        "files": {},
    }


# --------------------------------------------------------------------------- CLI


def dump_json(obj) -> str:
    return json.dumps(obj, indent=2, ensure_ascii=False) + "\n"


def export_png(scene_path: Path, png_path: Path) -> None:
    """Render `scene_path` to `png_path` with Excalidraw's own exporter in headless Chrome."""
    node = shutil.which("node")
    if node is None:
        raise ExportError("--png needs node >= 22 on PATH")
    try:
        proc = subprocess.run(
            [node, str(SKILL_DIR / "scripts" / "export_png.mjs"), str(scene_path), str(png_path)],
            capture_output=True,
            text=True,
            timeout=180,
        )
    except subprocess.TimeoutExpired:
        raise ExportError("timed out after 180 s") from None
    if proc.returncode == 0:
        return
    lines = [line for line in proc.stderr.splitlines() if line.strip()]
    if not lines:
        raise ExportError(f"export_png.mjs exited {proc.returncode}")
    detail = lines[-1].strip()
    if detail.startswith("error: "):
        detail = detail[len("error: ") :]
    raise ExportError(detail)


def _default_out(spec_path: Path) -> Path:
    name = spec_path.name
    for suffix in (".spec.json", ".json"):
        if name.endswith(suffix):
            return spec_path.with_name(name[: -len(suffix)] + ".excalidraw")
    return spec_path.with_name(name + ".excalidraw")


def _cmd_build(args) -> int:
    try:
        spec = load_spec(args.spec)
        scene, warnings = build(spec)
    except SpecError as exc:
        for msg in exc.errors:
            print(f"error: {msg}", file=sys.stderr)
        return 2
    for msg in warnings:
        print(f"warning: {msg}", file=sys.stderr)
    status = 1 if args.strict and warnings else 0
    n_nodes, n_edges = len(spec.get("nodes", [])), len(spec.get("edges", []))
    if args.check:
        print(f"ok: {n_nodes} nodes, {n_edges} edges, {len(warnings)} warnings")
        return status
    out = Path(args.out) if args.out else _default_out(Path(args.spec))
    out.write_text(dump_json(scene), encoding="utf-8")
    print(f"wrote {out} ({len(scene['elements'])} elements, {n_nodes} nodes, {n_edges} edges)")
    if not args.no_svg:
        svg = Path(args.svg) if args.svg else out.with_suffix(".svg")
        svg.write_text(render_svg(scene), encoding="utf-8")
        print(f"wrote {svg}")
    if args.png is not None:
        png = Path(args.png) if args.png else out.with_suffix(".png")
        try:
            export_png(out, png)
        except ExportError as exc:
            print(f"error: png export failed: {exc}", file=sys.stderr)
            return 3
        print(f"wrote {png}")
    return status


def _cmd_lib(args) -> int:
    lib = build_library()
    out, svg = Path(args.out), Path(args.svg)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(dump_json(lib), encoding="utf-8")
    print(f"wrote {out} ({len(lib['libraryItems'])} items)")
    svg.parent.mkdir(parents=True, exist_ok=True)
    svg.write_text(render_svg(library_preview(lib)), encoding="utf-8")
    print(f"wrote {svg}")
    return 0


def _cmd_kinds(_args) -> int:
    for kind, k in CATALOGUE.items():
        print(f"{kind}\t{k.family}\t{k.eip_name}")
    for badge, name in BADGES.items():
        print(f"badge\t{badge}\t{name}")
    for key, style in EDGE_KINDS.items():
        print(f"edge\t{key}\t{style.name}")
    for alias, target in ALIASES.items():
        print(f"alias\t{alias}\t{target}")
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="eip_excalidraw.py", description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build", help="spec JSON -> .excalidraw (+ preview .svg)")
    b.add_argument("spec")
    b.add_argument("-o", "--out", help="output .excalidraw (default: next to the spec)")
    svg = b.add_mutually_exclusive_group()
    svg.add_argument("--svg", help="preview SVG path (default: next to the output)")
    svg.add_argument("--no-svg", action="store_true", help="skip the preview SVG")
    b.add_argument("--check", action="store_true", help="validate and lay out; write nothing")
    b.add_argument(
        "--png",
        nargs="?",
        const="",
        metavar="OUT.png",
        help=(
            "also export a PNG rendered by Excalidraw itself, scene embedded (default: next to the output); "
            "needs node >= 22, Chrome or Chromium, and network access to esm.sh"
        ),
    )
    b.add_argument("--strict", action="store_true", help="exit 1 when there are layout warnings")
    lib = sub.add_parser("lib", help="write the EIP stencil library")
    lib.add_argument("-o", "--out", default=str(SKILL_DIR / "library" / "eip.excalidrawlib"))
    lib.add_argument("--svg", default=str(SKILL_DIR / "library" / "eip.svg"))
    sub.add_parser("kinds", help="list node kinds, badges, edge styles and aliases")
    args = parser.parse_args(argv)
    return {"build": _cmd_build, "lib": _cmd_lib, "kinds": _cmd_kinds}[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
