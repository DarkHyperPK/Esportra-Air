// Extract the original, user-owned design brief without executing its scripts.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { JSDOM } = require('../../frag-and-book-main/node_modules/jsdom');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'index.html'));
const document = new JSDOM(source.toString()).window.document;
const clean = value => value.replace(/\s+/g, ' ').trim();
const headings = [...document.querySelectorAll('h1,h2,h3,h4')].map(element => ({
  id: element.id || element.closest('[id]')?.id || '',
  title: clean(element.textContent),
}));
const spec = document.querySelector('#spec');
const prd = document.querySelector('#prd');
const parent = document.createElement('div');
for (const section of [spec, prd]) if (section) parent.appendChild(section.cloneNode(true));
const blocks = [...parent.querySelectorAll('h1,h2,h3,h4,p,li,tr')]
  .filter(element => !element.closest('script,style,nav'))
  .map(element => element.tagName.startsWith('H')
    ? `${'#'.repeat(Number(element.tagName.slice(1)))} ${clean(element.textContent)}`
    : `${element.tagName === 'LI' ? '- ' : ''}${clean(element.textContent)}`);
const target = path.join(root, 'docs/coverage');
fs.mkdirSync(target, { recursive: true });
fs.writeFileSync(path.join(target, 'index-prd-source.md'), '# Original index.html brief\n\n' +
  `Source: D:/Esportra-Air/index.html. SHA-256: ${crypto.createHash('sha256').update(source).digest('hex')}. Extracted 14 October 2026; original remains authoritative.\n\n` + blocks.join('\n\n') + '\n');
let section = '';
const requirements = [];
for (const element of prd.querySelectorAll('h2,h3,h4,tr,p,li')) {
  if (element.tagName.startsWith('H')) section = clean(element.textContent);
  if (element.tagName === 'TR') requirements.push({ section, cells: [...element.querySelectorAll('th,td')].map(cell => clean(cell.textContent)) });
}
fs.writeFileSync(path.join(target, 'index-prd-tables.json'), JSON.stringify(requirements, null, 2));
section = '';
const epics = [];
for (const element of prd.querySelectorAll('h2,h3,h4,p,li')) {
  if (element.tagName.startsWith('H')) section = clean(element.textContent);
  if (!/^E\d+\s/.test(section) || !['P', 'LI'].includes(element.tagName)) continue;
  for (const text of clean(element.textContent).split(/(?=E\d+\.\d+\s)/)) {
    const match = text.match(/^(E\d+\.\d+)\s/);
    if (match) epics.push({ id: match[1], epic: section, requirement: text });
  }
}
fs.writeFileSync(path.join(target, 'index-prd-requirements.json'), JSON.stringify(epics, null, 2));
console.log(JSON.stringify({ sourceHash: crypto.createHash('sha256').update(source).digest('hex'), headings: headings.length, blocks: blocks.length, tables: requirements.length }));
if (process.argv.includes('--requirements')) console.log(JSON.stringify(epics, null, 2));
