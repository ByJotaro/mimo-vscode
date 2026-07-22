import fs from "fs";
const p = "src/host/SidebarProvider.ts";
let c = fs.readFileSync(p, "utf8");
if (c.includes("showInformationMessage('MiMo permission")) {
  console.log("already");
  process.exit(0);
}
const old = `    if (ev.type === 'permission') {
      this.post({
        type: 'permissionRequest',
        sessionId: (ev as any).sessionId || this.currentSessionId,
        permissionId: (ev as any).permissionId,
        permission: (ev as any).permission,
        patterns: (ev as any).patterns,
      });
    }`;
const neu = `    if (ev.type === 'permission') {
      this.post({
        type: 'permissionRequest',
        sessionId: (ev as any).sessionId || this.currentSessionId,
        permissionId: (ev as any).permissionId,
        permission: (ev as any).permission,
        patterns: (ev as any).patterns,
      });
      if (!this.view?.visible) {
        const perm = String((ev as any).permission || 'tool').slice(0, 80);
        void vscode.window
          .showInformationMessage('MiMo permission: ' + perm, 'Open chat')
          .then((c) => {
            if (c === 'Open chat') void vscode.commands.executeCommand('mimo.openSidebar');
          });
      }
    }`;
if (c.includes(old)) {
  c = c.replace(old, neu);
  console.log("perm ok");
} else {
  // crlf
  const old2 = old.replace(/\n/g, "\r\n");
  const neu2 = neu.replace(/\n/g, "\r\n");
  if (c.includes(old2)) {
    c = c.replace(old2, neu2);
    console.log("perm ok crlf");
  } else console.log("perm miss");
}
const qold = `    if (ev.type === 'question') {
      this.post({
        type: 'questionOverlay',
        sessionId: (ev as any).sessionId || this.currentSessionId,
        callId: (ev as any).callId,
        requestId: (ev as any).requestId,
        title: (ev as any).title,
        prompt: (ev as any).prompt,
        options: (ev as any).options,
        questions: (ev as any).questions,
      });
    }`;
const qneu = `    if (ev.type === 'question') {
      this.post({
        type: 'questionOverlay',
        sessionId: (ev as any).sessionId || this.currentSessionId,
        callId: (ev as any).callId,
        requestId: (ev as any).requestId,
        title: (ev as any).title,
        prompt: (ev as any).prompt,
        options: (ev as any).options,
        questions: (ev as any).questions,
      });
      if (!this.view?.visible) {
        const title = String((ev as any).title || (ev as any).prompt || 'question').slice(0, 80);
        void vscode.window
          .showInformationMessage('MiMo question: ' + title, 'Open chat')
          .then((c) => {
            if (c === 'Open chat') void vscode.commands.executeCommand('mimo.openSidebar');
          });
      }
    }`;
if (c.includes(qold)) {
  c = c.replace(qold, qneu);
  console.log("q ok");
} else {
  const qold2 = qold.replace(/\n/g, "\r\n");
  const qneu2 = qneu.replace(/\n/g, "\r\n");
  if (c.includes(qold2)) {
    c = c.replace(qold2, qneu2);
    console.log("q ok crlf");
  } else console.log("q miss");
}
fs.writeFileSync(p, c);
console.log("done");