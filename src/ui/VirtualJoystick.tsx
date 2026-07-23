import { useCallback, useRef, useState } from 'react';
import { clearVirtualInput, setVirtualInput } from '../game/gameBridge';

const MAX_DISTANCE = 58;

export function VirtualJoystick(): React.JSX.Element {
  const baseRef = useRef<HTMLDivElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const updateFromPointer = useCallback((clientX: number): void => {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const rawX = clientX - (rect.left + rect.width / 2);
    const x = Math.max(-MAX_DISTANCE, Math.min(MAX_DISTANCE, rawX));
    setKnob({ x, y: 0 });
    setVirtualInput({ x: x / MAX_DISTANCE, y: 0, active: true });
  }, []);

  const release = useCallback((element?: HTMLElement): void => {
    if (pointerIdRef.current !== null && element?.hasPointerCapture(pointerIdRef.current)) {
      element.releasePointerCapture(pointerIdRef.current);
    }
    pointerIdRef.current = null;
    setKnob({ x: 0, y: 0 });
    clearVirtualInput();
  }, []);

  return (
    <div
      ref={baseRef}
      className="virtual-joystick"
      aria-label="左右移動スティック"
      onPointerDown={(event) => {
        if (pointerIdRef.current !== null) return;
        pointerIdRef.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        updateFromPointer(event.clientX);
      }}
      onPointerMove={(event) => {
        if (pointerIdRef.current !== event.pointerId) return;
        updateFromPointer(event.clientX);
      }}
      onPointerUp={(event) => release(event.currentTarget)}
      onPointerCancel={(event) => release(event.currentTarget)}
      onLostPointerCapture={() => release()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span className="joystick-guide" aria-hidden="true" />
      <span
        className="joystick-knob"
        aria-hidden="true"
        style={{ transform: `translate3d(${knob.x}px, ${knob.y}px, 0)` }}
      />
    </div>
  );
}
