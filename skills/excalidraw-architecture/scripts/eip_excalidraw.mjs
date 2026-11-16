#!/usr/bin/env node
/**
 * Excalidraw diagrams in Enterprise Integration Patterns notation, generated from a JSON spec.
 *
 *     node eip_excalidraw.mjs build SPEC [-o OUT.excalidraw] [--svg OUT.svg | --no-svg] [--png [OUT.png]] [--check] [--strict]
 *     node eip_excalidraw.mjs lib [-o library/eip.excalidrawlib] [--svg library/eip.svg]
 *     node eip_excalidraw.mjs kinds
 *
 * Exit codes: 0 ok, 1 layout warnings with --strict, 2 spec errors, 3 PNG export
 * failed (the .excalidraw scene was already written).
 *
 * Node >= 22, no dependencies. The spec format is documented in ../references/spec.md.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DESCRIPTION = "Excalidraw diagrams in Enterprise Integration Patterns notation, generated from a JSON spec.";
const SCRIPT = fileURLToPath(import.meta.url);
export const SKILL_DIR = path.dirname(path.dirname(SCRIPT));
export const SOURCE = "https://github.com/jamescarr/diagram-skill";

const INK = "#1e1e1e";
const MUTED = "#5c5f66";
const GREY = "#868e96";
const RED = "#c92a2a";
const WHITE = "#ffffff";
const FRAME_STROKE = "#bbb";
const LANE_LINE = "#ced4da";
const TRANSPARENT = "transparent";

export const FONTS = Object.freeze({ excalifont: 5, helvetica: 2, cascadia: 3 });

const MARGIN = 40;
const TITLE_H = 48;
const COL_GAP = 120;
const ROW_GAP = 40;
const SHADOW_GAP = 16;
const FRAME_PAD = 24;
const FRAME_PAD_TOP = 44;
const FRAME_NAME_H = 20;
const LEGEND_GAP = 60;
const FAN_STEP = 14;
const ORTHO_STEP = 8;
const BAND_PAD = 16;
export const ARROWHEAD = 25; // Excalidraw's "arrow" head length; it shrinks to half the final segment when that is shorter
export const STACK_STEP = 6; // offset of each card stacked behind a competing-consumers node
const LOOP_OFFSET = 40;
const LOOP_STEP = 24;
const LEGEND_COLS = 4;
const LEGEND_CELL = [220, 48];
const LIB_CELL = [260, 140];
const LIB_CREATED = 1700000000000;

// --------------------------------------------------------------------------- catalogue

/** One node kind: drawing family, Hohpe & Woolf name, icon recipe, pipe tag. */
const kind = (family, eipName, glyph = "", { tag = null, fill = null, dashed = false, captionY = null } = {}) =>
  Object.freeze({ family, eipName, glyph, tag, fill, dashed, captionY });

/** Stroke and arrowheads for one edge kind (or message type). */
const edgeStyle = (name, stroke, width, style, start, end, marker = null) =>
  Object.freeze({ name, stroke, width, style, start, end, marker });

const FAMILY_FILL = {
  component: "#d3f9d8",
  message: WHITE,
  pipe: "#dee2e6",
  app: "#fff3bf",
  cylinder: "#d0ebff",
  actor: "#e7f5ff",
  note: "#fff9db",
};
const PIPE_CAP_FILL = "#f1f3f5";

// Glyph mini-notation, coordinates relative to the node origin (see references/notation.md):
//   R|E|D x y w h fill      rectangle | ellipse | diamond ("-" = transparent)
//   L (x,y)(x,y)...         open line; start=/end= arrowheads turn it into an unbound arrow
//   P (x,y)... fill         closed polygon
//   A (x,y)(x,y)            black mini arrow;  G (x,y)(x,y) grey incoming arrow
//   T x y size "text"       text centred on (x, y)
// Any primitive takes stroke=#hex.
const DOTS = "E 37 29 6 6 #1e1e1e; E 61 15 6 6 #1e1e1e; E 61 29 6 6 #1e1e1e; E 61 43 6 6 #1e1e1e";
const STUBS = "L (64,18)(84,18); L (64,32)(84,32); L (64,46)(84,46)";
const ROUTER = `L (12,32)(40,32); L (40,32)(64,18); ${STUBS}; ${DOTS}`;
const RECIPIENTS = `L (12,32)(40,32); L (40,32)(64,18); L (40,32)(64,32); L (40,32)(64,46); ${STUBS}; ${DOTS}`;
const PROCESS =
  "E 43 6 10 10 #ffffff; L (48,16)(48,22); D 40 22 16 12 #ffffff; L (48,34)(48,40); " +
  "L (19,40)(77,40); L (19,40)(19,46); L (77,40)(77,46); " +
  "R 10 46 18 10 #ffffff; R 39 46 18 10 #ffffff; R 68 46 18 10 #ffffff";
const ENDPOINT = "G (6,32)(44,32); R 56 22 20 20 #ffffff";
const FAN_FROM_40 = "L (40,32)(66,16); L (40,32)(66,32); L (40,32)(66,48)";
const FAN_FROM_46 = "L (46,32)(66,16); L (46,32)(66,32); L (46,32)(66,48)";
const PERFORMERS = "D 66 11 10 10 #1e1e1e; D 66 27 10 10 #1e1e1e; D 66 43 10 10 #1e1e1e";
const CONTENT_FILTER = "R 12 20 24 24 #ffffff; A (40,32)(64,32); R 68 26 12 12 #ffffff";
const LOLLIPOP = "E 30 6 20 20 #adb5bd; L (40,26)(40,44)(48,44); R 48 36 16 16 #ffffff";
const MINI_CYLINDER_AT_10 = "E 10 36 20 8 #d0ebff; R 10 24 20 16 #d0ebff; E 10 20 20 8 #d0ebff";
const MINI_CYLINDER_AT_66 = "E 66 36 20 8 #d0ebff; R 66 24 20 16 #d0ebff; E 66 20 20 8 #d0ebff";
const BOTH = "start=arrow end=arrow";

export const CATALOGUE = Object.freeze({
  // participants
  service: kind("app", "Application", "", { fill: "#fff3bf" }),
  "external-system": kind("app", "External system", "", { fill: "#f8f9fa", dashed: true }),
  actor: kind("actor", "Actor"),
  datastore: kind("cylinder", "Data store", "", { fill: "#d0ebff" }),
  "message-store": kind("cylinder", "Message Store", "", { fill: "#dee2e6" }),
  "schema-registry": kind("cylinder", "Schema Registry", 'T 70 8 12 "{ }"', { fill: "#e5dbff" }),
  note: kind("note", "Note"),
  // channels
  channel: kind("pipe", "Message Channel"),
  "p2p-channel": kind("pipe", "Point-to-Point Channel", "", { tag: "P2P" }),
  "pubsub-channel": kind("pipe", "Publish-Subscribe Channel", "", { tag: "PUB-SUB" }),
  "datatype-channel": kind("pipe", "Datatype Channel", "", { tag: "TYPE" }),
  "dead-letter-channel": kind(
    "pipe",
    "Dead Letter Channel",
    "P (84,42)(96,42)(104,50)(104,62)(96,70)(84,70)(76,62)(76,50) #ff6b6b stroke=#c92a2a",
    { tag: "DLQ", captionY: 78 },
  ),
  "invalid-message-channel": kind("pipe", "Invalid Message Channel", 'P (90,42)(102,68)(78,68) #ffd43b; T 90 58 11 "!"', {
    tag: "INVALID",
    captionY: 76,
  }),
  "message-bus": kind(
    "pipe",
    "Message Bus",
    `L (30,-16)(30,-2) ${BOTH}; L (90,-16)(90,-2) ${BOTH}; L (150,-16)(150,-2) ${BOTH}; L (90,38)(90,52)`,
    { tag: "BUS", captionY: 58 },
  ),
  "control-bus": kind("pipe", "Control Bus", "", { tag: "CONTROL", dashed: true }),
  // routing
  "content-based-router": kind("component", "Content-Based Router", ROUTER),
  "message-filter": kind("component", "Message Filter", "P (24,14)(72,14)(53,34)(53,52)(43,52)(43,34) #adb5bd"),
  "dynamic-router": kind("component", "Dynamic Router", `${ROUTER}; R 70 48 18 10 #ffec99`),
  "recipient-list": kind("component", "Recipient List", RECIPIENTS),
  splitter: kind(
    "component",
    "Splitter",
    "R 18 25 14 14 #ffffff; A (36,32)(56,32); R 62 12 12 12 #ffffff; R 62 26 12 12 #ffffff; R 62 40 12 12 #ffffff",
  ),
  aggregator: kind(
    "component",
    "Aggregator",
    "R 22 12 12 12 #ffffff; R 22 26 12 12 #ffffff; R 22 40 12 12 #ffffff; A (40,32)(60,32); R 64 25 14 14 #ffffff",
  ),
  resequencer: kind(
    "component",
    "Resequencer",
    "R 12 14 10 10 #ffffff; R 26 30 10 10 #ffffff; R 14 44 10 10 #ffffff; A (40,32)(54,32); " +
      "R 58 27 10 10 #ffffff; R 70 27 10 10 #ffffff; R 82 27 10 10 #ffffff",
  ),
  "composed-message-processor": kind(
    "component",
    "Composed Message Processor",
    "R 8 26 12 12 #ffffff; A (22,32)(34,32); R 40 12 10 10 #ffffff; R 40 27 10 10 #ffffff; " +
      "R 40 42 10 10 #ffffff; A (54,32)(66,32); R 72 26 12 12 #ffffff",
  ),
  "scatter-gather": kind(
    "component",
    "Scatter-Gather",
    "E 9 29 6 6 #1e1e1e; L (12,32)(34,18); L (12,32)(34,32); L (12,32)(34,46); " +
      "D 30 13 10 10 #1e1e1e; D 30 27 10 10 #1e1e1e; D 30 41 10 10 #1e1e1e; " +
      "L (40,18)(80,32); L (40,32)(80,32); L (40,46)(80,32); E 80 29 6 6 #1e1e1e",
  ),
  "routing-slip": kind(
    "component",
    "Routing Slip",
    "L (22,32)(32,32); L (44,32)(54,32); L (66,32)(76,32); " +
      "R 10 26 12 12 #ffffff; R 32 26 12 12 #ffffff; R 54 26 12 12 #ffffff; R 76 26 12 12 #ffffff",
  ),
  "process-manager": kind("component", "Process Manager", PROCESS),
  saga: kind("component", "Saga (Process Manager)", PROCESS),
  "message-broker": kind(
    "component",
    "Message Broker",
    "L (48,26)(48,14); L (48,38)(48,50); L (38,30)(22,22); L (58,30)(74,22); L (38,34)(22,44); " +
      "L (58,34)(74,44); R 38 26 20 12 #d3f9d8; R 41 6 14 8 #ffec99; R 8 16 14 8 #ffec99; " +
      "R 74 16 14 8 #ffec99; R 8 42 14 8 #ffec99; R 74 42 14 8 #ffec99; R 41 50 14 8 #ffec99",
  ),
  // transformation
  "message-translator": kind(
    "component",
    "Message Translator",
    "R 18 22 20 20 #ffffff; R 58 22 20 20 #ffffff; L (36,24)(60,40); L (36,40)(60,24)",
  ),
  "envelope-wrapper": kind("component", "Envelope Wrapper", "R 30 19 36 26 #ffec99; L (30,19)(48,34); L (66,19)(48,34)"),
  "content-enricher": kind("component", "Content Enricher", "R 16 26 12 12 #ffffff; A (32,32)(56,32); R 60 20 24 24 #ffffff"),
  "content-filter": kind("component", "Content Filter", CONTENT_FILTER),
  "claim-check": kind("component", "Claim Check", `${CONTENT_FILTER}; E 66 46 8 8 -; L (74,50)(88,50); L (84,50)(84,55)`),
  normalizer: kind(
    "component",
    "Normalizer",
    "E 12 10 10 10 #ffffff; D 24 22 10 10 #ffffff; P (12,46)(22,46)(17,36) #ffffff; " +
      "A (40,32)(58,32); R 66 25 14 14 #ffffff",
  ),
  // endpoints
  "message-endpoint": kind("component", "Message Endpoint", ENDPOINT),
  "messaging-gateway": kind(
    "component",
    "Messaging Gateway",
    "G (6,32)(40,32); P (46,22)(60,16)(60,48)(46,42) #c5f6fa; R 66 16 14 32 #c5f6fa",
  ),
  "messaging-mapper": kind(
    "component",
    "Messaging Mapper",
    "L (30,17)(66,32); L (30,32)(66,47); L (30,47)(66,17); " +
      "R 20 12 10 10 #ffffff; R 20 27 10 10 #ffffff; R 20 42 10 10 #ffffff; " +
      "R 66 12 10 10 #ffffff; R 66 27 10 10 #ffffff; R 66 42 10 10 #ffffff",
  ),
  "transactional-client": kind("component", "Transactional Client", 'G (6,32)(40,32); R 50 20 30 24 #ffffff; T 65 32 12 "TX"'),
  "polling-consumer": kind("component", "Polling Consumer", "G (6,32)(40,32); E 44 20 24 24 -; D 68 28 8 8 #1e1e1e"),
  "event-driven-consumer": kind("component", "Event-Driven Consumer", "G (6,32)(40,32); L (40,32)(70,32); D 70 27 10 10 #1e1e1e"),
  "competing-consumers": kind("component", "Competing Consumers", `G (6,32)(40,32); ${FAN_FROM_40}; ${PERFORMERS}`),
  "message-dispatcher": kind(
    "component",
    "Message Dispatcher",
    `G (6,32)(32,32); ${FAN_FROM_46}; R 34 26 12 12 #ffffff; ${PERFORMERS}`,
  ),
  "selective-consumer": kind(
    "component",
    "Selective Consumer",
    "G (6,32)(30,32); P (34,22)(54,22)(47,32)(47,42)(41,42)(41,32) #adb5bd; R 64 24 16 16 #ffffff",
  ),
  "durable-subscriber": kind("component", "Durable Subscriber", `${ENDPOINT}; E 6 4 12 12 -; R 4 10 16 12 #adb5bd`),
  "idempotent-receiver": kind("component", "Idempotent Receiver", `${ENDPOINT}; E 4 4 16 16 #ffffff; T 12 12 11 "1"`),
  "service-activator": kind(
    "component",
    "Service Activator",
    "G (6,32)(34,32); L (44,32)(70,32); D 34 27 10 10 #1e1e1e; D 70 27 10 10 #ffffff",
  ),
  "channel-adapter": kind(
    "component",
    "Channel Adapter",
    `R 6 10 20 44 #ffec99; P (32,10)(52,16)(52,48)(32,54) #c5f6fa; L (56,32)(72,32) ${BOTH}; R 76 24 14 16 #adb5bd`,
  ),
  "messaging-bridge": kind(
    "component",
    "Messaging Bridge",
    "L (8,50)(20,30)(36,16)(60,16)(76,30)(88,50); L (8,50)(88,50); L (24,50)(24,26); " +
      "L (40,50)(40,16); L (56,50)(56,16); L (72,50)(72,26)",
  ),
  // system management
  "wire-tap": kind("component", "Wire Tap", "L (12,28)(84,28); A (48,30)(48,50); E 45 25 6 6 #1e1e1e"),
  detour: kind(
    "component",
    "Detour",
    "L (12,32)(40,32); L (40,32)(84,32); L (40,32)(62,14); L (62,14)(84,14); E 37 29 6 6 #1e1e1e; R 58 44 20 10 #ffec99",
  ),
  "message-history": kind("message", "Message History", `${LOLLIPOP}; L (68,16)(88,16); L (68,26)(88,26); L (68,36)(88,36)`),
  "smart-proxy": kind(
    "component",
    "Smart Proxy",
    "G (6,24)(36,24); R 38 14 20 36 #ffffff; A (58,24)(88,24); A (88,42)(58,42); " +
      "L (36,42)(6,42) end=triangle; E 42 52 12 6 #adb5bd",
  ),
  "test-message": kind("message", "Test Message", `${LOLLIPOP}; T 56 44 11 "T"`),
  "channel-purger": kind(
    "component",
    "Channel Purger",
    "R 14 26 56 14 #dee2e6; E 66 26 8 14 #f1f3f5; L (78,20)(90,44) stroke=#c92a2a; L (90,20)(78,44) stroke=#c92a2a",
  ),
  // messages
  message: kind("message", "Message", LOLLIPOP),
  "command-message": kind("message", "Command Message", `${LOLLIPOP}; T 56 44 11 "C"`),
  "document-message": kind("message", "Document Message", `${LOLLIPOP}; T 56 44 11 "D"`),
  "event-message": kind("message", "Event Message", `${LOLLIPOP}; T 56 44 11 "E"`),
  // transactional messaging
  outbox: kind(
    "component",
    "Transactional Outbox",
    `${MINI_CYLINDER_AT_10}; A (34,32)(56,32); R 60 26 26 12 #dee2e6; E 82 26 8 12 #f1f3f5`,
  ),
  inbox: kind("component", "Transactional Inbox", `R 10 26 26 12 #dee2e6; E 32 26 8 12 #f1f3f5; A (40,32)(62,32); ${MINI_CYLINDER_AT_66}`),
});

export const ALIASES = Object.freeze({
  "message-router": "content-based-router",
  queue: "p2p-channel",
  topic: "pubsub-channel",
  dlq: "dead-letter-channel",
  db: "datastore",
  external: "external-system",
});

export const BADGES = Object.freeze({
  gateway: "Messaging Gateway",
  mapper: "Messaging Mapper",
  activator: "Service Activator",
  tx: "Transactional Client",
  outbox: "Transactional Outbox",
  inbox: "Transactional Inbox",
  polling: "Polling Consumer",
  "event-driven": "Event-Driven Consumer",
  competing: "Competing Consumers",
  dispatcher: "Message Dispatcher",
  selective: "Selective Consumer",
  durable: "Durable Subscriber",
  idempotent: "Idempotent Receiver",
  adapter: "Channel Adapter",
  bulkhead: "Bulkhead",
  retry: "Retry",
  "circuit-breaker": "Circuit Breaker",
});

export const EDGE_KINDS = Object.freeze({
  message: edgeStyle("Message", INK, 2, "solid", null, "arrow"),
  "message:command": edgeStyle("Command Message", INK, 2, "solid", null, "triangle", "«C»"),
  "message:event": edgeStyle("Event Message", INK, 2, "solid", null, "arrow", "«E»"),
  "message:document": edgeStyle("Document Message", INK, 2, "solid", null, "arrow", "«D»"),
  "message:reply": edgeStyle("Reply (Request-Reply)", INK, 2, "dashed", null, "arrow", "«R»"),
  rpc: edgeStyle("Synchronous call (RPC)", INK, 1, "solid", null, "arrow"),
  data: edgeStyle("Data access", INK, 1, "dotted", null, "arrow"),
  tap: edgeStyle("Wire Tap copy", INK, 1, "dotted", "circle", "arrow"),
  dlq: edgeStyle("Dead letter route", RED, 1, "dashed", null, "arrow"),
  control: edgeStyle("Control Bus command", GREY, 1, "dashed", null, "bar"),
});
const EDGE_KIND_NAMES = Object.keys(EDGE_KINDS).filter((k) => !k.includes(":"));
const MESSAGE_TYPES = Object.keys(EDGE_KINDS)
  .filter((k) => k.includes(":"))
  .map((k) => k.split(":")[1]);
const ROUTES = ["straight", "ortho", "below", "above"];
const LINE_STYLES = ["solid", "dashed", "dotted"];
const GROUP_KINDS = ["context", "broker", "deployment"];

const TOP_KEYS = ["title", "style", "legend", "lanes", "nodes", "edges", "groups"];
const STYLE_KEYS = ["font", "sketchy"];
const NODE_KEYS = ["id", "kind", "label", "sub", "badges", "tags", "group", "lane", "col", "row", "shadow", "attach", "link"];
const EDGE_KEYS = [
  "from", "to", "kind", "type", "message", "label", "seq", "route",
  "correlation", "reply_to", "ttl", "sequence", "style", "color",
]; // prettier-ignore
const GROUP_KEYS = ["id", "label", "kind"];

const ID_RE = /^[A-Za-z0-9_.:-]+$/;
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const COMPETING_RE = /^competing:([1-9][0-9]*)$/;
const POINT_RE = /\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)/g;

/** The spec is invalid; `errors` holds one message per problem. */
export class SpecError extends Error {
  constructor(errors) {
    super(errors.join("\n"));
    this.name = "SpecError";
    this.errors = [...errors];
  }
}

/** The PNG export failed; the scene was already written. */
export class ExportError extends Error {
  constructor(message) {
    super(message);
    this.name = "ExportError";
  }
}

// --------------------------------------------------------------------------- small helpers

const has = (obj, key) => Object.hasOwn(obj, key);
const get = (obj, key, fallback = null) => (has(obj, key) ? obj[key] : fallback);
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isInt = (v) => Number.isInteger(v);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const last = (xs) => xs[xs.length - 1];

/** Length in code points, so a label's width does not depend on UTF-16 surrogate pairs. */
const cpLen = (s) => {
  let n = 0;
  for (const _ of s) n++;
  return n;
};

/** Lexicographic comparison of equal-length arrays of numbers or strings. */
function cmpTuple(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

/** A Map whose missing keys read as `fallback()`, stored on first read. */
class DefaultMap extends Map {
  constructor(fallback) {
    super();
    this.fallback = fallback;
  }
  get(key) {
    if (!super.has(key)) super.set(key, this.fallback());
    return super.get(key);
  }
}

/** A value as error messages have always spelled it: None for null, True/False, containers in brackets. */
function show(v) {
  if (v === null || v === undefined) return "None";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "string") return v;
  return repr(v);
}

function repr(v) {
  if (v === null || v === undefined) return "None";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    const q = v.includes("'") && !v.includes('"') ? '"' : "'";
    let out = q;
    for (const ch of v) {
      if (ch === q || ch === "\\") out += `\\${ch}`;
      else if (ch === "\n") out += "\\n";
      else if (ch === "\r") out += "\\r";
      else if (ch === "\t") out += "\\t";
      else if (ch < " " || ch === "\x7f") out += `\\x${ch.charCodeAt(0).toString(16).padStart(2, "0")}`;
      else out += ch;
    }
    return out + q;
  }
  if (Array.isArray(v)) return `[${v.map(repr).join(", ")}]`;
  return `{${Object.entries(v)
    .map(([k, x]) => `${repr(k)}: ${repr(x)}`)
    .join(", ")}}`;
}

/** [mantissa, exponent] with x === mantissa * 2 ** exponent exactly, for a finite x >= 0. */
function decompose(x) {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const hi = view.getUint32(0);
  const lo = view.getUint32(4);
  const e = (hi >>> 20) & 0x7ff;
  const m = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  return e === 0 ? [m, -1074] : [m | (1n << 52n), e - 1075];
}

/** `v` to `digits` decimals from its exact binary value, ties to even (toFixed rounds ties up). */
function fixed(v, digits) {
  const neg = v < 0 || Object.is(v, -0);
  const [m, e] = decompose(Math.abs(v));
  let num = m * 10n ** BigInt(digits);
  let den = 1n;
  if (e >= 0) num <<= BigInt(e);
  else den <<= BigInt(-e);
  let q = num / den;
  const r2 = (num % den) * 2n;
  if (r2 > den || (r2 === den && q % 2n === 1n)) q += 1n;
  const s = q.toString().padStart(digits + 1, "0");
  return (neg ? "-" : "") + (digits ? `${s.slice(0, -digits)}.${s.slice(-digits)}` : s);
}

/** CRC-32 (zlib's polynomial) of a string's UTF-8 bytes: element seeds stay stable across builds. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(s) {
  let c = 0xffffffff;
  for (const b of Buffer.from(s, "utf8")) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Words of `text` packed into lines of at most `width` code points; a longer word gets a line of its own. */
function wrapParagraph(text, width) {
  let expanded = "";
  let col = 0;
  for (const ch of text) {
    if (ch === "\t") {
      const n = 8 - (col % 8);
      expanded += " ".repeat(n);
      col += n;
    } else {
      expanded += ch;
      col = ch === "\r" ? 0 : col + 1;
    }
  }
  const chunks = expanded
    .replace(/[\t\n\x0b\x0c\r]/g, " ")
    .split(/( +)/)
    .filter((c) => c)
    .reverse();
  const blank = (c) => c.trim() === "";
  const lines = [];
  while (chunks.length) {
    const cur = [];
    let len = 0;
    if (blank(last(chunks)) && lines.length) chunks.pop();
    while (chunks.length && len + cpLen(last(chunks)) <= width) {
      len += cpLen(last(chunks));
      cur.push(chunks.pop());
    }
    if (chunks.length && cpLen(last(chunks)) > width && !cur.length) cur.push(chunks.pop());
    if (cur.length && blank(last(cur))) cur.pop();
    if (cur.length) lines.push(cur.join(""));
  }
  return lines;
}

// --------------------------------------------------------------------------- spec validation

export function loadSpec(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (err) {
    throw new SpecError([`${file}: ${STRERROR[err.code] ?? err.message}`]);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new SpecError([`${file}: invalid JSON: ${err.message}`]);
  }
}

const STRERROR = {
  ENOENT: "No such file or directory",
  EACCES: "Permission denied",
  EISDIR: "Is a directory",
  ENOTDIR: "Not a directory",
};

export function validate(spec) {
  return normalize(spec)[1];
}

const family = (k) => (k && has(CATALOGUE, k) ? CATALOGUE[k].family : null);

/** Resolve aliases, apply defaults and collect every validation error. */
function normalize(spec) {
  const errors = [];
  if (!isObject(spec)) return [null, ["spec must be a JSON object"]];
  for (const k of Object.keys(spec)) if (!TOP_KEYS.includes(k)) errors.push(`unknown key '${k}' in spec`);

  const title = get(spec, "title");
  if (title !== null && typeof title !== "string") errors.push("title must be a string");
  const style = get(spec, "style", {});
  let font = "excalifont";
  let sketchy = true;
  if (!isObject(style)) {
    errors.push("style must be an object");
  } else {
    for (const k of Object.keys(style)) if (!STYLE_KEYS.includes(k)) errors.push(`unknown key '${k}' in style`);
    font = get(style, "font", "excalifont");
    if (typeof font !== "string" || !has(FONTS, font)) errors.push(`unknown font '${show(font)}'`);
    sketchy = get(style, "sketchy", true);
    if (typeof sketchy !== "boolean") errors.push("style.sketchy must be true or false");
  }
  const legend = get(spec, "legend", true);
  if (typeof legend !== "boolean") errors.push("legend must be true or false");
  let lanes = get(spec, "lanes", []);
  if (!Array.isArray(lanes) || !lanes.every((x) => typeof x === "string" && x)) {
    errors.push("lanes must be a list of names");
    lanes = [];
  } else if (new Set(lanes).size !== lanes.length) {
    errors.push("lanes must be unique");
  }

  const groups = [];
  const groupIds = new Set();
  let rawGroups = get(spec, "groups", []);
  if (!Array.isArray(rawGroups)) {
    errors.push("groups must be a list");
    rawGroups = [];
  }
  rawGroups.forEach((g, i) => {
    if (!isObject(g)) {
      errors.push(`groups[${i}] must be an object`);
      return;
    }
    for (const k of Object.keys(g)) if (!GROUP_KEYS.includes(k)) errors.push(`unknown key '${k}' in groups[${i}]`);
    const gid = get(g, "id");
    if (typeof gid !== "string" || !ID_RE.test(gid)) {
      errors.push(`groups[${i}]: missing or invalid id`);
      return;
    }
    if (groupIds.has(gid)) errors.push(`duplicate group id '${gid}'`);
    groupIds.add(gid);
    const gkind = get(g, "kind", "context");
    if (!GROUP_KINDS.includes(gkind)) errors.push(`group '${gid}': unknown kind '${show(gkind)}'`);
    const label = get(g, "label", gid);
    if (typeof label !== "string") errors.push(`group '${gid}': label must be a string`);
    groups.push({ id: gid, label, kind: gkind });
  });

  let rawNodes = get(spec, "nodes", []);
  if (!Array.isArray(rawNodes)) {
    errors.push("nodes must be a list");
    rawNodes = [];
  }
  const nodes = [];
  const kinds = new Map();
  rawNodes.forEach((raw, i) => {
    if (!isObject(raw)) {
      errors.push(`nodes[${i}] must be an object`);
      return;
    }
    for (const k of Object.keys(raw)) if (!NODE_KEYS.includes(k)) errors.push(`unknown key '${k}' in nodes[${i}]`);
    const nid = get(raw, "id");
    if (typeof nid !== "string" || !ID_RE.test(nid)) {
      errors.push(`nodes[${i}]: missing or invalid id`);
      return;
    }
    if (kinds.has(nid)) {
      errors.push(`duplicate node id '${nid}'`);
      return;
    }
    const rawKind = get(raw, "kind");
    let k = typeof rawKind === "string" ? (has(ALIASES, rawKind) ? ALIASES[rawKind] : rawKind) : null;
    if (k === null || !has(CATALOGUE, k)) {
      errors.push(`unknown kind '${show(rawKind)}' for node '${nid}'`);
      k = null;
    }
    kinds.set(nid, k);
    nodes.push({ raw, id: nid, kind: k });
  });

  const pins = new Map();
  const outNodes = [];
  for (const { raw, id: nid, kind: k } of nodes) {
    const fam = family(k);
    let label = get(raw, "label");
    if (label === null && (fam === "message" || fam === "note")) label = CATALOGUE[k].eipName;
    if (label === null && k !== null) errors.push(`node '${nid}': missing label`);
    else if (label !== null && typeof label !== "string") errors.push(`node '${nid}': label must be a string`);
    for (const key of ["sub", "link"]) {
      if (has(raw, key) && typeof raw[key] !== "string") errors.push(`node '${nid}': ${key} must be a string`);
    }
    let badges = get(raw, "badges", []);
    if (has(raw, "badges")) {
      if (!Array.isArray(badges) || !badges.every((b) => typeof b === "string")) {
        errors.push(`node '${nid}': badges must be a list of strings`);
        badges = [];
      } else if (fam !== null && fam !== "app") {
        errors.push(`badges not allowed on kind '${k}'`);
      } else {
        for (const b of badges) {
          if (!has(BADGES, b) && !COMPETING_RE.test(b)) errors.push(`unknown badge '${b}' on node '${nid}'`);
        }
      }
    }
    let tags = get(raw, "tags", []);
    if (has(raw, "tags")) {
      if (!Array.isArray(tags) || !tags.every((t) => typeof t === "string")) {
        errors.push(`node '${nid}': tags must be a list of strings`);
        tags = [];
      } else if (fam !== null && fam !== "pipe") {
        errors.push(`tags not allowed on kind '${k}'`);
      }
    }
    const group = get(raw, "group");
    if (group !== null && !(typeof group === "string" && groupIds.has(group))) {
      errors.push(`node '${nid}': unknown group '${show(group)}'`);
    }
    const lane = get(raw, "lane");
    if (lane !== null && !lanes.includes(lane)) errors.push(`node '${nid}': unknown lane '${show(lane)}'`);
    for (const key of ["col", "row"]) {
      if (has(raw, key) && (!isInt(raw[key]) || raw[key] < 0)) {
        errors.push(`node '${nid}': ${key} must be a non-negative integer`);
      }
    }
    if (has(raw, "row") && lanes.length) errors.push(`node '${nid}': row cannot be used with lanes; use lane`);
    const shadow = get(raw, "shadow");
    const attach = get(raw, "attach");
    if (shadow !== null) {
      if (!kinds.has(shadow)) errors.push(`node '${nid}': unknown shadow target '${show(shadow)}'`);
      else if (family(kinds.get(shadow)) !== "pipe" && kinds.get(shadow) !== null) {
        errors.push(`node '${nid}': shadow target '${shadow}' is not a channel`);
      }
    }
    if (attach !== null) {
      if (k !== null && k !== "note") errors.push(`node '${nid}': attach is only valid for kind 'note'`);
      if (!kinds.has(attach)) errors.push(`node '${nid}': unknown attach target '${show(attach)}'`);
    }
    if (shadow !== null && attach !== null) errors.push(`node '${nid}': use either shadow or attach, not both`);
    const parent = shadow !== null ? shadow : attach;
    if (parent !== null && (has(raw, "col") || has(raw, "row"))) {
      errors.push(`node '${nid}': col/row cannot be combined with shadow/attach`);
    }
    if (parent !== null && kinds.has(parent)) {
      const praw = nodes.find((m) => m.id === parent).raw;
      if (get(praw, "shadow") !== null || get(praw, "attach") !== null) {
        errors.push(`node '${nid}': '${parent}' is itself attached to another node`);
      }
    }
    if (isInt(get(raw, "col")) && isInt(get(raw, "row")) && !lanes.length) {
      const cell = `${raw.col},${raw.row}`;
      if (pins.has(cell)) errors.push(`nodes '${pins.get(cell)}' and '${nid}' both pinned to col ${raw.col} row ${raw.row}`);
      else pins.set(cell, nid);
    }
    const sub = get(raw, "sub");
    const link = get(raw, "link");
    outNodes.push({
      id: nid,
      kind: k,
      label: typeof label === "string" ? label : "",
      sub: typeof sub === "string" ? sub : null,
      badges: Array.isArray(badges) ? [...badges] : [],
      tags: Array.isArray(tags) ? [...tags] : [],
      group,
      lane: lane !== null ? lane : lanes.length ? lanes[0] : null,
      col: get(raw, "col"),
      row: get(raw, "row"),
      parent,
      shadow: shadow !== null,
      link: typeof link === "string" ? link : null,
    });
  }

  let rawEdges = get(spec, "edges", []);
  if (!Array.isArray(rawEdges)) {
    errors.push("edges must be a list");
    rawEdges = [];
  }
  const outEdges = [];
  rawEdges.forEach((raw, i) => {
    if (!isObject(raw)) {
      errors.push(`edges[${i}] must be an object`);
      return;
    }
    for (const k of Object.keys(raw)) if (!EDGE_KEYS.includes(k)) errors.push(`unknown key '${k}' in edges[${i}]`);
    for (const end of ["from", "to"]) {
      if (!has(raw, end)) errors.push(`edge ${i}: missing '${end}'`);
      else if (!kinds.has(raw[end])) errors.push(`edge ${i}: unknown node '${show(raw[end])}'`);
    }
    if (get(raw, "from") !== null && get(raw, "from") === get(raw, "to")) {
      errors.push(`edge ${i}: from and to are the same node '${show(raw.from)}'`);
    }
    const ekind = get(raw, "kind", "message");
    if (!EDGE_KIND_NAMES.includes(ekind)) errors.push(`edge ${i}: unknown edge kind '${show(ekind)}'`);
    const etype = get(raw, "type");
    if (etype !== null) {
      if (ekind !== "message") errors.push(`edge ${i}: type '${show(etype)}' only valid for kind 'message'`);
      else if (!MESSAGE_TYPES.includes(etype)) errors.push(`edge ${i}: unknown message type '${show(etype)}'`);
    }
    if (has(raw, "route") && !ROUTES.includes(raw.route)) errors.push(`edge ${i}: unknown route '${show(raw.route)}'`);
    if (has(raw, "style") && !LINE_STYLES.includes(raw.style)) errors.push(`edge ${i}: unknown style '${show(raw.style)}'`);
    if (has(raw, "color") && !(typeof raw.color === "string" && HEX_RE.test(raw.color))) {
      errors.push(`edge ${i}: invalid color '${show(raw.color)}'`);
    }
    if (has(raw, "seq") && !isInt(raw.seq)) errors.push(`edge ${i}: seq must be an integer`);
    for (const key of ["correlation", "sequence"]) {
      if (has(raw, key) && typeof raw[key] !== "boolean") errors.push(`edge ${i}: ${key} must be true or false`);
    }
    for (const key of ["message", "label", "ttl"]) {
      if (has(raw, key) && typeof raw[key] !== "string") errors.push(`edge ${i}: ${key} must be a string`);
    }
    const replyTo = get(raw, "reply_to");
    if (replyTo !== null && family(kinds.get(replyTo) ?? null) !== "pipe") {
      errors.push(`reply_to '${show(replyTo)}' is not a channel (edge ${i})`);
    }
    const key = etype === null ? ekind : `${ekind}:${etype}`;
    outEdges.push({ ...raw, index: i, key });
  });

  if (errors.length) return [null, errors];
  return [
    {
      title,
      font: FONTS[font],
      rough: sketchy ? 1 : 0,
      legend,
      lanes,
      groups,
      nodes: outNodes,
      edges: outEdges,
    },
    [],
  ];
}

// --------------------------------------------------------------------------- element emitters

const seedOf = (eid) => crc32(eid) & 0x7fffffff || 1;

function el(eid, type, x, y, w, h, opts = {}) {
  const {
    stroke = INK,
    bg = TRANSPARENT,
    sw = 1,
    ss = "solid",
    rough = 0,
    roundness = null,
    groups = [],
    link = null,
    extra = {},
  } = opts;
  const seed = seedOf(eid);
  return {
    id: eid,
    type,
    x,
    y,
    width: w,
    height: h,
    angle: 0,
    strokeColor: stroke,
    backgroundColor: bg,
    fillStyle: "solid",
    strokeWidth: sw,
    strokeStyle: ss,
    roughness: rough,
    opacity: 100,
    groupIds: [...groups],
    frameId: null,
    index: null,
    roundness,
    seed,
    version: 1,
    versionNonce: seed,
    isDeleted: false,
    boundElements: [],
    updated: 1,
    link,
    locked: false,
    ...extra,
  };
}

export function textSize(lines, size, font) {
  const factor = font === 3 ? 0.62 : 0.6;
  const width = Math.max(0, ...lines.map(cpLen)) * size * factor;
  return [Math.ceil(width), Math.ceil(lines.length * size * 1.25)];
}

function wrap(text, width) {
  const lines = [];
  for (const para of text.split("\n")) {
    const w = wrapParagraph(para, width);
    lines.push(...(w.length ? w : [""]));
  }
  return lines;
}

function text(eid, lines, x, y, size, font, opts = {}) {
  const { align = "center", valign = "top", container = null, color = INK, groups = [] } = opts;
  const [w, h] = textSize(lines, size, font);
  const s = lines.join("\n");
  return el(eid, "text", x, y, w, h, {
    stroke: color,
    groups,
    extra: {
      text: s,
      fontSize: size,
      fontFamily: font,
      textAlign: align,
      verticalAlign: valign,
      containerId: container,
      originalText: s,
      autoResize: true,
      lineHeight: 1.25,
    },
  });
}

function centredText(eid, lines, cx, y, size, font, opts = {}) {
  const [w] = textSize(lines, size, font);
  return text(eid, lines, cx - w / 2, y, size, font, opts);
}

/** Text inside a container: emitted right after it, linked both ways. */
function boundText(box, eid, lines, size, font, groups, { align = "center", valign = "middle" } = {}) {
  const [w, h] = textSize(lines, size, font);
  const x = align === "center" ? box.x + box.width / 2 - w / 2 : box.x + 5;
  const y = valign === "middle" ? box.y + box.height / 2 - h / 2 : box.y + 5;
  box.boundElements.push({ type: "text", id: eid });
  return text(eid, lines, x, y, size, font, { align, valign, container: box.id, groups });
}

function linear(eid, type, pts, opts = {}) {
  const {
    stroke = INK,
    bg = TRANSPARENT,
    sw = 1,
    ss = "solid",
    rough = 0,
    start = null,
    end = null,
    groups = [],
    polygon = false,
    startBinding = null,
    endBinding = null,
  } = opts;
  const [x0, y0] = pts[0];
  const rel = pts.map(([px, py]) => [px - x0, py - y0]);
  const xs = rel.map((p) => p[0]);
  const ys = rel.map((p) => p[1]);
  const extra = { points: rel, startBinding, endBinding, startArrowhead: start, endArrowhead: end };
  if (type === "arrow") extra.elbowed = false;
  else extra.polygon = polygon;
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  return el(eid, type, x0, y0, w, h, { stroke, bg, sw, ss, rough, groups, extra });
}

const SHAPES = { R: "rectangle", E: "ellipse", D: "diamond" };

/** Shell-style tokens: whitespace-separated, double or single quotes keep spaces. */
function tokens(src) {
  const out = [];
  let cur = null;
  let quote = null;
  for (const ch of src) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur ??= "";
    } else if (/\s/.test(ch)) {
      if (cur !== null) out.push(cur);
      cur = null;
    } else {
      cur = (cur ?? "") + ch;
    }
  }
  if (cur !== null) out.push(cur);
  return out;
}

function parseGlyph(src) {
  const prims = [];
  for (const part of src.split(";")) {
    if (!part.trim()) continue;
    const [op, ...args] = tokens(part);
    const pos = [];
    const opts = {};
    for (const tok of args) {
      const eq = tok.indexOf("=");
      if (eq >= 0 && ["stroke", "start", "end"].includes(tok.slice(0, eq))) opts[tok.slice(0, eq)] = tok.slice(eq + 1);
      else pos.push(tok);
    }
    prims.push([op, pos, opts]);
  }
  return prims;
}

/** Icon primitives: stroke 1, roughness 0, sharp corners. */
function glyph(src, base, k, dx, dy, font, groups) {
  const out = [];
  for (const [op, pos, opts] of parseGlyph(src)) {
    const eid = `${base}:i${k}`;
    k += 1;
    const stroke = opts.stroke ?? INK;
    if (has(SHAPES, op)) {
      const [x, y, w, h] = pos.slice(0, 4).map(Number);
      const fill = pos.length > 4 ? pos[4] : "-";
      const bg = fill === "-" ? TRANSPARENT : fill;
      out.push(el(eid, SHAPES[op], x + dx, y + dy, w, h, { stroke, bg, groups }));
    } else if (op === "T") {
      const [cx, cy, size, s] = [Number(pos[0]) + dx, Number(pos[1]) + dy, Math.trunc(Number(pos[2])), pos[3]];
      const [w, h] = textSize([s], size, font);
      out.push(text(eid, [s], cx - w / 2, cy - h / 2, size, font, { valign: "middle", groups }));
    } else {
      const pts = [...pos[0].matchAll(POINT_RE)].map((m) => [Number(m[1]) + dx, Number(m[2]) + dy]);
      if (op === "P") {
        if (pts[0][0] !== last(pts)[0] || pts[0][1] !== last(pts)[1]) pts.push(pts[0]);
        const bg = pos[1] === "-" ? TRANSPARENT : pos[1];
        out.push(linear(eid, "line", pts, { stroke, bg, polygon: true, groups }));
      } else if (op === "A") {
        out.push(linear(eid, "arrow", pts, { stroke, end: "arrow", groups }));
      } else if (op === "G") {
        out.push(linear(eid, "arrow", pts, { stroke: GREY, sw: 2, end: "triangle", groups }));
      } else {
        const start = opts.start ?? null;
        const end = opts.end ?? null;
        out.push(linear(eid, start || end ? "arrow" : "line", pts, { stroke, start, end, groups }));
      }
    }
  }
  return [out, k];
}

function badgeText(badge) {
  const m = COMPETING_RE.exec(badge);
  return m ? `competing ×${m[1]}` : badge;
}

/** Cards drawn behind a competing-consumers node: one per extra instance, at most two. */
function stackCards(badges) {
  for (const b of badges) {
    if (b === "competing") return 2;
    const m = COMPETING_RE.exec(b);
    if (m) return Math.min(Number(m[1]), 3) - 1;
  }
  return 0;
}

function pill(eid, label, x, font, groups) {
  const [w, h] = textSize([label], 11, font);
  const pw = w + 12;
  const box = el(eid, "rectangle", x, -9, pw, 18, { bg: WHITE, roundness: { type: 3 }, groups });
  const t = text(`${eid}:t`, [label], x + pw / 2 - w / 2, -h / 2, 11, font, { valign: "middle", groups });
  return [[box, t], pw];
}

/**
 * Emit one node at its local origin: under-parts, bindable box, bound label, over-parts, glyph, tag,
 * badges, caption, sub. Returns { els, box, shape, radius, rightExtra, bottomExtra, caption, margin }.
 */
function drawNode(base, gid, kindName, label, sub, badges, tags, font, rough, { bare = false, link = null } = {}) {
  const k = CATALOGUE[kindName];
  const fam = k.family;
  const fill = k.fill || FAMILY_FILL[fam];
  const ss = k.dashed ? "dashed" : "solid";
  const groups = [gid];
  const els = [];
  let i = 0;
  let shape = "rect";
  let radius = 0;
  let rightExtra = 0;
  let bottomExtra = 0;
  let captionLines = [];
  let box;
  let cx;
  let capY;

  if (fam === "component" || fam === "message") {
    box = el(base, "rectangle", 0, 0, 96, 64, { bg: fill, sw: 2, ss, rough, groups, link });
    els.push(box);
    let icons;
    [icons, i] = glyph(k.glyph, base, i, 0, 0, font, groups);
    els.push(...icons);
    cx = 48;
    capY = k.captionY || 72;
    captionLines = wrap(label, 20);
  } else if (fam === "pipe") {
    const tagText = [...(k.tag ? [k.tag] : []), ...tags].join(" · ");
    const [tw, th] = textSize([tagText], 11, font);
    const w = tagText ? Math.max(168, 10 + tw + 22) : 168;
    box = el(base, "rectangle", 0, 0, w, 36, { bg: fill, sw: 2, ss, rough, groups, link });
    els.push(box);
    els.push(el(`${base}:i${i}`, "ellipse", w - 12, 0, 24, 36, { bg: PIPE_CAP_FILL, sw: 2, rough, groups }));
    i += 1;
    const total = w + 12;
    let icons;
    [icons, i] = glyph(k.glyph, base, i, (total - 180) / 2, 0, font, groups);
    els.push(...icons);
    if (tagText) {
      els.push(text(`${base}:tag`, [tagText], 10, 18 - th / 2, 11, font, { align: "left", valign: "middle", groups }));
    }
    cx = total / 2;
    capY = k.captionY || 44;
    rightExtra = 12;
    captionLines = wrap(label, 20);
  } else if (fam === "app") {
    const lines = bare ? [] : wrap(label, 22);
    const [tw, th] = textSize(lines, 16, font);
    const pills = bare ? [] : badges.map(badgeText);
    const pillWs = pills.map((p) => textSize([p], 11, font)[0] + 12);
    const w = Math.max(180, tw + 32, 24 + sum(pillWs.map((pw) => pw + 6)));
    const h = Math.max(72, th + 20);
    const cards = bare ? 0 : stackCards(badges);
    for (let c = cards; c > 0; c--) {
      // farthest first, so the front box draws on top
      const off = c * STACK_STEP;
      els.push(el(`${base}:s${c}`, "rectangle", off, off, w, h, { bg: fill, sw: 2, ss, rough, roundness: { type: 3 }, groups }));
    }
    box = el(base, "rectangle", 0, 0, w, h, { bg: fill, sw: 2, ss, rough, roundness: { type: 3 }, groups, link });
    els.push(box);
    rightExtra = bottomExtra = cards * STACK_STEP;
    if (lines.length) els.push(boundText(box, `${base}:lbl`, lines, 16, font, groups));
    let x = 12;
    pills.forEach((p, n) => {
      const [pillEls, pw] = pill(`${base}:b${n}`, p, x, font, groups);
      els.push(...pillEls);
      x += pw + 6;
    });
    radius = Math.min(w, h) <= 128 ? Math.min(w, h) * 0.25 : 32;
    cx = w / 2;
    capY = h + 8 + bottomExtra;
  } else if (fam === "cylinder") {
    const lines = bare ? [] : wrap(label, 16);
    const [tw, th] = textSize(lines, 14, font);
    const w = Math.max(140, tw + 24);
    const bodyH = Math.max(64, th + 16);
    els.push(el(`${base}:i${i}`, "ellipse", 0, bodyH, w, 16, { bg: fill, sw: 2, rough, groups }));
    i += 1;
    box = el(base, "rectangle", 0, 8, w, bodyH, { bg: fill, sw: 2, rough, groups, link });
    els.push(box);
    if (lines.length) els.push(boundText(box, `${base}:lbl`, lines, 14, font, groups));
    els.push(el(`${base}:i${i}`, "ellipse", 0, 0, w, 16, { bg: fill, sw: 2, rough, groups }));
    i += 1;
    let icons;
    [icons, i] = glyph(k.glyph, base, i, (w - 140) / 2, 0, font, groups);
    els.push(...icons);
    cx = w / 2;
    capY = bodyH + 24;
  } else if (fam === "actor") {
    const lines = bare ? [] : wrap(label, 12);
    const [tw, th] = textSize(lines, 14, font);
    const w = Math.max(140, Math.ceil(tw * 1.42) + 24);
    const h = Math.max(64, Math.ceil(th * 1.42) + 16);
    box = el(base, "ellipse", 0, 0, w, h, { bg: fill, sw: 2, rough, groups, link });
    els.push(box);
    if (lines.length) els.push(boundText(box, `${base}:lbl`, lines, 14, font, groups));
    shape = "ellipse";
    cx = w / 2;
    capY = h + 8;
  } else {
    // note
    const lines = bare ? [] : wrap(label, 28);
    const [tw] = textSize(lines, 12, font);
    const w = Math.max(160, tw + 16);
    const h = lines.length ? lines.length * 15 + 16 : 46;
    box = el(base, "rectangle", 0, 0, w, h, { bg: fill, rough, groups, link });
    els.push(box);
    if (lines.length) els.push(boundText(box, `${base}:lbl`, lines, 12, font, groups, { align: "left", valign: "top" }));
    cx = w / 2;
    capY = h + 8;
  }

  const below = [];
  let y = capY;
  if (!bare && captionLines.length && !(captionLines.length === 1 && captionLines[0] === "")) {
    below.push(centredText(`${base}:cap`, captionLines, cx, y, 14, font, { groups }));
    y += last(below).height + 2;
  }
  if (!bare && sub) below.push(centredText(`${base}:sub`, wrap(sub, 26), cx, y, 12, font, { color: MUTED, groups }));
  els.push(...below);
  const caption = below.length ? [Math.min(...below.map((t) => t.x)), Math.max(...below.map((t) => t.x + t.width))] : null;
  const margin = fam === "pipe" ? 5 : fam === "component" || fam === "message" ? 6 : Math.max(10, radius);
  return { els, box, shape, radius, rightExtra, bottomExtra, caption, margin };
}

// --------------------------------------------------------------------------- geometry helpers

function bbox(e) {
  if (has(e, "points")) {
    const xs = e.points.map((p) => e.x + p[0]);
    const ys = e.points.map((p) => e.y + p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }
  return [e.x, e.y, e.x + e.width, e.y + e.height];
}

function union(boxes) {
  return [
    Math.min(...boxes.map((b) => b[0])),
    Math.min(...boxes.map((b) => b[1])),
    Math.max(...boxes.map((b) => b[2])),
    Math.max(...boxes.map((b) => b[3])),
  ];
}

const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const expand = (r, d) => [r[0] - d, r[1] - d, r[2] + d, r[3] + d];

/** Liang-Barsky: does segment p-q intersect rectangle r? */
function segmentHits(p, q, r) {
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  let t0 = 0;
  let t1 = 1;
  for (const [pp, qq] of [
    [-dx, p[0] - r[0]],
    [dx, r[2] - p[0]],
    [-dy, p[1] - r[1]],
    [dy, r[3] - p[1]],
  ]) {
    if (pp === 0) {
      if (qq < 0) return false;
      continue;
    }
    const t = qq / pp;
    if (pp < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

function shift(els, dx, dy) {
  for (const e of els) {
    e.x += dx;
    e.y += dy;
  }
}

const round = (v) => Math.floor(v + 0.5);

/** Integer coordinates everywhere; linear sizes recomputed from rounded points. */
function finalize(els) {
  for (const e of els) {
    e.x = round(e.x);
    e.y = round(e.y);
    if (has(e, "points")) {
      const pts = e.points.map(([px, py]) => [round(px), round(py)]);
      e.points = pts;
      e.width = Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]));
      e.height = Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1]));
    } else {
      e.width = round(e.width);
      e.height = round(e.height);
    }
  }
}

/** Scale elements about the origin; text keeps its centre and gets a font size of at least 9. */
function scale(els, s) {
  for (const e of els) {
    e.x *= s;
    e.y *= s;
    e.width *= s;
    e.height *= s;
    if (has(e, "points")) e.points = e.points.map(([px, py]) => [px * s, py * s]);
    if (e.type === "text") {
      const cx = e.x + e.width / 2;
      const cy = e.y + e.height / 2;
      const size = Math.max(9, Math.floor(e.fontSize * s));
      const [w, h] = textSize(e.text.split("\n"), size, e.fontFamily);
      if (e.textAlign !== "left") e.x = cx - w / 2;
      e.y = cy - h / 2;
      e.fontSize = size;
      e.width = w;
      e.height = h;
    }
  }
}

/** Where Excalidraw centres an arrow label: middle point, or middle of the middle segment. */
function labelAnchor(pts) {
  const n = pts.length;
  if (n % 2) return pts[Math.floor(n / 2)];
  const i = n / 2 - 1;
  return [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2];
}

function edgeLines(e) {
  const marker = EDGE_KINDS[e.key].marker;
  const head = e.message || e.label || "";
  let first = [marker, head].filter((p) => p).join(" ");
  if (e.seq !== undefined && e.seq !== null) first = `${e.seq}. ${first}`.trimEnd();
  const lines = first ? [first] : [];
  if (e.message && e.label) lines.push(e.label);
  const notes = [];
  if (e.reply_to) notes.push(`reply-to: ${e.reply_to}`);
  if (e.correlation) notes.push("corr-id");
  if (e.ttl) notes.push(`ttl ${e.ttl}`);
  if (e.sequence) notes.push("seq#");
  if (notes.length) {
    // pack annotations onto lines of at most ~24 characters so request-reply labels stay narrow
    const packed = [notes[0]];
    for (const note of notes.slice(1)) {
      const joined = `${last(packed)} · ${note}`;
      if (cpLen(joined) > 24) packed.push(note);
      else packed[packed.length - 1] = joined;
    }
    lines.push(...packed);
  }
  return lines;
}

/** Distances of stacked loop lines (below/above) from the content edge, plus total depth. */
function stackOffsets(edges) {
  const offsets = new Map();
  let cur = null;
  let prevH = 0;
  for (const e of edges) {
    const h = e.th;
    cur = cur === null ? LOOP_OFFSET + h / 2 : cur + Math.max(LOOP_STEP, prevH / 2 + h / 2 + 8);
    offsets.set(e.idx, cur);
    prevH = h;
  }
  return [offsets, cur !== null ? cur + prevH / 2 + 8 : 0];
}

// --------------------------------------------------------------------------- builder

const newEdge = (idx, src, dst, key, spec) => ({
  idx,
  src,
  dst,
  key,
  spec,
  route: "straight",
  sides: null,
  gap: 0,
  band: 0,
  bandDir: 1,
  labelGap: null,
  lines: [],
  tw: 0,
  th: 0,
  ends: [null, null],
  bindingGaps: [1, 1],
  points: [],
  labelBox: null,
});

class Builder {
  constructor(spec) {
    this.spec = spec;
    this.font = spec.font;
    this.rough = spec.rough;
    this.warnings = [];
    this.nodes = new Map();
    spec.nodes.forEach((n, i) => {
      const d = drawNode(`n:${n.id}`, `grp:${n.id}`, n.kind, n.label, n.sub, n.badges, n.tags, this.font, this.rough, {
        link: n.link,
      });
      const b = d.box;
      this.nodes.set(n.id, {
        id: n.id,
        idx: i,
        spec: n,
        drawn: d,
        slot: union(d.els.map(bbox)),
        bcx: b.x + b.width / 2,
        bcy: b.y + b.height / 2,
        rel: [0, 0],
        combined: [],
        ox: 0,
        oy: 0,
      });
    });
    this.roots = spec.nodes.filter((n) => !n.parent).map((n) => n.id);
    this.children = new Map(this.roots.map((r) => [r, spec.nodes.filter((n) => n.parent === r).map((n) => n.id)]));
    this.edges = spec.edges.map((e) => newEdge(e.index, e.from, e.to, e.key, e));
    let base = this.edges.length;
    for (const n of spec.nodes) {
      if (n.shadow) {
        const specEdge = { from: n.parent, to: n.id, kind: "dlq", key: "dlq", index: base };
        this.edges.push(newEdge(base, n.parent, n.id, "dlq", specEdge));
        base += 1;
      }
    }
    this.frames = new Map();
  }

  root(nid) {
    return this.nodes.get(nid).spec.parent || nid;
  }

  // ---- layout

  run() {
    this.foldChildren();
    this.columns();
    this.rows();
    this.routes();
    this.place();
    this.attach();
    this.check();
    return { scene: this.assemble(), warnings: this.warnings };
  }

  foldChildren() {
    for (const r of this.roots) {
      const n = this.nodes.get(r);
      let [x0, y0, x1, bottom] = n.slot;
      for (const cid of this.children.get(r)) {
        const c = this.nodes.get(cid);
        const dx = n.bcx - c.bcx;
        const dy = bottom + SHADOW_GAP - c.slot[1];
        c.rel = [dx, dy];
        x0 = Math.min(x0, c.slot[0] + dx);
        x1 = Math.max(x1, c.slot[2] + dx);
        bottom = c.slot[3] + dy;
      }
      n.combined = [x0, y0, x1, bottom];
    }
  }

  layerEdges() {
    const out = [];
    for (const e of this.edges) {
      let a = this.root(e.src);
      let b = this.root(e.dst);
      if (a === b) continue;
      if (e.key === "message:reply") [a, b] = [b, a];
      out.push([e.idx, a, b]);
    }
    return out;
  }

  columns() {
    const lay = this.layerEdges();
    const succ = new Map(this.roots.map((r) => [r, []]));
    for (const [ei, a, b] of lay) succ.get(a).push([ei, b]);
    const state = new Map();
    const back = new Set();
    const dfs = (u) => {
      state.set(u, 1);
      for (const [ei, v] of succ.get(u)) {
        if (state.get(v) === 1) back.add(ei);
        else if (!state.get(v)) dfs(v);
      }
      state.set(u, 2);
    };
    for (const r of this.roots) if (!state.get(r)) dfs(r);
    const preds = new Map(this.roots.map((r) => [r, []]));
    const indeg = new Map(this.roots.map((r) => [r, 0]));
    const kept = new DefaultMap(() => []);
    for (const [ei, a, b] of lay) {
      if (back.has(ei)) continue;
      preds.get(b).push(a);
      kept.get(a).push(b);
      indeg.set(b, indeg.get(b) + 1);
    }
    // ready roots leave in spec order (node index), like a min-heap on it
    const ready = this.roots.filter((r) => indeg.get(r) === 0);
    const byIdx = (a, b) => this.nodes.get(a).idx - this.nodes.get(b).idx;
    ready.sort(byIdx);
    this.col = new Map();
    while (ready.length) {
      const u = ready.shift();
      const pin = this.nodes.get(u).spec.col;
      this.col.set(u, pin !== null ? pin : Math.max(0, ...preds.get(u).map((p) => this.col.get(p) + 1)));
      for (const v of kept.get(u)) {
        indeg.set(v, indeg.get(v) - 1);
        if (indeg.get(v) === 0) {
          ready.push(v);
          ready.sort(byIdx);
        }
      }
    }
    this.ncols = Math.max(-1, ...this.col.values()) + 1;
    this.nbrs = new DefaultMap(() => new Set());
    for (const [, a, b] of lay) {
      this.nbrs.get(a).add(b);
      this.nbrs.get(b).add(a);
    }
  }

  rows() {
    const byCol = new DefaultMap(() => []);
    for (const r of this.roots) byCol.get(this.col.get(r)).push(r);
    const cols = [...byCol.keys()].sort((a, b) => a - b);
    this.row = new Map();
    const lanes = this.spec.lanes;
    if (lanes.length) {
      this.laneRows = [];
      const depth = new DefaultMap(() => 0);
      const sub = new Map();
      for (const c of cols) {
        for (const u of byCol.get(c)) {
          const li = lanes.indexOf(this.nodes.get(u).spec.lane);
          sub.set(u, [li, depth.get(`${c},${li}`)]);
          depth.set(`${c},${li}`, depth.get(`${c},${li}`) + 1);
        }
      }
      const index = new Map();
      for (let li = 0; li < lanes.length; li++) {
        const counts = [...depth].filter(([key]) => Number(key.split(",")[1]) === li).map(([, d]) => d);
        for (let kk = 0; kk < Math.max(1, ...counts); kk++) {
          index.set(`${li},${kk}`, this.laneRows.length);
          this.laneRows.push([li, kk]);
        }
      }
      for (const [u, [li, kk]] of sub) this.row.set(u, index.get(`${li},${kk}`));
      this.nrows = this.laneRows.length;
      return;
    }
    const pins = new Map();
    for (const r of this.roots) {
      const pin = this.nodes.get(r).spec.row;
      if (pin !== null) pins.set(r, pin);
    }
    for (const members of byCol.values()) this.assign(members, new Map(members.map((u, i) => [u, i])), pins);
    for (const leftToRight of [true, false]) {
      for (const c of leftToRight ? cols : [...cols].reverse()) {
        const keys = new Map();
        for (const u of byCol.get(c)) {
          const nb = [...this.nbrs.get(u)]
            .filter((v) => (leftToRight ? this.col.get(v) < c : this.col.get(v) > c))
            .map((v) => this.row.get(v));
          keys.set(u, nb.length ? sum(nb) / nb.length : this.row.get(u));
        }
        this.assign(byCol.get(c), keys, pins);
      }
    }
    const low = this.row.size ? Math.min(...this.row.values()) : 0;
    if (!pins.size) for (const u of this.row.keys()) this.row.set(u, this.row.get(u) - low);
    this.nrows = Math.max(-1, ...this.row.values()) + 1;
  }

  /** Rows near each node's barycentre; pinned rows are exact, collisions push down. */
  assign(members, keys, pins) {
    const taken = new Set(members.filter((u) => pins.has(u)).map((u) => pins.get(u)));
    for (const u of members) if (pins.has(u)) this.row.set(u, pins.get(u));
    let prev = -1;
    const free = members.filter((u) => !pins.has(u));
    free.sort((a, b) => cmpTuple([keys.get(a), this.nodes.get(a).idx], [keys.get(b), this.nodes.get(b).idx]));
    for (const u of free) {
      let r = Math.max(prev + 1, Math.ceil(keys.get(u) - 0.5));
      while (taken.has(r)) r += 1;
      this.row.set(u, r);
      prev = r;
    }
  }

  routes() {
    for (const e of this.edges) {
      const a = this.root(e.src);
      const b = this.root(e.dst);
      const cs = this.col.get(a);
      const ct = this.col.get(b);
      let route = get(e.spec, "route");
      if (route === null) {
        if (a === b || cs === ct) {
          route = "straight";
        } else if (ct > cs) {
          // a shadow/attached endpoint sits below its row's axis, so only roots can go straight
          const level = this.row.get(a) === this.row.get(b) && a === e.src && b === e.dst;
          route = level ? "straight" : "ortho";
        } else {
          route = cs - ct === 1 ? "ortho" : "below";
        }
      }
      e.route = route;
      if (route === "straight") {
        e.sides = cs === ct ? null : ct > cs ? ["right", "left"] : ["left", "right"];
      } else if (route === "ortho") {
        if (ct > cs) [e.sides, e.gap] = [["right", "left"], cs];
        else if (ct < cs) [e.sides, e.gap] = [["left", "right"], cs - 1];
        else [e.sides, e.gap] = [["right", "right"], cs];
      } else if (route === "below") {
        e.sides = ["bottom", "bottom"];
      } else {
        e.sides = ["top", "top"];
      }
      e.lines = edgeLines(e.spec);
      [e.tw, e.th] = e.lines.length ? textSize(e.lines, 14, this.font) : [0, 0];
      if (e.sides && ["left", "right"].includes(e.sides[0]) && e.sides[1] !== e.sides[0]) {
        e.labelGap = ct > cs ? ct - 1 : ct;
      }
    }
    // vertical bands: forward verticals hug the left of their gap, backward ones the right
    this.nFwd = new DefaultMap(() => 0);
    this.nBack = new DefaultMap(() => 0);
    const byGap = new Map();
    for (const e of this.edges) {
      if (e.route !== "ortho") continue;
      const backward = e.sides[0] === "left";
      const key = `${e.gap},${backward}`;
      if (!byGap.has(key)) byGap.set(key, { g: e.gap, backward, lst: [] });
      byGap.get(key).lst.push(e);
    }
    for (const { g, backward, lst } of byGap.values()) {
      lst.sort((x, y) => cmpTuple(this.orthoKey(x), this.orthoKey(y)));
      lst.forEach((e, i) => {
        e.band = i;
        e.bandDir = backward ? -1 : 1;
      });
      (backward ? this.nBack : this.nFwd).set(g, lst.length);
    }
    [this.belowOff, this.belowDepth] = stackOffsets(this.edges.filter((e) => e.route === "below"));
    [this.aboveOff, this.aboveDepth] = stackOffsets(this.edges.filter((e) => e.route === "above"));
  }

  bandWidths(g) {
    const fwd = this.nFwd.get(g) ? BAND_PAD + ORTHO_STEP * (this.nFwd.get(g) - 1) : 0;
    const back = this.nBack.get(g) ? BAND_PAD + ORTHO_STEP * (this.nBack.get(g) - 1) : 0;
    return [fwd, back];
  }

  /** Order inside a band (index 0 nearest the edge's source) so that turns do not cross. */
  orthoKey(e) {
    const rs = this.row.get(this.root(e.src));
    const rt = this.row.get(this.root(e.dst));
    const up = rt < rs;
    return [e.sides[1] !== e.sides[0] ? 0 : 1, up ? 0 : 1, up ? rs : -rs, e.idx];
  }

  place() {
    const gapW = new Array(Math.max(this.ncols, 1)).fill(COL_GAP);
    for (let g = 0; g < gapW.length; g++) {
      const [fwd, back] = this.bandWidths(g);
      gapW[g] = Math.max(gapW[g], fwd + back + 24);
    }
    // widest label per gap and direction; a gap carrying labels both ways (request and reply)
    // puts each label against its own target, so it must hold both side by side
    this.labelW = new DefaultMap(() => 0);
    for (const e of this.edges) {
      const g = e.labelGap;
      if (e.lines.length && g !== null && g >= 0 && g < gapW.length) {
        const key = `${g},${e.sides[0] === "right"}`;
        this.labelW.set(key, Math.max(this.labelW.get(key), e.tw));
      }
    }
    for (let g = 0; g < gapW.length; g++) {
      const [fwd, back] = this.bandWidths(g);
      const right = this.labelW.get(`${g},true`);
      const left = this.labelW.get(`${g},false`);
      // each label direction also keeps clear of the arrowhead in front of its own target
      const labels = right && left ? right + left + 48 + 2 * ARROWHEAD : Math.max(right, left) + 32 + ARROWHEAD;
      gapW[g] = Math.max(gapW[g], fwd + back + labels);
    }
    const rowGap = new Array(Math.max(this.nrows, 1)).fill(ROW_GAP);
    for (let i = 0; i < 12; i++) {
      this.coords(gapW, rowGap);
      if (!this.separateFrames(gapW, rowGap)) break;
    }
  }

  coords(gapW, rowGap) {
    const left = new DefaultMap(() => 0);
    const right = new DefaultMap(() => 0);
    const up = new DefaultMap(() => 0);
    const down = new DefaultMap(() => 0);
    for (const r of this.roots) {
      const n = this.nodes.get(r);
      const [x0, y0, x1, y1] = n.combined;
      const c = this.col.get(r);
      const w = this.row.get(r);
      left.set(c, Math.max(left.get(c), n.bcx - x0));
      right.set(c, Math.max(right.get(c), x1 - n.bcx));
      up.set(w, Math.max(up.get(w), n.bcy - y0));
      down.set(w, Math.max(down.get(w), y1 - n.bcy));
    }
    const lanes = this.spec.lanes;
    const gutter = lanes.length ? Math.max(...lanes.map((lane) => textSize([lane], 14, this.font)[0])) + 24 : 0;
    const nodes = [...this.nodes.values()];
    const hasFrames = this.spec.groups.some((g) => nodes.some((n) => n.spec.group === g.id));
    let x = MARGIN + gutter + (hasFrames ? FRAME_PAD : 0);
    this.x0 = [];
    this.colw = [];
    for (let c = 0; c < this.ncols; c++) {
      this.x0.push(x);
      this.colw.push(left.get(c) + right.get(c));
      x += left.get(c) + right.get(c) + gapW[c];
    }
    this.gapW = [...gapW];
    let top = MARGIN + (this.spec.title ? TITLE_H : 0);
    top += Math.max(hasFrames ? FRAME_PAD_TOP + FRAME_NAME_H : 0, this.aboveDepth);
    this.rowsTop = top;
    this.y0 = [];
    this.rowh = [];
    let y = top;
    for (let w = 0; w < this.nrows; w++) {
      if (lanes.length && up.get(w) + down.get(w) === 0) {
        up.set(w, 20);
        down.set(w, 20);
      }
      this.y0.push(y);
      this.rowh.push(up.get(w) + down.get(w));
      y += up.get(w) + down.get(w) + rowGap[w];
    }
    this.rowGap = [...rowGap];
    for (const r of this.roots) {
      const n = this.nodes.get(r);
      const c = this.col.get(r);
      const w = this.row.get(r);
      n.ox = this.x0[c] + left.get(c) - n.bcx;
      n.oy = this.y0[w] + up.get(w) - n.bcy;
      for (const cid of this.children.get(r)) {
        const ch = this.nodes.get(cid);
        ch.ox = n.ox + ch.rel[0];
        ch.oy = n.oy + ch.rel[1];
      }
    }
    this.frames = new Map();
    for (const g of this.spec.groups) {
      const members = nodes.filter((n) => n.spec.group === g.id);
      if (!members.length) continue;
      const [x0, y0, x1, y1] = union(members.map((n) => this.slotAbs(n.id)));
      const rows = members.map((n) => this.row.get(this.root(n.id)));
      const cols = members.map((n) => this.col.get(this.root(n.id)));
      this.frames.set(g.id, [
        x0 - FRAME_PAD,
        y0 - FRAME_PAD_TOP,
        x1 + FRAME_PAD,
        y1 + FRAME_PAD,
        Math.min(...rows),
        Math.max(...rows),
        Math.min(...cols),
        Math.max(...cols),
      ]);
    }
  }

  /** Widen one row or column gap when two frames with disjoint rows/columns overlap. */
  separateFrames(gapW, rowGap) {
    const ids = [...this.frames.keys()];
    for (let i = 0; i < ids.length; i++) {
      for (const bId of ids.slice(i + 1)) {
        const a = this.frames.get(ids[i]);
        const b = this.frames.get(bId);
        if (!overlaps(a.slice(0, 4), b.slice(0, 4))) continue;
        if (a[5] < b[4] || b[5] < a[4]) {
          const [upper, lower] = a[5] < b[4] ? [a, b] : [b, a];
          rowGap[upper[5]] += upper[3] - lower[1] + FRAME_NAME_H + 8;
          return true;
        }
        if (a[7] < b[6] || b[7] < a[6]) {
          const [lft, rgt] = a[7] < b[6] ? [a, b] : [b, a];
          gapW[lft[7]] += lft[2] - rgt[0] + 16;
          return true;
        }
      }
    }
    return false;
  }

  // ---- absolute geometry

  slotAbs(nid) {
    const n = this.nodes.get(nid);
    return [n.slot[0] + n.ox, n.slot[1] + n.oy, n.slot[2] + n.ox, n.slot[3] + n.oy];
  }

  boxAbs(nid) {
    const n = this.nodes.get(nid);
    const b = n.drawn.box;
    return [b.x + n.ox, b.y + n.oy, b.width, b.height];
  }

  sideRange(nid, side) {
    const m = this.nodes.get(nid).drawn.margin;
    const [x, y, w, h] = this.boxAbs(nid);
    if (side === "left" || side === "right") return h > 2 * m ? [y + m, y + h - m] : [y + h / 2, y + h / 2];
    return w > 2 * m ? [x + m, x + w - m] : [x + w / 2, x + w / 2];
  }

  /** Bottom attach x in [lo, hi] that avoids the node's own caption when there is room beside it. */
  bottomBase(nid, lo, hi) {
    const n = this.nodes.get(nid);
    const [bx, , bw] = this.boxAbs(nid);
    const centre = Math.min(hi, Math.max(lo, bx + bw / 2));
    if (n.drawn.caption === null) return centre;
    const c0 = n.drawn.caption[0] + n.ox - 6;
    const c1 = n.drawn.caption[1] + n.ox + 6;
    if (c0 > lo) return (lo + Math.min(c0, hi)) / 2;
    if (c1 < hi) return (Math.max(c1, lo) + hi) / 2;
    return centre;
  }

  /** [[x, y], binding gap] where an arrow meets `side` of `nid` at coordinate `along`. */
  sidePoint(nid, side, along) {
    const n = this.nodes.get(nid);
    const [x, y, w, h] = this.boxAbs(nid);
    if (n.drawn.shape === "ellipse") {
      const a = w / 2;
      const b = h / 2;
      const cx = x + a;
      const cy = y + b;
      if (side === "left" || side === "right") {
        const t = (along - cy) / b;
        const d = a * Math.sqrt(Math.max(0, 1 - t * t));
        return [[side === "left" ? cx - d - 1 : cx + d + 1, along], 1];
      }
      const t = (along - cx) / a;
      const d = b * Math.sqrt(Math.max(0, 1 - t * t));
      return [[along, side === "top" ? cy - d - 1 : cy + d + 1], 1];
    }
    if (side === "left") return [[x - 1, along], 1];
    if (side === "right") return [[x + w + n.drawn.rightExtra + 1, along], 1 + n.drawn.rightExtra];
    if (side === "top") return [[along, y - 1], 1];
    return [[along, y + h + n.drawn.bottomExtra + 1], 1 + n.drawn.bottomExtra];
  }

  attach() {
    const groups = new Map();
    for (const e of this.edges) {
      if (e.sides === null) {
        const sy = this.boxAbs(e.src)[1];
        const ty = this.boxAbs(e.dst)[1];
        e.sides = sy < ty ? ["bottom", "top"] : ["top", "bottom"];
      }
      for (const [which, nid, other] of [
        [0, e.src, e.dst],
        [1, e.dst, e.src],
      ]) {
        const side = e.sides[which];
        const [ox, oy, ow, oh] = this.boxAbs(other);
        const coord = side === "left" || side === "right" ? oy + oh / 2 : ox + ow / 2;
        const key = `${nid}\u0000${side}`;
        if (!groups.has(key)) groups.set(key, { nid, side, lst: [] });
        groups.get(key).lst.push([coord, e.idx, which, e]);
      }
    }
    const ordered = [...groups.values()].sort((a, b) =>
      cmpTuple([this.nodes.get(a.nid).idx, a.side], [this.nodes.get(b.nid).idx, b.side]),
    );
    for (const { nid, side, lst } of ordered) {
      lst.sort((a, b) => cmpTuple(a.slice(0, 3), b.slice(0, 3)));
      let [lo, hi] = this.sideRange(nid, side);
      const [x, y, w, h] = this.boxAbs(nid);
      if ((side === "top" || side === "bottom") && lst.length === 1 && lst[0][3].route === "straight") {
        // vertical edge: keep the attach x inside the partner's facing side so the line stays vertical
        const e = lst[0][3];
        const partner = lst[0][2] === 0 ? e.dst : e.src;
        const [plo, phi] = this.sideRange(partner, side === "bottom" ? "top" : "bottom");
        if (Math.max(lo, plo) <= Math.min(hi, phi)) [lo, hi] = [Math.max(lo, plo), Math.min(hi, phi)];
      }
      let base;
      if (side === "bottom") base = this.bottomBase(nid, lo, hi);
      else if (side === "left" || side === "right") base = y + h / 2;
      else base = Math.min(hi, Math.max(lo, x + w / 2));
      const k = lst.length;
      let step = 0;
      let start = base;
      if (k > 1) {
        // spread ends; labels sitting on runs at this side need room between their neighbours
        const runs = lst
          .filter(([, , which, e]) => e.lines.length && (e.route === "straight" || (which === 1 && e.labelGap !== null)))
          .map(([, , , e]) => e.th);
        const want = Math.max(FAN_STEP, runs.length > 1 ? Math.max(...runs) + 4 : runs.length ? runs[0] / 2 + 6 : 0);
        step = Math.max(0, Math.min(want, (hi - lo) / (k - 1)));
        const aligned = lst.flatMap((t, i) => (Math.abs(t[0] - base) < 1 ? [i] : []));
        start = base - (aligned.length ? aligned[0] : (k - 1) / 2) * step;
      }
      start = Math.max(lo, Math.min(start, hi - (k - 1) * step));
      lst.forEach(([, , which, e], i) => {
        [e.ends[which], e.bindingGaps[which]] = this.sidePoint(nid, side, start + i * step);
      });
    }
    const bottoms = [...this.nodes.keys()].map((n) => this.slotAbs(n)[3]);
    for (const f of this.frames.values()) bottoms.push(f[3]);
    if (this.nrows) bottoms.push(last(this.y0) + last(this.rowh));
    this.bottom = bottoms.length ? Math.max(...bottoms) : MARGIN;
    for (const e of this.edges) this.polyline(e);
  }

  gapBounds(g) {
    const left = this.x0[g] + this.colw[g];
    return [left, left + this.gapW[g]];
  }

  /**
   * Centre the label on the final horizontal run, clear of the gap's vertical bands and the arrowhead.
   *
   * Excalidraw centres a label on the middle point (odd count) or the middle segment (even count),
   * so collinear points are inserted to make the middle point the window centre.
   */
  labelWindow(e, pts) {
    const g = e.labelGap;
    if (!e.lines.length || g === null || !(g >= 0 && g < this.ncols) || ![2, 4].includes(pts.length)) return pts;
    const a = pts[pts.length - 2];
    const q = last(pts);
    if (Math.abs(a[1] - q[1]) >= 1) return pts;
    const y = q[1];
    const d = q[0] > a[0] ? 1 : -1;
    const [left, right] = this.gapBounds(g);
    const [fwd, back] = this.bandWidths(g);
    let lo = Math.max(Math.min(a[0], q[0]), left + fwd) + 8;
    let hi = Math.min(Math.max(a[0], q[0]), right - back) - 8;
    // Excalidraw draws the arrowhead over the last ARROWHEAD px before the target
    if (d > 0) hi -= ARROWHEAD;
    else lo += ARROWHEAD;
    if (hi - lo < 4) return pts;
    let cx = (lo + hi) / 2;
    const both = this.labelW.get(`${g},true`) && this.labelW.get(`${g},false`);
    if (both && hi - lo > e.tw) cx = d > 0 ? hi - e.tw / 2 : lo + e.tw / 2;
    if (pts.length === 2) {
      // keep plain 2-point arrows (they stay straight when a node is dragged) unless a band of
      // verticals, the arrowhead or an opposing label shares the default, mid-run label position
      const mid = (a[0] + q[0]) / 2;
      const span = [mid - e.tw / 2 - 4, mid + e.tw / 2 + 4];
      const bands = fwd ? [[left, left + fwd]] : [];
      if (back) bands.push([right - back, right]);
      bands.push(d > 0 ? [q[0] - ARROWHEAD, q[0]] : [q[0], q[0] + ARROWHEAD]);
      if (!both && !bands.some(([b0, b1]) => b0 < span[1] && span[0] < b1)) return pts;
      if (d * (cx - a[0]) <= 2 || d * (q[0] - cx) <= 2) return pts;
      return [a, [cx, y], q];
    }
    // 7 points: the label sits on the middle point; the two after it stay under the label, so the
    // final segment runs from there to the target and is long enough for a full-size arrowhead
    if (d * (cx - a[0]) <= 2 || d * (q[0] - cx) <= 4) return pts;
    return [pts[0], pts[1], a, [cx, y], [cx + d, y], [cx + 2 * d, y], q];
  }

  polyline(e) {
    let p = [...e.ends[0]];
    let q = [...e.ends[1]];
    const [sSide, tSide] = e.sides;
    let pts;
    if (e.route === "straight") {
      const ranges = [this.sideRange(e.src, sSide), this.sideRange(e.dst, tSide)];
      const lo = Math.max(...ranges.map((r) => r[0]));
      const hi = Math.min(...ranges.map((r) => r[1]));
      if (lo <= hi + 0.5) {
        // keep the line axis-parallel: one shared coordinate inside both facing sides
        const axis = sSide === "left" || sSide === "right" ? 1 : 0;
        const ref = sSide === "top" ? q[0] : p[axis];
        const v = Math.min(Math.max(ref, lo), hi);
        p = [...this.sidePoint(e.src, sSide, v)[0]];
        q = [...this.sidePoint(e.dst, tSide, v)[0]];
      }
      pts = [p, q];
      if ((sSide === "left" || sSide === "right") && Math.abs(p[1] - q[1]) < 1) pts = this.labelWindow(e, pts);
    } else if (e.route === "ortho") {
      const [left, right] = this.gapBounds(e.gap);
      const step = ORTHO_STEP * e.band;
      const mx = e.bandDir > 0 ? left + BAND_PAD + step : right - BAND_PAD - step;
      pts = Math.abs(p[1] - q[1]) < 1 ? [p, q] : [p, [mx, p[1]], [mx, q[1]], q];
      pts = this.labelWindow(e, pts);
    } else if (e.route === "below") {
      const ly = this.bottom + this.belowOff.get(e.idx);
      pts = [p, [p[0], ly], [q[0], ly], q];
    } else {
      const ly = this.rowsTop - this.aboveOff.get(e.idx);
      pts = [p, [p[0], ly], [q[0], ly], q];
    }
    e.points = pts.map(([px, py]) => [round(px), round(py)]);
    if (e.lines.length) {
      const [ax, ay] = labelAnchor(e.points);
      e.labelBox = [ax - e.tw / 2, ay - e.th / 2, ax + e.tw / 2, ay + e.th / 2];
    }
  }

  check() {
    const order = this.spec.nodes.map((n) => n.id);
    for (const e of this.edges) {
      const ends = [e.src, e.dst];
      const segs = e.points.slice(1).map((b, i) => [e.points[i], b]);
      for (const nid of order) {
        if (ends.includes(nid)) continue;
        if (segs.some(([a, b]) => segmentHits(a, b, expand(this.slotAbs(nid), 4)))) {
          this.warnings.push(`edge ${e.idx} (${e.src} -> ${e.dst}) crosses node '${nid}'`);
        }
      }
      const [x0, y0] = e.points[e.points.length - 2];
      const [x1, y1] = last(e.points);
      // integer points: the sum of squares is exact, so this is the correctly rounded length
      const run = Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
      if (run < ARROWHEAD) {
        this.warnings.push(`edge ${e.idx} (${e.src} -> ${e.dst}) ends in a ${fixed(run, 0)}px segment: its arrowhead shrinks`);
      }
      if (e.labelBox) {
        for (const nid of order) {
          if (!ends.includes(nid) && overlaps(e.labelBox, this.slotAbs(nid))) {
            this.warnings.push(`label of edge ${e.idx} overlaps node '${nid}'`);
          }
        }
      }
    }
    for (const g of this.spec.groups) {
      if (!this.frames.has(g.id)) {
        this.warnings.push(`group '${g.id}' has no members`);
        continue;
      }
      const rect = this.frames.get(g.id).slice(0, 4);
      for (const nid of order) {
        if (this.nodes.get(nid).spec.group !== g.id && overlaps(rect, this.slotAbs(nid))) {
          this.warnings.push(`frame '${g.id}' encloses non-member node '${nid}'`);
        }
      }
    }
    const ids = [...this.frames.keys()];
    for (let i = 0; i < ids.length; i++) {
      for (const b of ids.slice(i + 1)) {
        if (overlaps(this.frames.get(ids[i]).slice(0, 4), this.frames.get(b).slice(0, 4))) {
          this.warnings.push(`frames '${ids[i]}' and '${b}' overlap`);
        }
      }
    }
  }

  // ---- output

  assemble() {
    const els = [];
    const font = this.font;
    if (this.spec.title) els.push(text("title", [this.spec.title], MARGIN, MARGIN, 28, font, { align: "left" }));
    const lanes = this.spec.lanes;
    const rightEdge = this.ncols ? last(this.x0) + last(this.colw) : MARGIN;
    lanes.forEach((name, li) => {
      const rows = this.laneRows.flatMap(([l2], i) => (l2 === li ? [i] : []));
      const top = this.y0[rows[0]];
      const bottom = this.y0[last(rows)] + this.rowh[last(rows)];
      els.push(text(`lane:${li}`, [name], MARGIN, top, 14, font, { align: "left", color: MUTED }));
      if (li < lanes.length - 1) {
        const ly = bottom + this.rowGap[last(rows)] / 2;
        els.push(
          linear(`lane:${li}:line`, "line", [
            [MARGIN, ly],
            [rightEdge, ly],
          ], { stroke: LANE_LINE, ss: "dotted" }),
        );
      }
    });
    const labels = new Map(this.spec.groups.map((g) => [g.id, g.label]));
    for (const [gid, f] of this.frames) {
      els.push(el(`g:${gid}`, "frame", f[0], f[1], f[2] - f[0], f[3] - f[1], {
        stroke: FRAME_STROKE,
        sw: 2,
        extra: { name: labels.get(gid) },
      }));
    }
    const ordered = [...this.roots, ...this.spec.nodes.filter((n) => n.parent).map((n) => n.id)];
    for (const nid of ordered) {
      const n = this.nodes.get(nid);
      const group = n.spec.group;
      const frameId = group !== null && this.frames.has(group) ? `g:${group}` : null;
      shift(n.drawn.els, n.ox, n.oy);
      for (const e of n.drawn.els) e.frameId = frameId;
      els.push(...n.drawn.els);
    }
    for (const e of this.edges) els.push(...this.arrow(e));
    if (this.spec.legend && this.nodes.size) els.push(...this.legend(this.bottom + this.belowDepth + LEGEND_GAP));
    finalize(els);
    return {
      type: "excalidraw",
      version: 2,
      source: SOURCE,
      elements: els,
      appState: { viewBackgroundColor: "#ffffff" },
      files: {},
    };
  }

  arrow(e) {
    const style = EDGE_KINDS[e.key];
    const srcBox = this.nodes.get(e.src).drawn.box;
    const dstBox = this.nodes.get(e.dst).drawn.box;
    const aid = `e:${e.idx}`;
    const a = linear(aid, "arrow", e.points, {
      stroke: e.spec.color || style.stroke,
      sw: style.width,
      ss: e.spec.style || style.style,
      rough: this.rough,
      start: style.start,
      end: style.end,
      startBinding: { elementId: srcBox.id, focus: 0, gap: e.bindingGaps[0] },
      endBinding: { elementId: dstBox.id, focus: 0, gap: e.bindingGaps[1] },
    });
    srcBox.boundElements.push({ type: "arrow", id: aid });
    dstBox.boundElements.push({ type: "arrow", id: aid });
    const g1 = this.nodes.get(e.src).spec.group;
    const g2 = this.nodes.get(e.dst).spec.group;
    const frameId = g1 !== null && g1 === g2 && this.frames.has(g1) ? `g:${g1}` : null;
    a.frameId = frameId;
    const out = [a];
    if (e.lines.length) {
      const [x0, y0] = e.labelBox;
      const label = text(`${aid}:lbl`, e.lines, x0, y0, 14, this.font, { valign: "middle", container: aid });
      label.frameId = frameId;
      a.boundElements.push({ type: "text", id: label.id });
      out.push(label);
    }
    return out;
  }

  legend(top) {
    const kinds = new Set(this.spec.nodes.map((n) => n.kind));
    const badges = [];
    for (const n of this.spec.nodes) {
      for (const b of n.badges) {
        const name = COMPETING_RE.test(b) ? "competing" : b;
        if (!badges.includes(name)) badges.push(name);
      }
    }
    const keys = new Set(this.edges.map((e) => e.key));
    const entries = [
      ...Object.keys(CATALOGUE)
        .filter((k) => kinds.has(k))
        .map((k) => legendKind(k, this.font)),
      ...Object.keys(BADGES)
        .filter((b) => badges.includes(b))
        .map((b) => legendBadge(b, this.font)),
      ...Object.keys(EDGE_KINDS)
        .filter((k) => keys.has(k))
        .map((k) => legendEdge(k, this.font)),
    ];
    return legendFrame("legend", entries, MARGIN, top, this.font);
  }
}

/** Glyph at the left, name in 12px to its right; local coordinates start at (0, 0). Returns [els, width, height]. */
function entry(name, glyphEls, font, eid) {
  const [x0, y0, x1, y1] = union(glyphEls.map(bbox));
  shift(glyphEls, -x0, -y0);
  const gw = x1 - x0;
  const gh = y1 - y0;
  const [tw, th] = textSize([name], 12, font);
  const h = Math.max(gh, th);
  shift(glyphEls, 0, (h - gh) / 2);
  const label = text(`${eid}:name`, [name], gw + 10, (h - th) / 2, 12, font, { align: "left", valign: "middle" });
  return [[...glyphEls, label], gw + 10 + tw, h];
}

function legendKind(k, font) {
  const base = `legend:${k}`;
  const d = drawNode(base, base, k, "", null, [], [], font, 0, { bare: true });
  scale(d.els, 0.5);
  return entry(CATALOGUE[k].eipName, d.els, font, base);
}

function legendBadge(badge, font) {
  const base = `legend:badge:${badge}`;
  const [els] = pill(base, badgeText(badge), 0, font, [base]);
  return entry(`— ${BADGES[badge]}`, els, font, base);
}

function legendEdge(key, font) {
  const style = EDGE_KINDS[key];
  const base = `legend:edge:${key}`;
  const a = linear(base, "arrow", [
    [0, 8],
    [60, 8],
  ], { stroke: style.stroke, sw: style.width, ss: style.style, start: style.start, end: style.end, groups: [base] });
  return entry(style.marker ? `${style.name} ${style.marker}` : style.name, [a], font, base);
}

function legendFrame(fidBase, entries, x, top, font) {
  const cellW = Math.max(LEGEND_CELL[0], Math.max(...entries.map(([, w]) => w)) + 24);
  const cellH = Math.max(LEGEND_CELL[1], Math.max(...entries.map(([, , h]) => h)) + 8);
  const cols = Math.min(LEGEND_COLS, entries.length);
  const rows = Math.ceil(entries.length / LEGEND_COLS);
  const frameId = `${fidBase}:frame`;
  const frame = el(frameId, "frame", x, top, 2 * FRAME_PAD + cols * cellW - 24, 2 * FRAME_PAD + rows * cellH, {
    stroke: FRAME_STROKE,
    sw: 2,
    extra: { name: "Legend" },
  });
  const out = [frame];
  entries.forEach(([els, , h], i) => {
    const cx = x + FRAME_PAD + (i % LEGEND_COLS) * cellW;
    const cy = top + FRAME_PAD + Math.floor(i / LEGEND_COLS) * cellH + (cellH - h) / 2;
    shift(els, cx, cy);
    for (const e of els) e.frameId = frameId;
    out.push(...els);
  });
  return out;
}

/** Lay out a spec. Returns { scene, warnings }; throws SpecError listing every problem in an invalid spec. */
export function build(spec) {
  const [norm, errors] = normalize(spec);
  if (errors.length) throw new SpecError(errors);
  return new Builder(norm).run();
}

// --------------------------------------------------------------------------- preview SVG

const SVG_FONTS = {
  5: "Virgil, 'Segoe Print', 'Comic Sans MS', cursive",
  1: "Virgil, 'Segoe Print', 'Comic Sans MS', cursive",
  2: "Helvetica, Arial, sans-serif",
  3: "'Cascadia Code', Menlo, monospace",
};

/** A coordinate for the SVG: integers as is, otherwise at most two decimals. */
function n(v) {
  if (Number.isInteger(v)) return String(v);
  return fixed(v, 2).replace(/0+$/, "").replace(/\.$/, "");
}

const esc = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function paint(e, fill = true) {
  const attrs = [`stroke="${e.strokeColor}"`, `stroke-width="${n(e.strokeWidth)}"`];
  const dash = { dashed: "8 6", dotted: "2 4" }[e.strokeStyle];
  if (dash) attrs.push(`stroke-dasharray="${dash}"`);
  const bg = e.backgroundColor ?? TRANSPARENT;
  attrs.push(`fill="${fill && bg !== TRANSPARENT ? bg : "none"}"`);
  if ((e.opacity ?? 100) !== 100) attrs.push(`opacity="${n(e.opacity / 100)}"`);
  return attrs.join(" ");
}

function svgHeads(e, pts) {
  const out = [];
  const color = e.strokeColor;
  const sw = n(e.strokeWidth);
  for (const [head, tip, prev] of [
    [e.startArrowhead, pts[0], pts[1]],
    [e.endArrowhead, last(pts), pts[pts.length - 2]],
  ]) {
    if (!head) continue;
    const ang = Math.atan2(tip[1] - prev[1], tip[0] - prev[0]);
    if (head === "circle" || head === "dot") {
      out.push(`<circle cx="${n(tip[0])}" cy="${n(tip[1])}" r="3" fill="${color}"/>`);
    } else if (head === "bar") {
      const dx = 5 * Math.sin(ang);
      const dy = -5 * Math.cos(ang);
      out.push(
        `<line x1="${n(tip[0] + dx)}" y1="${n(tip[1] + dy)}" x2="${n(tip[0] - dx)}" ` +
          `y2="${n(tip[1] - dy)}" stroke="${color}" stroke-width="${sw}"/>`,
      );
    } else if (head === "triangle") {
      const wings = [Math.PI / 6, -Math.PI / 6].map((s) => [tip[0] - 12 * Math.cos(ang + s), tip[1] - 12 * Math.sin(ang + s)]);
      const ptsS = [tip, ...wings].map(([px, py]) => `${n(px)},${n(py)}`).join(" ");
      out.push(`<polygon points="${ptsS}" fill="${color}" stroke="${color}" stroke-width="1"/>`);
    } else {
      for (const s of [Math.PI / 6, -Math.PI / 6]) {
        const bx = tip[0] - 10 * Math.cos(ang + s);
        const by = tip[1] - 10 * Math.sin(ang + s);
        out.push(`<line x1="${n(tip[0])}" y1="${n(tip[1])}" x2="${n(bx)}" y2="${n(by)}" stroke="${color}" stroke-width="${sw}"/>`);
      }
    }
  }
  return out;
}

function svgText(e, byId) {
  const out = [];
  const { x, y, width: w, height: h } = e;
  const container = byId.get(e.containerId);
  if (container !== undefined && container.type === "arrow") {
    out.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="#ffffff"/>`);
  }
  const size = e.fontSize;
  const lh = size * (e.lineHeight ?? 1.25);
  const align = e.textAlign ?? "left";
  const [anchor, ax] = { center: ["middle", x + w / 2], right: ["end", x + w] }[align] ?? ["start", x];
  const fam = esc(SVG_FONTS[e.fontFamily] ?? SVG_FONTS[2]);
  const spans = e.text
    .split("\n")
    .map((line, i) => `<tspan x="${n(ax)}" y="${n(y + i * lh + (lh - size) / 2)}">${esc(line)}</tspan>`)
    .join("");
  out.push(
    `<text font-size="${n(size)}" font-family="${fam}" fill="${e.strokeColor}" ` +
      `text-anchor="${anchor}" dominant-baseline="hanging">${spans}</text>`,
  );
  return out;
}

function svgEl(e, byId) {
  const { type: t, x, y, width: w, height: h } = e;
  if (t === "rectangle") {
    let rx = "";
    if (e.roundness) {
      let r = Math.min(w, h) * 0.25;
      if (e.roundness.type === 3 && Math.min(w, h) > 128) r = 32;
      rx = ` rx="${n(r)}"`;
    }
    return [`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"${rx} ${paint(e)}/>`];
  }
  if (t === "ellipse") {
    return [`<ellipse cx="${n(x + w / 2)}" cy="${n(y + h / 2)}" rx="${n(w / 2)}" ry="${n(h / 2)}" ${paint(e)}/>`];
  }
  if (t === "diamond") {
    const pts = [
      [x + w / 2, y],
      [x + w, y + h / 2],
      [x + w / 2, y + h],
      [x, y + h / 2],
    ];
    return [`<polygon points="${pts.map(([a, b]) => `${n(a)},${n(b)}`).join(" ")}" ${paint(e)}/>`];
  }
  if (t === "line" || t === "arrow") {
    const pts = e.points.map(([px, py]) => [x + px, y + py]);
    const s = pts.map(([a, b]) => `${n(a)},${n(b)}`).join(" ");
    if (e.polygon) return [`<polygon points="${s}" ${paint(e)}/>`];
    const out = [`<polyline points="${s}" ${paint(e, false)}/>`];
    return t === "arrow" && pts.length > 1 ? [...out, ...svgHeads(e, pts)] : out;
  }
  if (t === "text") return svgText(e, byId);
  if (t === "frame") {
    return [
      `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="8" stroke="${FRAME_STROKE}" ` +
        `stroke-width="2" fill="none"/>`,
      `<text x="${n(x)}" y="${n(y - 6)}" font-size="14" font-family="${esc(SVG_FONTS[2])}" ` +
        `fill="#999">${esc(e.name || "Frame")}</text>`,
    ];
  }
  return [];
}

/**
 * Deterministic layout preview: shapes, arrows, text and frames in array order (roughness ignored).
 * `pad` is the white margin around the content's bounding box.
 */
export function renderSvg(scene, pad = 40) {
  const els = (scene.elements ?? []).filter((e) => !e.isDeleted);
  const byId = new Map(els.map((e) => [e.id, e]));
  const boxes = els.map((e) => {
    const b = bbox(e);
    return e.type === "frame" ? [b[0], b[1] - FRAME_NAME_H, b[2], b[3]] : b;
  });
  const [x0, y0, x1, y1] = boxes.length ? union(boxes) : [0, 0, 0, 0];
  const [vx, vy, vw, vh] = [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad];
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(vx)} ${n(vy)} ${n(vw)} ${n(vh)}" ` +
      `width="${n(vw)}" height="${n(vh)}">`,
    `<rect x="${n(vx)}" y="${n(vy)}" width="${n(vw)}" height="${n(vh)}" fill="#ffffff"/>`,
  ];
  for (const e of els) out.push(...svgEl(e, byId));
  out.push("</svg>");
  return `${out.join("\n")}\n`;
}

// --------------------------------------------------------------------------- library

function libItem(id, name, els) {
  finalize(els);
  return { id, status: "unpublished", created: LIB_CREATED, name, elements: els };
}

/** One item per kind, badge and edge style; ids are unique across items. */
export function buildLibrary() {
  const font = FONTS.excalifont;
  const rough = 1;
  const items = [];
  for (const [k, def] of Object.entries(CATALOGUE)) {
    const base = `lib:${k}`;
    const d = drawNode(base, base, k, def.eipName, null, [], [], font, rough);
    items.push(libItem(`eip-${k}`, def.eipName, d.els));
  }
  for (const [badge, name] of Object.entries(BADGES)) {
    const base = `lib:badge-${badge}`;
    const d = drawNode(base, base, "service", "Service", null, [badge], [], font, rough);
    items.push(libItem(`eip-badge-${badge}`, name, d.els));
  }
  for (const [key, style] of Object.entries(EDGE_KINDS)) {
    const slug = key.replace(":", "-");
    const base = `lib:edge-${slug}`;
    const a = el(`${base}:a`, "rectangle", 0, 0, 96, 64, { bg: WHITE, sw: 2, rough, groups: [base] });
    const b = el(`${base}:b`, "rectangle", 256, 0, 96, 64, { bg: WHITE, sw: 2, rough, groups: [base] });
    const aid = `${base}:arrow`;
    const arrow = linear(aid, "arrow", [
      [97, 32],
      [255, 32],
    ], {
      stroke: style.stroke,
      sw: style.width,
      ss: style.style,
      rough,
      start: style.start,
      end: style.end,
      groups: [base],
      startBinding: { elementId: a.id, focus: 0, gap: 1 },
      endBinding: { elementId: b.id, focus: 0, gap: 1 },
    });
    a.boundElements.push({ type: "arrow", id: aid });
    b.boundElements.push({ type: "arrow", id: aid });
    const els = [a, b, arrow];
    if (style.marker) {
      const [w, h] = textSize([style.marker], 14, font);
      const label = text(`${base}:lbl`, [style.marker], 176 - w / 2, 32 - h / 2, 14, font, {
        valign: "middle",
        container: aid,
        groups: [base],
      });
      arrow.boundElements.push({ type: "text", id: label.id });
      els.push(label);
    }
    items.push(libItem(`eip-edge-${slug}`, style.name, els));
  }
  return { type: "excalidrawlib", version: 2, source: SOURCE, libraryItems: items };
}

/** Scene with every library item placed in a 4-column grid; badge and edge items get a name caption. */
export function libraryPreview(lib) {
  const items = lib.libraryItems;
  const bounds = items.map((item) => union(item.elements.map(bbox)));
  const cellW = Math.max(LIB_CELL[0], Math.max(...bounds.map((b) => b[2] - b[0])) + 40);
  const cellH = Math.max(LIB_CELL[1], Math.max(...bounds.map((b) => b[3] - b[1])) + 60);
  const font = FONTS.excalifont;
  const els = [];
  items.forEach((item, i) => {
    const b = bounds[i];
    const cx = MARGIN + (i % 4) * cellW + cellW / 2;
    const top = MARGIN + Math.floor(i / 4) * cellH + 20;
    const dx = cx - (b[0] + b[2]) / 2;
    const dy = top - b[1];
    const copies = structuredClone(item.elements);
    shift(copies, dx, dy);
    els.push(...copies);
    if (item.id.startsWith("eip-badge-") || item.id.startsWith("eip-edge-")) {
      els.push(centredText(`preview:${item.id}`, [item.name], cx, b[3] + dy + 10, 12, font, { color: MUTED }));
    }
  });
  finalize(els);
  return {
    type: "excalidraw",
    version: 2,
    source: SOURCE,
    elements: els,
    appState: { viewBackgroundColor: "#ffffff" },
    files: {},
  };
}

// --------------------------------------------------------------------------- CLI

export const dumpJson = (obj) => `${JSON.stringify(obj, null, 2)}\n`;

/** Render `scenePath` to `pngPath` with Excalidraw's own exporter in headless Chrome. */
export function exportPng(scenePath, pngPath) {
  const proc = spawnSync(process.execPath, [path.join(SKILL_DIR, "scripts", "export_png.mjs"), scenePath, pngPath], {
    encoding: "utf8",
    timeout: 180_000,
  });
  if (proc.error?.code === "ETIMEDOUT") throw new ExportError("timed out after 180 s");
  if (proc.error) throw new ExportError(proc.error.message);
  if (proc.status === 0) return;
  const lines = (proc.stderr ?? "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) throw new ExportError(`export_png.mjs exited ${proc.status ?? proc.signal}`);
  let detail = last(lines).trim();
  if (detail.startsWith("error: ")) detail = detail.slice("error: ".length);
  throw new ExportError(detail);
}

/** OUT.excalidraw next to the spec: name.spec.json and name.json both give name.excalidraw. */
function defaultOut(specPath) {
  const name = path.basename(specPath);
  const stem = name.endsWith(".spec.json") ? name.slice(0, -".spec.json".length) : name.endsWith(".json") ? name.slice(0, -".json".length) : name;
  return path.join(path.dirname(specPath), `${stem}.excalidraw`);
}

/** `file` with its last extension replaced, like pathlib's with_suffix. */
function withSuffix(file, suffix) {
  const { dir, name } = path.parse(file);
  return path.join(dir, name + suffix);
}

const out = (s) => process.stdout.write(`${s}\n`);
const err = (s) => process.stderr.write(`${s}\n`);

function cmdBuild(args) {
  let spec;
  let result;
  try {
    spec = loadSpec(args.spec);
    result = build(spec);
  } catch (e) {
    if (!(e instanceof SpecError)) throw e;
    for (const msg of e.errors) err(`error: ${msg}`);
    return 2;
  }
  const { scene, warnings } = result;
  for (const msg of warnings) err(`warning: ${msg}`);
  const status = args.strict && warnings.length ? 1 : 0;
  const nNodes = (spec.nodes ?? []).length;
  const nEdges = (spec.edges ?? []).length;
  if (args.check) {
    out(`ok: ${nNodes} nodes, ${nEdges} edges, ${warnings.length} warnings`);
    return status;
  }
  const file = path.normalize(args.out ?? defaultOut(args.spec));
  fs.writeFileSync(file, dumpJson(scene), "utf8");
  out(`wrote ${file} (${scene.elements.length} elements, ${nNodes} nodes, ${nEdges} edges)`);
  if (!args.noSvg) {
    const svg = path.normalize(args.svg ?? withSuffix(file, ".svg"));
    fs.writeFileSync(svg, renderSvg(scene), "utf8");
    out(`wrote ${svg}`);
  }
  if (args.png !== null) {
    const png = path.normalize(args.png || withSuffix(file, ".png"));
    try {
      exportPng(file, png);
    } catch (e) {
      if (!(e instanceof ExportError)) throw e;
      err(`error: png export failed: ${e.message}`);
      return 3;
    }
    out(`wrote ${png}`);
  }
  return status;
}

function cmdLib(args) {
  const lib = buildLibrary();
  const file = path.normalize(args.out);
  const svg = path.normalize(args.svg);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, dumpJson(lib), "utf8");
  out(`wrote ${file} (${lib.libraryItems.length} items)`);
  fs.mkdirSync(path.dirname(svg), { recursive: true });
  fs.writeFileSync(svg, renderSvg(libraryPreview(lib)), "utf8");
  out(`wrote ${svg}`);
  return 0;
}

function cmdKinds() {
  for (const [k, def] of Object.entries(CATALOGUE)) out(`${k}\t${def.family}\t${def.eipName}`);
  for (const [badge, name] of Object.entries(BADGES)) out(`badge\t${badge}\t${name}`);
  for (const [key, style] of Object.entries(EDGE_KINDS)) out(`edge\t${key}\t${style.name}`);
  for (const [alias, target] of Object.entries(ALIASES)) out(`alias\t${alias}\t${target}`);
  return 0;
}

const PROG = "eip_excalidraw.mjs";
const COMMANDS = {
  build: {
    usage: `usage: ${PROG} build [-h] [-o OUT] [--svg SVG | --no-svg] [--check] [--png [OUT.png]] [--strict] spec`,
    help: [
      ["spec", "the spec JSON"],
      ["-o, --out OUT", "output .excalidraw (default: next to the spec)"],
      ["--svg SVG", "preview SVG path (default: next to the output)"],
      ["--no-svg", "skip the preview SVG"],
      ["--check", "validate and lay out; write nothing"],
      [
        "--png [OUT.png]",
        "also export a PNG rendered by Excalidraw itself, scene embedded (default: next to the output); " +
          "needs Chrome or Chromium, and network access to esm.sh",
      ],
      ["--strict", "exit 1 when there are layout warnings"],
    ],
    options: {
      "--out": { dest: "out", value: "required", short: "-o" },
      "--svg": { dest: "svg", value: "required" },
      "--no-svg": { dest: "noSvg", value: "none" },
      "--check": { dest: "check", value: "none" },
      "--png": { dest: "png", value: "optional" },
      "--strict": { dest: "strict", value: "none" },
    },
    positional: ["spec"],
    defaults: () => ({ out: null, svg: null, noSvg: false, check: false, png: null, strict: false }),
    run: cmdBuild,
  },
  lib: {
    usage: `usage: ${PROG} lib [-h] [-o OUT] [--svg SVG]`,
    help: [
      ["-o, --out OUT", "the library (default: library/eip.excalidrawlib in the skill)"],
      ["--svg SVG", "its preview (default: library/eip.svg in the skill)"],
    ],
    options: {
      "--out": { dest: "out", value: "required", short: "-o" },
      "--svg": { dest: "svg", value: "required" },
    },
    positional: [],
    defaults: () => ({
      out: path.join(SKILL_DIR, "library", "eip.excalidrawlib"),
      svg: path.join(SKILL_DIR, "library", "eip.svg"),
    }),
    run: cmdLib,
  },
  kinds: {
    usage: `usage: ${PROG} kinds [-h]`,
    help: [],
    options: {},
    positional: [],
    defaults: () => ({}),
    run: cmdKinds,
  },
};
const TOP_USAGE = `usage: ${PROG} [-h] {build,lib,kinds} ...`;
const TOP_HELP = [
  TOP_USAGE,
  "",
  DESCRIPTION,
  "",
  "commands:",
  "  build    spec JSON -> .excalidraw (+ preview .svg)",
  "  lib      write the EIP stencil library",
  "  kinds    list node kinds, badges, edge styles and aliases",
].join("\n");

class UsageError extends Error {
  constructor(usage, message) {
    super(message);
    this.usage = usage;
  }
}

/** argparse-style parsing: `--opt value`, `--opt=value`, `-o value`, unique prefixes of long options. */
function parseCommand(name, argv) {
  const cmd = COMMANDS[name];
  const args = cmd.defaults();
  const positional = [];
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === "-h" || tok === "--help") return { help: [cmd.usage, "", ...cmd.help.map(([o, h]) => `  ${o.padEnd(18)}${h}`)].join("\n") };
    if (tok === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (!tok.startsWith("-") || tok === "-") {
      positional.push(tok);
      continue;
    }
    let flag = tok;
    let inline = null;
    if (tok.startsWith("--") && tok.includes("=")) [flag, inline] = [tok.slice(0, tok.indexOf("=")), tok.slice(tok.indexOf("=") + 1)];
    let opt = null;
    for (const [long, o] of Object.entries(cmd.options)) if (flag === long || flag === o.short) opt = long;
    if (opt === null && flag.startsWith("--")) {
      const matches = Object.keys(cmd.options).filter((long) => long.startsWith(flag));
      if (matches.length > 1) throw new UsageError(cmd.usage, `ambiguous option: ${flag} could match ${matches.join(", ")}`);
      if (matches.length === 1) opt = matches[0];
    }
    if (opt === null) throw new UsageError(cmd.usage, `unrecognized arguments: ${tok}`);
    const { dest, value } = cmd.options[opt];
    if (value === "none") {
      if (inline !== null) throw new UsageError(cmd.usage, `argument ${opt}: ignored explicit argument '${inline}'`);
      args[dest] = true;
    } else if (inline !== null) {
      args[dest] = inline;
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith("-")) {
      args[dest] = argv[++i];
    } else if (value === "optional") {
      args[dest] = "";
    } else {
      throw new UsageError(cmd.usage, `argument ${opt}${cmd.options[opt].short ? `/${cmd.options[opt].short}` : ""}: expected one argument`);
    }
    seen.add(opt);
  }
  if (seen.has("--svg") && seen.has("--no-svg")) throw new UsageError(cmd.usage, "argument --no-svg: not allowed with argument --svg");
  if (positional.length < cmd.positional.length) {
    throw new UsageError(cmd.usage, `the following arguments are required: ${cmd.positional.slice(positional.length).join(", ")}`);
  }
  if (positional.length > cmd.positional.length) {
    throw new UsageError(cmd.usage, `unrecognized arguments: ${positional.slice(cmd.positional.length).join(" ")}`);
  }
  cmd.positional.forEach((p, i) => {
    args[p] = positional[i];
  });
  return { args };
}

/** Run the CLI on `argv` (without the node and script paths); returns the exit code. */
export function main(argv = process.argv.slice(2)) {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 22) {
    err(`error: ${PROG} needs node >= 22 (this is ${process.version})`);
    return 2;
  }
  const [name, ...rest] = argv;
  if (name === "-h" || name === "--help") {
    out(TOP_HELP);
    return 0;
  }
  if (name === undefined || !has(COMMANDS, name)) {
    err(TOP_USAGE);
    err(
      name === undefined
        ? `${PROG}: error: the following arguments are required: command`
        : `${PROG}: error: argument command: invalid choice: '${name}' (choose from build, lib, kinds)`,
    );
    return 2;
  }
  let parsed;
  try {
    parsed = parseCommand(name, rest);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    err(e.usage);
    err(`${PROG} ${name}: error: ${e.message}`);
    return 2;
  }
  if (parsed.help) {
    out(parsed.help);
    return 0;
  }
  return COMMANDS[name].run(parsed.args);
}

const invoked = process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === SCRIPT;
if (invoked) process.exitCode = main();
