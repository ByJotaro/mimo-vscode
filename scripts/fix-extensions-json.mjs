/**
 * Rebuild VS Code extensions.json so mimo.mimo-vscode is registered
 * and corrupted nested {value,Count} wrappers are flattened.
 */
import fs from 'fs';
import path from 'path';

const extRoot = path.join(process.env.USERPROFILE || '', '.vscode', 'extensions');
const ej = path.join(extRoot, 'extensions.json');
const obs = path.join(extRoot, '.obsolete');

function unixPath(p) {
  let s = p.replace(/\\/g, '/');
  if (/^[A-Za-z]:/.test(s)) s = '/' + s;
  return s.toLowerCase();
}

function flatten(node, out) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const x of node) flatten(x, out);
    return;
  }
  if (typeof node !== 'object') return;
  if (node.identifier && node.identifier.id) {
    out.push(node);
    return;
  }
  if (node.value) flatten(node.value, out);
}

let old = [];
try {
  flatten(JSON.parse(fs.readFileSync(ej, 'utf8')), old);
} catch (e) {
  console.log('old_parse_err', e.message);
}

const byId = new Map();
for (const e of old) {
  if (!e?.identifier?.id) continue;
  if (e.identifier.id === 'mimo.mimo-vscode') continue;
  byId.set(e.identifier.id, e);
}

// Prefer disk folder for mimo
const preferred = [
  'mimo.mimo-vscode-1.0.0-beta.75',
  'mimo.mimo-vscode-1.0.0-beta.74',
  'mimo.mimo-vscode-1.0.0-beta.73',
  'mimo.mimo-vscode-1.0.0-beta.72',
  'mimo.mimo-vscode-1.0.0-beta.71',
  'mimo.mimo-vscode-1.0.0-beta.70',
  'mimo.mimo-vscode-1.0.0-beta.69',
  'mimo.mimo-vscode-1.0.0-beta.68',
  'mimo.mimo-vscode-1.0.0-beta.67',
  'mimo.mimo-vscode-1.0.0-beta.66',
  'mimo.mimo-vscode-1.0.0-beta.65',
  'mimo.mimo-vscode-1.0.0-beta.64',
  'mimo.mimo-vscode-1.0.0-beta.63',
  'mimo.mimo-vscode-1.0.0-beta.62',
  'mimo.mimo-vscode-1.0.0-beta.61',
  'mimo.mimo-vscode-1.0.0-beta.60',
  'mimo.mimo-vscode-1.0.0-beta.59',
  'mimo.mimo-vscode-1.0.0-beta.58',
  'mimo.mimo-vscode-1.0.0-beta.57',
  'mimo.mimo-vscode-1.0.0-beta.56',
  'mimo.mimo-vscode-1.0.0-beta.55',
  'mimo.mimo-vscode-1.0.0-beta.54',
  'mimo.mimo-vscode-1.0.0-beta.53',
  'mimo.mimo-vscode-1.0.0-beta.52',
  'mimo.mimo-vscode-1.0.0-beta.51',
  'mimo.mimo-vscode-1.0.0-beta.50',
  'mimo.mimo-vscode-1.0.0-beta.49',
  'mimo.mimo-vscode-1.0.0-beta.48',
  'mimo.mimo-vscode-1.0.0-beta.47',
  'mimo.mimo-vscode-1.0.0-beta.46',
  'mimo.mimo-vscode-1.0.0-beta.45',
  'mimo.mimo-vscode-1.0.0-beta.44',
  'mimo.mimo-vscode-1.0.0-beta.43',
  'mimo.mimo-vscode-1.0.0-beta.42',
  'mimo.mimo-vscode-1.0.0-beta.41',
  'mimo.mimo-vscode-1.0.0-beta.40',
  'mimo.mimo-vscode-1.0.0-beta.39',
  'mimo.mimo-vscode-1.0.0-beta.38',
  'mimo.mimo-vscode-1.0.0-beta.37',
  'mimo.mimo-vscode-1.0.0-beta.36',
  'mimo.mimo-vscode-1.0.0-beta.35',
  'mimo.mimo-vscode-1.0.0-beta.34',
  'mimo.mimo-vscode-1.0.0-beta.33',
  'mimo.mimo-vscode-1.0.0-beta.32',
  'mimo.mimo-vscode-1.0.0-beta.31',
  'mimo.mimo-vscode-1.0.0-beta.30',
  'mimo.mimo-vscode-1.0.0-beta.29',
  'mimo.mimo-vscode-1.0.0-beta.28',
  'mimo.mimo-vscode-1.0.0-beta.27',
  'mimo.mimo-vscode-1.0.0-beta.26',
  'mimo.mimo-vscode-1.0.0-beta.25',
  'mimo.mimo-vscode-1.0.0-beta.24',
  'mimo.mimo-vscode-1.0.0-beta.23',
  'mimo.mimo-vscode-1.0.0-beta.22',
  'mimo.mimo-vscode-1.0.0-beta.21',
  'mimo.mimo-vscode-1.0.0-beta.20',
  'mimo.mimo-vscode-1.0.0-beta.19',
  'mimo.mimo-vscode-1.0.0-beta.18',
  'mimo.mimo-vscode-1.0.0-beta.17',
  'mimo.mimo-vscode-1.0.0-beta.16',
  'mimo.mimo-vscode-1.0.0-beta.15',
  'mimo.mimo-vscode-1.0.0-beta.14',
  'mimo.mimo-vscode-1.0.0-beta.13',
  'mimo.mimo-vscode-1.0.0-beta.12',
  'mimo.mimo-vscode-1.0.0-beta.11',
  'mimo.mimo-vscode-1.0.0-beta.10',
  'mimo.mimo-vscode-1.0.0-beta.9',
  'mimo.mimo-vscode-1.0.0-beta.8',
  'mimo.mimo-vscode-1.0.0-beta.6',
  'mimo.mimo-vscode-1.0.0-beta.5',
];
let mimoFolder = preferred.find((f) => fs.existsSync(path.join(extRoot, f, 'package.json')));
if (!mimoFolder) {
  const hit = fs
    .readdirSync(extRoot)
    .find((n) => n.startsWith('mimo.mimo-vscode-') && fs.existsSync(path.join(extRoot, n, 'package.json')));
  mimoFolder = hit;
}

const out = [...byId.values()];
if (mimoFolder) {
  const dir = path.join(extRoot, mimoFolder);
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  out.push({
    identifier: { id: 'mimo.mimo-vscode' },
    version: pkg.version || '1.0.0-beta.6',
    location: { $mid: 1, path: unixPath(dir), scheme: 'file' },
    relativeLocation: mimoFolder,
    metadata: {
      installedTimestamp: Date.now(),
      pinned: false,
      source: 'vsix',
      id: 'mimo.mimo-vscode',
      publisherDisplayName: 'mimo',
      publisherId: 'mimo',
      isApplicationScoped: false,
      isMachineScoped: false,
      isBuiltin: false,
      isPreReleaseVersion: true,
      hasPreReleaseVersion: true,
      preRelease: true,
    },
  });
}

// Normalize $mid
for (const e of out) {
  if (e.location) {
    if (e.location.mid != null && e.location.$mid == null) e.location.$mid = e.location.mid;
    delete e.location.mid;
    if (e.location.$mid == null) e.location.$mid = 1;
  }
}

fs.writeFileSync(ej, JSON.stringify(out), 'utf8');
fs.writeFileSync(obs, '{}', 'utf8');
console.log(
  'ok count=',
  out.length,
  'mimo=',
  out
    .filter((x) => String(x.identifier?.id || '').includes('mimo'))
    .map((x) => `${x.identifier.id}@${x.version}`)
    .join(',')
);
