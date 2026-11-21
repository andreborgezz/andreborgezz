// Gera assets/contributions.svg e assets/languages.svg a partir da API GraphQL do GitHub.
// Uso: GH_TOKEN=... node scripts/generate.mjs
import { mkdirSync, writeFileSync } from 'node:fs';

const login = process.env.PROFILE_LOGIN || process.env.GITHUB_REPOSITORY_OWNER || 'andreborgezz';
const token = process.env.PROFILE_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token) throw new Error('Defina GH_TOKEN (ou PROFILE_TOKEN).');

const FONT = "'Segoe UI', -apple-system, Helvetica, Arial, sans-serif";
const C = {
  bg: '#0d1117',
  border: '#1c2431',
  title: '#f0f6fc',
  sub: '#6e8fb8',
  muted: '#8b98a9',
  text: '#c9d4e0',
  levels: ['#151b23', '#0f3d34', '#15705c', '#22a384', '#5eead4'],
};

async function gql(query, variables = {}) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'profile-readme' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors ?? json));
  return json.data;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function card(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}">
<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="14" fill="${C.bg}" stroke="${C.border}"/>
${body}
</svg>
`;
}

// ---------- Contribuições ----------
async function contributions() {
  const to = new Date();
  const from = new Date(to);
  from.setFullYear(from.getFullYear() - 1);
  const data = await gql(
    `query($login:String!,$from:DateTime!,$to:DateTime!){
      user(login:$login){ contributionsCollection(from:$from,to:$to){ contributionCalendar{
        totalContributions weeks{ contributionDays{ date contributionLevel } } } } } }`,
    { login, from: from.toISOString(), to: to.toISOString() },
  );
  const cal = data.user.contributionsCollection.contributionCalendar;
  const levelIdx = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  const cell = 12, pitch = 14.5, x0 = 56, y0 = 76;
  const width = 860;
  const height = 214;
  let out = '';
  out += `<text x="22" y="30" fill="${C.title}" font-size="18" font-weight="700">Um ano construindo</text>`;
  out += `<text x="22" y="50" fill="${C.sub}" font-size="11">${cal.totalContributions} contribuições nos últimos 12 meses</text>`;

  let lastMonth = -1, lastLabelCol = -10;
  cal.weeks.forEach((week, w) => {
    const first = week.contributionDays[0];
    const m = new Date(first.date + 'T00:00:00Z').getUTCMonth();
    if (m !== lastMonth) {
      if (w - lastLabelCol >= 3) {
        out += `<text x="${x0 + w * pitch}" y="68" fill="${C.sub}" font-size="10">${meses[m]}</text>`;
        lastLabelCol = w;
      }
      lastMonth = m;
    }
    week.contributionDays.forEach((day) => {
      const row = new Date(day.date + 'T00:00:00Z').getUTCDay();
      out += `<rect x="${x0 + w * pitch}" y="${y0 + row * pitch}" width="${cell}" height="${cell}" rx="3" fill="${C.levels[levelIdx[day.contributionLevel]]}"/>`;
    });
  });

  [[1, 'seg'], [3, 'qua'], [5, 'sex']].forEach(([row, label]) => {
    out += `<text x="22" y="${y0 + row * pitch + 10}" fill="${C.sub}" font-size="10">${label}</text>`;
  });

  const fy = height - 22;
  out += `<text x="22" y="${fy}" fill="${C.muted}" font-size="10">Fonte: GitHub · Atualização semanal</text>`;
  const lx = width - 22;
  out += `<text x="${lx}" y="${fy}" fill="${C.muted}" font-size="10" text-anchor="end">Mais</text>`;
  C.levels.forEach((c, i) => {
    out += `<rect x="${lx - 34 - (5 - i) * 15}" y="${fy - 10}" width="11" height="11" rx="3" fill="${c}"/>`;
  });
  out += `<text x="${lx - 34 - 5 * 15 - 6}" y="${fy}" fill="${C.muted}" font-size="10" text-anchor="end">Menos</text>`;

  return card(width, height, out);
}

// ---------- Linguagens (todos os repositorios) ----------
async function languages() {
  const data = await gql(
    `query($login:String!){
      user(login:$login){ repositories(first:100, ownerAffiliations:OWNER, isFork:false){
        nodes{ name languages(first:20, orderBy:{field:SIZE,direction:DESC}){ edges{ size node{ name color } } } } } } }`,
    { login },
  );
  const totals = new Map();
  for (const repo of data.user.repositories.nodes) {
    for (const e of repo.languages.edges) {
      const cur = totals.get(e.node.name) ?? { size: 0, color: e.node.color || '#8b98a9' };
      cur.size += e.size;
      totals.set(e.node.name, cur);
    }
  }
  const all = [...totals.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.size - a.size);
  const sum = all.reduce((s, l) => s + l.size, 0) || 1;
  const top = all.slice(0, 8);
  const rest = all.slice(8).reduce((s, l) => s + l.size, 0);
  if (rest > 0) top.push({ name: 'Outras', size: rest, color: '#8b98a9' });

  const width = 860, padX = 22, barW = width - padX * 2;
  const rows = Math.ceil(top.length / 2);
  const height = 112 + rows * 26;
  let out = `<text x="${padX}" y="30" fill="${C.title}" font-size="18" font-weight="700">Linguagens mais usadas</text>`;
  out += `<text x="${padX}" y="50" fill="${C.sub}" font-size="11">Somando todos os repositórios do GitHub</text>`;

  out += `<clipPath id="bar"><rect x="${padX}" y="66" width="${barW}" height="10" rx="5"/></clipPath><g clip-path="url(#bar)">`;
  let x = padX;
  top.forEach((l) => {
    const w = (l.size / sum) * barW;
    out += `<rect x="${x.toFixed(2)}" y="66" width="${w.toFixed(2)}" height="10" fill="${l.color}"/>`;
    x += w;
  });
  out += `</g>`;

  top.forEach((l, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const lx = padX + col * (barW / 2), ly = 104 + row * 26;
    const pct = ((l.size / sum) * 100).toFixed(1);
    out += `<circle cx="${lx + 5}" cy="${ly - 4}" r="5" fill="${l.color}"/>`;
    out += `<text x="${lx + 18}" y="${ly}" fill="${C.text}" font-size="13">${esc(l.name)}</text>`;
    out += `<text x="${lx + barW / 2 - 24}" y="${ly}" fill="${C.muted}" font-size="12" text-anchor="end">${pct}%</text>`;
  });

  return card(width, height, out);
}

mkdirSync('assets', { recursive: true });
writeFileSync('assets/contributions.svg', await contributions());
writeFileSync('assets/languages.svg', await languages());
console.log('SVGs gerados em assets/');
