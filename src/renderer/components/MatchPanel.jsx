import React, { useState, useMemo } from 'react';

// Flatten tournament/match tree from API response into a flat list.
function flattenMatches(tournaments) {
  if (!Array.isArray(tournaments)) return [];
  return tournaments.flatMap((t) =>
    (Array.isArray(t.matches) ? t.matches : []).map((m) => ({
      matchId: String(m.id),
      matchName: m.name || `Match ${m.id}`,
      tournamentName: t.name || '',
      tournamentSlug: t.slug || '',
      status: (m.status || '').toLowerCase(),
    }))
  );
}

function StatusPill({ status }) {
  const isLive = status === 'live';
  return (
    <span className={`match-status-pill ${isLive ? 'match-status-pill--live' : 'match-status-pill--other'}`}>
      {isLive ? 'Live' : status === 'upcoming' ? 'Upcoming' : status || 'Unknown'}
    </span>
  );
}

export default function MatchPanel({
  matchLoadState,
  matchLoadError,
  tournaments,
  selectedMatch,
  onSelectMatch,
  onChangeMatch,
}) {
  const [search, setSearch] = useState('');
  const [selectError, setSelectError] = useState(null);
  const [selecting, setSelecting] = useState(false);

  const allMatches = useMemo(() => flattenMatches(tournaments), [tournaments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allMatches;
    return allMatches.filter(
      (m) =>
        m.matchName.toLowerCase().includes(q) ||
        m.tournamentName.toLowerCase().includes(q)
    );
  }, [allMatches, search]);

  async function handleMatchClick(tournamentSlug, matchId) {
    setSelecting(true);
    setSelectError(null);
    const error = await onSelectMatch(tournamentSlug, matchId);
    setSelecting(false);
    if (error) {
      setSelectError(error);
    }
  }

  function handleChangeMatch() {
    setSelectError(null);
    onChangeMatch();
  }

  // ── Skeleton ──────────────────────────────────────────────────────────────
  if (matchLoadState === 'loading') {
    return (
      <section className="match-section">
        <p className="section-header">MATCH</p>
        <ul className="match-skeleton-list" aria-label="Loading matches">
          <li className="match-skeleton-row" aria-hidden="true" />
          <li className="match-skeleton-row" aria-hidden="true" />
          <li className="match-skeleton-row" aria-hidden="true" />
        </ul>
      </section>
    );
  }

  // ── Load error ────────────────────────────────────────────────────────────
  if (matchLoadState === 'error') {
    return (
      <section className="match-section">
        <p className="section-header">MATCH</p>
        <p className="match-load-error">{matchLoadError || 'Could not load matches.'}</p>
      </section>
    );
  }

  // ── Selected match ────────────────────────────────────────────────────────
  if (selectedMatch) {
    const status = (selectedMatch.status || '').toLowerCase();
    return (
      <section className="match-section">
        <p className="section-header">MATCH</p>
        <div className="match-selected-card">
          <p className="match-selected-name">{selectedMatch.name || `Match ${selectedMatch.id}`}</p>
          <p className="match-selected-tournament">{selectedMatch.tournamentName || selectedMatch.tournament_name || ''}</p>
          <StatusPill status={status} />
        </div>
        <button
          type="button"
          className="text-link"
          onClick={handleChangeMatch}
        >
          Change match
        </button>
        {selectError && (
          <p className="match-select-error" role="alert">{selectError}</p>
        )}
      </section>
    );
  }

  // ── Match list ────────────────────────────────────────────────────────────
  return (
    <section className="match-section">
      <p className="section-header">MATCH</p>
      <div className="match-search">
        <label className="form-label" htmlFor="match-search" style={{ display: 'none' }}>
          Search matches
        </label>
        <input
          id="match-search"
          type="search"
          className="form-input"
          placeholder="Search matches…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={selecting}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="match-empty">No active matches</p>
      ) : (
        <ul className="match-list" role="list" aria-label="Active matches">
          {filtered.map((m) => (
            <li key={`${m.tournamentSlug}-${m.matchId}`}>
              <button
                type="button"
                className="match-list-item"
                onClick={() => handleMatchClick(m.tournamentSlug, m.matchId)}
                disabled={selecting}
                aria-label={`${m.matchName} — ${m.tournamentName}`}
              >
                <span className="match-item-name">{m.matchName}</span>
                <span className="match-item-tournament">{m.tournamentName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectError && (
        <p className="match-select-error" role="alert">{selectError}</p>
      )}
    </section>
  );
}
