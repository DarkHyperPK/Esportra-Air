// What will be imported (28 Nov, approved mock): the teams grouped with their players and the checks on each. Warnings
// never stop the import; they wait under Needs you on the roster.
import { useState } from 'react';
import type { ImportPreview, ImportTeam } from '../../../shared/sheet-import.ts';

type Filter = 'all' | 'needs' | 'new' | 'updates';
const needsLook = (t: ImportTeam) => t.checks.length > 0 || t.players.some((p) => p.checks.length > 0);

export function ImportTable({ preview, logos, photos }: { preview: ImportPreview; /** Team keys with a logo found, when pictures were looked up. */ logos: Set<string> | null; /** Player keys with a photo found. */ photos: Set<string> | null }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const c = preview.counts;
  const teams = preview.teams.filter((t) => filter === 'all' || (filter === 'needs' ? needsLook(t) : filter === 'new' ? t.status === 'new' : t.status === 'update'));
  const isOpen = (t: ImportTeam) => open.has(t.key) || (!open.has(`!${t.key}`) && needsLook(t));
  const toggle = (t: ImportTeam) => setOpen((o) => { const n = new Set(o); if (isOpen(t)) { n.delete(t.key); n.add(`!${t.key}`); } else { n.add(t.key); n.delete(`!${t.key}`); } return n; });
  return (
    <section className="card pp-import-table" aria-label="What will be imported">
      <div className="between body-pad">
        <span className="cap">What will be imported · {c.all} teams, {preview.players} players</span>
        <div className="seg" role="tablist" aria-label="Show">
          {([['all', `All ${c.all}`], ['needs', `Needs a look ${c.needs}`], ['new', `New ${c.added}`], ['updates', `Updates library ${c.updates}`]] as Array<[Filter, string]>).map(([id, label]) => <button key={id} role="tab" aria-selected={filter === id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}
        </div>
      </div>
      <div className="scroll-x">
        <table className="lb-tbl pp-tbl">
          <thead><tr><th>Team / player</th><th>Tag</th><th>Group</th><th>UID</th><th>Role</th><th>Photo</th><th>Check</th></tr></thead>
          <tbody>
            {teams.map((t) => (
              <TeamRows key={t.key} t={t} open={isOpen(t)} toggle={() => toggle(t)} logo={logos ? logos.has(t.key) : null} photos={photos} />
            ))}
            {!teams.length && <tr><td colSpan={7} className="muted" style={{ padding: 16 }}>Nothing in this view.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="faint t-xs body-pad">Teams marked “Updates library team” already exist in Teams/Players. Importing updates them and keeps their saved colours. Warnings never stop the import; they wait under Needs you on the roster.</p>
    </section>
  );
}

function TeamRows({ t, open, toggle, logo, photos }: { t: ImportTeam; open: boolean; toggle: () => void; logo: boolean | null; photos: Set<string> | null }) {
  const warn = t.checks.length > 0;
  return (
    <>
      <tr className={`pp-team-row ${warn ? 'flag' : ''}`}>
        <td><button className="pp-fold" aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} the players of ${t.name}`} onClick={toggle}>{open ? '▾' : '▸'}</button> <b>{t.name}</b> <span className="faint t-xs">{t.counted} players{t.players.length !== t.counted ? ` + ${t.players.length - t.counted} staff` : ''}</span>{logo === false && <span className="faint t-xs"> · no logo</span>}</td>
        <td className="mono">{t.tag}</td><td>{t.group}</td><td /><td /><td />
        <td><span className="row g-1" style={{ flexWrap: 'wrap' }}>
          <span className={`pp-pill ${t.status === 'new' ? 'ok' : 'info'}`}>{t.status === 'new' ? '✓ New' : '↻ Updates library team'}</span>
          {t.checks.map((c) => <span key={c.id} className="pp-pill warn">⚠ {c.text}</span>)}
        </span></td>
      </tr>
      {open && t.players.map((p) => (
        <tr key={p.key} className={p.checks.length ? 'flag' : ''}>
          <td style={{ paddingLeft: 36 }}>{p.ign}</td><td /><td />
          <td className={`mono ${p.uid ? '' : 'warn-text'}`}>{p.uid || 'missing'}</td>
          <td>{p.role}</td>
          <td>{photos ? (photos.has(p.key) ? '✓' : <span className="faint">–</span>) : <span className="faint">·</span>}</td>
          <td>{p.checks.length ? <span className="row g-1" style={{ flexWrap: 'wrap' }}>{p.checks.map((c) => <span key={c.id + c.text} className="pp-pill warn" title={c.text}>⚠ {c.text}</span>)}</span> : '✓'}</td>
        </tr>
      ))}
    </>
  );
}
