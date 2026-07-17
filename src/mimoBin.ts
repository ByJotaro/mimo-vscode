import * as path from "path";
import * as fs from "fs";

/**
 * Resolve the absolute path to the mimo CLI node bin.
 *
 * On Windows the `mimo` command is a PowerShell wrapper (mimo.ps1); we must
 * spawn the real node bin (`@mimo-ai/cli/bin/mimo`) directly, otherwise stdout
 * parsing and stdio control break.
 */
export function findMimoBin(): string | undefined {
  const candidates: string[] = [];

  // 1. Global npm root (where `npm i -g @mimo-ai/cli` installs)
  try {
    const { execSync } = require("child_process");
    const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
    candidates.push(path.join(globalRoot, "@mimo-ai", "cli", "bin", "mimo"));
  } catch {
    /* ignore */
  }

  // 2. Common global locations
  const home = process.env.USERPROFILE || process.env.HOME || "";
  candidates.push(
    path.join(home, "AppData", "Roaming", "npm", "node_modules", "@mimo-ai", "cli", "bin", "mimo"),
    path.join(home, ".npm-global", "lib", "node_modules", "@mimo-ai", "cli", "bin", "mimo"),
  );

  // 3. require.resolve from this extension's node_modules (if bundled)
  try {
    candidates.push(require.resolve("@mimo-ai/cli/bin/mimo"));
  } catch {
    /* ignore */
  }

  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) {
        return c;
      }
    } catch {
      /* ignore */
    }
  }

  return undefined;
}
