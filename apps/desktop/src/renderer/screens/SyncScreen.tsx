import { Cap } from '../components/ui.tsx';

export function SyncScreen() {
  return (
    <section className="panel" style={{ maxWidth: 640 }}>
      <div className="head"><Cap>Offline and sync</Cap></div>
      <div className="body-pad stack" style={{ gap: 10 }}>
        <h2 className="title-md">Everything runs on this PC</h2>
        <p className="muted">Graphics, game data and corrections are all handled locally, so a lost connection never affects what is on air. Syncing with Esportra (tournaments, results and corrections) arrives with sign-in.</p>
      </div>
    </section>
  );
}
