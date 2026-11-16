import importlib.util
import json
import sys
from pathlib import Path

import pytest

SKILL_DIR = Path(__file__).resolve().parent.parent / "skills" / "excalidraw-architecture"


def _load_generator():
    spec = importlib.util.spec_from_file_location("eip_excalidraw", SKILL_DIR / "scripts" / "eip_excalidraw.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module  # dataclasses resolve annotations through sys.modules
    spec.loader.exec_module(module)
    return module


eip = _load_generator()
EXAMPLE = SKILL_DIR / "examples" / "order-flow.spec.json"


def _by_id(scene):
    return {el["id"]: el for el in scene["elements"]}


def _bbox(el):
    if "points" in el:
        xs = [el["x"] + p[0] for p in el["points"]]
        ys = [el["y"] + p[1] for p in el["points"]]
        return min(xs), min(ys), max(xs), max(ys)
    return el["x"], el["y"], el["x"] + el["width"], el["y"] + el["height"]


def _node_slots(scene):
    slots = {}
    for el in scene["elements"]:
        for gid in el["groupIds"]:
            if gid.startswith("grp:"):
                b = _bbox(el)
                old = slots.get(gid[4:], b)
                slots[gid[4:]] = (min(old[0], b[0]), min(old[1], b[1]), max(old[2], b[2]), max(old[3], b[3]))
    return slots


def _box(scene, node_id):
    el = _by_id(scene)[f"n:{node_id}"]
    return el["x"], el["y"], el["x"] + el["width"], el["y"] + el["height"]


def _catalogue_spec():
    """One node per kind chained by message edges, one service per badge, a frame and a DLQ shadow."""
    kinds = list(eip.CATALOGUE)
    nodes = [{"id": f"k{i}", "kind": k, "label": f"{k} with a deliberately long label"} for i, k in enumerate(kinds)]
    nodes[1]["group"] = nodes[2]["group"] = "g"
    nodes += [{"id": f"b{i}", "kind": "service", "label": "Svc", "badges": [b]} for i, b in enumerate(eip.BADGES)]
    nodes.append({"id": "dlq", "kind": "dead-letter-channel", "label": "dlq", "shadow": "k8"})
    edges = [{"from": f"k{i}", "to": f"k{i + 1}", "message": "M"} for i in range(len(kinds) - 1)]
    edges += [{"from": f"b{i}", "to": "k0", "kind": "rpc"} for i in range(len(eip.BADGES))]
    return {"title": "all kinds", "groups": [{"id": "g", "label": "G"}], "nodes": nodes, "edges": edges}


def test_example_outputs_are_current():
    scene, warnings = eip.build(eip.load_spec(EXAMPLE))
    assert warnings == []
    assert eip.dump_json(scene) == EXAMPLE.with_name("order-flow.excalidraw").read_text(encoding="utf-8")
    assert eip.render_svg(scene) == EXAMPLE.with_name("order-flow.svg").read_text(encoding="utf-8")
    lib = eip.build_library()
    assert eip.dump_json(lib) == (SKILL_DIR / "library" / "eip.excalidrawlib").read_text(encoding="utf-8")
    assert eip.render_svg(eip.library_preview(lib)) == (SKILL_DIR / "library" / "eip.svg").read_text(encoding="utf-8")


def test_every_kind_builds_with_valid_bindings():
    spec = _catalogue_spec()
    assert eip.validate(spec) == []
    scene, _ = eip.build(spec)
    els = scene["elements"]
    ids = [el["id"] for el in els]
    assert len(ids) == len(set(ids))
    pos = {eid: i for i, eid in enumerate(ids)}
    by_id = _by_id(scene)
    arrows = [el for el in els if el["type"] == "arrow" and el["id"].startswith("e:")]
    assert len(arrows) == len(spec["edges"]) + 1  # plus the automatic dead-letter route
    for arrow in arrows:
        for binding in (arrow["startBinding"], arrow["endBinding"]):
            target = by_id[binding["elementId"]]
            assert {"type": "arrow", "id": arrow["id"]} in target["boundElements"]
    for el in els:
        for ref in el["boundElements"]:
            assert ref["id"] in by_id
        if el["type"] == "text" and el["containerId"]:
            container = by_id[el["containerId"]]
            assert {"type": "text", "id": el["id"]} in container["boundElements"]
            assert pos[el["id"]] == pos[container["id"]] + 1
        if el["frameId"]:
            assert by_id[el["frameId"]]["type"] == "frame"
            assert pos[el["frameId"]] < pos[el["id"]]


@pytest.mark.parametrize("which", ["catalogue", "example"])
def test_bound_text_fits_container(which):
    spec = _catalogue_spec() if which == "catalogue" else eip.load_spec(EXAMPLE)
    scene, _ = eip.build(spec)
    by_id = _by_id(scene)
    checked = 0
    for el in scene["elements"]:
        container = by_id.get(el.get("containerId") or "")
        if el["type"] == "text" and container is not None and container["type"] != "arrow":
            assert el["width"] <= container["width"] - 10, el["id"]
            assert el["height"] <= container["height"] - 10, el["id"]
            checked += 1
    assert checked


def test_layout_no_overlaps_and_frames_enclose_members():
    scene, _ = eip.build(eip.load_spec(EXAMPLE))
    slots = _node_slots(scene)
    names = sorted(slots)
    for i, a in enumerate(names):
        for b in names[i + 1 :]:
            ra, rb = slots[a], slots[b]
            assert not (ra[0] < rb[2] and rb[0] < ra[2] and ra[1] < rb[3] and rb[1] < ra[3]), (a, b)
    by_id = _by_id(scene)
    members = [el for el in scene["elements"] if el["frameId"]]
    assert members
    for el in members:
        f = by_id[el["frameId"]]
        x0, y0, x1, y1 = _bbox(el)
        assert f["x"] <= x0 and f["y"] <= y0 and x1 <= f["x"] + f["width"] and y1 <= f["y"] + f["height"], el["id"]


def test_back_edge_routes_below():
    nodes = [{"id": n, "kind": "splitter", "label": n} for n in "abc"]
    edges = [{"from": "a", "to": "b"}, {"from": "b", "to": "c"}, {"from": "c", "to": "a"}]
    scene, warnings = eip.build({"nodes": nodes, "edges": edges})
    assert warnings == []
    by_id = _by_id(scene)
    back, forward = by_id["e:2"], by_id["e:0"]
    assert len(back["points"]) == 4
    lowest = max(back["y"] + p[1] for p in back["points"])
    assert lowest > _box(scene, "a")[3] and lowest > _box(scene, "c")[3]
    assert len(forward["points"]) == 2


def test_shadow_sits_under_channel():
    spec = {
        "nodes": [
            {"id": "ch", "kind": "p2p-channel", "label": "orders", "tags": ["key=orderId"]},
            {"id": "dlq", "kind": "dlq", "label": "orders.dlq", "shadow": "ch"},
        ]
    }
    scene, warnings = eip.build(spec)
    assert warnings == []
    ch, dlq = _box(scene, "ch"), _box(scene, "dlq")
    assert dlq[1] > ch[3]
    assert abs((dlq[0] + dlq[2]) / 2 - (ch[0] + ch[2]) / 2) <= 1
    routes = [
        el
        for el in scene["elements"]
        if el["type"] == "arrow"
        and el["startBinding"]
        and el["startBinding"]["elementId"] == "n:ch"
        and el["endBinding"]["elementId"] == "n:dlq"
    ]
    assert len(routes) == 1 and routes[0]["strokeStyle"] == "dashed"


def test_validation_messages():
    spec = {
        "lanes": ["Edge"],
        "nodes": [
            {"id": "r", "kind": "router-x", "label": "r"},
            {"id": "s", "kind": "service", "label": "s", "badges": ["shiny"]},
            {"id": "q", "kind": "queue", "label": "q", "badges": ["tx"]},
            {"id": "x", "kind": "service", "label": "x", "lane": "Nowhere"},
        ],
        "edges": [{"from": "s", "to": "nope"}],
    }
    errors = eip.validate(spec)
    for expected in (
        "unknown kind 'router-x' for node 'r'",
        "unknown badge 'shiny' on node 's'",
        "badges not allowed on kind 'p2p-channel'",
        "node 'x': unknown lane 'Nowhere'",
        "edge 0: unknown node 'nope'",
    ):
        assert expected in errors
    pinned = {
        "nodes": [
            {"id": "a", "kind": "service", "label": "a", "col": 2, "row": 1},
            {"id": "b", "kind": "service", "label": "b", "col": 2, "row": 1},
        ]
    }
    assert eip.validate(pinned) == ["nodes 'a' and 'b' both pinned to col 2 row 1"]
    with pytest.raises(eip.SpecError) as exc:
        eip.build(pinned)
    assert exc.value.errors == ["nodes 'a' and 'b' both pinned to col 2 row 1"]


def test_edge_crossing_warning():
    spec = {
        "nodes": [
            {"id": "a", "kind": "splitter", "label": "a", "col": 0, "row": 0},
            {"id": "b", "kind": "splitter", "label": "b", "col": 1, "row": 0},
            {"id": "c", "kind": "splitter", "label": "c", "col": 2, "row": 0},
        ],
        "edges": [{"from": "a", "to": "c"}],
    }
    _, warnings = eip.build(spec)
    assert warnings == ["edge 0 (a -> c) crosses node 'b'"]


def test_library_items_cover_catalogue():
    lib = eip.build_library()
    expected = (
        {f"eip-{k}" for k in eip.CATALOGUE}
        | {f"eip-badge-{b}" for b in eip.BADGES}
        | {f"eip-edge-{k.replace(':', '-')}" for k in eip.EDGE_KINDS}
    )
    items = lib["libraryItems"]
    assert {item["id"] for item in items} == expected
    assert len(items) == len(expected)
    element_ids = [el["id"] for item in items for el in item["elements"]]
    assert len(element_ids) == len(set(element_ids))
    for item in items:
        assert item["name"] and item["elements"]


def test_cli_exit_codes(tmp_path, capsys):
    bad = tmp_path / "bad.spec.json"
    bad.write_text(json.dumps({"nodes": [{"id": "a", "kind": "nope", "label": "a"}]}))
    assert eip.main(["build", str(bad)]) == 2
    assert "error: unknown kind 'nope' for node 'a'" in capsys.readouterr().err
    assert not (tmp_path / "bad.excalidraw").exists()

    good = tmp_path / "good.spec.json"
    good.write_text(EXAMPLE.read_text(encoding="utf-8"))
    assert eip.main(["build", str(good), "--check"]) == 0
    assert not (tmp_path / "good.excalidraw").exists()
    assert eip.main(["build", str(good)]) == 0
    out = capsys.readouterr().out
    assert f"wrote {tmp_path / 'good.excalidraw'}" in out
    assert json.loads((tmp_path / "good.excalidraw").read_text())["type"] == "excalidraw"
    assert (tmp_path / "good.svg").read_text().startswith("<svg")

    crossing = tmp_path / "cross.json"
    crossing.write_text(
        json.dumps(
            {
                "nodes": [{"id": n, "kind": "splitter", "label": n, "col": i, "row": 0} for i, n in enumerate("abc")],
                "edges": [{"from": "a", "to": "c"}],
            }
        )
    )
    assert eip.main(["build", str(crossing), "--no-svg", "--strict"]) == 1
    assert "warning: edge 0 (a -> c) crosses node 'b'" in capsys.readouterr().err
    assert not (tmp_path / "cross.svg").exists()


def test_png_export_needs_node(tmp_path, capsys, monkeypatch):
    spec = tmp_path / "good.spec.json"
    spec.write_text(EXAMPLE.read_text(encoding="utf-8"))
    monkeypatch.setattr(eip.shutil, "which", lambda _name: None)
    assert eip.main(["build", str(spec), "--no-svg", "--png"]) == 3
    assert "error: png export failed: --png needs node >= 22 on PATH" in capsys.readouterr().err
    assert (tmp_path / "good.excalidraw").exists()
    assert not (tmp_path / "good.png").exists()


def _chrome():
    import os
    import shutil as sh

    for candidate in (
        os.environ.get("CHROME"),
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ):
        if candidate and os.path.exists(candidate):
            return candidate
    for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
        if sh.which(name):
            return name
    return None


@pytest.mark.skipif(
    not (_chrome() and __import__("shutil").which("node")),
    reason="needs node >= 22, Chrome or Chromium, and network access to esm.sh",
)
def test_png_export(tmp_path):
    import struct

    spec = tmp_path / "good.spec.json"
    spec.write_text(EXAMPLE.read_text(encoding="utf-8"))
    assert eip.main(["build", str(spec), "--no-svg", "--png"]) == 0
    data = (tmp_path / "good.png").read_bytes()
    assert data.startswith(b"\x89PNG\r\n\x1a\n")
    assert max(struct.unpack(">II", data[16:24])) == 3000
    chunk, offset = None, 8
    while offset < len(data):
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        kind = data[offset + 4 : offset + 8]
        if kind == b"tEXt":
            chunk = data[offset + 8 : offset + 8 + length]
            break
        offset += 12 + length
    assert chunk is not None, "expected a tEXt chunk with the embedded scene"
    assert chunk.split(b"\x00")[0] == b"application/vnd.excalidraw+json"
