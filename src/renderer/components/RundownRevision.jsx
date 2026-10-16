import React from 'react';
export default function RundownRevision({ publication, reason }) {
  if (!publication?.version && !publication?.pendingVersion) return null;
  const diff = publication.diff;
  return <div className="product-data-row" role="status" style={{ display: 'block' }}>
    <strong>Broadcast screens v{publication.version || '—'}</strong>
    {publication.pendingVersion && <>
      <p>v{publication.pendingVersion} waiting · current item stays unchanged</p>
      {diff && <p>{diff.added.length} added · {diff.changed.length} changed · {diff.removed.length} removed{diff.reordered ? ' · order changed' : ''}</p>}
      {diff && [...diff.added, ...diff.changed].slice(0, 4).length > 0 && <p>{[...diff.added, ...diff.changed].slice(0, 4).join(' · ')}</p>}
      <small>{reason || 'Upcoming items update after the next confirmed Take or Skip.'}</small>
    </>}
  </div>;
}
