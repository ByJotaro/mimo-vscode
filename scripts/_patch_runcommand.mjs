import fs from "fs";
const p = "src/host/SidebarProvider.ts";
let c = fs.readFileSync(p, "utf8");
const nl = c.includes("\r\n") ? "\r\n" : "\n";
if (!c.includes("async runCommand")) {
  const anchor = "  private post(msg: unknown): void {" + nl + "    void this.view?.webview.postMessage(msg);" + nl + "  }";
  if (!c.includes(anchor)) { console.error("anchor miss"); process.exit(1); }
  const inject = anchor + nl + nl + "  /** Command palette / external entry */" + nl + "  async runCommand(type: string, extra?: Record<string, unknown>): Promise<void> {" + nl + "    await this.onMessage({ type, ...(extra || {}) });" + nl + "  }";
  c = c.replace(anchor, inject);
  console.log("runCommand ok");
} else console.log("runCommand exists");
if (!c.includes("case 'openHistory'")) {
  c = c.replace("case 'goHome':", "case 'openHistory':" + nl + "          this.post({ type: 'toast', text: 'history' });" + nl + "          await this.sendSessionsList(true);" + nl + "          break;" + nl + "        case 'goHome':");
  console.log("openHistory ok");
} else console.log("openHistory exists");
if (c.includes("const header = '' + file")) {
  c = c.replace("const header = '' + file + ':' + start + (end !== start ? '-' + end : '') + '';", "const header =" + nl + "            '`' + file + ':' + start + (end !== start ? '-' + end : '') + '`';");
  c = c.replace("text: header + '\\n`\\n' + sel + '\\n`\\n'", "text: header + '\\n```\\n' + sel + '\\n```\\n'");
  console.log("selection header fixed");
}
if (!c.trimEnd().endsWith("}")) { console.error("structure broken"); process.exit(1); }
fs.writeFileSync(p, c);
console.log("ok", c.length);