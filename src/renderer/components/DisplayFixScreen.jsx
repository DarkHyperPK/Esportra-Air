import React, { useEffect, useState } from 'react';
import AirShell from './air/AirShell.jsx';
import ActiveDisplayFixes from './ActiveDisplayFixes.jsx';
const api = window.esportraBroadcast?.displayFixes;
const LABELS = { scores: 'On-air score', series: 'Series wins', names: 'Team names & tags', player_name: 'Player display name', sides: 'Attacking / defending sides', observed: 'Observed player' };
export default function DisplayFixScreen({ status, onScreenChange }) {
  const [context, setContext] = useState(null), [field, setField] = useState('scores');
  const [binding, setBinding] = useState(null);
  const [values, setValues] = useState(null), [until, setUntil] = useState('next_round'), [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('');
  async function load() {
    try { const result = await api.get(); if (!result.ok) throw new Error(result.error); setContext(result.status); setBinding(result.context); }
    catch (failure) { setError(failure.message || 'Could not read the local match.'); }
  }
  useEffect(() => { setContext(null); setValues(null); setReason(''); void load(); }, [status?.show?.matchCode, status?.show?.id]);
  useEffect(() => { const timer = setInterval(() => { if (!busy) void load(); }, 2500); return () => clearInterval(timer); }, [busy, status?.show?.matchCode]);
  function choose(next) {
    setField(next); setReason(''); setError(''); setNotice('');
    setUntil(['names', 'sides'].includes(next) ? 'cleared' : 'next_round');
    if (next === 'player_name') {
      const choices = context.players.flatMap((players, team) => players.map((player, index) => ({ player, team, index }))).filter(item => item.player.name);
      const first = choices[0]; setValues([first?.team || 0, { index: first?.index || 0, name: first?.player.name || '' }]);
    } else setValues(next === 'observed' ? [...(context.observed || [0, 0])] : next === 'names' ? context.teams.map(team => ({ name: team.name, tag: team.tag })) : context.teams.map(team => team[next === 'scores' ? 'score' : next === 'series' ? 'series' : 'side'] || (next === 'sides' ? 'ATK' : 0)));
  }
  async function change(input) {
    setBusy(true); setError('');
    try { const result = await api.change({ input, context: binding }); if (!result.ok) throw new Error(result.error); setContext(result.status); setBinding(result.context); setValues(null); setReason(''); setNotice('On-air data updated. Esportra’s tournament records and official results are unchanged.'); }
    catch (failure) { setError(failure.message || 'Could not apply the fix.'); }
    finally { setBusy(false); }
  }
  return <AirShell screenTitle="On-air data fixes" nodeName={status?.nodeName} show={status?.show} nav={[{ id: 'readiness', label: 'Match setup' }, { id: 'producer', label: 'Live controls' }, { id: 'outputs', label: 'Advanced sources' }]} onTabChange={onScreenChange} contextualButton={<button className="air-ghost-btn" onClick={() => onScreenChange('producer')}>Back to OBS controls</button>}>
    <main className="air-content" style={{ overflowY: 'auto', padding: 32 }}>
      <h1>Fix on-air match data.</h1><p>Use the current match’s data. Overrides affect its local browser outputs.</p>
      {error && <p role="alert" className="broadcast-error">{error} <button className="air-ghost-btn" disabled={busy} onClick={() => void load()}>Retry</button></p>}
      {notice && <p role="status">{notice}</p>}
      {context?.storageWarning && <p role="alert" className="broadcast-error">{context.storageWarning}</p>}
      {!context ? <p>Waiting for local match data.</p> : <>
        <div className="product-actions">{Object.entries(LABELS).map(([value, label]) => <button className={field === value && values ? 'air-primary-btn' : 'air-ghost-btn'} key={value} disabled={busy || context.teams.length !== 2} onClick={() => choose(value)}>{label}</button>)}</div>
        {values && <form onSubmit={event => { event.preventDefault(); void change({ action: 'set', field, value: values, until, reason }); }}>
          <h2>{LABELS[field]}</h2>
          <div className="product-form">
            {field === 'scores' && context.teams.map((team, index) => <label key={index}>{team.name || `Team ${index + 1}`} · score<input className="product-input" aria-label={`Team ${index + 1} on-air score`} type="number" required min="0" max="999" value={values[index]} disabled={busy} onChange={event => setValues(previous => previous.map((value, i) => i === index ? Number(event.target.value) : value))} /></label>)}
            {field === 'series' && context.teams.map((team, index) => <label key={index}>{team.name || `Team ${index + 1}`} · series wins<input className="product-input" aria-label={`Team ${index + 1} series wins`} type="number" required min="0" max="9" value={values[index]} disabled={busy} onChange={event => setValues(previous => previous.map((value, i) => i === index ? Number(event.target.value) : value))} /></label>)}
            {field === 'player_name' && <><label>Player from received roster<select className="product-input" aria-label="Player to rename" value={`${values[0]}:${values[1].index}`} disabled={busy} onChange={event => { const [team, index] = event.target.value.split(':').map(Number); setValues([team, { index, name: context.players[team][index].name }]); }}>{context.players.flatMap((players, team) => players.map((player, index) => player.name ? <option key={`${team}:${index}`} value={`${team}:${index}`}>{context.teams[team]?.name} · {player.name}</option> : null))}</select></label><label>Broadcast display name<input className="product-input" aria-label="Player broadcast display name" required maxLength={80} value={values[1].name} disabled={busy} onChange={event => setValues([values[0], { ...values[1], name: event.target.value }])} /></label>{!context.players.flat().some(player => player.name) && <p>Waiting for the observer’s roster. Choose a received player before renaming.</p>}</>}
            {field === 'names' && values.map((team, index) => <React.Fragment key={index}><label>Team {index + 1} · name<input className="product-input" aria-label={`Team ${index + 1} display name`} required maxLength={80} value={team.name} disabled={busy} onChange={event => setValues(previous => previous.map((value, i) => i === index ? { ...value, name: event.target.value } : value))} /></label><label>Team {index + 1} · tag<input className="product-input" aria-label={`Team ${index + 1} display tag`} required maxLength={12} value={team.tag} disabled={busy} onChange={event => setValues(previous => previous.map((value, i) => i === index ? { ...value, tag: event.target.value } : value))} /></label></React.Fragment>)}
            {field === 'sides' && <label>Attacking team<select className="product-input" aria-label="Attacking team" value={values[0] === 'ATK' ? '0' : '1'} disabled={busy} onChange={event => setValues(event.target.value === '0' ? ['ATK', 'DEF'] : ['DEF', 'ATK'])}>{context.teams.map((team, index) => <option key={index} value={index}>{team.name || `Team ${index + 1}`}</option>)}</select></label>}
            {field === 'observed' && <label>Player from received roster<select className="product-input" aria-label="Observed player override" value={values.join(':')} disabled={busy} onChange={event => setValues(event.target.value.split(':').map(Number))}>{context.players.flatMap((players, team) => players.map((player, index) => player.name ? <option key={`${team}:${index}`} value={`${team}:${index}`}>{context.teams[team]?.name} · {player.name}</option> : null))}</select>{!context.players.flat().some(player => player.name) && <small>Waiting for the observer’s roster. Player focus cannot be corrected yet.</small>}</label>}
            <label>Keep override<select className="product-input" value={until} disabled={busy} onChange={event => setUntil(event.target.value)}><option value="next_round">Until next round</option><option value="cleared">Until I clear it</option></select></label>
            <label>Reason<input className="product-input" aria-label="On-air fix reason" required maxLength={500} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} /></label>
          </div>
          <p>These are current HUD values. Game values may still be waiting for the observer. Undo restores the previous override; clearing uses the latest received data.</p>
          <div className="product-actions"><button className="air-primary-btn" disabled={busy || !reason.trim() || ['observed', 'player_name'].includes(field) && !context.players.flat().some(player => player.name)}>Apply on-air fix</button><button type="button" className="air-ghost-btn" disabled={busy} onClick={() => setValues(null)}>Cancel</button></div>
        </form>}
        <ActiveDisplayFixes context={context} busy={busy} change={change} />
      </>}
    </main>
  </AirShell>;
}
