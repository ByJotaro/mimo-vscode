import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "module";
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import esbuild from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../..");
await esbuild.build({
  entryPoints: [path.join(root, "src/host/cli/slashCatalog.ts")],
  bundle: true,
  outfile: path.join(root, "out-test/slash.js"),
  platform: "node",
  format: "cjs",
});
const require = createRequire(import.meta.url);
const { getSlashCommandCatalog, filterSlashCommands } = require(path.join(root, "out-test/slash.js"));

describe("slash catalog", () => {
  it("has core + skills", () => {
    const cat = getSlashCommandCatalog();
    assert.ok(cat.length > 40);
    assert.ok(cat.some((c) => c.name === "loop"));
    assert.ok(cat.some((c) => c.name === "arxiv"));
  });
  it("filters by query", () => {
    const cat = getSlashCommandCatalog();
    const f = filterSlashCommands("deep", cat);
    assert.ok(f.some((c) => c.name.includes("deep") || c.name === "deep-research"));
  });
});
