/**
 * E2E test: slash commands and session export (through a real `mimo serve`).
 *
 * Starts a real `mimo serve` on a fixed port, hits the same HTTP endpoints
 * the extension uses (OpenCodeClient.fetchSlashCommands -> GET /command,
 * exportSessionRecent -> GET /session/:id/message), and asserts the results.
 *
 * Run: npx jest src/ocgui/__tests__/mimo-e2e.test.ts
 */
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';

const PORT = 44321;
const BASE = `http://127.0.0.1:${PORT}`;

function findMimoBin(): string {
    const candidates = [
        process.env.MIMO_BIN,
        path.resolve(process.env.APPDATA || '', 'npm/node_modules/@mimo-ai/cli/node_modules/@mimo-ai/mimocode-windows-x64/bin/mimo.exe'),
        'mimo',
    ].filter(Boolean) as string[];
    for (const c of candidates) {
        try { fs.accessSync(c); return c; } catch { /* next */ }
    }
    return 'mimo';
}

function requestJson<T>(url: string): Promise<T> {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(`JSON parse: ${e}`)); }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
                }
            });
        }).on('error', reject);
    });
}

let serverProc: ChildProcess | null = null;

beforeAll(async () => {
    const bin = findMimoBin();
    console.log(`mimo binary: ${bin}`);
    serverProc = spawn(bin, ['serve', '--port', String(PORT), '--hostname', '127.0.0.1'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    });
    for (let i = 0; i < 30; i++) {
        try {
            const resp = await requestJson<any>(`${BASE}/session`);
            if (Array.isArray(resp)) {
                console.log(`mimo ready, sessions=${resp.length}`);
                return;
            }
        } catch { /* retry */ }
        await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error('mimo serve did not start in 30s');
}, 45000);

afterAll(() => {
    if (serverProc) { serverProc.kill('SIGTERM'); serverProc = null; }
});

describe('MiMo backend endpoints (used by extension)', () => {
    it('GET /command returns 44+ slash commands', async () => {
        const data = await requestJson<any>(`${BASE}/command`);
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThanOrEqual(44);
        expect(data[0]).toHaveProperty('name');
        expect(data[0]).toHaveProperty('description');
        const names = data.map((c: any) => c.name);
        expect(names).toContain('init');
        expect(names).toContain('review');
    }, 15000);

    it('GET /skill returns 35+ skills', async () => {
        const data = await requestJson<any>(`${BASE}/skill`);
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThanOrEqual(35);
        const names = data.map((s: any) => s.name);
        expect(names).toContain('super-research');
        expect(names).toContain('arxiv');
    }, 15000);

    it('GET /session returns an array', async () => {
        const sessions = await requestJson<any>(`${BASE}/session`);
        expect(Array.isArray(sessions)).toBe(true);
    }, 10000);

    it('GET /session/:id/message returns messages with parts', async () => {
        const sessions = await requestJson<any>(`${BASE}/session`);
        expect(Array.isArray(sessions)).toBe(true);
        if (!sessions.length) { console.warn('no sessions, skip'); return; }
        const sid = sessions[0].id;
        const info = await requestJson<any>(`${BASE}/session/${sid}`);
        expect(info).toHaveProperty('id', sid);
        const messages = await requestJson<any[]>(`${BASE}/session/${sid}/message?limit=2`);
        expect(Array.isArray(messages)).toBe(true);
        if (messages.length) {
            const msg = messages[0];
            expect(msg).toHaveProperty('info');
            expect(['user', 'assistant']).toContain(msg.info.role);
            expect(Array.isArray(msg.parts)).toBe(true);
        }
    }, 15000);
});
