# Excalidraw file format — what the generator emits and what survives hand edits

Facts here come from reading `excalidraw/excalidraw@master` (`restore.ts`, `blob.ts`) and from a live render on excalidraw.com. Scene load uses `repairBindings: true, refreshDimensions: false`, so the text sizes in the file are used as-is and legacy bindings are migrated rather than rejected.

## Scene file

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://github.com/jamescarr/diagram-skill",
  "elements": [],
  "appState": {"viewBackgroundColor": "#ffffff"},
  "files": {}
}
```

Serialised with `indent=2`, `ensure_ascii=False`; all coordinates are integers.

## Element base

Every element begins with these keys, in this order, then its type-specific keys:

```
id, type, x, y, width, height, angle:0,
strokeColor, backgroundColor, fillStyle:"solid", strokeWidth, strokeStyle:"solid",
roughness, opacity:100, groupIds:[], frameId:null, index:null, roundness:null,
seed, version:1, versionNonce, isDeleted:false, boundElements:[], updated:1,
link:null, locked:false
```

- `seed = versionNonce = (zlib.crc32(id.encode()) & 0x7fffffff) or 1` — deterministic, so rebuilds are byte-identical.
- No `created`, `labelPosition` or `baseFontSize`: they are newer-only keys and restore defaults them.
- Missing base fields are defaulted on load (`restoreElementWithProperties`), so hand edits that drop one are not fatal.

### IDs

| Element | Id |
|---|---|
| bindable box / pipe body | `n:<node id>` |
| bound label | `n:<node id>:lbl` |
| caption, sub-caption | `n:<node id>:cap`, `n:<node id>:sub` |
| glyph primitives | `n:<node id>:i<k>` |
| badge pill, badge text | `n:<node id>:b<k>`, `n:<node id>:b<k>:t` |
| arrow, arrow label | `e:<edge index>`, `e:<edge index>:lbl` |
| frame | `g:<group id>` |
| title, legend | `title`, `legend:*` |

Every element of a node carries `groupIds: ["grp:<node id>"]`, so one click selects the whole glyph.

## Text

Keys: `text`, `fontSize`, `fontFamily`, `textAlign` (`center` or `left`), `verticalAlign` (`middle`, `top` or `bottom`), `containerId` (or `null`), `originalText` (same string as `text`), `autoResize: true`, `lineHeight: 1.25`.

Size estimate:

```
width  = max(len(line) for line in lines) * fontSize * F
height = len(lines) * fontSize * 1.25
```

`F = 0.6`, or `0.62` for Cascadia. The estimate runs about 10% wide against Excalifont (measured 0.49–0.55), which is deliberate: Excalidraw centres lines on the box centre, so a wide box still reads centred.

| `style.font` | `fontFamily` | SVG family |
|---|---|---|
| `excalifont` (default) | 5 | `Virgil, 'Segoe Print', 'Comic Sans MS', cursive` |
| `helvetica` | 2 | `Helvetica, Arial, sans-serif` |
| `cascadia` | 3 | `'Cascadia Code', Menlo, monospace` |

### Bound text

Container text (labels inside app, cylinder, actor and note boxes; captions under components and pipes are free text): the container's `boundElements` lists `{"type": "text", "id": "<text id>"}`, the text has `containerId: "<container id>"`, and the text element is emitted **immediately after** its container. Position: `x = box.cx - width/2`, `y = box.cy - height/2`; note text is left/top aligned at `box.x + 5`, `box.y + 5` (Excalidraw's bound-text padding). The text must fit the container minus 10px.

Free captions (below components, pipes and messages) use `containerId: null` and the same centring formula under the box.

## Arrows

- `type: "arrow"`, `elbowed: false`, `roundness: null` (sharp polyline corners).
- `points` starts at `[0, 0]`; `x`, `y` is the first point; `width`, `height` is the bounding box of the points.
- `startBinding` / `endBinding`: `{"elementId": "<bindable id>", "focus": 0, "gap": 1}`, or `null`. Arrows leaving a pipe's right side start at the outer edge of the cap ellipse, 12px past the body rectangle they bind to, so their `gap` is 13.
- `startArrowhead` / `endArrowhead` per edge kind (`null`, `arrow`, `triangle`, `bar`, `circle`).
- The bindable shape lists every attached arrow in `boundElements` as `{"type": "arrow", "id": "<arrow id>"}`.

### Binding migration

Bindings are emitted in the legacy `{elementId, focus, gap}` form so older builds (Obsidian, VS Code extensions) still load the file. Current excalidraw.com migrates them on load (`restore.ts repairBinding`). If a future build drops the v1 migration, switch to `{elementId, fixedPoint: [fx, fy], mode: "orbit"}` where `fx, fy` is the attachment point as a fraction of the bound box.

### Arrow labels

Label text is a separate text element with `containerId` = the arrow id; the arrow's `boundElements` lists `{"type": "text", "id": "<label id>"}`. Excalidraw places the label itself:

- odd number of points → on the middle point;
- even number of points → on the midpoint of the middle segment.

The generator wants labels on the arrow's final horizontal run, inside the column gap before the target, clear of the gap's vertical routing bands and clear of the arrowhead. Excalidraw draws an `arrow` head 25px long, shrunk to half the final segment when that segment is shorter than 50px. So where needed the generator inserts collinear points until Excalidraw's rule lands there: a straight edge becomes 3 points (the middle one is the label centre) and an `ortho` edge 7 points (the middle one is the label centre; the two after it are 1px apart under the label, so the final segment, which carries the arrowhead, runs from the label to the target). A straight edge whose mid-run label is already clear stays at 2 points. Vertical, `below` and `above` arrows keep Excalidraw's default spot (the vertical's midpoint, or the long horizontal). The extra points are invisible; they show up only as handles when the arrow is selected. A final segment under 25px is reported as `warning: edge N (a -> b) ends in a Mpx segment: its arrowhead shrinks`.

Tradeoff when editing by hand: dragging a bound node moves only the arrow's end points. A 2-point arrow just tilts; a 3-point arrow kinks at its middle point, and every `ortho` arrow (4 or 7 points) keeps its interior corners where they were. Prefer moving nodes in the spec and rebuilding.

The text is anchored at that point minus half its size: 14px, centred. The SVG preview draws a white rectangle behind it, the mask Excalidraw draws.

## Shapes

- Rectangle / pipe body: plain `rectangle`. `app` boxes use `roundness: {"type": 3}`; Excalidraw's radius is `min(w, h) * 0.25` capped at 32 — there are no proper pill shapes, so badge pills are small rectangles.
- EIP boxes, pipes, cylinders, notes and arrows: `roundness: null` (sharp).
- Ellipse: `ellipse` (actor, cylinder lids, icon circles).
- Diamond: `diamond` with `roundness: null`. Bindings on a diamond work with null roundness.
- Polygon icon: `type: "line"`, closed `points` (first point repeated last), `polygon: true`, `fillStyle: "solid"`, null heads and bindings.
- Frames: `type: "frame"`, `name`, `strokeColor: "#bbb"`, `strokeWidth: 2`, `roughness: 0`, `backgroundColor: "transparent"`. Member elements carry `frameId`, and frames are emitted **before** their members. Arrows are members only when both endpoints are.

## Element order

1. Title text.
2. Lane labels and lane separator lines.
3. Group frames.
4. Per root node, in this z-order: stack cards (competing consumers, farthest first) → family under-parts (cylinder bottom ellipse) → bindable box → bound label → family over-parts (pipe cap, cylinder top) → kind glyph icons → pipe tag text → badges → caption → sub.
5. Shadow nodes and attached notes, after all root nodes, same per-node order.
6. Each arrow followed immediately by its label.
7. Legend frame, then its entries.

Icons sit **on top of** the box so they stay visible. Glyph lines that carry arrowheads are emitted as unbound `arrow` elements, because Excalidraw only draws arrowheads on arrows, not on lines. The `schema-registry` cylinder's `{ }` sits on the lid (centre y=8), clear of the label.

Badge text is free text centred on its pill (not bound to it). Badges, pills and glyph icons share the node's `groupIds`, so a click selects the whole node.

An app node with a `competing` or `competing:N` badge draws copies of its box behind it (`n:<id>:s1`, `n:<id>:s2`), each 6px further down and right: one card per instance beyond the first, at most two, and two for a bare `competing`. Only the front box is bindable. Arrows on its right and bottom sides end on the outer card, with the binding `gap` widened by the same 6px per card, as arrows leaving a pipe end on its cap. The `sub` caption sits below the outer card.

## Style

`sketchy: true` (default) → `roughness: 1` on boxes, pipes, cylinders, actors, notes and arrows. Icons, badges and frames stay `roughness: 0`. `sketchy: false` → 0 everywhere.

## Invariants for hand edits

After editing a scene by hand or in Excalidraw, keep these true or bindings silently detach:

1. **Both directions.** Every `{"type": "arrow", "id": A}` in a shape's `boundElements` has a matching arrow `A` whose `startBinding`/`endBinding` points back at that shape. Text links work the same way: `containerId` ↔ `{"type": "text", "id": …}`.
2. **Text follows its container** in the `elements` array. A container before its text is required for Excalidraw to adopt the text.
3. **IDs stay unique.** Duplicated ids make bindings resolve to the wrong element.
4. **Frames precede members**, and every non-null `frameId` names a frame that appears earlier.
5. **Text stays inside its container** (`width <= container.width - 10`, same for height). Load does not re-measure, so an overflowing label stays overflowing.
6. **`points[0]` is `[0, 0]`** and `x, y` is that first point; otherwise the arrow jumps on the next edit.
7. **`groupIds` stay consistent** across all elements of a node, or one click no longer selects the glyph.
8. If you change a label's text, update both `text` and `originalText`, and adjust `width`/`height` yourself.

## Real render on excalidraw.com

Needs the omp `browser` helper and network access to excalidraw.com. Inject the elements into `localStorage`, reload, zoom to fit, then read console errors and screenshot.

```python
import asyncio, json
scene = json.load(open("docs/architecture/order-flow.excalidraw"))
tab = await browser.open(name="excalidraw", url="https://excalidraw.com", app={"tern": False, "relay": False}, headed=False, viewport={"width": 1600, "height": 1000})
await tab.waitForSelector(".excalidraw", timeout=30000)
for script in await tab.initScripts():  # a reused tab keeps earlier injections
    await tab.removeInitScript(script["id"])
await tab.addInitScript("localStorage.setItem('excalidraw', JSON.stringify(%s)); localStorage.setItem('excalidraw-state', JSON.stringify({viewBackgroundColor:'#ffffff', scrollX:0, scrollY:0, zoom:{value:1}}));" % json.dumps(scene["elements"]))
await tab.reload(); await tab.waitForSelector(".excalidraw__canvas", timeout=30000)
await tab.press("Shift+1", selector="body")  # zoom to fit
await asyncio.sleep(1.5)
print(await tab.errors()); await tab.screenshot(); await browser.close(name="excalidraw")
```

`Shift+1` is Excalidraw's zoom-to-fit shortcut; on excalidraw.com it took the example from 100% to 62%. If the zoom indicator does not change, set `zoom: {value: 0.5}` in the `excalidraw-state` item instead. To inspect one area at full size, set `scrollX`/`scrollY` (negative values move the view right/down) and `zoom` in `excalidraw-state` and skip the shortcut.

A clean render prints `{'entries': [], ...}` from `tab.errors()` and a hand-drawn screenshot matching the SVG preview's layout. Without the browser helper the SVG preview is the only visual check; say so rather than claiming a real render.

The stencil library can be checked the same way: inject `library_preview(json.load(open("<skill-dir>/library/eip.excalidrawlib")))["elements"]` (`library_preview` is in `scripts/eip_excalidraw.py`) instead of the scene's elements; it lays every item out in the grid that `library/eip.svg` shows.
