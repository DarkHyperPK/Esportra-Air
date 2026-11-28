// Live › Sources (17 Nov): every browser source of this match's show in one list, to copy again after an OBS
// refresh or to add a graphic quickly, without going back to the Rundown. Same addresses as Rundown's.
import { useState } from 'react';
import type { Snapshot } from '../../shared/api.ts';
import { browserSource, type SourceLinks } from '../../shared/browser-source.ts';
import { pageHost } from '../../shared/graphics-lan.ts';
import { air } from '../bridge.ts';

export interface SourceEntry { key: string; label: string; look: string | null; links: SourceLinks }

/** The show's sources in Rundown order, one per graphic and look. */
export function liveSources(s: Snapshot): SourceEntry[] {
  const port = s.engine.port ?? 0;
  const seen = new Set<string>();
  const out: SourceEntry[] = [];
  for (const r of s.rundown) {
    if (!r.enabled || !r.show) continue;
    const links = browserSource(port, s.setup.screens, r, pageHost(s.graphicsLan));
    if (!links || seen.has(links.url)) continue;
    seen.add(links.url);
    const screen = s.setup.screens.find((x) => x.id === r.show);
    out.push({ key: r.id, label: screen?.title ?? r.show, look: links.always ? (r.style === 'band' ? 'Overlay bar' : 'Full screen') : null, links });
  }
  return out;
}

function CopyLink({ url, label }: { url: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button className="btn small" title={url} onClick={() => void air.copy(url).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }, () => setDone(false))}>
      {done ? 'Copied' : label}
    </button>
  );
}

export function LiveSources({ s, close }: { s: Snapshot; close: () => void }) {
  const list = liveSources(s);
  return (
    <div className="scrim right" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="editor all-graphics" role="dialog" aria-modal="true" aria-label="Browser sources">
        <header><h2 className="title-md">Browser sources</h2><button className="btn quiet small" onClick={close}>Esc</button></header>
        <div className="editor-body">
          <p className="muted t-sm">Paste into OBS as a browser source, 1920 × 1080. Each follows the match selected in Air. <b>Copy</b> shows the graphic while Air has it on air; <b>Always on</b> shows it all the time.</p>
          {s.graphicsLan.on && <p className="notice t-sm" role="status">These addresses use this PC\u2019s network address{s.graphicsLan.address ? ` (${s.graphicsLan.address})` : ''}, so OBS or vMix on another PC can load them. Other PCs can only look at graphics.</p>}
          {list.length === 0 && <p className="faint t-sm">This match's Rundown has no graphics yet.</p>}
          <ul className="live-src">
            {list.map((x) => (
              <li key={x.key}>
                <span><b>{x.label}</b>{x.look && <span className="faint t-xs"> · {x.look}</span>}</span>
                <span className="row-gap">
                  <CopyLink url={x.links.url} label="Copy" />
                  {x.links.always && <CopyLink url={x.links.always} label="Always on" />}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
