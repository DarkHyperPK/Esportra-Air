// Change picture (20 Nov): pick a game-pack picture for a picture slot. Thumbnails only; only kinds that fit the
// slot are offered (logos only in their own slot), and only packs an event has a licence for.
import { useEffect, useState } from 'react';
import type { Snapshot } from '../../shared/api.ts';
import { KIND_LABEL, type GameAsset } from '../../shared/game-assets.ts';
import { packPath } from '../../shared/game-assets.ts';
import { slotFits, type PartPicture, type SlotKind } from '../../shared/templates.ts';
import { air } from '../bridge.ts';

type Asset = GameAsset & { src: string; thumbSrc: string };
const GAME_NAME: Record<string, string> = { pubgm: 'PUBG MOBILE' };

export function AssetPicker({ s, slot, current, pick, close }: { s: Snapshot; slot: SlotKind; current?: PartPicture; pick: (p: PartPicture) => void; close: () => void }) {
  const packs = s.packs.filter((p) => p.licensed && p.total > 0);
  const [game, setGame] = useState(packs[0]?.game ?? '');
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => { if (!game) return; let gone = false; void air.packAssets(game).then((a) => { if (!gone) setAssets(a); }, () => setAssets([])); return () => { gone = true; }; }, [game]);
  const fits = (assets ?? []).filter((a) => slotFits(slot, a.kind) && (!q || a.name.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-label="Change picture" onClick={close} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}>
      <div className="card ap" onClick={(e) => e.stopPropagation()}>
        <div className="between"><b>Change picture</b><button className="btn quiet small" onClick={close}>Close</button></div>
        {!packs.length ? (
          <p className="muted t-sm">No game pack yet. Confirm the event's tournament licence in Graphics studio › Game assets, and Air downloads the pack.</p>
        ) : (
          <>
            <div className="row g-2" style={{ flexWrap: 'wrap' }}>
              {packs.length > 1 && <select className="cell" aria-label="Game" value={game} onChange={(e) => setGame(e.target.value)}>{packs.map((p) => <option key={p.game} value={p.game}>{GAME_NAME[p.game] ?? p.game}</option>)}</select>}
              <input className="cell" type="search" autoFocus placeholder="Search pictures" aria-label="Search pictures" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="ga-grid ap-grid">
              {fits.map((a) => {
                const src = packPath(game, a.file);
                return (
                  <button key={a.id} className={`ga-card ${current?.src === src ? 'on' : ''}`} title={a.name} aria-pressed={current?.src === src}
                    onClick={() => { pick({ src, kind: a.kind, ...(current?.fit ? { fit: current.fit } : {}), ...(current?.flip ? { flip: true } : {}) }); close(); }}>
                    <img src={a.thumbSrc} alt="" loading="lazy" decoding="async" draggable={false} />
                    <span><b>{a.name}</b><small>{KIND_LABEL[a.kind]}</small></span>
                  </button>
                );
              })}
              {assets === null ? <p className="muted">Loading the pack…</p> : !fits.length && <p className="muted">No pictures of this kind in the pack.</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
