import React, { useState, useEffect, useRef } from 'react';

export default function OverlayCard({ name, url }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef(null);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function handleCopy() {
    navigator.clipboard.writeText(url).catch(() => {
      // Clipboard API may fail — silently ignore
    });
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setCopied(true);
    timeoutRef.current = setTimeout(() => setCopied(false), 2000);
  }

  function handlePreview() {
    // Fire and forget — main process opens the URL
    window.esportraBroadcast.hud.previewOverlay(url);
  }

  return (
    <div className="overlay-card" role="listitem">
      <span className="overlay-card-name" title={name}>{name}</span>
      <div className="overlay-card-actions">
        <button
          type="button"
          className="overlay-preview-btn"
          onClick={handlePreview}
          aria-label={`Preview ${name}`}
        >
          Preview
        </button>
        <button
          type="button"
          className={`overlay-copy-btn${copied ? ' overlay-copy-btn--copied' : ''}`}
          onClick={handleCopy}
          aria-label={copied ? `Copied ${name} URL` : `Copy OBS URL for ${name}`}
          aria-pressed={copied}
        >
          {copied ? 'Copied!' : 'Copy OBS URL'}
        </button>
      </div>
    </div>
  );
}
