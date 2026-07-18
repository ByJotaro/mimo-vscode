import * as path from "path";
import * as fs from "fs";

/**
 * Resolve the absolute path to the mimo CLI executable.
 *
 * `mimo` ships as a native Go binary. On Windows the npm package installs a
 * node wrapper (`@mimo-ai/cli/bin/mimo`) that re-spawns the real Go binary via
 * `spawnSync(..., { stdio: "inherit" })`. If we spawn that wrapper, Windows pops
 * a visible console window and stdio piping for JSON events breaks. So we
 * resolve the native binary directly (mimo.exe on Windows) and run it with
 * `windowsHide: true`.
 */
export function findMimoBin(): string | undefined {
  const isWin = process.platform === "win32";
  const candidates: string[] = [];

  const pushDir = (dir: string, exe: string) => {
    if (isWin) {
      // Look for the bundled platform binary first.
      candidates.push(
        path.join(dir, "node_modules", "@mimo-ai", "mimocode-windows-x64", "bin", "mimo.exe"),
        path.join(dir, "node_modules", "@mimo-ai", "mimocode-windows-x64-baseline", "bin", "mimo.exe"),
        path.join(dir, "bin", "mimo.exe"),
      );
    } else {
      candidates.push(path.join(dir, "bin", "mimo"));
    }
  };

  const pushGlobal = () => {
    try {
      const { execSync } = require("child_process");
      const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
      pushDir(globalRoot, "mimo");
      const home = process.env.USERPROFILE || process.env.HOME || "";
      pushDir(path.join(home, "AppData", "Roaming", "npm", "node_modules", "@mimo-ai", "cli"), "mimo");
      pushDir(path.join(home, ".npm-global", "lib", "node_modules", "@mimo-ai", "cli"), "mimo");
    } catch {
      /* ignore */
    }
  };

  pushGlobal();

  // require.resolve fallback (if bundled inside the extension)
  try {
    const resolved = require.resolve("@mimo-ai/cli/bin/mimo");
    const dir = path.dirname(resolved);
    const base = path.resolve(dir, "..");
    pushDir(base, "mimo");
    candidates.push(resolved);
  } catch {
    /* ignore */
  }

  // PATH lookup (works on all platforms)
  try {
    const { execSync } = require("child_process");
    const which = isWin ? "where mimo" : "which mimo";
    const out = execSync(which, { encoding: "utf8" }).trim().split(/\r?\n/)[0];
    if (out) candidates.push(out);
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
