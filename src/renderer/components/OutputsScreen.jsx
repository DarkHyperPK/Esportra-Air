import React, { useState, useCallback } from 'react';
import AirShell from './air/AirShell.jsx';
import OutputRow from './air/OutputRow.jsx';
import ConfirmDialog from './air/ConfirmDialog.jsx';

const NAV = [
  { id: 'readiness', label: 'Readiness' },
  { id: 'producer',  label: 'Producer' },
  { id: 'outputs',   label: 'Outputs' },
];

function buildUrl(output, mode, nodeIp) {
  if (!output?.url) return null;
  try {
    const u = new URL(output.url);
    const port = u.port || '5300';
    u.host = mode === 'lan' && nodeIp ? `${nodeIp}:${port}` : `localhost:${port}`;
    return u.toString();
  } catch {
    return output.url;
  }
}

export default function OutputsScreen({ status, airApi, onScreenChange }) {
  const [addressMode, setAddressMode] = useState('local');
  const [regenTarget, setRegenTarget] = useState(null);
  const [regenState, setRegenState]   = useState('idle');
  const [regenError, setRegenError]   = useState('');
  const [regenNotice, setRegenNotice] = useState(false);

  const outputs  = status?.outputs ?? null;
  const nodeIp   = status?.nodeIp   ?? null;

  const handleRegenOpen   = useCallback((o) => { setRegenTarget(o); setRegenState('idle'); setRegenError(''); }, []);
  const handleRegenCancel = useCallback(() => { setRegenTarget(null); setRegenState('idle'); setRegenError(''); }, []);

  const handleRegenConfirm = useCallback(async () => {
    if (!regenTarget) return;
    setRegenState('working');
    try {
      await new Promise((r) => setTimeout(r, 800)); // P0 stub
      console.log('regenerate key for', regenTarget.name);
      setRegenTarget(null); setRegenState('idle');
      setRegenNotice(true);
      setTimeout(() => setRegenNotice(false), 3000);
    } catch {
      setRegenState('error');
      setRegenError('Couldn\'t regenerate. The current key is still active.');
    }
  }, [regenTarget]);

  const displayedOutputs = outputs?.map((o) => ({ ...o, url: buildUrl(o, addressMode, nodeIp) }));
  const localAddr = 'ws://localhost:5300';
  const lanAddr   = nodeIp ? `ws://${nodeIp}:5300` : 'ws://?.?.?.?:5300';
  const addrOptions = [
    { id: 'local', label: 'This PC', addr: localAddr },
    { id: 'lan',   label: 'LAN',     addr: lanAddr },
  ];

  return (
    <AirShell
      screenTitle="Outputs"
      nodeName={status?.nodeName ?? null}
      nav={NAV}
      activeTab="outputs"
      onTabChange={onScreenChange}
      contextualButton={
        <button type="button" className="air-ghost-btn"
          style={(!outputs || outputs.length === 0) ? { borderColor: 'rgba(255,255,255,.35)' } : undefined}
          onClick={() => alert('Coming soon')}>
          + Add Output
        </button>
      }
    >
      <div className="air-content">
        <div className="air-section-label">Address mode</div>
        <div className="address-mode-options">
          {addrOptions.map(({ id, label, addr }) => (
            <label key={id} className="address-mode-option">
              <div className={`address-radio${addressMode === id ? ' address-radio--selected' : ''}`}>
                {addressMode === id && <div className="address-radio-inner" />}
              </div>
              <div className="address-mode-text">
                <span className="address-mode-label">{label}</span>
                <span className="address-mode-value">{addr}</span>
              </div>
              <input type="radio" name="address-mode" value={id}
                checked={addressMode === id} onChange={() => setAddressMode(id)}
                style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} />
            </label>
          ))}
        </div>
        <div className="air-section-sep" />

        {regenNotice && (
          <div className="air-notice" role="status" aria-live="polite">
            <div className="air-notice-dot" style={{ background: '#22C55E' }} />
            <span className="air-notice-text outputs-regen-notice">Key regenerated</span>
          </div>
        )}

        <div className="outputs-table-wrap">
          <table className="outputs-table">
            <thead className="outputs-thead">
              <tr>
                <th style={{ width: 200 }}>Name</th>
                <th style={{ width: 140 }}>Type</th>
                <th>URL</th>
                <th style={{ width: 120 }}>Last accessed</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody className="outputs-tbody">
              {!outputs && Array.from({ length: 5 }, (_, i) => (
                <tr key={i}><td colSpan={5}>
                  <div className="air-skeleton" style={{ height: 24, margin: '6px 0' }} />
                </td></tr>
              ))}
              {outputs?.length === 0 && (
                <tr><td colSpan={5} style={{ padding: '20px 0' }}>
                  <span className="air-empty-state" style={{ padding: 0 }}>
                    No outputs added yet. Use Add Output above to create your first browser source.
                  </span>
                </td></tr>
              )}
              {displayedOutputs?.map((output) => (
                <OutputRow key={output.id ?? output.name} output={output} onRegenerate={handleRegenOpen} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {regenTarget && (
        <ConfirmDialog
          title="Regenerate key"
          body={<>This will immediately revoke the existing URL for{' '}
            <strong>&ldquo;{regenTarget.name}&rdquo;</strong>.{' '}
            Any OBS source using it will drop for up to 60 seconds while it reconnects.</>}
          confirmLabel="Regenerate and revoke"
          confirmVariant="destructive"
          onConfirm={handleRegenConfirm}
          onCancel={handleRegenCancel}
          confirming={regenState === 'working'}
          errorText={regenState === 'error' ? regenError : null}
        />
      )}
    </AirShell>
  );
}
