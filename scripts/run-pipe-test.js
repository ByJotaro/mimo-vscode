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

const run = spawn(node, [bin, "run", "say hi in one word", "--format", "json"], {
  stdio: ["ignore", "pipe", "pipe"],
});
let out = "";
let err = "";
run.stdout.on("data", (d) => {
  out += d.toString();
  process.stdout.write("[OUT] " + d.toString().replace(/\n/g, "[NL]\n[OUT] "));
});
run.stderr.on("data", (d) => {
  err += d.toString();
  process.stdout.write("[ERR] " + d.toString().replace(/\n/g, "[NL]\n[ERR] "));
});
run.on("exit", (c) => {
  console.log("\n=== EXIT", c, "OUT_LEN", out.length, "ERR_LEN", err.length, "===");
  process.exit(0);
});
run.on("error", (e) => {
  console.log("SPAWN ERR", e.message);
  process.exit(1);
});
