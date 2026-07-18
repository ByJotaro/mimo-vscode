import * as fs from "fs";
import * as os from "os";

const LOG_PATH = `${os.homedir()}\\.mimo-vscode-debug.log`;

export function rtLog(msg: string): void {
    try {
        fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${msg}\n`);
    } catch {
        // ignore
    }
}

export function rtLogClear(): void {
    try {
        fs.writeFileSync(LOG_PATH, "");
    } catch {
        // ignore
    }
}
