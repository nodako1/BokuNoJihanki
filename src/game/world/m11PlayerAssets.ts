import { createArtDefs, createSvg } from './m11AssetFactory';

type Direction = 'down' | 'up' | 'left' | 'right';

function frontOrBack(direction: 'down' | 'up', step: number): string {
  const leftLeg = step === 0 ? 0 : 5;
  const rightLeg = step === 0 ? 5 : 0;
  const leftArm = step === 0 ? -3 : 4;
  const rightArm = step === 0 ? 4 : -3;
  const face = direction === 'down'
    ? `<circle cx="47" cy="55" r="2.7" fill="#34271f"/><circle cx="65" cy="55" r="2.7" fill="#34271f"/>
       <path d="M49 64 Q56 69 63 64" fill="none" stroke="#b96657" stroke-width="2.5" stroke-linecap="round"/>
       <path d="M52 59 H60" stroke="#d39476" stroke-width="1.5" opacity=".55"/>`
    : `<path d="M35 52 Q56 30 77 52 V68 Q56 83 35 68Z" fill="#30241f"/>
       <path d="M39 69 Q56 79 73 69" fill="none" stroke="#5b3a2c" stroke-width="4"/>`;

  return `<g filter="url(#soft-shadow)">
    <ellipse cx="56" cy="150" rx="31" ry="7" fill="#17353d" opacity=".2"/>
    <path d="M42 ${112 + leftLeg} L38 143" stroke="url(#skin)" stroke-width="12" stroke-linecap="round"/>
    <path d="M69 ${112 + rightLeg} L75 143" stroke="url(#skin)" stroke-width="12" stroke-linecap="round"/>
    <path d="M31 143 Q39 137 50 144 L49 151 H27Z" fill="#f3f0e8" stroke="#31404a" stroke-width="3"/>
    <path d="M65 144 Q74 137 86 143 L88 151 H62Z" fill="#f3f0e8" stroke="#31404a" stroke-width="3"/>
    <path d="M34 101 Q56 92 78 101 L75 124 L60 123 L56 105 L52 123 L36 124Z" fill="url(#shorts)" stroke="#243f58" stroke-width="3"/>
    <path d="M35 78 L${22 + leftArm} 104" stroke="url(#skin)" stroke-width="12" stroke-linecap="round"/>
    <path d="M77 78 L${90 + rightArm} 104" stroke="url(#skin)" stroke-width="12" stroke-linecap="round"/>
    <path d="M32 77 Q56 67 80 77 L78 107 Q56 116 34 107Z" fill="url(#shirt)" stroke="#7f4e3c" stroke-width="3"/>
    <path d="M35 82 Q56 91 77 82" fill="none" stroke="#e05e4f" stroke-width="6" opacity=".92"/>
    <path d="M50 78 Q56 84 62 78" fill="none" stroke="#ffffff" stroke-width="4" opacity=".75"/>
    ${direction === 'down' ? `<circle cx="56" cy="54" r="22" fill="url(#skin)" stroke="#6f4835" stroke-width="3"/>
      <path d="M34 53 Q34 28 56 27 Q79 28 79 54 Q70 45 58 43 Q45 44 34 53Z" fill="#30241f"/>
      <path d="M38 40 Q49 25 65 31" fill="none" stroke="#49342b" stroke-width="5" stroke-linecap="round"/>${face}` : `<circle cx="56" cy="55" r="21" fill="url(#skin)" stroke="#6f4835" stroke-width="3"/>${face}`}
    <path d="M44 76 H68" stroke="#e05e4f" stroke-width="5"/>
    <path d="M78 91 Q91 96 94 111" fill="none" stroke="#6e4d36" stroke-width="4" opacity=".5"/>
  </g>`;
}

function side(step: number): string {
  const frontLeg = step === 0 ? 0 : 7;
  const backLeg = step === 0 ? 7 : 0;
  const armForward = step === 0 ? 6 : -4;
  const armBack = step === 0 ? -4 : 6;

  return `<g filter="url(#soft-shadow)">
    <ellipse cx="56" cy="150" rx="31" ry="7" fill="#17353d" opacity=".2"/>
    <path d="M50 ${111 + backLeg} L43 142" stroke="url(#skin)" stroke-width="11" stroke-linecap="round"/>
    <path d="M67 ${111 + frontLeg} L75 142" stroke="url(#skin)" stroke-width="12" stroke-linecap="round"/>
    <path d="M34 143 Q43 137 54 143 L54 151 H31Z" fill="#f3f0e8" stroke="#31404a" stroke-width="3"/>
    <path d="M66 144 Q76 136 89 142 L91 151 H63Z" fill="#f3f0e8" stroke="#31404a" stroke-width="3"/>
    <path d="M39 99 Q57 92 76 99 L74 124 L58 122 L51 106 L50 123 L36 123Z" fill="url(#shorts)" stroke="#243f58" stroke-width="3"/>
    <path d="M45 80 Q35 ${94 + armBack} 30 108" fill="none" stroke="url(#skin)" stroke-width="11" stroke-linecap="round"/>
    <path d="M70 80 Q80 ${94 + armForward} 91 105" fill="none" stroke="url(#skin)" stroke-width="12" stroke-linecap="round"/>
    <path d="M38 77 Q57 69 75 77 L78 107 Q58 114 39 106Z" fill="url(#shirt)" stroke="#7f4e3c" stroke-width="3"/>
    <path d="M42 82 Q57 90 74 82" fill="none" stroke="#e05e4f" stroke-width="6" opacity=".92"/>
    <circle cx="61" cy="54" r="22" fill="url(#skin)" stroke="#6f4835" stroke-width="3"/>
    <path d="M39 53 Q41 29 62 27 Q79 29 83 46 Q73 42 68 43 Q55 39 39 53Z" fill="#30241f"/>
    <path d="M70 51 Q78 53 82 59 Q75 62 70 60Z" fill="url(#skin)"/>
    <circle cx="72" cy="54" r="2.7" fill="#34271f"/>
    <path d="M71 64 Q76 67 80 63" fill="none" stroke="#b96657" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M47 76 H68" stroke="#e05e4f" stroke-width="5"/>
    <path d="M39 91 Q28 96 27 111" fill="none" stroke="#6e4d36" stroke-width="4" opacity=".5"/>
  </g>`;
}

function createPlayer(direction: Direction, step: number): string {
  const body = direction === 'down' || direction === 'up'
    ? frontOrBack(direction, step)
    : direction === 'right'
      ? side(step)
      : `<g transform="translate(112 0) scale(-1 1)">${side(step)}</g>`;

  return createSvg(
    112,
    160,
    body,
    `${createArtDefs(100 + step + direction.length)}
      <linearGradient id="skin" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffdfbd"/><stop offset="1" stop-color="#dfa177"/></linearGradient>
      <linearGradient id="shirt" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fffdf0"/><stop offset="1" stop-color="#ead9a7"/></linearGradient>
      <linearGradient id="shorts" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#3e7396"/><stop offset="1" stop-color="#243e58"/></linearGradient>`,
  );
}

export const M11_PLAYER_ASSETS: Record<string, string> = {
  'player-down-0': createPlayer('down', 0),
  'player-down-1': createPlayer('down', 1),
  'player-up-0': createPlayer('up', 0),
  'player-up-1': createPlayer('up', 1),
  'player-right-0': createPlayer('right', 0),
  'player-right-1': createPlayer('right', 1),
  'player-left-0': createPlayer('left', 0),
  'player-left-1': createPlayer('left', 1),
};
