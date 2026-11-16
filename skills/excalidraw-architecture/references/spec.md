# Spec reference — `eip_excalidraw.py`

The spec is a single JSON object. It is the source of truth: the `.excalidraw` scene, the preview SVG and the stencil library are all derived from it.

```
python3 <skill-dir>/scripts/eip_excalidraw.py build examples/order-flow.spec.json
```

`<skill-dir>` is the directory the skill is installed in (`skills/excalidraw-architecture` in the https://github.com/jamescarr/diagram-skill repo). The script is stdlib only and runs on Python 3.12+.

## Contents

- [File shape](#file-shape)
- [Top level](#top-level)
- [style](#style)
- [lanes](#lanes)
- [nodes](#nodes)
- [edges](#edges)
- [groups](#groups)
- [Node kinds](#node-kinds)
- [Aliases](#aliases)
- [Badges](#badges)
- [Edge kinds and labels](#edge-kinds-and-labels)
- [Layout rules](#layout-rules)
- [Validation messages](#validation-messages)
- [CLI](#cli)
- [Worked example](#worked-example)

## File shape

```json
{
  "title": "Order placement — message flow",
  "style": {"font": "excalifont", "sketchy": true},
  "legend": true,
  "lanes": ["Clients", "Orders", "Fulfilment"],
  "nodes": [],
  "edges": [],
  "groups": []
}
```

Every field has a default (`nodes` is `[]`), so `{}` builds an empty scene. Unknown top-level keys and unknown keys inside `nodes[i]`, `edges[i]`, `groups[i]` and `style` are errors: `unknown key 'x' in nodes[3]`, `unknown key 'x' in spec`.

## Top level

| Field | Type | Default | Meaning |
|---|---|---|---|
| `title` | string | none | Diagram title, drawn 28px at the top left. |
| `style` | object | `{"font": "excalifont", "sketchy": true}` | Rendering style (below). |
| `legend` | bool | `true` | Draw a legend frame naming every kind, badge and edge style used. The legend is skipped when `false` or when there are no nodes. |
| `lanes` | array of strings | none | Swimlane rows, top to bottom. Setting `lanes` switches layout from barycentre row packing to lane bands. |
| `nodes` | array of objects | `[]` | The boxes, pipes, actors and stores. |
| `edges` | array of objects | `[]` | The arrows. |
| `groups` | array of objects | `[]` | Frames around related nodes. |

## style

| Field | Type | Default | Values |
|---|---|---|---|
| `font` | string | `excalifont` | `excalifont` (Excalifont, fontFamily 5), `helvetica` (2), `cascadia` (Cascadia Code, monospace, 3). |
| `sketchy` | bool | `true` | `true` = roughness 1 on boxes, pipes, cylinders, actors, notes and arrows (the hand-drawn look). `false` = roughness 0 everywhere. Icons, badges and frames are always roughness 0. |

## lanes

An array of lane names, drawn top to bottom with a label in the left gutter and a dotted rule under each band.

- Node `lane` must be one of these names (`node 'x': unknown lane 'L'`).
- A node without `lane` goes to the first lane.
- `row` cannot be combined with `lanes`: `node 'x': row cannot be used with lanes; use lane`.
- Nodes sharing a `(col, lane)` stack top to bottom in spec order inside the lane band.

## nodes

```json
{"id": "orders", "kind": "service", "label": "Order Service", "badges": ["gateway", "tx"], "group": "orders-ctx"}
```

| Field | Type | Default | Rules |
|---|---|---|---|
| `id` | string | required | Unique; characters `[A-Za-z0-9_.:-]+`. Used in element ids (`n:<id>`) and edge references. |
| `kind` | string | required | One of the [kinds](#node-kinds), after [alias](#aliases) resolution. |
| `label` | string | required | The text the user reads. Optional for `note` and the message-family kinds, where it defaults to the kind's EIP name. Missing is `node 'x': missing label`. |
| `sub` | string | none | Second caption line, 12px muted, below the label. Use it for the completion rule, timeout, owner or topic detail. |
| `badges` | array of strings | `[]` | App-family nodes only. Each entry from [Badges](#badges); `competing:N` is allowed. Elsewhere: `badges not allowed on kind 'x'`. |
| `tags` | array of strings | `[]` | Channel-family (pipe) nodes only. Joined with ` · ` inside the pipe body after the kind tag, e.g. `PUB-SUB · key=orderId · 12 partitions`. Elsewhere: `tags not allowed on kind 'x'`. |
| `group` | string | none | Id of a frame in `groups`. |
| `lane` | string | first lane | Lane name from `lanes`. |
| `col` | int ≥ 0 | computed | Pins the column (layer), left to right. |
| `row` | int ≥ 0 | computed | Pins the row. Without lanes only; with lanes use `lane`. |
| `shadow` | string | none | Id of a channel-family node. This node is drawn directly under that channel, centred on it, and a `dlq` edge is auto-drawn from the channel to this node. Skips normal column/row layout. |
| `attach` | string | none | `note` kind only: id of the node the note sits under (drawn below it, centred). Invalid elsewhere: `node 'x': attach is only valid for kind 'note'`. |
| `link` | string | none | URL stored on the node's box (`link`), so Excalidraw shows a link handle on it. |

`col`/`row` cannot be combined with `shadow` or `attach`: `node 'x': col/row cannot be combined with shadow/attach`.

## edges

```json
{"from": "orders", "to": "orders.placed", "type": "event", "message": "OrderPlaced", "seq": 2, "route": "straight"}
```

| Field | Type | Default | Meaning |
|---|---|---|---|
| `from` | string | required | Source node id. |
| `to` | string | required | Target node id; unlike `from` must differ. |
| `kind` | string | `message` | One of [EDGE_KINDS](#edge-kinds-and-labels). |
| `type` | string | none | `command`, `event`, `document` or `reply`. Valid only for `kind: "message"`. |
| `message` | string | none | The message or operation name; shown first, with the type marker. |
| `label` | string | none | Second line of the arrow label (condition, note). When there is no `message`, the label is the only text. |
| `seq` | int | none | Prefixes the label with `1.` etc. for ordered flows. |
| `route` | string | computed | `straight`, `ortho`, `below`, `above`. See [Layout rules](#layout-rules). |
| `correlation` | bool | `false` | Adds `corr-id` to the annotation line. |
| `reply_to` | string | none | Channel id; adds `reply-to: <id>`. Must be a channel-family node. |
| `ttl` | string | none | Adds `ttl <value>` to the annotation line. |
| `sequence` | bool | `false` | Adds `seq#` to the annotation line (sequence number carried in the message). |
| `style` | string | derived from kind/type | `solid`, `dashed` or `dotted`; overrides the table. |
| `color` | hex string | derived from kind | Overrides the stroke colour, e.g. `"#c92a2a"`. |

## groups

```json
{"id": "orders-ctx", "label": "Orders bounded context", "kind": "context"}
```

| Field | Type | Default | Values |
|---|---|---|---|
| `id` | string | required | Referenced by `node.group`. |
| `label` | string | the id | Frame title. |
| `kind` | string | `context` | Frame kind: `context`, `broker` or `deployment`. |

Frames are drawn behind their members. Arrows are inside a frame only when both endpoints are members. Warnings: `frame 'g' encloses non-member node 'x'`, `frames 'a' and 'b' overlap`, `group 'g' has no members`.

A frame is the bounding box of its members plus padding, so members must form a contiguous block of the grid. A group whose members sit in columns 2 and 4 encloses whatever is in column 3; pin `col`/`row`, use `lanes`, or leave the outlier out of the group.

## Node kinds

60 kinds. Family decides the box shape; the EIP name appears in the legend. Aliases resolve before validation, so use either spelling.

### Messaging systems — channels

| Kind | Family | EIP name | Use when |
|---|---|---|---|
| `channel` | pipe | Message Channel | A message moves between participants and p2p vs pub-sub is not yet decided. |
| `p2p-channel` | pipe | Point-to-Point Channel | Exactly one consumer handles each message. |
| `pubsub-channel` | pipe | Publish-Subscribe Channel | Every subscriber receives every message. |
| `datatype-channel` | pipe | Datatype Channel | The channel carries one payload type. |
| `dead-letter-channel` | pipe | Dead Letter Channel | Messages that cannot be delivered or processed after bounded attempts. |
| `invalid-message-channel` | pipe | Invalid Message Channel | Messages that fail validation, kept separate so bad producers are visible. |
| `message-bus` | pipe | Message Bus | A shared bus, envelope and conventions across many applications; the context-level broker. |
| `control-bus` | pipe | Control Bus | Management commands and status on their own channel. |

### Message construction

| Kind | Family | EIP name | Use when |
|---|---|---|---|
| `message` | message | Message | A message in flight where the type is not the point. |
| `command-message` | message | Command Message | One receiver, do this; imperative name. |
| `document-message` | message | Document Message | Here is data; noun name. |
| `event-message` | message | Event Message | This happened; past-tense name. |

### Routing

| Kind | Family | EIP name | Use when |
|---|---|---|---|
| `content-based-router` | component | Content-Based Router | Route each message by payload or header rules. |
| `message-filter` | component | Message Filter | Drop messages a consumer does not want. |
| `dynamic-router` | component | Dynamic Router | Destinations are registered at runtime. |
| `recipient-list` | component | Recipient List | Send one message to a computed list of recipients. |
| `splitter` | component | Splitter | One message with many items becomes one message per item. |
| `aggregator` | component | Aggregator | Reassemble parts, with an explicit completion rule (count, timeout, predicate). |
| `resequencer` | component | Resequencer | Restore order by sequence number with a gap timeout. |
| `composed-message-processor` | component | Composed Message Processor | Split, process the parts, aggregate the results. |
| `scatter-gather` | component | Scatter-Gather | Broadcast a request and gather replies with a timeout. |
| `routing-slip` | component | Routing Slip | Each message carries its own list of steps. |
| `process-manager` | component | Process Manager | The next step depends on intermediate results, state or timeouts. |
| `saga` | component | Saga (Process Manager) | A long-running flow with compensation (same glyph as Process Manager). |

### Transformation

| Kind | Family | EIP name | Use when |
|---|---|---|---|
| `message-translator` | component | Message Translator | Format or model changes between hops, typically at a bounded-context border. |
| `envelope-wrapper` | component | Envelope Wrapper | Transport metadata is added at the boundary and stripped at the other side. |
| `content-enricher` | component | Content Enricher | The message needs data fetched from elsewhere. |
| `content-filter` | component | Content Filter | Strip the payload to the fields the consumer needs. |
| `claim-check` | component | Claim Check | Store the payload and send a reference. |
| `normalizer` | component | Normalizer | Several input formats become one common format. |

### Messaging endpoints

| Kind | Family | EIP name | Use when |
|---|---|---|---|
| `message-endpoint` | component | Message Endpoint | A generic receive point; the endpoint style is not the point. |
| `messaging-gateway` | component | Messaging Gateway | Expose a domain interface over messaging (`orders.place(order)`). |
| `messaging-mapper` | component | Messaging Mapper | Map domain objects to and from messages. |
| `transactional-client` | component | Transactional Client | Send or receive is tied to the local transaction. |
| `polling-consumer` | component | Polling Consumer | The consumer pulls at its own pace (long polling, batches). |
| `event-driven-consumer` | component | Event-Driven Consumer | The broker pushes; bounded prefetch. |
| `competing-consumers` | component | Competing Consumers | Several instances share one point-to-point channel. |
| `message-dispatcher` | component | Message Dispatcher | One consumer hands messages to specific performers. |
| `selective-consumer` | component | Selective Consumer | The broker filters by selector before delivery. |
| `durable-subscriber` | component | Durable Subscriber | No message gaps while the subscriber is down. |
| `idempotent-receiver` | component | Idempotent Receiver | The handler is safe under redelivery. |
| `service-activator` | component | Service Activator | A thin adapter invokes a plain service method. |
| `channel-adapter` | component | Channel Adapter | Connect an application or protocol to the messaging system. |

### System management

| Kind | Family | EIP name | Use when |
|---|---|---|---|
| `wire-tap` | component | Wire Tap | Copy messages to a side channel for audit or debugging. |
| `detour` | component | Detour | Route through extra steps switched on at runtime. |
| `message-history` | message | Message History | Record each hop on the message. |
| `smart-proxy` | component | Smart Proxy | Intercept requests and replies to measure them, then forward. |
| `test-message` | message | Test Message | Inject a probe periodically and verify it at the end of the flow. |
| `channel-purger` | component | Channel Purger | Clear leftover junk in test setup or recovery, scoped and logged. |

### Messaging infrastructure

| Kind | Family | EIP name | Use when |
|---|---|---|---|
| `message-broker` | component | Message Broker | The broker is a participant; keep it to hub routing, no business logic. |
| `messaging-bridge` | component | Messaging Bridge | Connect two brokers or broker clusters. |
| `outbox` | component | Transactional Outbox | Publish as part of the local transaction. |
| `inbox` | component | Transactional Inbox | Dedupe/consume as part of the local transaction. |

### Participants and stores

| Kind | Family | EIP name | Use when |
|---|---|---|---|
| `service` | app | Application | A service or application you own. |
| `external-system` | app (dashed) | External system | A system outside your control. |
| `actor` | actor | Actor | A person or client. |
| `datastore` | cylinder | Data store | State the service owns. |
| `message-store` | cylinder | Message Store | Copies of messages for audit, replay or reconciliation. |
| `schema-registry` | cylinder | Schema Registry | Where message schemas live. |
| `note` | note | Note | A sticky annotation; use `attach` to place it under a node. |

## Aliases

Aliases resolve before validation; either spelling is accepted.

| Alias | Kind |
|---|---|
| `message-router` | `content-based-router` |
| `queue` | `p2p-channel` |
| `topic` | `pubsub-channel` |
| `dlq` | `dead-letter-channel` |
| `db` | `datastore` |
| `external` | `external-system` |

## Badges

Badges are pills straddling the top edge of an app-family node. `competing` may be written `competing:N` and renders `competing ×N`. A competing node is drawn as a stack of boxes, one per instance and at most three (`competing:2` draws two, `competing:3` and above three, and bare `competing` three). Arrows on its right and bottom sides end on the back of the stack.

| Badge | EIP name | Use when |
|---|---|---|
| `gateway` | Messaging Gateway | The service is reached through a messaging interface. |
| `mapper` | Messaging Mapper | The service maps domain objects to messages. |
| `activator` | Service Activator | The endpoint calls a plain service method. |
| `tx` | Transactional Client | Send/receive is tied to the service's transaction. |
| `outbox` | Transactional Outbox | Publishes are written in the same transaction as the state change. |
| `inbox` | Transactional Inbox | Consumes are deduplicated in the same transaction. |
| `polling` | Polling Consumer | The service pulls. |
| `event-driven` | Event-Driven Consumer | The broker pushes. |
| `competing` | Competing Consumers | Several instances consume the same channel; `competing:N` states the count. |
| `dispatcher` | Message Dispatcher | One consumer hands work to specific performers. |
| `selective` | Selective Consumer | The service receives only selected messages. |
| `durable` | Durable Subscriber | The subscription survives downtime. |
| `idempotent` | Idempotent Receiver | Redelivery is safe. |
| `adapter` | Channel Adapter | A protocol or legacy system is adapted to messaging. |
| `bulkhead` | Bulkhead (resilience) | Failures are isolated per pool. |
| `retry` | Retry (resilience) | Bounded retries before the DLQ. |
| `circuit-breaker` | Circuit Breaker (resilience) | The caller stops calling a failing dependency. |

The last three are resilience patterns, not EIP; they are drawn because the diagram has to state them.

## Edge kinds and labels

`EDGE_KINDS` keys: `message`, `message:command`, `message:event`, `message:document`, `message:reply`, `rpc`, `data`, `tap`, `dlq`, `control`. A spec sets `kind: "message"` plus `type: "command"`; the composite keys below name the style row that results.

| Kind | Name | Stroke | Width | Start head | End head | Marker |
|---|---|---|---|---|---|---|
| `message` (no type) | Message | solid `#1e1e1e` | 2 | none | `arrow` | none |
| `message:command` | Command Message | solid `#1e1e1e` | 2 | none | `triangle` | `«C»` |
| `message:event` | Event Message | solid `#1e1e1e` | 2 | none | `arrow` | `«E»` |
| `message:document` | Document Message | solid `#1e1e1e` | 2 | none | `arrow` | `«D»` |
| `message:reply` | Reply (Request-Reply) | dashed `#1e1e1e` | 2 | none | `arrow` | `«R»` |
| `rpc` | Synchronous call (RPC) | solid `#1e1e1e` | 1 | none | `arrow` | none |
| `data` | Data access | dotted `#1e1e1e` | 1 | none | `arrow` | none |
| `tap` | Wire Tap copy | dotted `#1e1e1e` | 1 | `circle` | `arrow` | none |
| `dlq` | Dead letter route | dashed `#c92a2a` | 1 | none | `arrow` | none |
| `control` | Control Bus command | dashed `#868e96` | 1 | none | `bar` | none |

All arrows are `type: "arrow"`, `elbowed: false`, `roundness: null` (sharp corners). `style` and `color` on the edge override the row.

Label text, bound to the arrow, 14px, centred:

1. `[seq. ][marker ]message` — or the `label` alone when the edge has no `message`.
2. `label` — only when both `message` and `label` are present.
3. Annotations joined by ` · `: `reply-to: <id>` (`reply_to`), `corr-id` (`correlation`), `ttl <value>` (`ttl`), `seq#` (`sequence`). A new line starts whenever the next annotation would push a line past 24 characters, so request-reply labels stay narrow.

No label element is emitted when all parts are empty.

## Layout rules

The grid is columns (layers) left to right, rows top to bottom.

- **Columns**: derived from the edges. `message` edges with `type: "reply"` are inserted reversed for layering, so a reply channel lands beside its request channel. Remaining cycles are broken by DFS back-edge detection in spec order. `col = node.col` when pinned, otherwise `max(col(predecessor) + 1)`, sources at 0. Pinned columns never move; unpinned successors still take `max(pred + 1)`.
- **Rows**: with `lanes`, each lane is a band and nodes sharing `(col, lane)` stack top to bottom in spec order inside it. Without lanes, two barycentre sweeps (left→right over neighbours in earlier columns, right→left over neighbours in later columns); each node takes the row nearest its neighbours' mean row, ties by spec order, collisions push down, so a column may skip rows to line up with its neighbours. A pinned `row` is exact; unpinned nodes avoid it.
- **Alignment**: rows are aligned on the bindable box centre, so same-row arrows are horizontal; columns are aligned on the box centre x.
- **Gaps**: the base column gap is 120. It widens to hold the gap's vertical routing bands plus the widest arrow label that sits in it, plus 25px for the arrowhead in front of the label's target. When a gap carries labels in both directions (a request and its reply), it holds the widest of each side by side, each with its own arrowhead room. The base row gap is 40 and widens so frames of different groups do not overlap.
- **Sizing**: pipes widen to fit the kind tag plus `tags` text. App, cylinder, actor and note boxes widen or grow to fit their label; bound text always fits the container minus 10px.
- **Shadow nodes** sit under their channel, centred, 16px below its caption; the auto `dlq` edge runs from the channel to the shadow node, kept vertical and clear of the channel's caption.
- **Attached notes** sit under the target node, centred.
- **Attachment points**: several arrows on one side of a node are spread 14px apart, ordered by the other endpoint's position; an arrow to a node in the same row keeps the side's centre so it stays horizontal; the spacing widens when an arrow label sits on one of the runs. Points stay 10px (pipes 5px, EIP component and message boxes 6px, rounded boxes the corner radius) inside the side. Arrows leave a pipe's right side from the cap's outer edge, and a competing node's right and bottom sides from the back of its stack. Bottom attachments move beside the node's caption when there is room.
- **Vertical bands**: in each column gap, forward `ortho` verticals run at 16px, 24px, … from the gap's left edge, backward ones at 16px, 24px, … from its right edge, ordered so turns do not cross.
- **Labels**: an arrow that enters its target from the side carries its label on that final horizontal run, in the gap before the target, clear of both bands and of the 25px the arrowhead covers: centred, or pushed against its own target when the gap also carries labels running the other way. A straight arrow keeps its plain mid-run label (2 points) unless a band, the arrowhead or an opposing label is in the way. Vertical, `below` and `above` arrows carry it on the vertical or on the long horizontal. See `excalidraw-format.md` → Arrow labels for how this survives Excalidraw's own label placement and what it costs when nodes are dragged.

### Default routes

| Geometry | Default route |
|---|---|
| Forward, same row | `straight` |
| Forward, different rows | `ortho` |
| Same column | vertical `straight` between the facing edges |
| Backward between adjacent columns | `ortho`: leaves the source's left side, runs vertically in the gap between the two columns, enters the target's right side |
| Backward spanning more than one column gap | `below` |

Explicit `route` values:

- `ortho` on a forward edge: right side → vertical in the column gap → left side.
- `ortho` on a backward edge: left side → right side (left-to-right), so it does not loop around the diagram.
- `ortho` on a same-column edge: a C-shape out of and back into the right sides.
- `above`: reserves space above the first row (backward edges that should not pass underneath).
- `below`: passes below the content, with each successive below-edge offset further down.

`warning:` lines report layout defects (`edge 4 (a -> b) crosses node 'c'`, `label of edge 4 overlaps node 'c'`, `edge 4 (a -> b) ends in a 12px segment: its arrowhead shrinks`, a frame enclosing a non-member, overlapping frames, a group with no members); they do not stop the build. Edges are numbered by their index in `edges`; automatic `dlq` edges continue the numbering after the last spec edge.

## Validation messages

Errors are one per line, printed to stderr prefixed `error: `, exit code 2. Nothing is written when validation fails.

| Message | Cause |
|---|---|
| `duplicate node id 'x'` | Two nodes share an id. |
| `unknown kind 'x' for node 'y'` | Kind not in the catalogue (after aliases). |
| `node 'x': missing label` | No `label`, and the kind does not default one. |
| `unknown key 'x' in nodes[3]` | Unknown field in a node, edge, group, style or top level. |
| `unknown badge 'x' on node 'y'` | Badge not in the badge table. |
| `badges not allowed on kind 'x'` | `badges` on a non-app kind. |
| `tags not allowed on kind 'x'` | `tags` on a non-channel kind. |
| `edge 3: unknown node 'x'` | `from`/`to` references a missing node. |
| `edge 3: unknown edge kind 'x'` | `kind` not in EDGE_KINDS. |
| `edge 3: type 'x' only valid for kind 'message'` | `type` on a non-message edge. |
| `edge 3: unknown message type 'x'` | `type` not in command/event/document/reply. |
| `edge 3: unknown route 'x'` | `route` not in straight/ortho/below/above. |
| `edge 3: from and to are the same node 'x'` | Self-edge. |
| `node 'x': unknown group 'g'` | `group` id not declared. |
| `node 'x': unknown lane 'L'` | `lane` not declared in `lanes`. |
| `node 'x': row cannot be used with lanes; use lane` | `row` and `lanes` together. |
| `node 'x': shadow target 'y' is not a channel` | `shadow` points at a non-channel kind. |
| `node 'x': unknown shadow target 'y'` | `shadow` id does not exist. |
| `node 'x': attach is only valid for kind 'note'` | `attach` on a non-note kind. |
| `node 'x': unknown attach target 'y'` | `attach` id does not exist. |
| `nodes 'x' and 'y' both pinned to col 2 row 1` | Two pinned nodes share a cell. |
| `node 'x': col/row cannot be combined with shadow/attach` | Pin plus `shadow`/`attach`. |
| `reply_to 'x' is not a channel (edge 3)` | `reply_to` does not name a channel-family node. |

Other type and value errors use the same shapes: `nodes[3]: missing or invalid id`, `edge 3: missing 'from'`, `edge 3: unknown style 'x'`, `edge 3: invalid color 'x'`, `edge 3: seq must be an integer`, `edge 3: correlation must be true or false`, `node 'x': col must be a non-negative integer`, `node 'x': use either shadow or attach, not both`, `node 'x': 'y' is itself attached to another node`, `duplicate group id 'g'`, `group 'g': unknown kind 'k'`, `unknown font 'x'`, `lanes must be unique`.

## CLI

```
eip_excalidraw.py build SPEC [-o OUT.excalidraw] [--svg OUT.svg | --no-svg] [--check] [--strict]
eip_excalidraw.py lib [-o library/eip.excalidrawlib] [--svg library/eip.svg]
eip_excalidraw.py kinds
```

**build** — validate, lay out, write the scene and (by default) the preview.

- `-o` defaults to the spec path with `.spec.json` or `.json` replaced by `.excalidraw`.
- The SVG defaults next to the scene; `--no-svg` skips it.
- `--check` validates and lays out, prints errors and warnings plus `ok: <m> nodes, <k> edges, <w> warnings`, writes nothing.
- Exit `0` success; `1` warnings with `--strict`; `2` spec errors. Warnings are prefixed `warning: `.
- Success prints `wrote <out> (<n> elements, <m> nodes, <k> edges)` and `wrote <svg>`.

**lib** — write the stencil library (`eip-<kind>`, `eip-badge-<badge>`, `eip-edge-<key with ':' replaced by '-'>`, 87 items) and its SVG index; prints `wrote <path> (87 items)` and `wrote <svg>`. Defaults to `<skill-dir>/library/`.

**kinds** — print the live catalogue, tab separated: `kind<TAB>family<TAB>EIP name`, then `badge<TAB>…`, `edge<TAB>…` and `alias<TAB>alias<TAB>kind`.

## Worked example

`examples/order-flow.spec.json` — 17 nodes, 15 edges, two frames, one auto `dlq` arrow, legend on. `payments.cmd`, `orders.reply` and the `ship.*` queues are Kafka channels too (their `sub` says so), but they sit in column 4 with the saga in column 3, so putting them in the `kafka` group would make that frame enclose the saga; pinning them under `orders.placed` instead keeps the frame clean but tangles the request-reply loop. Channels without a drawn DLQ state the decision in a `sub` or the saga's note, and the saga states its dedupe key in `sub`.

```json
{
  "title": "Order placement — message flow",
  "legend": true,
  "groups": [
    {"id": "orders-ctx", "label": "Orders bounded context", "kind": "context"},
    {"id": "kafka", "label": "Kafka", "kind": "broker"}
  ],
  "nodes": [
    {"id": "customer", "kind": "actor", "label": "Customer"},
    {"id": "orders", "kind": "service", "label": "Order Service", "badges": ["gateway", "tx", "outbox"], "group": "orders-ctx"},
    {"id": "orders-db", "kind": "datastore", "label": "orders (Postgres)", "group": "orders-ctx"},
    {"id": "orders.placed", "kind": "pubsub-channel", "label": "orders.placed", "sub": "Kafka topic", "tags": ["key=orderId", "12 partitions"], "group": "kafka"},
    {"id": "orders.placed.dlq", "kind": "dead-letter-channel", "label": "orders.placed.dlq", "shadow": "orders.placed", "group": "kafka"},
    {"id": "payments.cmd", "kind": "p2p-channel", "label": "payments.cmd", "sub": "Kafka topic", "tags": ["key=orderId"]},
    {"id": "orders.reply", "kind": "p2p-channel", "label": "orders.reply", "sub": "Kafka topic", "tags": ["key=orderId"]},
    {"id": "saga", "kind": "process-manager", "label": "Order Saga", "sub": "timeout 15 min · dedupe by orderId"},
    {"id": "payments", "kind": "service", "label": "Payment Service", "badges": ["idempotent", "competing:3"]},
    {"id": "fulfilment", "kind": "service", "label": "Fulfilment Service", "badges": ["idempotent", "durable", "competing:3"]},
    {"id": "region-router", "kind": "content-based-router", "label": "by region"},
    {"id": "ship.eu", "kind": "p2p-channel", "label": "ship.eu", "sub": "Kafka topic · DLQ ship.dlq (not drawn)", "tags": ["key=orderId"]},
    {"id": "ship.us", "kind": "p2p-channel", "label": "ship.us", "sub": "Kafka topic · DLQ ship.dlq (not drawn)", "tags": ["key=orderId"]},
    {"id": "carrier-eu", "kind": "external-system", "label": "EU Carrier API"},
    {"id": "carrier-us", "kind": "external-system", "label": "US Carrier API"},
    {"id": "audit", "kind": "message-store", "label": "Audit store"},
    {"id": "agg-note", "kind": "note", "label": "Completes on PaymentAuthorized or after 15 min → compensates. No DLQ on payments.cmd / orders.reply: a lost message ends in the timeout.", "attach": "saga"}
  ],
  "edges": [
    {"from": "customer", "to": "orders", "kind": "rpc", "message": "POST /orders", "seq": 1},
    {"from": "orders", "to": "orders-db", "kind": "data", "label": "writes"},
    {"from": "orders", "to": "orders.placed", "type": "event", "message": "OrderPlaced", "seq": 2},
    {"from": "orders.placed", "to": "saga", "type": "event", "message": "OrderPlaced"},
    {"from": "orders.placed", "to": "fulfilment", "type": "event", "message": "OrderPlaced"},
    {"from": "orders.placed", "to": "region-router", "type": "event", "message": "OrderPlaced"},
    {"from": "region-router", "to": "ship.eu", "type": "document", "message": "Shipment", "label": "region = EU"},
    {"from": "region-router", "to": "ship.us", "type": "document", "message": "Shipment", "label": "region = US"},
    {"from": "ship.eu", "to": "carrier-eu", "type": "document", "message": "Shipment"},
    {"from": "ship.us", "to": "carrier-us", "type": "document", "message": "Shipment"},
    {"from": "orders.placed", "to": "audit", "kind": "tap"},
    {"from": "saga", "to": "payments.cmd", "type": "command", "message": "AuthorizePayment", "seq": 3, "reply_to": "orders.reply", "correlation": true, "ttl": "30s"},
    {"from": "payments.cmd", "to": "payments", "type": "command", "message": "AuthorizePayment"},
    {"from": "payments", "to": "orders.reply", "type": "reply", "message": "PaymentAuthorized", "correlation": true, "seq": 4},
    {"from": "orders.reply", "to": "saga", "type": "reply", "message": "PaymentAuthorized"}
  ]
}
```

Build it, then read `examples/order-flow.svg:img`. The Kafka frame shows `orders.placed` with its DLQ pipe and red octagon directly beneath it; the pub-sub fans out to the saga, Fulfilment and the router; the tap goes dotted to the Audit cylinder; the dashed reply arrows run back through the column gaps (`ortho`, the default for a backward edge between adjacent columns) into `orders.reply` and the saga, with each request label against `payments.cmd`/`Payment Service` and each reply label against its own target.
