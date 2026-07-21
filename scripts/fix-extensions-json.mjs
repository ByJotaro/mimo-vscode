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
  'mimo.mimo-vscode-1.0.0-beta.196',
  'mimo.mimo-vscode-1.0.0-beta.195',
  'mimo.mimo-vscode-1.0.0-beta.194',
  'mimo.mimo-vscode-1.0.0-beta.193',
  'mimo.mimo-vscode-1.0.0-beta.192',
  'mimo.mimo-vscode-1.0.0-beta.191',
  'mimo.mimo-vscode-1.0.0-beta.190',
  'mimo.mimo-vscode-1.0.0-beta.189',
  'mimo.mimo-vscode-1.0.0-beta.188',
  'mimo.mimo-vscode-1.0.0-beta.187',
  'mimo.mimo-vscode-1.0.0-beta.186',
  'mimo.mimo-vscode-1.0.0-beta.185',
  'mimo.mimo-vscode-1.0.0-beta.184',
  'mimo.mimo-vscode-1.0.0-beta.183',
  'mimo.mimo-vscode-1.0.0-beta.182',
  'mimo.mimo-vscode-1.0.0-beta.181',
  'mimo.mimo-vscode-1.0.0-beta.180',
  'mimo.mimo-vscode-1.0.0-beta.179',
  'mimo.mimo-vscode-1.0.0-beta.178',
  'mimo.mimo-vscode-1.0.0-beta.177',
  'mimo.mimo-vscode-1.0.0-beta.176',
  'mimo.mimo-vscode-1.0.0-beta.175',
  'mimo.mimo-vscode-1.0.0-beta.174',
  'mimo.mimo-vscode-1.0.0-beta.173',
  'mimo.mimo-vscode-1.0.0-beta.172',
  'mimo.mimo-vscode-1.0.0-beta.171',
  'mimo.mimo-vscode-1.0.0-beta.170',
  'mimo.mimo-vscode-1.0.0-beta.169',
  'mimo.mimo-vscode-1.0.0-beta.168',
  'mimo.mimo-vscode-1.0.0-beta.167',
  'mimo.mimo-vscode-1.0.0-beta.166',
  'mimo.mimo-vscode-1.0.0-beta.165',
  'mimo.mimo-vscode-1.0.0-beta.164',
  'mimo.mimo-vscode-1.0.0-beta.163',
  'mimo.mimo-vscode-1.0.0-beta.162',
  'mimo.mimo-vscode-1.0.0-beta.161',
  'mimo.mimo-vscode-1.0.0-beta.160',
  'mimo.mimo-vscode-1.0.0-beta.159',
  'mimo.mimo-vscode-1.0.0-beta.158',
  'mimo.mimo-vscode-1.0.0-beta.157',
  'mimo.mimo-vscode-1.0.0-beta.156',
  'mimo.mimo-vscode-1.0.0-beta.155',
  'mimo.mimo-vscode-1.0.0-beta.154',
  'mimo.mimo-vscode-1.0.0-beta.153',
  'mimo.mimo-vscode-1.0.0-beta.152',
  'mimo.mimo-vscode-1.0.0-beta.151',
  'mimo.mimo-vscode-1.0.0-beta.150',
  'mimo.mimo-vscode-1.0.0-beta.149',
  'mimo.mimo-vscode-1.0.0-beta.148',
  'mimo.mimo-vscode-1.0.0-beta.147',
  'mimo.mimo-vscode-1.0.0-beta.146',
  'mimo.mimo-vscode-1.0.0-beta.145',
  'mimo.mimo-vscode-1.0.0-beta.144',
  'mimo.mimo-vscode-1.0.0-beta.143',
  'mimo.mimo-vscode-1.0.0-beta.142',
  'mimo.mimo-vscode-1.0.0-beta.141',
  'mimo.mimo-vscode-1.0.0-beta.140',
  'mimo.mimo-vscode-1.0.0-beta.139',
  'mimo.mimo-vscode-1.0.0-beta.138',
  'mimo.mimo-vscode-1.0.0-beta.137',
  'mimo.mimo-vscode-1.0.0-beta.136',
  'mimo.mimo-vscode-1.0.0-beta.135',
  'mimo.mimo-vscode-1.0.0-beta.134',
  'mimo.mimo-vscode-1.0.0-beta.133',
  'mimo.mimo-vscode-1.0.0-beta.132',
  'mimo.mimo-vscode-1.0.0-beta.131',
  'mimo.mimo-vscode-1.0.0-beta.130',
  'mimo.mimo-vscode-1.0.0-beta.129',
  'mimo.mimo-vscode-1.0.0-beta.128',
  'mimo.mimo-vscode-1.0.0-beta.127',
  'mimo.mimo-vscode-1.0.0-beta.126',
  'mimo.mimo-vscode-1.0.0-beta.125',
  'mimo.mimo-vscode-1.0.0-beta.124',
  'mimo.mimo-vscode-1.0.0-beta.123',
  'mimo.mimo-vscode-1.0.0-beta.122',
  'mimo.mimo-vscode-1.0.0-beta.121',
  'mimo.mimo-vscode-1.0.0-beta.120',
  'mimo.mimo-vscode-1.0.0-beta.119',
  'mimo.mimo-vscode-1.0.0-beta.118',
  'mimo.mimo-vscode-1.0.0-beta.117',
  'mimo.mimo-vscode-1.0.0-beta.116',
  'mimo.mimo-vscode-1.0.0-beta.115',
  'mimo.mimo-vscode-1.0.0-beta.114',
  'mimo.mimo-vscode-1.0.0-beta.113',
  'mimo.mimo-vscode-1.0.0-beta.112',
  'mimo.mimo-vscode-1.0.0-beta.111',
  'mimo.mimo-vscode-1.0.0-beta.110',
  'mimo.mimo-vscode-1.0.0-beta.109',
  'mimo.mimo-vscode-1.0.0-beta.108',
  'mimo.mimo-vscode-1.0.0-beta.107',
  'mimo.mimo-vscode-1.0.0-beta.106',
  'mimo.mimo-vscode-1.0.0-beta.105',
  'mimo.mimo-vscode-1.0.0-beta.104',
  'mimo.mimo-vscode-1.0.0-beta.103',
  'mimo.mimo-vscode-1.0.0-beta.102',
  'mimo.mimo-vscode-1.0.0-beta.101',
  'mimo.mimo-vscode-1.0.0-beta.100',
  'mimo.mimo-vscode-1.0.0-beta.99',
  'mimo.mimo-vscode-1.0.0-beta.98',
  'mimo.mimo-vscode-1.0.0-beta.97',
  'mimo.mimo-vscode-1.0.0-beta.96',
  'mimo.mimo-vscode-1.0.0-beta.95',
  'mimo.mimo-vscode-1.0.0-beta.94',
  'mimo.mimo-vscode-1.0.0-beta.93',
  'mimo.mimo-vscode-1.0.0-beta.92',
  'mimo.mimo-vscode-1.0.0-beta.91',
  'mimo.mimo-vscode-1.0.0-beta.90',
  'mimo.mimo-vscode-1.0.0-beta.89',
  'mimo.mimo-vscode-1.0.0-beta.88',
  'mimo.mimo-vscode-1.0.0-beta.87',
  'mimo.mimo-vscode-1.0.0-beta.86',
  'mimo.mimo-vscode-1.0.0-beta.85',
  'mimo.mimo-vscode-1.0.0-beta.84',
  'mimo.mimo-vscode-1.0.0-beta.83',
  'mimo.mimo-vscode-1.0.0-beta.82',
  'mimo.mimo-vscode-1.0.0-beta.81',
  'mimo.mimo-vscode-1.0.0-beta.80',
  'mimo.mimo-vscode-1.0.0-beta.79',
  'mimo.mimo-vscode-1.0.0-beta.78',
  'mimo.mimo-vscode-1.0.0-beta.77',
  'mimo.mimo-vscode-1.0.0-beta.76',
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
