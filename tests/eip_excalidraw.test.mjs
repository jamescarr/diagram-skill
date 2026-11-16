import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(HERE, "..", "skills", "excalidraw-architecture");
const GENERATOR = new URL("../skills/excalidraw-architecture/scripts/eip_excalidraw.mjs", import.meta.url);
const eip = await import(GENERATOR.href);
const EXAMPLE = path.join(SKILL_DIR, "examples", "order-flow.spec.json");

const readText = (file) => fs.readFileSync(file, "utf8");

function byId(scene) {
  return Object.fromEntries(scene.elements.map((el) => [el.id, el]));
}

function bbox(el) {
  if (Array.isArray(el.points)) {
    const xs = el.points.map((p) => el.x + p[0]);
    const ys = el.points.map((p) => el.y + p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }
  return [el.x, el.y, el.x + el.width, el.y + el.height];
}

function nodeSlots(scene) {
  const slots = {};
  for (const el of scene.elements) {
    for (const gid of el.groupIds) {
      if (!gid.startsWith("grp:")) continue;
      const b = bbox(el);
      const old = slots[gid.slice(4)] ?? b;
      slots[gid.slice(4)] = [
        Math.min(old[0], b[0]),
        Math.min(old[1], b[1]),
        Math.max(old[2], b[2]),
        Math.max(old[3], b[3]),
      ];
    }
  }
  return slots;
}

function box(scene, nodeId) {
  const el = byId(scene)[`n:${nodeId}`];
  return [el.x, el.y, el.x + el.width, el.y + el.height];
}

/** One node per kind chained by message edges, one service per badge, a frame and a DLQ shadow. */
function catalogueSpec() {
  const kinds = Object.keys(eip.CATALOGUE);
  const nodes = kinds.map((kind, i) => ({ id: `k${i}`, kind, label: `${kind} with a deliberately long label` }));
  nodes[1].group = "g";
  nodes[2].group = "g";
  Object.keys(eip.BADGES).forEach((badge, i) => {
    nodes.push({ id: `b${i}`, kind: "service", label: "Svc", badges: [badge] });
  });
  nodes.push({ id: "dlq", kind: "dead-letter-channel", label: "dlq", shadow: "k8" });
  const edges = kinds.slice(1).map((_, i) => ({ from: `k${i}`, to: `k${i + 1}`, message: "M" }));
  Object.keys(eip.BADGES).forEach((_, i) => {
    edges.push({ from: `b${i}`, to: "k0", kind: "rpc" });
  });
  return { title: "all kinds", groups: [{ id: "g", label: "G" }], nodes, edges };
}

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eip-excalidraw-"));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Run the CLI with stdout/stderr captured. */
function runCaptured(argv) {
  const stdout = [];
  const stderr = [];
  const stdoutWrite = process.stdout.write;
  const stderrWrite = process.stderr.write;
  process.stdout.write = (chunk) => {
    stdout.push(String(chunk));
    return true;
  };
  process.stderr.write = (chunk) => {
    stderr.push(String(chunk));
    return true;
  };
  try {
    return { code: eip.main(argv), stdout: stdout.join(""), stderr: stderr.join("") };
  } finally {
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
  }
}

function which(name) {
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // not on this PATH entry
    }
  }
  return null;
}

function chrome() {
  for (const candidate of [
    process.env.CHROME,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ]) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  for (const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    if (which(name)) return name;
  }
  return null;
}

test("example outputs are current", () => {
  const { scene, warnings } = eip.build(eip.loadSpec(EXAMPLE));
  assert.deepEqual(warnings, []);
  assert.equal(eip.dumpJson(scene), readText(path.join(SKILL_DIR, "examples", "order-flow.excalidraw")));
  assert.equal(eip.renderSvg(scene), readText(path.join(SKILL_DIR, "examples", "order-flow.svg")));
  const lib = eip.buildLibrary();
  assert.equal(eip.dumpJson(lib), readText(path.join(SKILL_DIR, "library", "eip.excalidrawlib")));
  assert.equal(eip.renderSvg(eip.libraryPreview(lib)), readText(path.join(SKILL_DIR, "library", "eip.svg")));
});

test("every kind builds with valid bindings", () => {
  const spec = catalogueSpec();
  assert.deepEqual(eip.validate(spec), []);
  const { scene } = eip.build(spec);
  const elements = scene.elements;
  const ids = elements.map((el) => el.id);
  assert.equal(ids.length, new Set(ids).size);
  const pos = new Map(ids.map((id, i) => [id, i]));
  const found = byId(scene);
  const arrows = elements.filter((el) => el.type === "arrow" && el.id.startsWith("e:"));
  assert.equal(arrows.length, spec.edges.length + 1); // plus the automatic dead-letter route
  for (const arrow of arrows) {
    for (const binding of [arrow.startBinding, arrow.endBinding]) {
      const target = found[binding.elementId];
      assert.ok(target.boundElements.some((ref) => ref.type === "arrow" && ref.id === arrow.id));
    }
  }
  for (const el of elements) {
    for (const ref of el.boundElements) {
      assert.ok(ref.id in found);
    }
    if (el.type === "text" && el.containerId) {
      const container = found[el.containerId];
      assert.ok(container.boundElements.some((ref) => ref.type === "text" && ref.id === el.id));
      assert.equal(pos.get(el.id), pos.get(container.id) + 1);
    }
    if (el.frameId) {
      assert.equal(found[el.frameId].type, "frame");
      assert.ok(pos.get(el.frameId) < pos.get(el.id));
    }
  }
});

for (const which of ["catalogue", "example"]) {
  test(`bound text fits container (${which})`, () => {
    const spec = which === "catalogue" ? catalogueSpec() : eip.loadSpec(EXAMPLE);
    const { scene } = eip.build(spec);
    const found = byId(scene);
    let checked = 0;
    for (const el of scene.elements) {
      const container = found[el.containerId || ""];
      if (el.type === "text" && container !== undefined && container.type !== "arrow") {
        assert.ok(el.width <= container.width - 10, el.id);
        assert.ok(el.height <= container.height - 10, el.id);
        checked += 1;
      }
    }
    assert.ok(checked);
  });
}

test("layout has no overlaps and frames enclose members", () => {
  const { scene } = eip.build(eip.loadSpec(EXAMPLE));
  const slots = nodeSlots(scene);
  const names = Object.keys(slots).sort();
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const ra = slots[names[i]];
      const rb = slots[names[j]];
      const overlaps = ra[0] < rb[2] && rb[0] < ra[2] && ra[1] < rb[3] && rb[1] < ra[3];
      assert.ok(!overlaps, `${names[i]}, ${names[j]}`);
    }
  }
  const found = byId(scene);
  const members = scene.elements.filter((el) => el.frameId);
  assert.ok(members.length > 0);
  for (const el of members) {
    const f = found[el.frameId];
    const [x0, y0, x1, y1] = bbox(el);
    assert.ok(f.x <= x0 && f.y <= y0 && x1 <= f.x + f.width && y1 <= f.y + f.height, el.id);
  }
});

test("back edge routes below", () => {
  const nodes = [..."abc"].map((n) => ({ id: n, kind: "splitter", label: n }));
  const edges = [
    { from: "a", to: "b" },
    { from: "b", to: "c" },
    { from: "c", to: "a" },
  ];
  const { scene, warnings } = eip.build({ nodes, edges });
  assert.deepEqual(warnings, []);
  const found = byId(scene);
  const back = found["e:2"];
  const forward = found["e:0"];
  assert.equal(back.points.length, 4);
  const lowest = Math.max(...back.points.map((p) => back.y + p[1]));
  assert.ok(lowest > box(scene, "a")[3] && lowest > box(scene, "c")[3]);
  assert.equal(forward.points.length, 2);
});

test("shadow sits under channel", () => {
  const spec = {
    nodes: [
      { id: "ch", kind: "p2p-channel", label: "orders", tags: ["key=orderId"] },
      { id: "dlq", kind: "dlq", label: "orders.dlq", shadow: "ch" },
    ],
  };
  const { scene, warnings } = eip.build(spec);
  assert.deepEqual(warnings, []);
  const ch = box(scene, "ch");
  const dlq = box(scene, "dlq");
  assert.ok(dlq[1] > ch[3]);
  assert.ok(Math.abs((dlq[0] + dlq[2]) / 2 - (ch[0] + ch[2]) / 2) <= 1);
  const routes = scene.elements.filter(
    (el) =>
      el.type === "arrow" &&
      el.startBinding &&
      el.startBinding.elementId === "n:ch" &&
      el.endBinding.elementId === "n:dlq",
  );
  assert.equal(routes.length, 1);
  assert.equal(routes[0].strokeStyle, "dashed");
});

test("labelled arrows keep full arrowheads", () => {
  // a fan-out: one labelled arrow turns through the gap (ortho), one runs straight, a tap adds a band
  const spec = {
    nodes: [
      { id: "svc", kind: "service", label: "Order Service" },
      { id: "ch", kind: "pubsub-channel", label: "orders.placed" },
      { id: "billing", kind: "service", label: "Billing" },
      { id: "shipping", kind: "service", label: "Shipping" },
      { id: "audit", kind: "message-store", label: "Audit" },
    ],
    edges: [
      { from: "svc", to: "ch", type: "event", message: "OrderPlaced" },
      { from: "ch", to: "billing", type: "event", message: "OrderPlaced" },
      { from: "ch", to: "shipping", type: "event", message: "OrderPlaced" },
      { from: "ch", to: "audit", kind: "tap" },
    ],
  };
  const { scene, warnings } = eip.build(spec);
  assert.deepEqual(warnings, []);
  const found = byId(scene);
  const arrows = scene.elements.filter((el) => el.type === "arrow" && el.id.startsWith("e:"));
  const labelledTurn = arrows.some((a) => a.points.length > 3 && Object.hasOwn(found, `${a.id}:lbl`));
  assert.ok(labelledTurn); // the ortho case is covered
  for (const a of arrows) {
    const [x0, y0] = a.points[a.points.length - 2];
    const [x1, y1] = a.points[a.points.length - 1];
    // Excalidraw draws min(ARROWHEAD, final segment / 2): anything shorter shrinks the head
    assert.ok(Math.abs(x1 - x0) + Math.abs(y1 - y0) >= 2 * eip.ARROWHEAD, a.id);
    const label = found[`${a.id}:lbl`];
    if (label) {
      assert.ok(label.x + label.width <= a.x + x1 - eip.ARROWHEAD, a.id);
    }
  }
});

test("competing consumers draw a stack", () => {
  const badges = { w1: "competing:1", w2: "competing:2", w3: "competing:3", w12: "competing:12", w: "competing" };
  const spec = {
    nodes: [
      { id: "ch", kind: "p2p-channel", label: "jobs" },
      ...Object.entries(badges).map(([id, badge]) => ({ id, kind: "service", label: "Worker", badges: [badge] })),
      { id: "plain", kind: "service", label: "Worker", badges: ["idempotent"] },
      { id: "db", kind: "datastore", label: "db" },
    ],
    edges: [
      ...[...Object.keys(badges), "plain"].map((to) => ({ from: "ch", to })),
      { from: "w3", to: "db", kind: "data" },
    ],
  };
  spec.nodes.find((n) => n.id === "w3").sub = "3 pods";
  const { scene, warnings } = eip.build(spec);
  assert.deepEqual(warnings, []);
  const found = byId(scene);
  const order = scene.elements.map((el) => el.id);
  const expected = { w1: 0, w2: 1, w3: 2, w12: 2, w: 2, plain: 0 };
  for (const [node, cards] of Object.entries(expected)) {
    const front = found[`n:${node}`];
    const prefix = `n:${node}:s`;
    const stacked = order.filter(
      (id) => id !== `n:${node}` && id.startsWith(prefix) && /^\d+$/.test(id.slice(prefix.length)),
    ).length;
    assert.equal(stacked, cards, node);
    for (let i = 1; i <= cards; i++) {
      const card = found[`n:${node}:s${i}`];
      const off = i * eip.STACK_STEP;
      assert.deepEqual([card.x - front.x, card.y - front.y], [off, off]);
      assert.deepEqual([card.width, card.height], [front.width, front.height]);
      assert.ok(order.indexOf(card.id) < order.indexOf(front.id)); // behind the front box
    }
  }
  const w3 = found["n:w3"];
  const stackRight = w3.x + w3.width + 2 * eip.STACK_STEP;
  const stackBottom = w3.y + w3.height + 2 * eip.STACK_STEP;
  const out = scene.elements.find((el) => el.type === "arrow" && el.startBinding.elementId === "n:w3");
  assert.ok(out, "expected an arrow leaving w3");
  assert.ok(out.x >= stackRight); // leaves from the outer card, not from inside the stack
  assert.ok(found["n:w3:sub"].y >= stackBottom);
});

test("validation messages", () => {
  const spec = {
    lanes: ["Edge"],
    nodes: [
      { id: "r", kind: "router-x", label: "r" },
      { id: "s", kind: "service", label: "s", badges: ["shiny"] },
      { id: "q", kind: "queue", label: "q", badges: ["tx"] },
      { id: "x", kind: "service", label: "x", lane: "Nowhere" },
    ],
    edges: [{ from: "s", to: "nope" }],
  };
  const errors = eip.validate(spec);
  for (const expected of [
    "unknown kind 'router-x' for node 'r'",
    "unknown badge 'shiny' on node 's'",
    "badges not allowed on kind 'p2p-channel'",
    "node 'x': unknown lane 'Nowhere'",
    "edge 0: unknown node 'nope'",
  ]) {
    assert.ok(errors.includes(expected), expected);
  }
  const pinned = {
    nodes: [
      { id: "a", kind: "service", label: "a", col: 2, row: 1 },
      { id: "b", kind: "service", label: "b", col: 2, row: 1 },
    ],
  };
  assert.deepEqual(eip.validate(pinned), ["nodes 'a' and 'b' both pinned to col 2 row 1"]);
  let thrown;
  try {
    eip.build(pinned);
  } catch (e) {
    thrown = e;
  }
  assert.ok(thrown instanceof eip.SpecError);
  assert.deepEqual(thrown.errors, ["nodes 'a' and 'b' both pinned to col 2 row 1"]);
});

test("edge crossing warning", () => {
  const spec = {
    nodes: [
      { id: "a", kind: "splitter", label: "a", col: 0, row: 0 },
      { id: "b", kind: "splitter", label: "b", col: 1, row: 0 },
      { id: "c", kind: "splitter", label: "c", col: 2, row: 0 },
    ],
    edges: [{ from: "a", to: "c" }],
  };
  const { warnings } = eip.build(spec);
  assert.deepEqual(warnings, ["edge 0 (a -> c) crosses node 'b'"]);
});

test("library items cover catalogue", () => {
  const lib = eip.buildLibrary();
  const expected = new Set([
    ...Object.keys(eip.CATALOGUE).map((kind) => `eip-${kind}`),
    ...Object.keys(eip.BADGES).map((badge) => `eip-badge-${badge}`),
    ...Object.keys(eip.EDGE_KINDS).map((kind) => `eip-edge-${kind.replaceAll(":", "-")}`),
  ]);
  const items = lib.libraryItems;
  assert.deepEqual([...new Set(items.map((item) => item.id))].sort(), [...expected].sort());
  assert.equal(items.length, expected.size);
  const elementIds = items.flatMap((item) => item.elements.map((el) => el.id));
  assert.equal(elementIds.length, new Set(elementIds).size);
  for (const item of items) {
    assert.ok(item.name && item.elements);
  }
});

test("CLI exit codes", () => {
  withTempDir((dir) => {
    const bad = path.join(dir, "bad.spec.json");
    fs.writeFileSync(bad, JSON.stringify({ nodes: [{ id: "a", kind: "nope", label: "a" }] }));
    let run = runCaptured(["build", bad]);
    assert.equal(run.code, 2);
    assert.ok(run.stderr.includes("error: unknown kind 'nope' for node 'a'"));
    assert.ok(!fs.existsSync(path.join(dir, "bad.excalidraw")));

    const good = path.join(dir, "good.spec.json");
    fs.writeFileSync(good, readText(EXAMPLE));
    run = runCaptured(["build", good, "--check"]);
    assert.equal(run.code, 0);
    assert.ok(!fs.existsSync(path.join(dir, "good.excalidraw")));
    run = runCaptured(["build", good]);
    assert.equal(run.code, 0);
    assert.ok(run.stdout.includes(`wrote ${path.join(dir, "good.excalidraw")}`));
    assert.equal(JSON.parse(readText(path.join(dir, "good.excalidraw"))).type, "excalidraw");
    assert.ok(readText(path.join(dir, "good.svg")).startsWith("<svg"));

    const crossing = path.join(dir, "cross.json");
    fs.writeFileSync(
      crossing,
      JSON.stringify({
        nodes: [..."abc"].map((n, i) => ({ id: n, kind: "splitter", label: n, col: i, row: 0 })),
        edges: [{ from: "a", to: "c" }],
      }),
    );
    run = runCaptured(["build", crossing, "--no-svg", "--strict"]);
    assert.equal(run.code, 1);
    assert.ok(run.stderr.includes("warning: edge 0 (a -> c) crosses node 'b'"));
    assert.ok(!fs.existsSync(path.join(dir, "cross.svg")));
  });
});

test(
  "PNG export",
  { skip: chrome() ? false : "needs node >= 22, Chrome or Chromium, and network access to esm.sh" },
  () => {
    withTempDir((dir) => {
      const spec = path.join(dir, "good.spec.json");
      fs.writeFileSync(spec, readText(EXAMPLE));
      assert.equal(eip.main(["build", spec, "--no-svg", "--png"]), 0);
      const data = fs.readFileSync(path.join(dir, "good.png"));
      assert.ok(data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])));
      assert.equal(Math.max(data.readUInt32BE(16), data.readUInt32BE(20)), 3000);
      let chunk = null;
      let offset = 8;
      while (offset < data.length) {
        const length = data.readUInt32BE(offset);
        const kind = data.subarray(offset + 4, offset + 8);
        if (kind.toString("latin1") === "tEXt") {
          chunk = data.subarray(offset + 8, offset + 8 + length);
          break;
        }
        offset += 12 + length;
      }
      assert.ok(chunk !== null, "expected a tEXt chunk with the embedded scene");
      const nul = chunk.indexOf(0);
      const keyword = (nul === -1 ? chunk : chunk.subarray(0, nul)).toString();
      assert.equal(keyword, "application/vnd.excalidraw+json");
    });
  },
);

test("PNG export failure exits 3 and keeps the scene", () => {
  withTempDir((dir) => {
    const spec = path.join(dir, "good.spec.json");
    fs.writeFileSync(spec, readText(EXAMPLE));
    const missing = path.join(dir, "no-such-chrome");
    const saved = process.env.CHROME;
    process.env.CHROME = missing;
    try {
      const run = runCaptured(["build", spec, "--no-svg", "--png"]);
      assert.equal(run.code, 3);
      assert.ok(
        run.stderr.includes(`error: png export failed: CHROME points at ${missing}, which does not exist`),
        run.stderr,
      );
    } finally {
      if (saved === undefined) delete process.env.CHROME;
      else process.env.CHROME = saved;
    }
    assert.ok(fs.existsSync(path.join(dir, "good.excalidraw")));
    assert.ok(!fs.existsSync(path.join(dir, "good.png")));
  });
});
