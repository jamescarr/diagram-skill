# Notation — what the shapes mean

Every glyph is a monochrome line drawing (stroke `#1e1e1e`, 1px) with flat fills, laid over a labelled box. The label is what the system is called; the glyph is which EIP pattern it is. The legend frame repeats the mapping for whatever a diagram uses.

## Families and colours

| Family | Look | Means |
|---|---|---|
| `component` | green square box (`#d3f9d8`), caption below | An EIP component: router, translator, endpoint pattern. |
| `message` | white square box, caption below | A message in flight, not a component. |
| `pipe` | wide grey pipe (`#dee2e6`) with a cap ring, caption below | A channel. The tag inside names its semantics. |
| `app` | rounded yellow box (`#fff3bf`), label inside | A service or application you own. |
| `app`, external | rounded pale box, dashed border | A system outside your control. |
| `actor` | pale blue ellipse (`#e7f5ff`), label inside | A person or client. |
| `cylinder` | cylinder with an elliptical lid, label inside | State: datastore, message store, schema registry. |
| `note` | sticky yellow rectangle (`#fff9db`) | An annotation, usually attached under a node. |

Other colour signals:

| Colour | Use |
|---|---|
| `#d0ebff` blue | datastore |
| `#dee2e6` grey | message store, pipe body |
| `#f1f3f5` light grey | pipe cap |
| `#e5dbff` purple | schema registry |
| `#ff6b6b` / `#c92a2a` red | dead-letter octagon and its stroke |
| `#ffd43b` yellow | invalid-message warning triangle |
| `#adb5bd` grey icon fill | neutral icon mass (funnel, lock) |
| `#ffec99` yellow icon fill | configuration, envelope, broker leaves |
| `#c5f6fa` cyan icon fill | boundary/adapter shapes |
| `#5c5f66` muted text | sub-captions, lane labels |
| `#bbb` frame stroke | frames and the legend |

## Channels

| Kind | Drawn as | Reads as |
|---|---|---|
| `channel` | bare pipe with cap, no tag | A channel whose semantics are not yet fixed. |
| `p2p-channel` | pipe tagged `P2P` | Work is done once; consumers compete. |
| `pubsub-channel` | pipe tagged `PUB-SUB` | Every subscriber gets every message. |
| `datatype-channel` | pipe tagged `TYPE` | One channel per payload type. |
| `dead-letter-channel` | pipe tagged `DLQ` plus a red octagon below it | Failed messages park here. |
| `invalid-message-channel` | pipe tagged `INVALID` plus a yellow `!` triangle below it | Validation failures, kept apart from processing failures. |
| `message-bus` | pipe tagged `BUS`, three double-headed stems above and one below | A shared bus with many attached systems. |
| `control-bus` | dashed pipe tagged `CONTROL` | Management commands and status. |

## Messages

| Kind | Drawn as | Reads as |
|---|---|---|
| `message` | lollipop: grey circle on a stem into a white box | A message where the type is not the point. |
| `command-message` | lollipop with `C` | Do this — one receiver. |
| `document-message` | lollipop with `D` | Here is data. |
| `event-message` | lollipop with `E` | This happened. |

## Routing

| Kind | Drawn as | Reads as |
|---|---|---|
| `content-based-router` | line into a junction dot, fanning to three stubs with dots | Payload or header rules pick the destination. |
| `message-filter` | grey funnel | Unwanted messages are dropped. |
| `dynamic-router` | router fan plus a small yellow rules box | Destinations come from runtime configuration. |
| `recipient-list` | one line fanning to three recipients | One message, a computed list of receivers. |
| `splitter` | one box → arrow → three boxes | One message becomes one per item. |
| `aggregator` | three boxes → arrow → one box | Parts are reassembled under a completion rule. |
| `resequencer` | three scrambled boxes → arrow → three ordered boxes | Sequence order is restored, with a gap timeout. |
| `composed-message-processor` | box → three parallel boxes → box | Split, process each part, aggregate. |
| `scatter-gather` | dot → three diamonds → dot | Broadcast the request, gather the replies. |
| `routing-slip` | four boxes chained by short links | Each message carries its own step list. |
| `process-manager` | dot head, diamond state, bus line to three result boxes | A state machine owns the flow. |
| `saga` | same glyph as the process manager | A process manager with compensation. |

## Transformation

| Kind | Drawn as | Reads as |
|---|---|---|
| `message-translator` | two boxes with crossing lines between them | Format or model changes. |
| `envelope-wrapper` | yellow envelope | Transport metadata is added or removed. |
| `content-enricher` | small box → arrow → larger box | Data is fetched and added. |
| `content-filter` | large box → arrow → small box | Fields are stripped. |
| `claim-check` | filter glyph plus a key | The payload is stored; the message carries a reference. |
| `normalizer` | circle, diamond and triangle → arrow → one box | Several formats become one. |

## Endpoints

| Kind | Drawn as | Reads as |
|---|---|---|
| `message-endpoint` | grey incoming arrow → white box | A generic receive point. |
| `messaging-gateway` | grey arrow → cyan wedge → cyan box | A domain interface over messaging. |
| `messaging-mapper` | three left boxes joined to three right boxes by crossing lines | Domain objects ↔ messages. |
| `transactional-client` | grey arrow → white box marked `TX` | Send/receive joined to the local transaction. |
| `polling-consumer` | grey arrow → open circle with a dot | The consumer pulls. |
| `event-driven-consumer` | grey arrow → line → black diamond | The broker pushes. |
| `competing-consumers` | grey arrow → three black diamonds | Several instances share the channel. |
| `message-dispatcher` | grey arrow → box → three black diamonds | One consumer distributes to performers. |
| `selective-consumer` | grey arrow → funnel → box | The broker filters before delivery. |
| `durable-subscriber` | endpoint glyph plus a grey lock | The subscription survives downtime. |
| `idempotent-receiver` | endpoint glyph plus a circled `1` | Redelivery is safe. |
| `service-activator` | grey arrow → diamond → line → box | A thin adapter calls a plain service method. |
| `channel-adapter` | yellow block, cyan wedge, double-headed arrow, grey block | An application or protocol meets messaging. |

## System management and infrastructure

| Kind | Drawn as | Reads as |
|---|---|---|
| `wire-tap` | main line with a dot branching down an arrow | A copy goes to a side channel. |
| `detour` | main line with a dot, branch through a yellow box, rejoin | Extra steps switched on at runtime. |
| `message-history` | message lollipop plus three horizontal records | Each hop is recorded on the message. |
| `smart-proxy` | grey arrow → white box ↔ grey box, grey base below | Requests and replies are intercepted and measured. |
| `test-message` | message lollipop with `T` | A periodic probe, verified at the end of the flow. |
| `channel-purger` | pipe with a red cross | Junk is cleared deliberately, in test or recovery. |
| `message-broker` | green hub box with six yellow leaves on spokes | Hub routing only, no business logic. |
| `messaging-bridge` | an arch over a deck, with vertical posts | Two brokers are connected. |
| `outbox` | blue cylinder → arrow → grey pipe | Publish inside the local transaction. |
| `inbox` | grey pipe → arrow → blue cylinder | Consume inside the local transaction. |

## Participants and stores

| Kind | Drawn as | Reads as |
|---|---|---|
| `service` | plain rounded yellow box, label inside | A service or application you own. |
| `external-system` | pale rounded box with a dashed border | A system outside your control. |
| `actor` | pale blue ellipse, label inside | A person or client. |
| `datastore` | blue cylinder, label inside | State the service owns. |
| `message-store` | grey cylinder, label inside | Copies kept for audit, replay or reconciliation. |
| `schema-registry` | purple cylinder with `{ }` on the lid | Where message schemas live. |
| `note` | sticky yellow rectangle, text inside | An annotation, usually attached under a node. |

## Edges

| Edge | Look | Means |
|---|---|---|
| `message` | solid black, arrowhead | A message on a channel. |
| `message` + `command` | solid black, filled triangle head, `«C»` | A command. |
| `message` + `event` | solid black, arrowhead, `«E»` | An event. |
| `message` + `document` | solid black, arrowhead, `«D»` | A document. |
| `message` + `reply` | dashed, arrowhead, `«R»` | A reply. |
| `rpc` | thin solid, arrowhead | A synchronous call — the exception. |
| `data` | thin dotted, arrowhead | A direct data access. |
| `tap` | thin dotted, circle start, arrowhead | A copy is taken without disturbing the flow. |
| `dlq` | thin dashed red, arrowhead | A failed message is routed to a dead letter channel. |
| `control` | thin dashed grey, bar head | A management command. |

The label on an edge is the message or operation, plus `reply-to`, `corr-id`, `ttl` and `seq#` annotations when the spec sets them.

## Anti-patterns

1. **Everything on one page.** A 40-node diagram is read as a wall. Split by flow or level; keep each diagram to one flow and about 20 nodes.
2. **Unlabelled arrows.** An arrow without a message name says two boxes are related but not how. Every edge carries a message or call name; the marker says command, event, document or reply.
3. **Channels without semantics.** A bare pipe hides whether work is shared or broadcast, and whether order is preserved. Tag `P2P`/`PUB-SUB`/`TYPE` and state the key and partitions.
4. **Missing DLQ.** A consumer that can fail with no dead letter channel means failures go nowhere visible. Draw the `dead-letter-channel` shadow (and an `invalid-message-channel` when validation can fail).
5. **Request-reply without correlation.** Two reply arrows look identical, so a reader cannot tell how replies are matched. Draw `reply_to` and `correlation` on the request, and the reply edge back.
6. **Business logic inside a broker.** Routing rules, enrichment and orchestration drawn as broker configuration make the broker a bottleneck. Keep the broker as a hub and move the logic into router, translator and process-manager nodes: smart endpoints, dumb pipes.
