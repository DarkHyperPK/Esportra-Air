// Help: the manual, by situation (approved mock). The same source makes the PDF for crews.
import { useState } from 'react';
import { MANUAL, fill, type Block } from '../../shared/manual.ts';
import { ACTIONS, keyLabel, keyOf } from '../../shared/keymap.ts';
import { air } from '../bridge.ts';
import type { PageProps } from '../App.tsx';

export function HelpScreen({ s, run }: Pick<PageProps, 's' | 'run'>) {
  const [open, setOpen] = useState(MANUAL[0]!.id);
  const [q, setQ] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const game = s.game?.name ?? 'your game';
  const text = (b: Block) => ('p' in b ? b.p : 'steps' in b ? b.steps.join(' ') : '');
  const list = MANUAL.filter((sec) => !q.trim() || `${sec.title} ${sec.blocks.map(text).join(' ')}`.toLowerCase().includes(q.trim().toLowerCase()));
  const section = MANUAL.find((x) => x.id === open) ?? MANUAL[0]!;
  const label = (id: string) => ACTIONS.find((a) => a.id === id)?.label ?? id;
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="between">
        <div><h1 className="title-lg">Running a show</h1><p className="muted">The same manual is available as a PDF for your crew. The keys shown are this PC’s.</p></div>
        <span className="row-gap">
          {saved && <span className="muted t-sm">Saved: {saved}</span>}
          <button className="btn" onClick={async () => { try { const where = await air.saveManualPdf(); setSaved(where); } catch (e) { await run(async () => { throw e; }); } }}>Save as PDF</button>
        </span>
      </div>
      <div className="manual">
        <nav className="stack" style={{ gap: 2 }} aria-label="Manual sections">
          <input className="cell" aria-label="Search the manual" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 8 }} />
          {list.map((x) => <button key={x.id} className="manual-link" aria-current={x.id === section.id ? 'true' : undefined} onClick={() => setOpen(x.id)}>{x.title}</button>)}
          {list.length === 0 && <p className="muted t-sm">Nothing matches.</p>}
        </nav>
        <article aria-label={section.title}>
          <h2 className="title-md">{section.title}</h2>
          {section.blocks.map((b, i) => (
            'p' in b ? <p key={i}>{fill(b.p, s.keymap, game)}</p>
              : 'steps' in b ? <ol key={i}>{b.steps.map((x, j) => <li key={j}>{fill(x, s.keymap, game)}</li>)}</ol>
                : <dl key={i} className="manual-keys">{b.keys.map((id) => <div key={id}><dt>{label(id)}</dt><dd><span className="kbd">{keyLabel(keyOf(s.keymap, id))}</span></dd></div>)}</dl>
          ))}
        </article>
      </div>
    </div>
  );
}
