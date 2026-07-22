import fs from "fs";
const p = "src/host/SidebarProvider.ts";
let c = fs.readFileSync(p, "utf8");
if (c.includes("models refreshed") || c.includes("no models")) {
  console.log("already");
} else {
  const old = `              this.post({
                type: 'init',
                sessions: [],
                models: this.models,
                modes: this.modes,
                selectedModel: this.selectedModel,
                selectedMode: this.selectedMode,
                metadataOnly: true,
                showStartupChooser: false,
                slashCommands: getSlashCommandCatalog(),
              });
            } catch (e) {
              this.log.appendLine('[refreshModels] ' + String(e).slice(0, 120));
            }`;
  const neu = `              this.post({
                type: 'init',
                sessions: [],
                models: this.models,
                modes: this.modes,
                selectedModel: this.selectedModel,
                selectedMode: this.selectedMode,
                metadataOnly: true,
                showStartupChooser: false,
                slashCommands: getSlashCommandCatalog(),
              });
              this.post({
                type: 'toast',
                text: this.models.length
                  ? 'models · ' + this.models.length
                  : 'no models from serve',
              });
            } catch (e) {
              this.log.appendLine('[refreshModels] ' + String(e).slice(0, 120));
              this.post({ type: 'toast', text: 'models refresh failed' });
            }`;
  if (c.includes(old)) {
    c = c.replace(old, neu);
    console.log("ok");
  } else {
    const old2 = old.replace(/\n/g, "\r\n");
    const neu2 = neu.replace(/\n/g, "\r\n");
    if (c.includes(old2)) {
      c = c.replace(old2, neu2);
      console.log("ok crlf");
    } else console.log("miss");
  }
  fs.writeFileSync(p, c);
}