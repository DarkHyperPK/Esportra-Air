import React, { useState, useCallback, useRef } from 'react';

/**
 * Copies a URL to the clipboard. Shows "Copied" confirmation for 1.2 s.
 * url: string — the URL to copy
 * label: string — button label (default "Copy URL")
 */
export default function CopyUrlButton({ url, label = 'Copy URL' }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);

  const handleClick = useCallback(async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard access failed silently — no rose error per spec
    }
  }, [url]);

  const btnClass = `copy-url-btn${copied ? ' copy-url-btn--copied' : ''}`;

  return (
    <button
      type="button"
      className={btnClass}
      onClick={handleClick}
      disabled={!url}
    >
      {copied ? '✓' : null}
      {copied ? 'Copied' : label}
      <span
        className="copy-url-live-region"
        aria-live="assertive"
        aria-atomic="true"
      >
        {copied ? 'Copied' : ''}
      </span>
    </button>
  );
}
