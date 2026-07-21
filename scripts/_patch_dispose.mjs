import fs from "fs";
const p = "src/host/SidebarProvider.ts";
let c = fs.readFileSync(p, "utf8");
if (c.includes("dispose(): void")) {
  console.log("exists");
  process.exit(0);
}
const t = c.trimEnd();
if (!t.endsWith("}")) {
  console.error("no end");
  process.exit(1);
}
const out =
  t.slice(0, -1) +
  "\n  dispose(): void {\n    try {\n      this.client.dispose();\n    } catch {\n      /* ignore */\n    }\n  }\n}\n";
fs.writeFileSync(p, out);
console.log("ok", out.length);
