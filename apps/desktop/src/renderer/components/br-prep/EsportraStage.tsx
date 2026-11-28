// Use a stage from Esportra (28 Nov, approved mock `br-prep-mock` frame 6, READ ONLY): pick a stage, see what Esportra has
// (points table, groups, lobbies and schedule), use it, then follow it. Air takes teams, players, groups, lobbies, times
// and the points table; nothing is sent back, and results stay in Air. Esportra has no game UIDs, so the producer adds
// them in Teams and players.
import { useEffect, useMemo, useState } from 'react';
import type { StageDetail, StageList, StageFollow } from '../../../main/esportra-stages.ts';
import type { Snapshot } from '../../../shared/api.ts';
import { TIEBREAK_NAME, type StagePart } from '../../../shared/br.ts';
import type { StageSummary } from '../../../shared/esportra-stage.ts';
import { air } from '../../bridge.ts';
import type { Run } from '../../App.tsx';

const PART_NAME: Record<StagePart, string> = { schedule: 'Schedule', roster: 'Teams', scoring: 'Points table' };
const initials = (n: string) => n.split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase() || '?';
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'No time yet');
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : '');
function ago(t: number | null, now: number) {
  if (!t) return 'not read yet';
  const min = Math.max(0, Math.floor((now - t) / 60_000));
  return min < 1 ? 'just now' : min < 60 ? `${min} min ago` : `${Math.round(min / 60)} h ago`;
}
function useNow(every = 15_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), every); return () => clearInterval(i); }, [every]);
  return now;
}

/** "Following Esportra · updated N min ago" and what is edited in Air, for one stage (or one lobby of it). */
export function StageChip({ s, stageId, lobbyId }: { s: Snapshot; stageId: string; lobbyId?: string }) {
  const now = useNow();
  const f = s.esportraStages.followed.find((x) => x.stageId === stageId);
  if (!f) return null;
  const edited = f.lobbies.filter((l) => !lobbyId || l.lobbyId === lobbyId).flatMap((l) => Object.keys(l.edited));
  const kind = f.error && !f.following ? 'warn' : f.unreachableSince ? 'warn' : f.following ? 'ok' : '';
  const text = !f.following ? 'Not following Esportra' : f.unreachableSince ? `Esportra offline · last read ${ago(f.readAt, now)}` : `Following Esportra · updated ${ago(f.readAt, now)}`;
  return (
    <span className="chips-row">
      <span className={`pp-chip ${kind === 'ok' ? 'ok' : kind === 'warn' ? 'partial' : ''}`} title={f.error ?? undefined}><i className={`dot ${kind || 'off'}`} />{text}</span>
      {edited.length > 0 && <span className="pp-chip partial">Edited in Air: {[...new Set(edited)].map((p) => PART_NAME[p as StagePart].toLowerCase()).join(', ')}</span>}
    </span>
  );
}

function Following({ s, run, f }: { s: Snapshot; run: Run; f: StageFollow & { lobbies: Array<{ lobbyId: string; title: string; groupId: string; edited: Partial<Record<StagePart, true>> }> } }) {
  const edited = f.lobbies.flatMap((l) => (Object.keys(l.edited) as StagePart[]).map((p) => ({ l, p })));
  return (
    <section className="card body-pad stack g-2" aria-label="Following Esportra">
      <div className="row g-2" style={{ flexWrap: 'wrap' }}>
        <StageChip s={s} stageId={f.stageId} />
        <button className="btn small" onClick={() => void run(() => air.esportraStageRefresh(f.stageId))}>Refresh now</button>
        {f.following
          ? <button className="btn quiet small" onClick={() => void run(() => air.esportraStageFollow(f.stageId, 'off'))}>Stop following</button>
          : <button className="btn small" onClick={() => void run(() => air.esportraStageFollow(f.stageId, 'all'))}>Follow Esportra again</button>}
      </div>
      {f.error && <div className="notice" role="status">{f.error}</div>}
      {edited.map(({ l, p }) => (
        <div key={l.lobbyId + p} className="row g-2 t-sm">
          <span><b>{l.title}</b> · {PART_NAME[p].toLowerCase()} edited in Air. Air no longer changes it when Esportra does.</span>
          <button className="btn quiet small" onClick={() => void run(() => air.esportraStageFollow(f.stageId, p))}>Follow Esportra again</button>
        </div>
      ))}
      {f.held.map((h) => <p key={h} className="faint t-xs">Left as it is: {h}</p>)}
      {f.notes.map((n) => <p key={n} className="faint t-xs">{n}</p>)}
    </section>
  );
}

export function EsportraStage({ s, run, eventId, back, openSignIn }: { s: Snapshot; run: Run; eventId: string; back: () => void; openSignIn: () => void }) {
  const e = s.esportra;
  const own = s.esportraStages.followed.find((f) => f.eventId === eventId);
  const [list, setList] = useState<StageList | null>(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<string | null>(own?.stageId ?? null);
  const [detail, setDetail] = useState<StageDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const event = s.events.find((x) => x.id === eventId);
  const ok = e.state === 'online' || e.state === 'offline';
  const load = async () => {
    setError('');
    try { setList(await air.esportraStages()); } catch (x) { setError(x instanceof Error ? x.message : String(x)); }
  };
  useEffect(() => { if (ok) void load(); }, [ok]);
  const followed = s.esportraStages.followed.find((f) => f.stageId === picked) ?? null;
  const readAt = followed?.readAt ?? 0;
  useEffect(() => {
    if (!picked || !ok) { setDetail(null); return; }
    let live = true;
    air.esportraStageRead(picked).then((d) => { if (live) { setDetail(d); setError(''); } }).catch((x) => { if (live) { setDetail(null); setError(x instanceof Error ? x.message : String(x)); } });
    return () => { live = false; };
  }, [picked, ok, readAt]);
  const byTournament = useMemo(() => {
    const m = new Map<string, StageSummary[]>();
    for (const st of list?.stages ?? []) m.set(st.tournamentId || st.tournamentName, [...(m.get(st.tournamentId || st.tournamentName) ?? []), st]);
    return [...m.values()];
  }, [list]);
  const stage = detail?.read.stage;
  const place = (i: number) => `${i + 1}${['st', 'nd', 'rd'][i] && ![10, 11, 12].includes(i + 1) ? ['st', 'nd', 'rd'][i] : 'th'}`;
  return (
    <div className="stack" style={{ gap: 18 }}>
      <nav className="crumb-back"><button className="btn quiet small" onClick={back}>← {event?.name ?? 'Event'}</button></nav>
      <header><h1 className="title-lg">Use a stage from Esportra</h1><p className="muted">Pick the stage you are producing. Air reads it and keeps following it. It only reads: results you save stay in Air.</p></header>
      {!ok ? (
        <section className="card body-pad stack g-2">
          {e.state === 'signed-out'
            ? <><p className="muted">Sign in to Esportra to see the stages you can produce.</p><div><button className="btn primary" onClick={openSignIn}>Sign in to Esportra</button></div></>
            : <p className="muted">{e.warning ?? 'Esportra has not confirmed Air access for this PC, so its stages cannot load.'}</p>}
        </section>
      ) : (
        <div className="pp-two" style={{ gridTemplateColumns: 'minmax(0, 0.8fr) minmax(0, 2fr)' }}>
          <div className="stack g-2" aria-label="Your Esportra tournaments">
            <div className="row g-2"><span className="cap faint">Your Esportra tournaments</span><span style={{ flex: 1 }} /><button className="btn quiet small" onClick={() => void load()}>Refresh</button></div>
            {byTournament.map((stages) => (
              <section key={stages[0]!.tournamentId + stages[0]!.stageId} className="card body-pad stack g-2">
                <div className="row g-2"><span className="lb-tag" style={{ background: 'var(--panel-2, #333)' }}>{initials(stages[0]!.tournamentName)}</span><span><b>{stages[0]!.tournamentName}</b><br /><span className="faint t-xs">{stages[0]!.startsAt ? `starts ${day(stages[0]!.startsAt)}` : 'no start date'}</span></span></div>
                {stages.map((st) => (
                  <button key={st.stageId} type="button" className="pp-opt" aria-pressed={picked === st.stageId} style={picked === st.stageId ? { borderColor: 'var(--text)' } : undefined} onClick={() => setPicked(st.stageId)}>
                    <b>{st.stageName}</b><span className="faint t-xs">{st.groupCount} group{st.groupCount === 1 ? '' : 's'} · {st.lobbyCount} lobb{st.lobbyCount === 1 ? 'y' : 'ies'}</span>
                  </button>
                ))}
              </section>
            ))}
            {list && !list.stages.length && <p className="muted t-sm">No battle royale stages you can produce yet.</p>}
            <p className="faint t-xs">Only stages you can produce are listed{list?.hidden ? `; ${list.hidden} for games Air cannot produce are left out` : ''}.</p>
            {error && !detail && <div className="notice" role="alert">{error}</div>}
          </div>
          <div className="stack" style={{ gap: 14 }}>
            {!picked && <section className="card body-pad"><p className="muted">Choose a stage on the left to see what it holds.</p></section>}
            {picked && !detail && !error && <section className="card body-pad"><p className="muted">Reading the stage…</p></section>}
            {picked && error && detail === null && null}
            {detail && stage && (
              <>
                <section className="card body-pad stack g-2" aria-label="Stage">
                  <div className="row g-2" style={{ flexWrap: 'wrap' }}>
                    <span className="lb-tag" style={{ background: 'var(--panel-2, #333)' }}>{initials(stage.tournamentName)}</span>
                    <span style={{ flex: 1 }}><h2 className="title-md">{stage.tournamentName} · {stage.stageName}</h2><span className="muted t-sm">From Esportra · {detail.read.groups.length} group{detail.read.groups.length === 1 ? '' : 's'} · {detail.read.lobbies.length} lobbies{stage.startsAt ? ` · ${day(stage.startsAt)}` : ''}</span></span>
                    {!followed && <><button className="btn quiet" onClick={() => setPicked(null)}>Cancel</button><button className="btn primary" disabled={busy} onClick={() => { setBusy(true); void run(() => air.esportraStageUse(stage.stageId, eventId)).finally(() => setBusy(false)); }}>Use this stage</button></>}
                  </div>
                  {followed && <p className="faint t-xs">In use here. Air has made a lobby for each group{event ? ` in ${event.name}` : ''}.</p>}
                </section>
                {followed && <Following s={s} run={run} f={s.esportraStages.followed.find((f) => f.stageId === picked)!} />}
                <section className="card body-pad stack g-2" aria-label="Ready from Esportra">
                  <div className="pp-chips">
                    <span className="pp-chip ok">✓ {detail.read.groups.reduce((n, g) => n + g.teams.length, 0)} teams</span>
                    <span className="pp-chip ok">✓ {detail.players} players</span>
                    <span className="pp-chip ok">✓ {detail.read.lobbies.reduce((n, l) => n + l.games.length, 0)} matches, with times and maps</span>
                    <span className="pp-chip ok">✓ Points table</span>
                    <span className={`pp-chip ${detail.uidMissing ? 'partial' : 'ok'}`}>{detail.uidMissing ? '○' : '✓'} UIDs: {detail.uidMissing ? `${detail.uidMissing} missing` : 'all added'}</span>
                  </div>
                  {detail.uidMissing > 0 && <p className="t-sm"><b>Esportra has no game UIDs.</b> Add UIDs in Teams and players ({detail.uidMissing} player{detail.uidMissing === 1 ? '' : 's'} without one): the game places a player by UID.</p>}
                </section>
                <div className="pp-two">
                  <section className="card body-pad stack g-2" aria-label="Points table">
                    <div className="row g-2"><span className="cap faint">Points table</span><span style={{ flex: 1 }} /><span className="pp-pill info">From Esportra</span></div>
                    <p className="muted t-sm">Read only. Changes are made in Esportra.</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', gap: 8 }}>
                      {detail.scoring.placement.map((p, i) => <div key={i} className="stack" style={{ gap: 2, textAlign: 'center' }}><span className="faint t-xs">{place(i)}</span><b className="mono">{p}</b></div>)}
                    </div>
                    <p className="t-sm">Per kill <b>{detail.scoring.perElim}</b>{detail.scoring.elimCap !== undefined ? ` · kill points capped at ${detail.scoring.elimCap}` : ''} · If tied: {detail.scoring.tiebreak.map((t) => TIEBREAK_NAME[t]).join(' › ') || 'shared rank'}</p>
                    {detail.notes.map((n) => <p key={n} className="faint t-xs">{n}</p>)}
                  </section>
                  <section className="card body-pad stack g-2" aria-label="Groups">
                    <span className="cap faint">Groups</span>
                    {detail.plans.map((g) => <div key={g.groupId} className="row g-2 t-sm"><b style={{ flex: 1 }}>{g.name}</b><span className="muted">{g.teams} teams</span></div>)}
                  </section>
                </div>
                <section className="card body-pad stack g-2" aria-label="Lobbies and schedule">
                  <span className="cap faint">Lobbies and schedule · {detail.plans.length}</span>
                  {detail.plans.flatMap((g) => g.days.map((d) => ({ g, d }))).map(({ g, d }) => (
                    <div key={g.groupId + d.title} className="row g-2 t-sm" style={{ borderTop: '1px solid var(--hair)', paddingTop: 8 }}>
                      <b style={{ width: 160 }}>{g.name} · {d.title}</b>
                      <span className="mono" style={{ width: 190 }}>{when(d.firstAt)}</span>
                      <span style={{ width: 90 }}>{d.games} matches</span>
                      <span className="muted">{g.games.slice(0, 12).map((x) => x.map || '—').join(', ')}</span>
                    </div>
                  ))}
                  {!detail.plans.length && <p className="muted t-sm">This stage has no groups yet.</p>}
                </section>
                <p className="card body-pad muted t-sm"><b>Results stay in Air.</b> Using the stage copies its teams, players, lobbies, times and points table into {event?.name ?? 'the event'}; Air never sends results, adjustments or status to Esportra. After it, Air reads the stage again every minute while the event is open and updates what you have not edited.</p>
              </>
            )}
            {error && detail && <div className="notice" role="alert">{error}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
