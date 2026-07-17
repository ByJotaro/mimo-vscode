const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

function find() {
  const c = [];
  try { const r = require("child_process").execSync("npm root -g", { encoding: "utf8" }).trim(); c.push(path.join(r, "@mimo-ai", "cli", "bin", "mimo")); } catch (e) {}
  const home = process.env.USERPROFILE || "";
  c.push(path.join(home, "AppData", "Roaming", "npm", "node_modules", "@mimo-ai", "cli", "bin", "mimo"));
  for (const x of c) { try { if (fs.existsSync(x) && fs.statSync(x).isFile()) return x; } catch (e) {} }
  return undefined;
}
const bin = find();
const node = process.execPath;

function run(args, timeout = 20000) {
  return new Promise((resolve) => {
    const p = spawn(node, [bin, ...args], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));
    const t = setTimeout(() => { p.kill("SIGTERM"); resolve({ args, ok: false, out: out.slice(0,120), err: "TIMEOUT" }); }, timeout);
    p.on("exit", (code) => {
      clearTimeout(t);
      resolve({ args: args.join(" "), ok: code === 0 || code === null, out: out.slice(0, 160), code });
    });
  });
}

(async () => {
  const tests = [
    ["--version"],
    ["models", "--verbose"],
    ["providers", "list"],
    ["providers", "whoami"],
    ["stats"],
    ["debug", "paths"],
    ["debug", "config"],
    ["agent", "list"],
    ["mcp", "list"],
  ];
  for (const t of tests) {
    const r = await run(t);
    console.log(`[${r.ok ? "OK " : "ERR"}] mimo ${r.args} (exit ${r.code})`);
    console.log(`     ${r.out.replace(/\n/g, " ").slice(0, 150)}`);
  }
  // session delete/export need a real session id
  console.log("\n=== session commands (using a real session) ===");
  const serve = spawn(node, [bin, "serve", "--port", "0", "--hostname", "127.0.0.1"], { stdio: ["ignore", "pipe", "pipe"] });
  const u = await new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error("serve timeout")), 15000);
    serve.stdout.on("data", (d) => { const m = d.toString().match(/listening on (https?:\/\/127\.0\.0\.1:(\d+))/); if (m) { clearTimeout(to); res(m[1]); } });
    serve.stderr.on("data", () => {});
  });
  const sessions = await (await fetch(u + "/session")).json();
  const sid = sessions[0].id;
  console.log("test session:", sid);
  const exp = await run(["export", sid, "--sanitize"], 20000);
  console.log(`[${exp.ok ? "OK " : "ERR"}] mimo export ${sid} (exit ${exp.code}) out_len=${exp.out.length}`);
  serve.kill();
  process.exit(0);
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
