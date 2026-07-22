import { useCallback, useEffect, useState } from 'react';
import { PhaserGame } from './game/PhaserGame';
import { publishPreviewTime } from './game/gameBridge';
import { audioEngine } from './game/systems/audioEngine';
import {
  advancePreviewTime,
  GAME_DAY_START,
  getTimePhase,
} from './game/systems/timeOfDay';
import { BuildBadge } from './ui/BuildBadge';
import { OrientationGuard } from './ui/OrientationGuard';
import { TitleOverlay } from './ui/TitleOverlay';

export default function App(): React.JSX.Element {
  const [started, setStarted] = useState(false);
  const [previewMinutes, setPreviewMinutes] = useState(GAME_DAY_START);
  const [autoPlay, setAutoPlay] = useState(true);
  const [muted, setMuted] = useState(false);
  const [audioAvailable, setAudioAvailable] = useState(true);

  useEffect(() => {
    publishPreviewTime(previewMinutes);
    audioEngine.setPhase(getTimePhase(previewMinutes));
  }, [previewMinutes]);

  useEffect(() => {
    if (!started || !autoPlay) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setPreviewMinutes((current) => advancePreviewTime(current));
    }, 620);

    return () => window.clearInterval(timer);
  }, [autoPlay, started]);

  useEffect(
    () => () => {
      audioEngine.destroy();
    },
    [],
  );

  const handleStart = useCallback((): void => {
    void audioEngine.start().then((available) => {
      setAudioAvailable(available);
      if (available) {
        audioEngine.playConfirm();
      }
    });
    setStarted(true);
  }, []);

  const handleStepTime = useCallback((): void => {
    audioEngine.playClick();
    setPreviewMinutes((current) => advancePreviewTime(current));
  }, []);

  const handleToggleAutoPlay = useCallback((): void => {
    audioEngine.playClick();
    setAutoPlay((current) => !current);
  }, []);

  const handleToggleMuted = useCallback((): void => {
    setMuted((current) => {
      const next = !current;
      audioEngine.setMuted(next);
      if (!next) {
        audioEngine.playClick();
      }
      return next;
    });
  }, []);

  const handleResetTime = useCallback((): void => {
    audioEngine.playClick();
    setPreviewMinutes(GAME_DAY_START);
  }, []);

  return (
    <OrientationGuard>
      <div className="app-shell">
        <PhaserGame />
        <TitleOverlay
          started={started}
          previewMinutes={previewMinutes}
          autoPlay={autoPlay}
          muted={muted}
          audioAvailable={audioAvailable}
          onStart={handleStart}
          onStepTime={handleStepTime}
          onToggleAutoPlay={handleToggleAutoPlay}
          onToggleMuted={handleToggleMuted}
          onResetTime={handleResetTime}
        />
        <BuildBadge />
      </div>
    </OrientationGuard>
  );
}
