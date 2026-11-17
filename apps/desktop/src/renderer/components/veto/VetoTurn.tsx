import { teamAt, title, type VetoModel } from './model.ts';

/** Whose turn it is and what they do, in one line. */
export function VetoTurn({ v }: { v: VetoModel }) {
  const tag = (t: 0 | 1) => v.m.teams[t].tag || v.m.teams[t].name;
  let say: React.ReactNode, color = 'var(--amber)', meta = '';
  if (v.sideAt >= 0) {
    const step = v.md.veto[v.sideAt]!;
    color = v.m.teams[v.sideTeam!].color;
    say = <><em>{tag(v.sideTeam!)}</em> chooses the side on {title(step.map)}</>;
    meta = step.action === 'decider' ? 'Decider' : `Map ${v.maps.findIndex((x) => x.map === step.map) + 1}`;
  } else if (!v.next) {
    say = 'The veto is complete';
    color = 'var(--ok)';
  } else if (v.next.action === 'decider') {
    say = v.open.length === 1 ? <>Decider: {title(v.open[0]!)}</> : 'Decider: click the map left';
    meta = 'The last map standing';
  } else {
    const t = teamAt(v, v.md.veto.length) as 0 | 1;
    color = v.m.teams[t].color;
    const pickNo = v.md.veto.filter((x) => x.action === 'pick').length + 1;
    say = <><em>{tag(t)}</em> {v.next.action === 'ban' ? 'bans' : `picks map ${pickNo}`}</>;
    meta = `Step ${v.md.veto.length + 1} of ${v.order.length} · click a map`;
  }
  return (
    <div className="vp-turn" style={{ ['--c' as string]: color }} role="status">
      <span className="vp-say">{say}</span>
      {meta && <span className="faint t-sm">{meta}</span>}
    </div>
  );
}
