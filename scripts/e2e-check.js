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
if (!bin) {
  console.error("BIN NOT FOUND");
  process.exit(1);
}
console.log("BIN:", bin);

const serve = spawn(node, [bin, "serve", "--port", "0", "--hostname", "127.0.0.1"], {
  stdio: ["ignore", "pipe", "pipe"],
});

const wait = new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error("timeout starting serve")), 15000);
  serve.stdout.on("data", (d) => {
    const m = d.toString().match(/listening on (https?:\/\/127\.0\.0\.1:(\d+))/);
    if (m) {
      clearTimeout(t);
      res(m[1]);
    }
  });
  serve.stderr.on("data", (d) => process.stderr.write("[serve] " + d));
  serve.on("error", rej);
});

wait
  .then(async (u) => {
    console.log("SERVE URL:", u);
    const ses = await (await fetch(u + "/session")).json();
    console.log("SESSIONS COUNT:", ses.length);
    const sid = ses[0].id;
    const msgs = await (await fetch(u + "/session/" + encodeURIComponent(sid) + "/message")).json();
    console.log("MESSAGES IN FIRST SESSION:", msgs.length);

    const run = spawn(node, [bin, "run", "say hi in one word", "--format", "json", "--port", "0"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let buf = "";
    let acc = "";
    let msgId = "";
    run.stdout.on("data", (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const ln = buf.slice(0, i);
        buf = buf.slice(i + 1);
        try {
          const e = JSON.parse(ln);
          if (e.type === "text" && typeof e.text === "string") {
            msgId = e.messageID;
            acc += e.text;
            console.log("TEXT EVENT:", JSON.stringify(e.text.slice(0, 40)));
          } else if (e.type === "step_finish") {
            console.log("RUN DONE msgId=", e.messageID);
          }
        } catch (e) {}
      }
    });
    run.on("exit", (c) => {
      if (buf.trim()) {
        try {
          const e = JSON.parse(buf.trim());
          if (e.type === "text" && typeof e.text === "string") acc += e.text;
        } catch (e) {}
      }
      console.log("RUN EXIT", c, "MSGID=", msgId, "TEXT=", JSON.stringify(acc.slice(0, 120)));
      serve.kill();
      process.exit(0);
    });
  })
  .catch((e) => {
    console.error("FAIL", e.message);
    serve.kill();
    process.exit(1);
  });
