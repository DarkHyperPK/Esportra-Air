import React, { useEffect, useRef } from 'react';

/**
 * Focus-trapped confirmation dialog.
 * Esc → onCancel. Enter does not submit (accidental confirm prevention).
 * confirmVariant: 'destructive' | 'primary'
 */
export default function ConfirmDialog({
  title,
  body,
  confirmLabel,
  confirmVariant = 'destructive',
  onConfirm,
  onCancel,
  confirming = false,
  errorText = null,
}) {
  const dialogRef = useRef(null);
  const cancelBtnRef = useRef(null);

  // Focus the Cancel button on open (safer default for destructive flows)
  useEffect(() => {
    cancelBtnRef.current?.focus();
  }, []);

  // Recapture focus when it escapes the dialog (e.g. backdrop click moves focus to body)
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    function handleFocusIn(e) {
      if (!el.contains(e.target)) cancelBtnRef.current?.focus();
    }
    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, []);

  // Focus trap + keyboard handling
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;

    function handleKeyDown(e) {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); return; }
      if (e.key === 'Enter') { e.preventDefault(); return; }
      if (e.key !== 'Tab') return;

      const focusable = Array.from(
        el.querySelectorAll('button:not(:disabled), [tabindex]:not([tabindex="-1"])')
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const confirmBtnClass = confirmVariant === 'destructive'
    ? 'confirm-destructive-btn'
    : 'air-primary-btn';

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <div className="confirm-dialog" ref={dialogRef}>
        <div className="confirm-dialog-title" id="dialog-title">{title}</div>
        <div className="confirm-dialog-body">{body}</div>
        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="air-ghost-btn air-ghost-btn--36"
            ref={cancelBtnRef}
            onClick={onCancel}
            disabled={confirming}
          >
            Cancel
          </button>
          <button
            type="button"
            className={confirmBtnClass}
            onClick={onConfirm}
            disabled={confirming}
          >
            {confirming && <span className="air-spinner" aria-label="Working" />}
            {confirming ? 'Working…' : confirmLabel}
          </button>
        </div>
        {errorText && (
          <div className="confirm-dialog-error" role="alert">{errorText}</div>
        )}
      </div>
    </div>
  );
}
