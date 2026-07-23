import { useCallback, useEffect, useState } from 'react';
import { PhaserGame } from './game/PhaserGame';
import {
  publishCollisionDebug,
  publishAudioMuted,
  publishGameStarted,
  publishPreviewTime,
} from './game/gameBridge';
import { audioEngine } from './game/systems/audioEngine';
import {
  advancePreviewTime,
  GAME_DAY_START,
  getTimePhase,
} from './game/systems/timeOfDay';
import { BuildBadge } from './ui/BuildBadge';
import { GameHud } from './ui/GameHud';
import { OrientationGuard } from './ui/OrientationGuard';
import { TitleOverlay } from './ui/TitleOverlay';

export default function App(): React.JSX.Element {
  const [started, setStarted] = useState(false);
  const [previewMinutes, setPreviewMinutes] = useState(GAME_DAY_START);
  const [autoPlay, setAutoPlay] = useState(false);
  const [muted, setMuted] = useState(false);
  const [audioAvailable, setAudioAvailable] = useState(true);
  const [developerHudVisible, setDeveloperHudVisible] = useState(false);
  const [collisionDebug, setCollisionDebug] = useState(false);

  useEffect(() => {
    publishPreviewTime(previewMinutes);
    audioEngine.setPhase(getTimePhase(previewMinutes));
  }, [previewMinutes]);

  useEffect(() => {
    publishAudioMuted(muted);
  }, [muted]);

  useEffect(() => {
    if (!started || !autoPlay) return undefined;
    const timer = window.setInterval(() => {
      setPreviewMinutes((current) => advancePreviewTime(current));
    }, 1500);
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
      if (available) audioEngine.playConfirm();
    });
    setStarted(true);
    publishGameStarted();
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
      if (!next) audioEngine.playClick();
      return next;
    });
  }, []);

  const handleResetTime = useCallback((): void => {
    audioEngine.playClick();
    setPreviewMinutes(GAME_DAY_START);
  }, []);

  const handleToggleDeveloperHud = useCallback((): void => {
    audioEngine.playClick();
    setDeveloperHudVisible((current) => !current);
  }, []);

  const handleToggleCollisionDebug = useCallback((): void => {
    audioEngine.playClick();
    setCollisionDebug((current) => {
      const next = !current;
      publishCollisionDebug(next);
      return next;
    });
  }, []);

  return (
    <OrientationGuard>
      <div className="app-shell">
        <PhaserGame />
        {!started ? (
          <TitleOverlay onStart={handleStart} />
        ) : (
          <GameHud
            minutes={previewMinutes}
            autoPlay={autoPlay}
            muted={muted}
            audioAvailable={audioAvailable}
            developerHudVisible={developerHudVisible}
            collisionDebug={collisionDebug}
            onStepTime={handleStepTime}
            onToggleAutoPlay={handleToggleAutoPlay}
            onToggleMuted={handleToggleMuted}
            onResetTime={handleResetTime}
            onToggleDeveloperHud={handleToggleDeveloperHud}
            onToggleCollisionDebug={handleToggleCollisionDebug}
          />
        )}
        <BuildBadge />
      </div>
    </OrientationGuard>
  );
}
