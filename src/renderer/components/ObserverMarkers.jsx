import React, { useEffect, useState } from 'react';
export default function ObserverMarkers({ broadcastApi, listening, connected }) {
  const [notice, setNotice] = useState('');
  async function mark(kind) {
    try { const result = await broadcastApi.marker(kind); setNotice(result.ok ? `${kind === 'replay' ? 'Replay marker' : 'Producer flag'} ${connected ? 'sent to production.' : 'buffered for production reconnect.'}` : result.error); }
    catch (_) { setNotice('Could not send marker. Check the relay connection.'); }
  }
  useEffect(() => {
    function key(event) {
      if (!listening || event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      if (document.activeElement?.matches('input,textarea,select,[contenteditable="true"]') || document.querySelector('[role="dialog"]')) return;
      if (!['F9', 'F10'].includes(event.key)) return;
      event.preventDefault(); void mark(event.key === 'F9' ? 'replay' : 'flag');
    }
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, [listening, connected, broadcastApi]);
  return <section className="observer-markers"><div className="air-section-label">Observer markers</div><div className="product-actions"><button className="air-ghost-btn" disabled={!listening || !broadcastApi?.marker} onClick={() => mark('replay')}>Mark replay · F9</button><button className="air-ghost-btn" disabled={!listening || !broadcastApi?.marker} onClick={() => mark('flag')}>Flag moment · F10</button></div>{notice && <p role="status">{notice}</p>}</section>;
}
