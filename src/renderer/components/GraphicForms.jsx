import React, { useEffect, useState } from 'react';

const EMPTY = [];
export default function GraphicForms({ kind, show, placements = EMPTY, onClose }) {
  const [update, setUpdate] = useState(''), [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']), [percent, setPercent] = useState(50);
  const [sponsorId, setSponsorId] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const sponsors = show?.sponsors || [];
  const currentSponsor = sponsorId || sponsors[0]?.sponsorId || sponsors[0]?.id || '';
  const [placement, setPlacement] = useState(null);
  useEffect(() => { setPlacement(placements.find(item => item.sponsorId === currentSponsor && item.slotType === 'custom') || null); }, [placements, currentSponsor]);
  async function perform(action) {
    setBusy(true); setError(''); setNotice('');
    try { const result = await action(); if (!result?.ok) throw new Error(result?.error || 'Action failed.'); if (result.impression) setPlacement(result.impression.endedAt ? null : result.impression); setNotice(kind === 'sponsor' ? 'Placement recorded locally and queued for sponsor proof.' : 'HUD updated.'); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  function submit(event) {
    event.preventDefault();
    return perform(() => kind === 'sponsor'
      ? window.esportraBroadcast.runner.sponsorSlot({ action: placement ? 'end' : 'start', sponsorId: currentSponsor, slotType: 'custom' })
      : window.esportraBroadcast.graphics.fire(kind, kind === 'toast' ? { text: update } : { question, options, firstPercent: percent }));
  }
  return <form className="graphic-inline-form" onSubmit={submit} aria-label={kind === 'toast' ? 'Show update' : kind === 'poll' ? 'Show poll' : 'Sponsor read'}>
    <div className="product-page-head"><h3>{kind === 'toast' ? 'Show update' : kind === 'poll' ? 'Show poll' : 'Sponsor read'}</h3><button type="button" className="air-ghost-btn" onClick={onClose}>Close form</button></div>
    {kind === 'toast' && <label>Update text<input autoFocus className="product-input" required maxLength={180} value={update} onChange={event => setUpdate(event.target.value)} /><small>Appears on the HUD for seven seconds.</small></label>}
    {kind === 'poll' && <>
      <label>Poll question<input autoFocus className="product-input" required maxLength={120} value={question} onChange={event => setQuestion(event.target.value)} /></label>
      <div className="product-form">{options.map((option, i) => <label key={i}>Option {i + 1}<input className="product-input" required maxLength={40} value={option} onChange={event => setOptions(previous => previous.map((value, index) => index === i ? event.target.value : value))} /></label>)}<label>Option 1 percentage<input type="number" className="product-input" min="0" max="100" required value={percent} onChange={event => setPercent(Number(event.target.value))} /></label></div>
      <p>Enter results from your poll source. Option 2 uses {100 - percent}%. Air does not collect viewer votes.</p>
    </>}
    {kind === 'sponsor' && <>
      <label>Assigned sponsor<select autoFocus className="product-input" value={currentSponsor} onChange={event => setSponsorId(event.target.value)}>{sponsors.map(sponsor => <option key={sponsor.sponsorId || sponsor.id || sponsor.name} value={sponsor.sponsorId || sponsor.id || ''}>{sponsor.name}</option>)}</select></label>
      <p>{placement ? `Read started ${new Date(placement.startedAt).toLocaleTimeString()}. End it when the read finishes.` : 'Mark when the sponsor read starts and ends. These are operator-reported placements.'}</p>
      {!currentSponsor && <p>Add sponsors on the tournament Broadcast workspace, then send the updated configuration.</p>}
    </>}
    {error && <p className="broadcast-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <div className="product-actions"><button className="air-primary-btn" disabled={busy || (kind === 'sponsor' && !currentSponsor)}>{busy ? 'Working…' : kind === 'toast' ? 'Show update' : kind === 'poll' ? 'Show poll' : placement ? 'End sponsor read' : 'Start sponsor read'}</button>{kind === 'poll' && <button type="button" className="air-ghost-btn" disabled={busy} onClick={() => perform(() => window.esportraBroadcast.graphics.fire('hide-poll'))}>Hide poll</button>}</div>
  </form>;
}
