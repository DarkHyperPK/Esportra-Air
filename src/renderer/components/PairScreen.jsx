import React, { useState, useCallback, useEffect, useRef } from 'react';
import AirShell from './air/AirShell.jsx';

const MAX_CODE_LEN = 8;

function sanitizeCode(raw) {
  // Strip everything except alphanumeric, upper-case, max 8 chars
  return raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, MAX_CODE_LEN);
}

/**
 * Screen 1: Pair
 * Shown when status.paired === false.
 * onPairSuccess: fn() — called after successful pairing so App can re-poll status.
 */
export default function PairScreen({ airApi, onPairSuccess, notice, onSettings, onIndependent }) {
  const pairedTimer=useRef(null);
  useEffect(()=>()=>clearTimeout(pairedTimer.current),[]);
  const [code, setCode] = useState('');
  const [pairState, setPairState] = useState('idle');
  // idle | checking | success | error
  const [errorMsg, setErrorMsg] = useState('');

  const handleCodeChange = useCallback((e) => {
    setCode(sanitizeCode(e.target.value));
    if (pairState === 'error') { setPairState('idle'); setErrorMsg(''); }
  }, [pairState]);

  const handlePair = useCallback(async () => {
    if (code.length < MAX_CODE_LEN || !airApi) return;
    setPairState('checking');
    setErrorMsg('');
    try {
      const result = await airApi.pair(code);
      if (result?.ok) {
        setPairState('success');
        pairedTimer.current=setTimeout(() => onPairSuccess(), 800);
      } else {
        const msg = result?.error || '';
        if (msg.includes('already')) {
          setErrorMsg('That code has already been used. Generate a new one on the Esportra website.');
        } else if (msg.includes('not found') || msg.includes('invalid') || msg.includes('expired')) {
          setErrorMsg('That code wasn\'t found. Check the code and try again. Codes expire after 10 minutes.');
        } else {
          setErrorMsg('That code wasn\'t found. Check the code and try again. Codes expire after 10 minutes.');
        }
        setPairState('error');
      }
    } catch {
      setErrorMsg('Couldn\'t reach Esportra. Check your connection and try again.');
      setPairState('error');
    }
  }, [code, airApi, onPairSuccess]);

  const isChecking = pairState === 'checking' || pairState === 'success';
  const canSubmit = code.length === MAX_CODE_LEN && !isChecking;

  return (
    <AirShell screenTitle="" showHeader={false}>
      <div className="pair-screen-content">
        <div className="pair-card">
          {onSettings && <button className="air-ghost-btn" onClick={onSettings}>PC role</button>}
          <div className="pair-card-title">Pair this node</div>
          {onIndependent && <p>Create your own matches without a tournament connection. <button className="air-ghost-btn" onClick={onIndependent}>Create independent broadcast</button></p>}
          {notice && <p role="alert">{notice}</p>}

          <div className="form-group">
            <label className="pair-field-label" htmlFor="pair-code">Pairing code</label>
            <input
              id="pair-code"
              type="text"
              className="pair-code-input"
              value={code}
              onChange={handleCodeChange}
              onKeyDown={(e) => e.key === 'Enter' && canSubmit && handlePair()}
              placeholder="_ _ _ _  _ _ _ _"
              maxLength={MAX_CODE_LEN}
              autoComplete="off"
              spellCheck="false"
              autoCorrect="off"
              autoCapitalize="characters"
              disabled={isChecking}
              aria-describedby="pair-hint"
            />
          </div>

          <p className="pair-hint" id="pair-hint">
            Enter the 8-character code from Esportra Broadcast.
          </p>

          <button
            type="button"
            className="pair-btn"
            onClick={handlePair}
            disabled={!canSubmit}
            title={!canSubmit && !isChecking ? 'Enter the 8-character pairing code first.' : undefined}
          >
            {pairState === 'checking' && <span className="air-spinner air-spinner--dark" aria-label="Pairing" />}
            {pairState === 'checking' ? 'Pairing…' : 'Pair'}
          </button>

          <div className="pair-status-area" role="status" aria-live="polite">
            {pairState === 'checking' && (
              <span className="pair-status-text pair-status-text--checking">
                Checking code…
              </span>
            )}
            {pairState === 'success' && (
              <>
                <span className="pair-status-dot" aria-hidden="true" />
                <span className="pair-status-text pair-status-text--success">
                  Paired to Esportra. Loading your node…
                </span>
              </>
            )}
            {pairState === 'error' && (
              <span
                className="pair-status-text pair-status-text--error"
                role="alert"
              >
                {errorMsg}
              </span>
            )}
          </div>
        </div>
      </div>
    </AirShell>
  );
}
