import React, { useState, useRef, useEffect } from 'react';

const DEFAULT_FIELDS = {
  phase: '',
  roundNumber: '',
  teamAScore: '',
  teamBScore: '',
};

// Build the HUD patch object from field list values.
function buildFieldPatch(fields, customFields) {
  const patch = {};

  if (fields.phase.trim()) {
    patch.round = patch.round || {};
    patch.round.phase = fields.phase.trim();
  }
  if (fields.roundNumber.trim()) {
    const n = parseInt(fields.roundNumber, 10);
    if (!isNaN(n)) {
      patch.round = patch.round || {};
      patch.round.number = n;
    }
  }
  if (fields.teamAScore.trim() || fields.teamBScore.trim()) {
    patch.teams = [
      fields.teamAScore.trim() !== '' ? { score: parseInt(fields.teamAScore, 10) } : {},
      fields.teamBScore.trim() !== '' ? { score: parseInt(fields.teamBScore, 10) } : {},
    ];
  }

  for (const cf of customFields) {
    if (cf.key.trim()) {
      patch[cf.key.trim()] = cf.value;
    }
  }

  return patch;
}

export default function StateEditor() {
  const [mode, setMode] = useState('fields');
  // mode: 'fields' | 'json'
  const [fields, setFields] = useState(DEFAULT_FIELDS);
  const [customFields, setCustomFields] = useState([]);
  const [jsonText, setJsonText] = useState('{}');
  const [patchState, setPatchState] = useState('idle');
  // patchState: 'idle' | 'patching' | 'success' | 'error'
  const [patchError, setPatchError] = useState(null);
  const successTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    };
  }, []);

  const isPatching = patchState === 'patching';

  // ── Determine whether Patch button should be enabled ──────────────────────
  const hasFieldValues =
    Object.values(fields).some((v) => v.trim() !== '') ||
    customFields.some((cf) => cf.key.trim() !== '');
  const hasJsonValue = jsonText.trim() !== '{}' && jsonText.trim() !== '';
  const isPatchDisabled = isPatching || (mode === 'fields' ? !hasFieldValues : !hasJsonValue);

  // ── Field update helpers ─────────────────────────────────────────────────
  function updateField(key, value) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function addCustomField() {
    setCustomFields((prev) => [...prev, { key: '', value: '' }]);
  }

  function updateCustomField(index, prop, value) {
    setCustomFields((prev) =>
      prev.map((cf, i) => (i === index ? { ...cf, [prop]: value } : cf))
    );
  }

  function removeCustomField(index) {
    setCustomFields((prev) => prev.filter((_, i) => i !== index));
  }

  // ── Patch ─────────────────────────────────────────────────────────────────
  async function handlePatch() {
    setPatchState('patching');
    setPatchError(null);

    let patch;
    if (mode === 'json') {
      try {
        patch = JSON.parse(jsonText);
      } catch {
        setPatchState('error');
        setPatchError('Invalid JSON — could not parse.');
        return;
      }
    } else {
      patch = buildFieldPatch(fields, customFields);
    }

    const result = await window.esportraBroadcast.manual.patch(patch);

    if (result.ok) {
      setPatchState('success');
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = setTimeout(() => setPatchState('idle'), 3000);
    } else {
      setPatchState('error');
      setPatchError(result.error || 'Patch failed.');
    }
  }

  // ── Toggle mode ──────────────────────────────────────────────────────────
  function toggleMode() {
    setMode((prev) => (prev === 'fields' ? 'json' : 'fields'));
    setPatchError(null);
    if (patchState === 'error') setPatchState('idle');
  }

  return (
    <>
      {/* Section header + mode toggle */}
      <div className="state-editor-header">
        <p className="section-header" style={{ marginBottom: 0 }}>STATE OVERRIDE</p>
        <button
          type="button"
          className="mode-toggle"
          onClick={toggleMode}
          aria-label={mode === 'fields' ? 'Switch to Raw JSON mode' : 'Switch to Field list mode'}
        >
          {mode === 'fields' ? 'Field list · Raw JSON' : 'Field list · Raw JSON'}
        </button>
      </div>

      {/* Editor body */}
      {mode === 'fields' ? (
        <div className="state-fields">
          <div className="state-field-row">
            <label className="state-field-label" htmlFor="field-phase">phase</label>
            <input
              id="field-phase"
              type="text"
              className="state-field-input"
              placeholder="buy | combat | end"
              value={fields.phase}
              onChange={(e) => updateField('phase', e.target.value)}
              disabled={isPatching}
            />
          </div>
          <div className="state-field-row">
            <label className="state-field-label" htmlFor="field-round">roundNumber</label>
            <input
              id="field-round"
              type="number"
              className="state-field-input"
              placeholder="0"
              value={fields.roundNumber}
              onChange={(e) => updateField('roundNumber', e.target.value)}
              disabled={isPatching}
            />
          </div>
          <div className="state-field-row">
            <label className="state-field-label" htmlFor="field-team-a">teamA.score</label>
            <input
              id="field-team-a"
              type="number"
              className="state-field-input"
              placeholder="0"
              value={fields.teamAScore}
              onChange={(e) => updateField('teamAScore', e.target.value)}
              disabled={isPatching}
            />
          </div>
          <div className="state-field-row">
            <label className="state-field-label" htmlFor="field-team-b">teamB.score</label>
            <input
              id="field-team-b"
              type="number"
              className="state-field-input"
              placeholder="0"
              value={fields.teamBScore}
              onChange={(e) => updateField('teamBScore', e.target.value)}
              disabled={isPatching}
            />
          </div>

          {/* Custom fields */}
          {customFields.map((cf, i) => (
            <div key={i} className="state-field-row">
              <input
                type="text"
                className="custom-field-key"
                placeholder="key"
                value={cf.key}
                onChange={(e) => updateCustomField(i, 'key', e.target.value)}
                disabled={isPatching}
                aria-label={`Custom field ${i + 1} key`}
              />
              <input
                type="text"
                className="state-field-input"
                placeholder="value"
                value={cf.value}
                onChange={(e) => updateCustomField(i, 'value', e.target.value)}
                disabled={isPatching}
                aria-label={`Custom field ${i + 1} value`}
              />
              <button
                type="button"
                className="custom-field-remove"
                onClick={() => removeCustomField(i)}
                disabled={isPatching}
                aria-label={`Remove custom field ${i + 1}`}
              >
                ×
              </button>
            </div>
          ))}

          <button
            type="button"
            className="add-field-btn"
            onClick={addCustomField}
            disabled={isPatching}
          >
            Add field…
          </button>
        </div>
      ) : (
        <textarea
          className="json-textarea"
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          disabled={isPatching}
          aria-label="Raw JSON patch"
          spellCheck={false}
        />
      )}

      {/* Spacer */}
      <div className="state-editor-spacer" />

      {/* Patch button */}
      <button
        type="button"
        className="patch-btn"
        onClick={handlePatch}
        disabled={isPatchDisabled}
        aria-busy={isPatching}
      >
        {isPatching
          ? <span className="spinner spinner--sm" role="status" aria-label="Patching" />
          : 'Patch'}
      </button>

      {/* Feedback */}
      <div className="patch-feedback" aria-live="polite" role="status">
        {patchState === 'success' && (
          <p className="patch-feedback--success">Patched</p>
        )}
        {patchState === 'error' && patchError && (
          <p className="patch-feedback--error" role="alert">{patchError}</p>
        )}
      </div>
    </>
  );
}
