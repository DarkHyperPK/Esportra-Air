import React, { useState, useEffect, useCallback } from 'react';
import OverlayCard from './OverlayCard.jsx';

const SKELETON_COUNT = 24; // 3 cols × 8 rows

export default function OverlayCatalogue() {
  const [loadState, setLoadState] = useState('loading');
  // loadState: 'loading' | 'loaded' | 'error'
  const [overlays, setOverlays] = useState([]);
  const [error, setError] = useState(null);

  const fetchOverlays = useCallback(async () => {
    setLoadState('loading');
    setError(null);
    try {
      const result = await window.esportraBroadcast.hud.getOverlayList();
      if (Array.isArray(result)) {
        setOverlays(result);
        setLoadState('loaded');
      } else if (result && result.error) {
        setError(result.error);
        setLoadState('error');
      } else {
        // Unexpected shape — treat as empty loaded
        setOverlays([]);
        setLoadState('loaded');
      }
    } catch (err) {
      setError(err?.message || 'Could not load overlays.');
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    fetchOverlays();
  }, [fetchOverlays]);

  return (
    <>
      <div className="catalogue-header">
        <p className="catalogue-title">
          OVERLAYS
          {loadState === 'loaded' && (
            <span className="catalogue-count">({overlays.length})</span>
          )}
        </p>
      </div>

      <div className="catalogue-scroll">
        {loadState === 'loading' && (
          <div className="catalogue-grid" aria-label="Loading overlays" aria-busy="true">
            {Array.from({ length: SKELETON_COUNT }, (_, i) => (
              <div
                key={i}
                className="overlay-card-skeleton"
                aria-hidden="true"
              />
            ))}
          </div>
        )}

        {loadState === 'error' && (
          <div className="catalogue-error" role="alert">
            <p className="catalogue-error-text">Could not load overlays.</p>
            <button
              type="button"
              className="catalogue-retry"
              onClick={fetchOverlays}
            >
              Retry
            </button>
          </div>
        )}

        {loadState === 'loaded' && (
          <div className="catalogue-grid" aria-label={`${overlays.length} overlays`}>
            {overlays.map((overlay) => (
              <OverlayCard
                key={overlay.name}
                name={overlay.name}
                url={overlay.url}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
