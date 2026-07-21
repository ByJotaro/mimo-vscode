import fs from 'fs';

const p = 'src/host/SidebarProvider.ts';
let c = fs.readFileSync(p, 'utf8');
if (c.includes('soft?: boolean') || c.includes('opts?.soft')) {
  console.log('already soft');
} else {
  // case selectSession
  const oldCase = `case 'selectSession':
          if (typeof msg.sessionId === 'string' && msg.sessionId) {
            await this.selectSession(msg.sessionId);
          }
          break;`;
  const newCase = `case 'selectSession':
          if (typeof msg.sessionId === 'string' && msg.sessionId) {
            await this.selectSession(msg.sessionId, { soft: msg.soft === true });
          }
          break;`;
  if (c.includes(oldCase)) c = c.replace(oldCase, newCase);
  else if (c.includes(oldCase.replace(/\n/g, '\r\n')))
    c = c.replace(oldCase.replace(/\n/g, '\r\n'), newCase.replace(/\n/g, '\r\n'));
  else {
    console.log('case miss');
    process.exit(1);
  }

  // method signature
  const oldSig = 'private async selectSession(sessionId: string): Promise<void> {';
  const newSig =
    'private async selectSession(sessionId: string, opts?: { soft?: boolean }): Promise<void> {';
  if (!c.includes(oldSig)) {
    console.log('sig miss');
    process.exit(1);
  }
  c = c.replace(oldSig, newSig);

  // skip loading status when soft
  const load = "this.post({ type: 'sessionLoadStatus', sessionId, loading: true });";
  if (c.includes(load) && !c.includes('if (!opts?.soft)')) {
    c = c.replace(
      load,
      "if (!opts?.soft) this.post({ type: 'sessionLoadStatus', sessionId, loading: true });"
    );
  }

  // pinBottom false when soft same session resync
  const pin = 'pinBottom: true,';
  // only first in selectSession meta - careful global
  const metaBlock = `meta: {
          source: 'db',
          pinBottom: true,`;
  const metaSoft = `meta: {
          source: opts?.soft ? 'db-soft' : 'db',
          pinBottom: !opts?.soft,`;
  if (c.includes(metaBlock)) c = c.replace(metaBlock, metaSoft);
  else if (c.includes(metaBlock.replace(/\n/g, '\r\n')))
    c = c.replace(metaBlock.replace(/\n/g, '\r\n'), metaSoft.replace(/\n/g, '\r\n'));
  else console.log('meta miss - continue');

  fs.writeFileSync(p, c);
  console.log('soft select ok');
}
