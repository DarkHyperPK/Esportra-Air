// The match page (approved 12 Nov): a match opened from its event, with its steps. The list of matches
// lives in the event (Events). The New match wizard opens here, for the event it was started from.
import { useEffect, useState } from 'react';
import type { ActionId } from '../../shared/api.ts';
import { NewMatchWizard } from '../components/NewMatch.tsx';
import { air } from '../bridge.ts';
import type { MatchCommand, MatchStep, PageProps } from '../App.tsx';
import type { EventView } from './EventsScreen.tsx';
import { MatchWorkspace } from './MatchWorkspace.tsx';

export function ReadyScreen({ s, run, go, askCapture, openSignIn, start, command, open, setOpen, openEvent }: PageProps & {
  start: () => void; command?: MatchCommand; open: boolean; setOpen: (open: boolean) => void; openEvent: (tab: EventView['tab']) => void;
}) {
  const [wizard, setWizard] = useState<{ eventId: string | null } | null>(null);
  const [step, setStep] = useState<MatchStep>('ready');
  const [focus, setFocus] = useState<string | null>(null);
  // Commands: the New match wizard for an event, or a step of the open match (palette, old links).
  useEffect(() => {
    if (!command) return;
    if (command.name === 'new-match') return setWizard({ eventId: command.eventId ?? null });
    const name = command.name === 'myshow' || command.name === 'autopilot' ? 'rundown' : command.name;
    setStep(name);
    setFocus(command.screen ?? null);
    setOpen(true);
  }, [command]);

  const act = (id: ActionId) => {
    if (id === 'start-capture') return askCapture();
    if (id === 'download-art') return void run(() => air.artDownload());
    if (id === 'connect-obs' || id === 'open-sources') return setStep('obs');
    if (id === 'choose-match') return openEvent('matches');
    if (id === 'add-casters') return setStep('talent');
    if (id === 'open-devices') return setStep('devices');
    if (id === 'sign-in') return openSignIn();
    if (id === 'install-graphics') void run(() => air.installGraphics());
  };

  const wizardEl = wizard && <NewMatchWizard s={s} run={run} eventId={wizard.eventId} close={() => { setWizard(null); if (s.match) { setStep('ready'); setOpen(true); } else openEvent('matches'); }} />;
  if (!s.match || !open) {
    return (
      <>
        {!wizard && (
          <div className="empty" style={{ padding: 40 }}>
            <h2 className="title-md">No match open</h2>
            <p className="muted">Open a match from its event.</p>
            <button className="btn primary" onClick={() => go('event')}>Go to Events</button>
          </div>
        )}
        {wizardEl}
      </>
    );
  }
  return (
    <>
      <MatchWorkspace s={s} run={run} go={go} focus={focus} step={step} setStep={setStep} act={act} start={start} back={() => openEvent('matches')} openEvent={openEvent} />
      {wizardEl}
    </>
  );
}
