// Rundown › Copy browser source (17 Nov): one OBS browser source per row, for crews who build their own scenes.
// Air stays the cue tool: a full-screen graphic's source shows it while Air has it on air (Take, keys, autopilot).
import { useState } from 'react';
import type { Snapshot } from '../../shared/api.ts';
import { browserSource } from '../../shared/browser-source.ts';
import { air } from '../bridge.ts';

export function CopySourceButton({ open, toggle, name }: { open: boolean; toggle: () => void; name: string }) {
  return <button className="btn quiet small" aria-expanded={open} onClick={toggle} aria-label={`Browser source for ${name}`}>Browser source</button>;
}

/** The addresses for a row, each with a copy button; shown under the row while open. */
export function CopySourcePanel({ s, row }: { s: Snapshot; row: { show?: string | null; style?: 'full' | 'band'; enabled: boolean } }) {
  const links = browserSource(s.engine.port ?? 0, s.setup.screens, row);
  const [copied, setCopied] = useState<string | null>(null);
  if (!links) return <div className="rd-src faint t-sm">This row has no graphic of its own to add to OBS.</div>;
  const copy = async (which: string, url: string) => {
    try { await air.copy(url); setCopied(which); } catch { setCopied(null); }
  };
  const line = (which: string, label: string, url: string, note: string) => (
    <div className="rd-src-line">
      <span className="t-sm"><b>{label}</b> <span className="faint">· {note}</span></span>
      <span className="row-gap">
        <input className="cell mono" readOnly value={url} aria-label={`${label} address`} onFocus={(e) => e.currentTarget.select()} />
        <button className="btn small" onClick={() => void copy(which, url)}>{copied === which ? 'Copied' : 'Copy'}</button>
      </span>
    </div>
  );
  return (
    <div className="rd-src" role="group" aria-label="Browser source">
      {line('cue', links.always ? 'Follows Air' : 'Browser source', links.url, links.always ? 'shows while Air has it on air (Take, keys, autopilot)' : 'always shows; follows the selected match')}
      {links.always && line('always', 'Always on', links.always, 'shows all the time; you show and hide it in OBS')}
      <span className="faint t-xs">In OBS: Sources › + › Browser, width 1920, height 1080. It follows the match selected in Air, so add it once.{row.enabled ? '' : ' Turn this row on for the address to work.'}{copied ? ' Copied to the clipboard.' : ''}</span>
    </div>
  );
}
