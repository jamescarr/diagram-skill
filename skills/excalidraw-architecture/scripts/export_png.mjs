// Render an .excalidraw scene to PNG with Excalidraw's own exporter inside headless Chrome.
//
//     node export_png.mjs <scene.excalidraw> <out.png>
//
// Stdlib only (Node >= 22): drives Chrome over the DevTools pipe, imports
// @excalidraw/excalidraw from esm.sh and calls exportToBlob, which draws the
// hand-drawn scene with Excalifont and embeds the scene as a PNG tEXt chunk.
// Needs network access to esm.sh the first time.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const EXCALIDRAW = "https://esm.sh/@excalidraw/excalidraw@0.18.0";
const MAX_SIDE = 3000;
const MAX_SCALE = 2;
const PADDING = 24;
const TIMEOUT_MS = 120_000;

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];
const CHROME_NAMES = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];

function usage() {
  process.stderr.write("usage: node export_png.mjs <scene.excalidraw> <out.png>\n");
  process.exit(2);
}

function removeProfile(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch {
    /* Chrome may still be flushing its profile; a stray temp dir is not worth failing over */
  }
}

function fail(message) {
  process.stderr.write(`error: ${message}\n`);
  process.exit(1);
}

function findChrome() {
  if (process.env.CHROME) {
    if (!fs.existsSync(process.env.CHROME)) return { missing: process.env.CHROME };
    return process.env.CHROME;
  }
  for (const p of CHROME_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  for (const name of CHROME_NAMES) {
    for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
      if (!dir) continue;
      const p = path.join(dir, name);
      try {
        fs.accessSync(p, fs.constants.X_OK);
        return p;
      } catch {
        /* keep looking */
      }
    }
  }
  return null;
}

/** Newline-delimited JSON over the pair of pipes Chrome exposes for --remote-debugging-pipe. */
class Devtools {
  constructor(child) {
    this.child = child;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = "";
    this.lastStderr = "";
    this.exited = null;

    child.stdio[4].setEncoding("utf8");
    child.stdio[4].on("data", (chunk) => {
      this.buffer += chunk;
      let end;
      while ((end = this.buffer.indexOf("\0")) !== -1) {
        const raw = this.buffer.slice(0, end);
        this.buffer = this.buffer.slice(end + 1);
        if (!raw) continue;
        let message;
        try {
          message = JSON.parse(raw);
        } catch {
          continue;
        }
        const resolve = this.pending.get(message.id);
        if (!resolve) continue;
        this.pending.delete(message.id);
        resolve(message);
      }
    });

    child.stdio[2].setEncoding("utf8");
    child.stdio[2].on("data", (chunk) => {
      for (const line of chunk.split("\n")) {
        if (line.trim()) this.lastStderr = line.trim();
      }
    });

    child.on("exit", (code) => {
      this.exited = code;
      for (const resolve of this.pending.values()) resolve({ error: "exited" });
      this.pending.clear();
    });

    child.on("error", (err) => {
      this.spawnError = err.message;
      for (const resolve of this.pending.values()) resolve({ error: "exited" });
      this.pending.clear();
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    const reply = new Promise((resolve) => this.pending.set(id, resolve));
    this.child.stdio[3].write(JSON.stringify(payload) + "\0");
    return reply;
  }
}

function expression(scene) {
  const source = JSON.stringify(scene);
  return `(async () => {
  const scene = JSON.parse(${JSON.stringify(source)});
  const { exportToBlob } = await import(${JSON.stringify(EXCALIDRAW)});
  const blob = await exportToBlob({
    elements: scene.elements,
    files: scene.files ?? {},
    mimeType: "image/png",
    exportPadding: ${PADDING},
    appState: {
      exportBackground: true,
      viewBackgroundColor: (scene.appState && scene.appState.viewBackgroundColor) || "#ffffff",
      exportEmbedScene: true,
    },
    getDimensions: (w, h) => {
      const s = Math.min(${MAX_SCALE}, ${MAX_SIDE} / Math.max(w, h));
      return { width: Math.round(w * s), height: Math.round(h * s), scale: s };
    },
  });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
})()`;
}

async function main() {
  const [scenePath, outPath] = process.argv.slice(2);
  if (!scenePath || !outPath || process.argv.length > 4) usage();

  const chrome = findChrome();
  if (!chrome) fail("no Chrome or Chromium found; set CHROME to its executable");
  if (chrome.missing) fail(`CHROME points at ${chrome.missing}, which does not exist`);

  let scene;
  try {
    scene = JSON.parse(fs.readFileSync(scenePath, "utf8"));
  } catch (err) {
    fail(`cannot read ${scenePath}: ${err.message}`);
  }

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "eip-png-"));
  const child = spawn(
    chrome,
    [
      "--headless=new",
      "--remote-debugging-pipe",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--user-data-dir=" + profileDir,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] },
  );

  const devtools = new Devtools(child);
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ error: "timeout" }), TIMEOUT_MS);
  });

  const render = (async () => {
    const target = await devtools.send("Target.createTarget", { url: "about:blank" });
    if (target.error) throw new Error("could not open a browser target");
    const attached = await devtools.send("Target.attachToTarget", { targetId: target.result.targetId, flatten: true });
    if (attached.error) throw new Error("could not attach to the browser target");
    const sessionId = attached.result.sessionId;
    const reply = await devtools.send(
      "Runtime.evaluate",
      { expression: expression(scene), awaitPromise: true, returnByValue: true },
      sessionId,
    );
    if (reply.error === "exited") return { error: "exited" };
    if (reply.error) throw new Error(reply.error.message ?? String(reply.error));
    const result = reply.result ?? {};
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
      throw new Error(`excalidraw export failed: ${detail}`);
    }
    return { value: result.result?.value };
  })();

  let outcome;
  let error = null;
  try {
    outcome = await Promise.race([render, timeout]);
  } catch (err) {
    error = err.message;
  } finally {
    clearTimeout(timer);
    try {
      child.kill();
    } catch {
      /* already gone */
    }
    removeProfile(profileDir);
  }

  if (error) fail(error);
  if (outcome.error === "timeout") fail(`png export timed out after ${TIMEOUT_MS / 1000} s`);
  if (outcome.error === "exited") {
    if (devtools.spawnError) fail(`could not run chrome: ${devtools.spawnError}`);
    fail(`chrome exited with code ${devtools.exited}: ${devtools.lastStderr}`);
  }
  if (!outcome.value) fail("excalidraw export returned no image");

  const buf = Buffer.from(outcome.value, "base64");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
}

await main();
