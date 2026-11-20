// Graphics studio › Game assets (20 Nov): a game's official pictures, hosted by Esportra and downloaded once.
// A licensed pack (PUBG MOBILE) needs one event to confirm its tournament licence first; the kit's rules sit
// beside the pictures. Lists show the pack's small versions only, never live pages.
import { useEffect, useMemo, useState } from 'react';
import type { Snapshot } from '../../shared/api.ts';
import { ASSET_KINDS, KIND_LABEL, isLogo, type AssetKind, type GameAsset } from '../../shared/game-assets.ts';
import { air } from '../bridge.ts';

type Run = (fn: () => Promise<void | Snapshot>) => Promise<boolean>;
type Asset = GameAsset & { src: string; thumbSrc: string };
const GAME_NAME: Record<string, string> = { pubgm: 'PUBG MOBILE' };

export function GameAssets({ s, run }: { s: Snapshot; run: Run }) {
  const [game, setGame] = useState(s.packs[0]?.game ?? 'pubgm');
  const pack = s.packs.find((p) => p.game === game);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [kind, setKind] = useState<AssetKind | 'all'>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Asset | null>(null);
  // Reload the list when the pack's version or file count changes.
  useEffect(() => { let gone = false; void air.packAssets(game).then((a) => { if (!gone) setAssets(a); }, () => setAssets([])); return () => { gone = true; }; }, [game, pack?.version, pack?.have]);
  const kinds = useMemo(() => ASSET_KINDS.filter((k) => assets.some((a) => a.kind === k)), [assets]);
  const shown = assets.filter((a) => (kind === 'all' || a.kind === kind) && (!q || a.name.toLowerCase().includes(q.toLowerCase())));
  if (!pack) return <p className="muted">No game has a pack yet.</p>;
  return (
    <div className="stack" style={{ gap: 18 }}>
      {s.packs.length > 1 && (
        <div className="seg" role="tablist" aria-label="Game">{s.packs.map((p) => <button key={p.game} role="tab" aria-selected={p.game === game} aria-pressed={p.game === game} onClick={() => setGame(p.game)}>{GAME_NAME[p.game] ?? p.game}</button>)}</div>
      )}
      {!pack.licensed ? <Licence s={s} run={run} game={game} pack={pack} /> : <PackState run={run} game={game} pack={pack} />}
      <details className="card ga-rules"><summary><b>{GAME_NAME[game] ?? game} kit rules</b> <span className="muted t-sm">Air keeps these for you on every graphic</span></summary><ul>{pack.rules.map((r) => <li key={r}>{r}</li>)}</ul></details>
      {pack.licensed && assets.length > 0 && (
        <section className="stack" style={{ gap: 12 }}>
          <div className="row g-2" style={{ flexWrap: 'wrap' }}>
            <div className="seg" role="tablist" aria-label="Kind of picture">
              <button role="tab" aria-selected={kind === 'all'} aria-pressed={kind === 'all'} onClick={() => setKind('all')}>All · {assets.length}</button>
              {kinds.map((k) => <button key={k} role="tab" aria-selected={kind === k} aria-pressed={kind === k} onClick={() => setKind(k)}>{KIND_LABEL[k]} · {assets.filter((a) => a.kind === k).length}</button>)}
            </div>
            <input className="cell" type="search" placeholder="Search pictures" aria-label="Search pictures" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 240 }} />
          </div>
          <div className="ga-grid">
            {shown.map((a) => (
              <button key={a.id} className={`ga-card ${isLogo(a.kind) ? 'logo' : ''}`} onClick={() => setOpen(a)} title={a.name}>
                <img src={a.thumbSrc} alt="" loading="lazy" decoding="async" draggable={false} />
                <span><b>{a.name}</b><small>{KIND_LABEL[a.kind]} · {a.w}×{a.h}{isLogo(a.kind) ? ' · protected' : ''}</small></span>
              </button>
            ))}
            {!shown.length && <p className="muted">No pictures match.</p>}
          </div>
        </section>
      )}
      {open && (
        <div className="scrim" role="dialog" aria-modal="true" aria-label={open.name} onClick={() => setOpen(null)} onKeyDown={(e) => { if (e.key === 'Escape') setOpen(null); }}>
          <div className="card ga-view" onClick={(e) => e.stopPropagation()}>
            <img src={open.src} alt={open.name} />
            <div className="between"><span><b>{open.name}</b><br /><span className="muted t-sm">{KIND_LABEL[open.kind]} · {open.w}×{open.h} · from the official pack{isLogo(open.kind) ? ' · used as it is: no recolouring, at least 120 px' : ' · move, scale and flip only'}</span></span><button className="btn" autoFocus onClick={() => setOpen(null)}>Close</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function Licence({ s, run, game, pack }: { s: Snapshot; run: Run; game: string; pack: Snapshot['packs'][number] }) {
  const [eventId, setEventId] = useState(s.match?.eventId ?? s.events[0]?.id ?? '');
  const [ok, setOk] = useState(false);
  const [number, setNumber] = useState('');
  return (
    <section className="card body-pad stack" style={{ gap: 12 }} aria-label="Tournament licence">
      <div><h2 className="title-sm">The {GAME_NAME[game] ?? game} pack needs a tournament licence</h2>
        <p className="muted t-sm">The official logos, characters, maps and vehicles are for licensed {GAME_NAME[game] ?? game} tournaments. Confirm it once for an event and Air downloads the pack from Esportra.</p></div>
      {s.events.length ? (
        <>
          <label className="stack g-1"><span className="cap">Event</span>
            <select className="cell" value={eventId} onChange={(e) => setEventId(e.target.value)}>{s.events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
          <label className="stack g-1"><span className="cap">Licence or application number · optional</span>
            <input className="cell" value={number} maxLength={40} onChange={(e) => setNumber(e.target.value)} placeholder="From partner.esports.pubgmobile.com" /></label>
          <label className="row g-2"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /><span>{pack.licence}</span></label>
          <div><button className="btn primary" disabled={!ok || !eventId} onClick={() => void run(() => air.eventLicence(eventId, game, { confirmed: true, number }))}>Confirm and download the pack</button></div>
        </>
      ) : <p className="muted">Create an event first; the licence belongs to an event.</p>}
    </section>
  );
}

function PackState({ run, game, pack }: { run: Run; game: string; pack: Snapshot['packs'][number] }) {
  const done = pack.total > 0 && pack.have === pack.total;
  return (
    <section className={`card between ${done ? "ok" : pack.waiting ? "warn" : ""}`} style={{ padding: "14px 18px" }} aria-label="Game pack">
      <span>
        <b>{GAME_NAME[game] ?? game} pack{pack.version ? ` · ${pack.version}` : ''}</b><br />
        <span className="muted t-sm">{done ? `Ready · ${pack.total} files on this PC` : pack.downloading ? `Downloading ${pack.have} of ${pack.total}…` : pack.waiting ?? 'Not downloaded yet'}</span>
      </span>
      {!done && !pack.downloading && <button className="btn" onClick={() => void run(() => air.packDownload(game))}>Try again</button>}
      {pack.downloading && <progress max={pack.total || 1} value={pack.have} aria-label="Download progress" />}
    </section>
  );
}
