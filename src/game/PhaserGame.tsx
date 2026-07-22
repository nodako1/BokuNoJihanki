import { useEffect, useRef } from 'react';
import { createGame } from './createGame';

export function PhaserGame(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    const game = createGame(container);
    return () => {
      game.destroy(true);
    };
  }, []);

  return <div ref={containerRef} className="game-canvas" aria-hidden="true" />;
}
