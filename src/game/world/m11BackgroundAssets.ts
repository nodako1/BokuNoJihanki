import { createArtDefs, createSvg, repeat, seededPoints } from './m11AssetFactory';

function createBackgroundDefs(seed: number): string {
  return `${createArtDefs(seed)}
    <linearGradient id="grass-bg" x1="0" y1="0" x2="0" y2="1">
      <stop stop-color="#8aae67"/>
      <stop offset=".46" stop-color="#6e995d"/>
      <stop offset="1" stop-color="#557e50"/>
    </linearGradient>
    <linearGradient id="road" x1="0" y1="0" x2="0" y2="1">
      <stop stop-color="#68757a"/>
      <stop offset=".52" stop-color="#515f66"/>
      <stop offset="1" stop-color="#3f4e55"/>
    </linearGradient>
    <linearGradient id="sidewalk" x1="0" y1="0" x2="0" y2="1">
      <stop stop-color="#ded4bf"/>
      <stop offset="1" stop-color="#b9ad98"/>
    </linearGradient>
    <linearGradient id="dirt" x1="0" y1="0" x2="0" y2="1">
      <stop stop-color="#c7a36f"/>
      <stop offset="1" stop-color="#967550"/>
    </linearGradient>
    <pattern id="asphalt-speck" width="42" height="42" patternUnits="userSpaceOnUse">
      <circle cx="8" cy="11" r="1.3" fill="#dbe3e3" opacity=".16"/>
      <circle cx="31" cy="27" r="1" fill="#121e24" opacity=".18"/>
      <path d="M3 34 L13 31 M24 7 L34 5" stroke="#f0f3ed" stroke-width="1" opacity=".08"/>
    </pattern>
    <pattern id="paving" width="48" height="30" patternUnits="userSpaceOnUse">
      <rect width="48" height="30" fill="none"/>
      <path d="M0 0 H48 M0 30 H48 M0 0 V30 M24 0 V30 M48 0 V30" stroke="#796f63" stroke-width="1" opacity=".18"/>
    </pattern>
    <pattern id="grass-lines" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M8 29 Q10 20 13 27 M23 31 Q21 22 18 27 M29 17 Q27 10 24 15" fill="none" stroke="#e2edbd" stroke-width="1.2" opacity=".22"/>
    </pattern>
  `;
}

function residentialBackground(east: boolean): string {
  const seed = east ? 28 : 17;
  const grassPoints = seededPoints(110, seed, 1280, 410)
    .map(({ x, y, r }) => `<circle cx="${x}" cy="${70 + y}" r="${r * 0.58}" fill="#d5e7a6" opacity=".18"/>`)
    .join('\n');
  const laneCenter = east ? 930 : 735;
  const laneLeftTop = laneCenter - 96;
  const laneRightTop = laneCenter + 84;
  const laneLeftBottom = laneCenter - 154;
  const laneRightBottom = laneCenter + 174;
  const manholeX = east ? 470 : 1040;

  const distantRoofs = repeat(7, (index) => {
    const x = -70 + index * 210 + (index % 2) * 24;
    const roof = index % 3 === 0 ? '#4e6571' : index % 3 === 1 ? '#865b4a' : '#5d6d55';
    return `<g opacity=".54">
      <path d="M${x} 145 L${x + 96} ${70 + (index % 2) * 18} L${x + 194} 145 Z" fill="${roof}"/>
      <rect x="${x + 24}" y="138" width="148" height="55" rx="5" fill="#c9bf9f"/>
    </g>`;
  });

  const curbBlocks = repeat(28, (index) => {
    const x = index * 48;
    return `<path d="M${x} 475 H${x + 44}" stroke="#f5eedb" stroke-width="5" opacity=".68"/>`;
  });

  const roadMarks = repeat(8, (index) => {
    const x = 62 + index * 165;
    return `<path d="M${x} 620 H${x + 78}" stroke="#f4e6ad" stroke-width="5" stroke-linecap="round" opacity=".68"/>`;
  });

  const sideLane = `<g>
    <path d="M${laneLeftTop} 68 L${laneRightTop} 68 L${laneRightBottom} 493 L${laneLeftBottom} 493 Z" fill="#b8ad98"/>
    <path d="M${laneLeftTop + 16} 68 L${laneRightTop - 16} 68 L${laneRightBottom - 20} 493 L${laneLeftBottom + 20} 493 Z" fill="url(#road)"/>
    <path d="M${laneLeftTop + 16} 68 L${laneRightTop - 16} 68 L${laneRightBottom - 20} 493 L${laneLeftBottom + 20} 493 Z" fill="url(#asphalt-speck)"/>
    <path d="M${laneCenter - 5} 90 L${laneCenter + 8} 450" stroke="#eef1df" stroke-width="4" stroke-dasharray="22 25" opacity=".35"/>
  </g>`;

  const crosswalk = east
    ? repeat(6, (index) => `<path d="M${780 + index * 34} 488 L${804 + index * 34} 550" stroke="#f3ede2" stroke-width="17" opacity=".74"/>`)
    : repeat(5, (index) => `<rect x="${610 + index * 34}" y="498" width="20" height="72" rx="2" fill="#f3ede2" opacity=".68"/>`);

  return createSvg(
    1280,
    720,
    `<rect width="1280" height="720" fill="url(#grass-bg)"/>
    <rect width="1280" height="720" fill="url(#grass-lines)" opacity=".55"/>
    <g filter="url(#paper-grain)">${distantRoofs}</g>
    <path d="M0 186 C150 155 242 190 365 162 C505 130 626 190 770 154 C938 112 1087 181 1280 135 V328 H0Z" fill="#476f48" opacity=".78"/>
    <path d="M0 222 C180 178 295 222 418 188 C568 145 704 216 874 171 C1032 132 1150 184 1280 154 V344 H0Z" fill="#5d8551" opacity=".83"/>
    ${grassPoints}
    <path d="M0 386 C188 366 350 398 520 371 C720 339 880 394 1070 359 C1145 345 1210 347 1280 354 V450 H0Z" fill="#5d884f" opacity=".72"/>
    ${sideLane}
    <rect x="0" y="428" width="1280" height="67" fill="url(#sidewalk)"/>
    <rect x="0" y="428" width="1280" height="67" fill="url(#paving)" opacity=".74"/>
    <path d="M0 428 H1280" stroke="#ece5d3" stroke-width="7" opacity=".7"/>
    <path d="M0 493 H1280" stroke="#7f766b" stroke-width="5" opacity=".52"/>
    ${curbBlocks}
    <rect x="0" y="495" width="1280" height="225" fill="url(#road)"/>
    <rect x="0" y="495" width="1280" height="225" fill="url(#asphalt-speck)"/>
    <path d="M0 705 H1280" stroke="#2d3d44" stroke-width="18" opacity=".45"/>
    ${roadMarks}
    ${crosswalk}
    <g filter="url(#small-shadow)">
      <ellipse cx="${manholeX}" cy="587" rx="39" ry="18" fill="#29393d" opacity=".42"/>
      <ellipse cx="${manholeX}" cy="580" rx="34" ry="15" fill="#586469" stroke="#28363b" stroke-width="4"/>
      <path d="M${manholeX - 22} 580 H${manholeX + 22} M${manholeX} 568 V592" stroke="#2e3b40" stroke-width="3" opacity=".6"/>
    </g>
    <g opacity=".38" stroke="#293b40" stroke-width="2" fill="none">
      <path d="M90 570 q45 -20 90 8 q35 20 82 -2"/>
      <path d="M${east ? 1020 : 310} 662 q58 -16 112 4"/>
      <path d="M${east ? 180 : 900} 540 q25 12 47 2 q27 -12 62 4"/>
    </g>
    <g opacity=".2" fill="#233b34">
      <ellipse cx="210" cy="443" rx="120" ry="22"/>
      <ellipse cx="1160" cy="448" rx="142" ry="24"/>
      <ellipse cx="${laneCenter}" cy="460" rx="105" ry="16"/>
    </g>
    <g opacity=".34" stroke="#2a3c43" stroke-width="4" fill="none">
      <path d="M0 111 C260 90 510 132 760 98 C962 70 1122 102 1280 83"/>
      <path d="M0 127 C250 110 496 150 752 117 C966 88 1118 122 1280 103"/>
    </g>`,
    createBackgroundDefs(seed),
  );
}

function parkBackground(east: boolean): string {
  const seed = east ? 61 : 47;
  const grassPoints = seededPoints(170, seed, 1280, 620)
    .map(({ x, y, r }) => `<circle cx="${x}" cy="${85 + y}" r="${r * 0.5}" fill="#e2edaf" opacity=".18"/>`)
    .join('\n');
  const stones = repeat(24, (index) => {
    const x = 26 + ((index * 97) % 1220);
    const y = 195 + ((index * 53) % 390);
    return `<ellipse cx="${x}" cy="${y}" rx="${5 + (index % 4)}" ry="${3 + (index % 3)}" fill="#55684d" opacity=".22"/>`;
  });
  const path = east
    ? 'M-80 640 C190 505 360 555 565 480 C795 396 1025 435 1360 275'
    : 'M-100 640 C230 560 380 520 595 566 C835 620 984 517 1390 455';
  const secondary = east
    ? 'M540 760 C610 560 740 465 895 350 C1015 262 1115 195 1280 148'
    : 'M760 735 C724 575 705 456 690 255 C680 170 670 110 650 40';

  return createSvg(
    1280,
    720,
    `<rect width="1280" height="720" fill="url(#grass-bg)"/>
    <rect width="1280" height="720" fill="url(#grass-lines)" opacity=".72"/>
    <path d="M0 60 C170 22 292 75 430 45 C602 10 720 72 891 31 C1050 -7 1158 42 1280 20 V170 H0Z" fill="#385f3f" opacity=".82"/>
    <path d="M0 114 C150 72 312 130 474 87 C624 49 758 111 930 63 C1085 20 1170 88 1280 54 V206 H0Z" fill="#517d49" opacity=".86"/>
    ${grassPoints}
    ${stones}
    <path d="${path}" fill="none" stroke="#6e5a43" stroke-width="155" stroke-linecap="round" opacity=".3"/>
    <path d="${path}" fill="none" stroke="url(#dirt)" stroke-width="137" stroke-linecap="round"/>
    <path d="${path}" fill="none" stroke="#e1c692" stroke-width="13" stroke-linecap="round" opacity=".55"/>
    <path d="${secondary}" fill="none" stroke="#765f45" stroke-width="88" stroke-linecap="round" opacity=".24"/>
    <path d="${secondary}" fill="none" stroke="#b99464" stroke-width="74" stroke-linecap="round"/>
    <g fill="#f0dbac" opacity=".36">
      ${repeat(34, (index) => {
        const x = (index * 113 + 42) % 1260;
        const y = 245 + ((index * 67) % 410);
        return `<circle cx="${x}" cy="${y}" r="${2 + (index % 3)}"/>`;
      })}
    </g>
    <g opacity=".38" fill="#31573c">
      <ellipse cx="125" cy="370" rx="118" ry="32"/>
      <ellipse cx="1120" cy="322" rx="154" ry="38"/>
      <ellipse cx="${east ? 670 : 890}" cy="580" rx="125" ry="27"/>
    </g>
    <g opacity=".34" stroke="#486f45" stroke-width="6" fill="none">
      <path d="M0 155 C235 127 470 175 695 138 C890 105 1095 139 1280 108"/>
      <path d="M0 172 C235 144 470 192 695 155 C890 122 1095 156 1280 125"/>
    </g>
    ${east ? `<g filter="url(#small-shadow)">
      <ellipse cx="1100" cy="600" rx="64" ry="25" fill="#354b3f" opacity=".32"/>
      <ellipse cx="1100" cy="589" rx="52" ry="20" fill="#a9895c"/>
      <path d="M1062 586 Q1100 558 1138 586" fill="none" stroke="#d6bd8c" stroke-width="6" opacity=".8"/>
    </g>` : ''}
    <rect width="1280" height="720" fill="url(#paper-grain)" opacity=".14"/>`,
    createBackgroundDefs(seed),
  );
}

export const M11_BACKGROUND_ASSETS: Record<string, string> = {
  'm11-bg-residential-west': residentialBackground(false),
  'm11-bg-residential-east': residentialBackground(true),
  'm11-bg-park-west': parkBackground(false),
  'm11-bg-park-east': parkBackground(true),
};
