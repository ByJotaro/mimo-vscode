const assert = require("assert");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

/** Resolve mimo bin, reused from MimoService logic (inline copy for the test). */
function findMimoBin() {
  const candidates = [];
  try {
    const r = require("child_process").execSync("npm root -g", { encoding: "utf8" }).trim();
    candidates.push(path.join(r, "@mimo-ai", "cli", "bin", "mimo"));
  } catch (e) {}
  const home = process.env.USERPROFILE || process.env.HOME || "";
  candidates.push(path.join(home, "AppData", "Roaming", "npm", "node_modules", "@mimo-ai", "cli", "bin", "mimo"));
  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    } catch (e) {}
  }
  return undefined;
}

async function run() {
  const vscode = require("vscode");
  // The extension under test is this very package; activating it should start
  // `mimo serve` and register the webview provider. We verify the mimo CLI is
  // present and that the serve process can come up (the transport the extension relies on).
  const bin = findMimoBin();
  assert.ok(bin, "mimo CLI bin should be resolvable");

  // Verify the extension is actually activated in the host.
  const ext = vscode.extensions.getExtension("ByJotaro.mimo-vscode");
  assert.ok(ext, "extension ByJotaro.mimo-vscode should be present");
  await ext.activate();
  assert.ok(ext.isActive, "extension should be active");

  // Verify the serve + run transport works (the core of the extension).
  await new Promise((resolve, reject) => {
    const node = process.execPath;
    const serve = spawn(node, [bin, "serve", "--port", "0", "--hostname", "127.0.0.1"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const ready = new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error("serve timeout")), 15000);
      serve.stdout.on("data", (d) => {
        const m = d.toString().match(/listening on (https?:\/\/127\.0\.0\.1:(\d+))/);
        if (m) {
          clearTimeout(t);
          res(m[1]);
        }
      });
      serve.stderr.on("data", () => {});
      serve.on("error", rej);
    });
    ready
      .then(async (u) => {
        const sessions = await (await fetch(u + "/session")).json();
        assert.ok(Array.isArray(sessions), "GET /session should return an array");
        const run = spawn(node, [bin, "run", "say hi in one word", "--format", "json", "--port", "0"], {
          stdio: ["ignore", "pipe", "pipe"],
        });
        let out = "";
        run.stdout.on("data", (d) => (out += d.toString()));
        run.on("exit", (c) => {
          assert.ok(/"type":"text"/.test(out), "mimo run should emit text events");
          serve.kill();
          resolve();
        });
      })
      .catch((e) => {
        serve.kill();
        reject(e);
      });
  });

  console.log("SMOKE TEST PASSED: extension activates, mimo serve + run transport works");
}

module.exports = { run };
