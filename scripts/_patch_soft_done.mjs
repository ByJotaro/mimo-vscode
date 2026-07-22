import fs from "fs";
const p = "src/host/SidebarProvider.ts";
let c = fs.readFileSync(p, "utf8");
// soft selectSession after done
const a = "if (this.currentSessionId === sid) void this.selectSession(sid);";
const b = "if (this.currentSessionId === sid) void this.selectSession(sid, { soft: true });";
if (c.includes(a) && !c.includes(b)) {
  c = c.replace(a, b);
  console.log("soft_done ok");
} else if (c.includes(b)) console.log("soft_done exists");
else console.log("soft_done miss");

// notify turn done when not visible
const marker = "type: 'streamDone',";
if (!c.includes("Turn finished") && c.includes(marker)) {
  c = c.replace(
    `this.post({
        type: 'streamDone',
        sessionId: sid,
        messageId: this.liveAssistantId,
        text: this.liveBuffer,
      });`,
    `this.post({
        type: 'streamDone',
        sessionId: sid,
        messageId: this.liveAssistantId,
        text: this.liveBuffer,
      });
      if (!this.view?.visible) {
        void vscode.window
          .showInformationMessage('MiMo turn finished', 'Open chat')
          .then((choice) => {
            if (choice === 'Open chat') void vscode.commands.executeCommand('mimo.openSidebar');
          });
      }`
  );
  // try crlf
  if (!c.includes("Turn finished")) {
    c = c.replace(
      "this.post({\r\n        type: 'streamDone',\r\n        sessionId: sid,\r\n        messageId: this.liveAssistantId,\r\n        text: this.liveBuffer,\r\n      });",
      "this.post({\r\n        type: 'streamDone',\r\n        sessionId: sid,\r\n        messageId: this.liveAssistantId,\r\n        text: this.liveBuffer,\r\n      });\r\n      if (!this.view?.visible) {\r\n        void vscode.window\r\n          .showInformationMessage('MiMo turn finished', 'Open chat')\r\n          .then((choice) => {\r\n            if (choice === 'Open chat') void vscode.commands.executeCommand('mimo.openSidebar');\r\n          });\r\n      }"
    );
  }
  console.log("notify", c.includes("Turn finished"));
}
fs.writeFileSync(p, c);
console.log("done");