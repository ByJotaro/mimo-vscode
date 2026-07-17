const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

function find() {
  const c = [];
  try {
    const r = require("child_process").execSync("npm root -g", { encoding: "utf8" }).trim();
    c.push(path.join(r, "@mimo-ai", "cli", "bin", "mimo"));
  } catch (e) {}
  const home = process.env.USERPROFILE || "";
  c.push(path.join(home, "AppData", "Roaming", "npm", "node_modules", "@mimo-ai", "cli", "bin", "mimo"));
  for (const x of c) {
    try {
      if (fs.existsSync(x) && fs.statSync(x).isFile()) return x;
    } catch (e) {}
  }
  return undefined;
}
const bin = find();
const node = process.execPath;
const serve = spawn(node, [bin, "serve", "--port", "0", "--hostname", "127.0.0.1"], {
  stdio: ["ignore", "pipe", "pipe"],
});
const wait = new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error("timeout")), 15000);
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

async function probe(base, path, method = "GET", body) {
  try {
    const opt = { method, signal: AbortSignal.timeout(6000) };
    if (body) {
      opt.headers = { "Content-Type": "application/json" };
      opt.body = JSON.stringify(body);
    }
    const r = await fetch(base + path, opt);
    let txt = "";
    try {
      txt = await r.text();
    } catch (e) {}
    const preview = txt.length > 200 ? txt.slice(0, 200) + "..." : txt;
    console.log(`${method} ${path} -> ${r.status} | ${preview}`);
  } catch (e) {
    console.log(`${method} ${path} -> ERR ${e.message}`);
  }
}

wait
  .then(async (u) => {
    console.log("BASE:", u);
    const paths = [
      "/session",
      "/session/stats",
      "/models",
      "/providers",
      "/agents",
      "/agent",
      "/mcp",
      "/mcp/list",
      "/stats",
      "/config",
      "/version",
      "/health",
      "/debug",
      "/db/path",
      "/plugin",
      "/github",
    ];
    for (const p of paths) await probe(u, p);
    // session verbs
    const sid = "ses_0924fe372ffewkHtRN7q2TyFS6";
    await probe(u, `/session/${sid}`);
    await probe(u, `/session/${sid}/message`);
    serve.kill();
    process.exit(0);
  })
  .catch((e) => {
    console.error("FAIL", e.message);
    serve.kill();
    process.exit(1);
  });
