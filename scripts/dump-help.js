const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

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
const cmds = ["acp","mcp","attach","run","debug","providers","agent","upgrade","uninstall","serve","models","stats","export","import","github","pr","session","plugin","db","completion"];
let out = "";
for (const c of cmds) {
  out += `\n===== mimo ${c} --help =====\n`;
  try {
    const r = spawnSync(node, [bin, c, "--help"], { encoding: "utf8", timeout: 8000 });
    out += (r.stdout || "") + (r.stderr || "");
  } catch (e) {
    out += "ERR: " + e.message + "\n";
  }
}
fs.writeFileSync(path.join(__dirname, "cli-help.txt"), out);
console.log("written cli-help.txt", out.length, "bytes");
