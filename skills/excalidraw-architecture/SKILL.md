---
name: excalidraw-architecture
description: >-
  Use when asked to diagram, draw, sketch, or visualise a software architecture,
  message flow, event-driven or microservices system in Excalidraw. Produces
  .excalidraw files in Enterprise Integration Patterns notation (channels,
  routers, translators, endpoints, DLQs, sagas) from a small JSON spec via
  scripts/eip_excalidraw.py, with a preview SVG and a render check. Not for UI
  mockups, slide decks, or freeform whiteboarding.
license: MIT
compatibility: "build needs python3 >= 3.12 (stdlib only); --png export needs node >= 22, Chrome or Chromium, and network access to esm.sh"
metadata:
  author: jamescarr
  version: "1.0.0"
---
# Excalidraw architecture diagrams (EIP notation)

A diagram is a small JSON **spec** — nodes, edges, groups — plus a generator that lays it out in Hohpe & Woolf notation. The spec is the source of truth; the `.excalidraw` file and the preview `.svg` are build artefacts.

`<skill-dir>` below is the directory this skill is installed in — e.g. `~/.omp/agent/skills/excalidraw-architecture`, `~/.claude/skills/excalidraw-architecture` or `.agents/skills/excalidraw-architecture` — and `skills/excalidraw-architecture` in the https://github.com/jamescarr/diagram-skill repo.

## When to use

- Asked to diagram, draw, sketch or visualise a service, event or messaging architecture.
- Explaining how a message travels: which channel, which endpoint, what happens when it fails.
- Documenting the integration surface of a bounded context at context, flow or endpoint level.
- Reviewing a message-oriented design where the picture must expose a missing DLQ, correlation id or idempotency.

## Don't use

- UI mockups, wireframes, slide decks, freeform whiteboarding.
- Sequence diagrams of calls inside one process.
- Anything whose deliverable is not an `.excalidraw` file.

## Workflow

1. **Inventory** — list before drawing:
   - participants: services, external systems, actors, stores;
   - channels: name, point-to-point vs publish-subscribe, key/partitions/ordering, durability, DLQ;
   - messages: name (command = imperative, event = past tense, document = noun) and type;
   - endpoints per service: gateway, outbox/transaction, consumer style, competing count, idempotency, durability, selectivity;
   - routing and transformation steps;
   - request-reply pairs: reply channel, correlation, TTL;
   - management: wire tap, store, control bus.
   Read the `enterprise-integration-patterns` skill, if you have it installed, when a pattern choice is unclear.
2. **Pick the level** — `context`: actors, services, external systems, broker as `message-bus`, `rpc`/`data` edges. `flow` (the default): one business flow end to end with channels and EIP components. `endpoint`: inside one service — gateway → outbox → channel, or consumer → idempotent receiver → activator. One flow per diagram, at most 20 nodes; split by flow otherwise.
3. **Write the spec** — `<name>.spec.json` next to where the diagram will live (default `docs/architecture/`), using the cheat-sheet below. Run `python3 <skill-dir>/scripts/eip_excalidraw.py kinds` for the live catalogue.
4. **Build** — `python3 <skill-dir>/scripts/eip_excalidraw.py build <name>.spec.json` writes `<name>.excalidraw` and `<name>.svg`. Fix every `error:` (exit 2); treat `warning:` as a layout defect (`--strict` makes warnings exit 1). `--check` validates and lays out without writing.
   Add `--png [OUT.png]` to also export a PNG rendered by Excalidraw itself (hand-drawn, Excalifont, the scene embedded in the file so it can be dropped back onto excalidraw.com) — what a README, a doc or a blog post should embed. It needs node >= 22, Chrome or Chromium (`CHROME` overrides the lookup) and network access to esm.sh; it drives the browser through `scripts/export_png.mjs`, stdlib only. A failed export exits 3 and the scene is still written.
5. **Look** — `read <name>.png` when you built one, otherwise `read <name>.svg:img`; then work the review list.
6. **Fix** — rebuild after each spec change:

   | Symptom | Spec change |
   |---|---|
   | arrow crosses a node | `route: "ortho"` or `"below"`, or pin `row` |
   | label overlaps a node | shorten `message`/`label`, or pin the node's `row` away from the arrow |
   | backward arrow clutter | `route: "above"` |
   | reply arrow loops under the whole diagram | `route: "ortho"`, or put the reply channel next to the request channel |
   | crowded column | add `lanes`, or split the diagram |
   | long node label | move detail to `sub` |
   | group members scattered | pin `col`/`row` so members are adjacent |
   | frame encloses a non-member | pin `col`/`row` or use `lanes` so the group's members form a contiguous block |

7. **Deliver** — the `.spec.json`, `.excalidraw` and `.svg` (plus the `.png` when you built one). Say the spec is the source of truth: regenerate after edits. Hand edits in Excalidraw are fine afterwards, but a rebuild overwrites them.

## Modelling rules

Each rule is a claim the diagram must make visible; when it cannot be true, draw the exception explicitly.

- Every channel shows its kind tag and its key/partition/ordering tags (`tags`).
- Every consumer of an at-least-once channel wears `idempotent` — or the diagram says why not. Badges exist only on app-family nodes, so a saga, router or aggregator states its dedupe rule in `sub` (`dedupe by orderId`).
- Every channel whose consumer can fail has a `dead-letter-channel` `shadow`; validation failures get an `invalid-message-channel`. A DLQ that is left undrawn, or deliberately absent, is stated in the channel's `sub` or in a `note`.
- Request-reply = a command edge with `reply_to` and `correlation`, plus a dashed reply edge back.
- Aggregator, scatter-gather and saga nodes carry a `sub` with the completion rule (count/timeout).
- Publish inside a transaction = an `outbox` badge or `outbox` node, never a bare publish after commit.
- Translators sit on bounded-context borders (frames).
- Competing consumers show `competing:N`; durable subscriptions wear `durable`.
- Wire taps are `tap` edges into a `message-store`.
- Smart endpoints, dumb pipes: routing logic lives in router nodes, never implied inside a channel.
- Sync calls are `rpc` edges and are the exception, not the default.
- Internal records crossing a boundary get a `content-filter`, or a `claim-check` reference.

## Spec cheat-sheet

Nodes by EIP chapter — the full kind-by-kind table is in `references/spec.md`:

| Chapter | Kinds | Use when |
|---|---|---|
| Channels | `channel` `p2p-channel` `pubsub-channel` `datatype-channel` `dead-letter-channel` `invalid-message-channel` `message-bus` `control-bus` | A message moves between participants; pick p2p vs pub-sub, then the failure channel. |
| Messages | `message` `command-message` `document-message` `event-message` | The message itself is the subject, not the endpoint. |
| Routing | `content-based-router` `message-filter` `dynamic-router` `recipient-list` `splitter` `aggregator` `resequencer` `composed-message-processor` `scatter-gather` `routing-slip` `process-manager` `saga` | One message, several possible destinations, or parts to reassemble. |
| Transformation | `message-translator` `envelope-wrapper` `content-enricher` `content-filter` `claim-check` `normalizer` | The payload or its envelope changes between hops. |
| Endpoints | `message-endpoint` `messaging-gateway` `messaging-mapper` `transactional-client` `polling-consumer` `event-driven-consumer` `competing-consumers` `message-dispatcher` `selective-consumer` `durable-subscriber` `idempotent-receiver` `service-activator` `channel-adapter` | How a service attaches to a channel and consumes it. |
| System management | `wire-tap` `detour` `message-history` `smart-proxy` `test-message` `channel-purger` | Observability, probes and operations. |
| Infrastructure | `message-broker` `messaging-bridge` `outbox` `inbox` | The broker itself, broker-to-broker links, transactional publish/consume. |
| Participants and stores | `service` `external-system` `actor` `datastore` `message-store` `schema-registry` `note` | Who owns a channel end; where state, schemas and annotations live. |

Badges (app-family nodes only; the pill renders the short text):

| Group | Badges |
|---|---|
| Endpoint | `gateway` (Messaging Gateway), `mapper` (Messaging Mapper), `activator` (Service Activator), `adapter` (Channel Adapter) |
| Consumption | `polling` (Polling Consumer), `event-driven` (Event-Driven Consumer), `competing` / `competing:N` (Competing Consumers, renders `competing ×N`), `dispatcher` (Message Dispatcher), `selective` (Selective Consumer), `durable` (Durable Subscriber) |
| Transaction | `tx` (Transactional Client), `outbox` (Transactional Outbox), `inbox` (Transactional Inbox), `idempotent` (Idempotent Receiver) |
| Resilience | `bulkhead`, `retry`, `circuit-breaker` — resilience patterns, not EIP |

Edges:

| Edge kind | Stroke | Width | Heads | Marker |
|---|---|---|---|---|
| `message` (no type) | solid `#1e1e1e` | 2 | → `arrow` | none |
| `message` `type: command` | solid | 2 | → `triangle` | `«C»` |
| `message` `type: event` | solid | 2 | → `arrow` | `«E»` |
| `message` `type: document` | solid | 2 | → `arrow` | `«D»` |
| `message` `type: reply` | dashed | 2 | → `arrow` | `«R»` |
| `rpc` | solid | 1 | → `arrow` | none |
| `data` | dotted | 1 | → `arrow` | none |
| `tap` | dotted | 1 | `circle` → `arrow` | none |
| `dlq` | dashed `#c92a2a` | 1 | → `arrow` | none |
| `control` | dashed `#868e96` | 1 | ┤ `bar` | none |

Edge fields: `from`, `to`, `kind`, `type`, `message`, `label`, `seq`, `route`, `correlation`, `reply_to`, `ttl`, `sequence`, `style`, `color`. Node fields: `id`, `kind`, `label`, `sub`, `badges`, `tags`, `group`, `lane`, `col`, `row`, `shadow`, `attach`, `link`.

## Review checklist

- Title present; it names the flow, not the whole system.
- Every arrow is labelled with a message or a call.
- Every channel carries its kind tag and its key/partition tags.
- The DLQ decision is visible for every channel.
- Legend present when more than 6 kinds appear.
- No `warning:` left from the build.
- Group frames contain only their members.
- At most 20 nodes.

## Stack mapping

| Stack | Draw as |
|---|---|
| Kafka topic | `pubsub-channel`; consumer group → `competing:N`; durable subscription → `durable` |
| RabbitMQ queue | `p2p-channel`; exchange → `message-broker` or `content-based-router`; DLX → `dead-letter-channel` |
| SQS / SNS | `p2p-channel` / `pubsub-channel` |
| EventBridge rule | `content-based-router` |
| Step Functions | `process-manager` or `saga` |
| Lambda consumer | `service` with `event-driven` |
| Database | `datastore`; audit/replay copies → `message-store` |
| Partner API | `external-system`, dashed |

## Hand edits

`references/excalidraw-format.md` lists the JSON invariants that keep Excalidraw's bindings, text and frames valid after a hand edit.
