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

// start serve
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

wait
  .then(async (u) => {
    console.log("SERVE UP:", u);
    // try run with explicit own port (not attaching to 4096)
    await testRun("--port", "0");
    await testRun("--attach", u);
    serve.kill();
    process.exit(0);
  })
  .catch((e) => {
    console.error("FAIL", e.message);
    serve.kill();
    process.exit(1);
  });

async function testRun(...extra) {
  return new Promise((resolve) => {
    const args = [bin, "run", "say hi in one word", "--format", "json", ...extra];
    console.log("RUN ARGS:", args.slice(1).join(" "));
    const run = spawn(node, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    run.stdout.on("data", (d) => (out += d.toString()));
    run.stderr.on("data", (d) => process.stdout.write("[run-err] " + d.toString()));
    run.on("exit", (c) => {
      const hasText = /"type":"text"/.test(out);
      console.log(`  EXIT ${c} OUT_LEN ${out.length} HAS_TEXT_EVENT ${hasText}`);
      if (hasText) {
        const m = out.match(/"text":"([^"]*)"/);
        console.log("  TEXT:", m ? m[1] : "(none)");
      }
      resolve();
    });
  });
}
