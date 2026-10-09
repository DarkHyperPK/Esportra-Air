import React, { useState } from 'react';

const PRIVACY_TEXT =
  'This app collects data for all players in the observed match — including health, credits, weapons, kills, and agents. This data is processed locally and never sent to Esportra servers. The Overwolf platform used for game data capture may collect operational telemetry per Overwolf’s privacy policy.';

function PrivacyModal({ onConfirm, onCancel }) {
  return (
    <div className="privacy-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="privacy-modal-title">
      <div className="privacy-modal-card">
        <p id="privacy-modal-title" className="privacy-modal-title">Before starting broadcast</p>
        <p className="privacy-modal-body">{PRIVACY_TEXT}</p>
        <div className="privacy-modal-buttons">
          <button className="privacy-cancel-btn" onClick={onCancel} type="button">
            Cancel
          </button>
          <button className="privacy-confirm-btn" onClick={onConfirm} type="button">
            Start Broadcast
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BroadcastPanel({
  broadcastState,
  broadcastError,
  matchSelected,
  onStart,
  onStop,
}) {
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  function handleStartClick() {
    const accepted = localStorage.getItem('broadcast-privacy-accepted') === 'true';
    if (accepted) {
      onStart();
    } else {
      setShowPrivacyModal(true);
    }
  }

  function handlePrivacyConfirm() {
    localStorage.setItem('broadcast-privacy-accepted', 'true');
    setShowPrivacyModal(false);
    onStart();
  }

  function handlePrivacyCancel() {
    setShowPrivacyModal(false);
  }

  const startDisabled = !matchSelected || broadcastState === 'starting';

  return (
    <>
      <div className="broadcast-panel">
        <p className="section-header">Broadcast</p>

        {broadcastState === 'active' ? (
          <>
            <div className="broadcast-status-row">
              <span className="broadcast-dot" aria-hidden="true" />
              <span className="broadcast-active-label">Broadcast Active</span>
            </div>
            <button
              className="broadcast-stop-btn"
              onClick={onStop}
              type="button"
            >
              Stop Broadcast
            </button>
          </>
        ) : (
          <>
            {broadcastState === 'error' && broadcastError && (
              <p className="broadcast-error" role="alert">{broadcastError}</p>
            )}
            <button
              className={`broadcast-start-btn${matchSelected ? ' broadcast-start-btn--enabled' : ''}`}
              onClick={handleStartClick}
              disabled={startDisabled}
              type="button"
            >
              {broadcastState === 'starting' ? (
                <span className="spinner spinner--sm" aria-label="Starting broadcast" />
              ) : (
                'Start Broadcast'
              )}
            </button>
          </>
        )}
      </div>

      {showPrivacyModal && (
        <PrivacyModal onConfirm={handlePrivacyConfirm} onCancel={handlePrivacyCancel} />
      )}
    </>
  );
}
