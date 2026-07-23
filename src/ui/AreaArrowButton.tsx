import { useEffect, useState } from 'react';
import {
  AREA_PROMPT_EVENT,
  readAreaPrompt,
  requestAreaTraversal,
  type AreaPromptState,
} from '../game/gameBridge';

export function AreaArrowButton(): React.JSX.Element | null {
  const [prompt, setPrompt] = useState<AreaPromptState>(readAreaPrompt);

  useEffect(() => {
    const handlePrompt = (event: Event): void => {
      setPrompt((event as CustomEvent<AreaPromptState>).detail);
    };
    window.addEventListener(AREA_PROMPT_EVENT, handlePrompt);
    return () => window.removeEventListener(AREA_PROMPT_EVENT, handlePrompt);
  }, []);

  if (!prompt.visible || !prompt.direction) return null;

  const upward = prompt.direction === 'up';
  const ariaLabel = upward ? '上のエリアへ移動' : '下のエリアへ移動';
  return (
    <button
      type="button"
      className={`area-arrow-button area-arrow-button--${prompt.direction}`}
      aria-label={ariaLabel}
      onClick={() => requestAreaTraversal(prompt.direction!)}
    >
      <span className="area-arrow-glyph" aria-hidden="true">{upward ? '↑' : '↓'}</span>
      <span className="area-arrow-label">{prompt.label}</span>
      <small>{upward ? 'W / ↑' : 'S / ↓'}</small>
    </button>
  );
}
