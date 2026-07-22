import { createArtDefs, createSvg, repeat } from './m11AssetFactory';

type HousePalette = {
  roofTop: string;
  roofBottom: string;
  wall: string;
  wallShade: string;
  trim: string;
  door: string;
  accent: string;
};

function createHouse(palette: HousePalette, variant: number): string {
  const tileLines = repeat(9, (index) => {
    const x = 48 + index * 38;
    return `<path d="M${x} 96 L${x + 37} 36" stroke="#fff4dd" stroke-width="2" opacity=".18"/>`;
  });
  const verticalWallLines = variant === 2
    ? repeat(13, (index) => `<path d="M${72 + index * 22} 145 V286" stroke="#5e3f2a" stroke-width="2" opacity=".18"/>`)
    : '';
  const roofDetail = variant % 2 === 0
    ? `<path d="M42 104 L210 18 L382 104 L365 125 L210 49 L56 126Z" fill="url(#roof-gradient)"/>
       <path d="M43 104 L210 18 L382 104" fill="none" stroke="#ffe3bf" stroke-width="7" opacity=".5"/>`
    : `<path d="M48 99 L78 34 H348 L378 99Z" fill="url(#roof-gradient)"/>
       <path d="M61 93 H366" stroke="#ffe9c9" stroke-width="7" opacity=".42"/>`;

  return createSvg(
    420,
    330,
    `<g filter="url(#soft-shadow)">
      <ellipse cx="214" cy="305" rx="172" ry="19" fill="#17353d" opacity=".22"/>
      <path d="M78 123 H345 L372 153 V286 H78Z" fill="${palette.wallShade}"/>
      <rect x="54" y="115" width="300" height="174" rx="10" fill="${palette.wall}" stroke="#604d3c" stroke-width="3"/>
      ${roofDetail}
      ${tileLines}
      <path d="M55 127 H355" stroke="${palette.trim}" stroke-width="13"/>
      <path d="M55 136 H355" stroke="#4a3428" stroke-width="3" opacity=".55"/>
      ${verticalWallLines}
      <g filter="url(#small-shadow)">
        <rect x="88" y="161" width="82" height="64" rx="7" fill="url(#glass)" stroke="#f8f1df" stroke-width="8"/>
        <path d="M129 165 V221 M92 192 H166" stroke="#f9f4e7" stroke-width="5"/>
        <path d="M100 170 L154 218" stroke="#ffffff" stroke-width="5" opacity=".2"/>
        <rect x="207" y="151" width="75" height="138" rx="7" fill="${palette.door}"/>
        <rect x="220" y="168" width="49" height="42" rx="5" fill="#9fc5c8" opacity=".62"/>
        <circle cx="267" cy="229" r="6" fill="#f5d06a"/>
        <path d="M202 151 H287 L279 139 H210Z" fill="${palette.accent}"/>
        <rect x="300" y="171" width="36" height="62" rx="5" fill="#d9c49b" stroke="#8f7658" stroke-width="3"/>
        <path d="M307 184 H329 M307 195 H329 M307 206 H329" stroke="#8a775e" stroke-width="2" opacity=".65"/>
      </g>
      <path d="M68 260 H343" stroke="#90755a" stroke-width="8" opacity=".7"/>
      <path d="M80 276 Q115 249 149 276 T216 276" fill="none" stroke="#4b7e47" stroke-width="13" stroke-linecap="round"/>
      <g fill="#d97865"><circle cx="105" cy="264" r="5"/><circle cx="139" cy="269" r="4"/><circle cx="183" cy="263" r="5"/></g>
      <path d="M63 116 V285 M351 117 V285" stroke="#5c493a" stroke-width="5" opacity=".5"/>
      <path d="M69 104 Q210 84 349 104" fill="none" stroke="#2f3a3f" stroke-width="5" opacity=".45"/>
    </g>`,
    `${createArtDefs(variant + 10)}
      <linearGradient id="roof-gradient" x1="0" y1="0" x2="0" y2="1">
        <stop stop-color="${palette.roofTop}"/>
        <stop offset="1" stop-color="${palette.roofBottom}"/>
      </linearGradient>`,
  );
}

function createTree(variant: number): string {
  const canopy: readonly (readonly [number, number, number])[] = variant === 0
    ? [[61, 126, 57], [111, 86, 66], [168, 91, 71], [221, 128, 58], [144, 139, 82], [90, 157, 59], [198, 159, 55]]
    : variant === 1
      ? [[54, 138, 51], [96, 92, 57], [149, 70, 66], [204, 96, 61], [232, 145, 50], [165, 146, 78], [91, 165, 54]]
      : [[50, 145, 46], [83, 105, 58], [130, 82, 62], [183, 78, 60], [226, 112, 56], [232, 162, 43], [170, 151, 73], [103, 166, 52]];
  const highlight = canopy.slice(0, 5).map(([x, y, r], index) => (
    `<ellipse cx="${x - r * 0.16}" cy="${y - r * 0.22}" rx="${r * 0.35}" ry="${r * 0.23}" fill="#c9e78d" opacity="${0.18 + (index % 2) * 0.06}"/>`
  )).join('\n');

  return createSvg(
    280,
    330,
    `<g filter="url(#soft-shadow)">
      <ellipse cx="142" cy="309" rx="70" ry="17" fill="#18383c" opacity=".24"/>
      <path d="M123 286 C125 238 119 207 131 164 C139 134 160 128 170 161 C180 201 167 245 171 286Z" fill="url(#trunk)" stroke="#523a28" stroke-width="5"/>
      <path d="M140 214 C113 189 104 168 93 145 M154 204 C180 176 194 155 211 133 M145 175 C145 144 137 119 124 99" fill="none" stroke="#60412c" stroke-width="13" stroke-linecap="round"/>
      <g filter="url(#leaf-texture)">
        ${canopy.map(([x, y, r], index) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${index % 3 === 0 ? 'url(#leaf-dark)' : 'url(#leaf)'}" stroke="#2b5c3a" stroke-width="3"/>`).join('\n')}
      </g>
      ${highlight}
      <g fill="#e2efad" opacity=".26">
        ${repeat(15, (index) => `<circle cx="${45 + ((index * 37) % 190)}" cy="${66 + ((index * 29) % 115)}" r="${2 + (index % 4)}"/>`)}
      </g>
      <path d="M119 284 Q143 270 174 284" fill="none" stroke="#8d6440" stroke-width="5" opacity=".72"/>
    </g>`,
    `${createArtDefs(30 + variant)}
      <linearGradient id="trunk" x1="0" y1="0" x2="1" y2="0">
        <stop stop-color="#5b3b27"/>
        <stop offset=".48" stop-color="#a07043"/>
        <stop offset="1" stop-color="#563823"/>
      </linearGradient>`,
  );
}

function createHedge(variant: number): string {
  return createSvg(
    280,
    120,
    `<g filter="url(#small-shadow)">
      <ellipse cx="140" cy="103" rx="126" ry="14" fill="#1c3b38" opacity=".2"/>
      <path d="M13 91 Q5 55 34 48 Q45 17 78 35 Q106 9 135 35 Q166 7 194 37 Q229 17 257 49 Q279 62 264 99 H23Q12 101 13 91Z" fill="url(#leaf)" stroke="#2b6240" stroke-width="4"/>
      <path d="M23 69 Q54 43 84 60 T145 58 T209 62 T257 56" fill="none" stroke="#b6da7d" stroke-width="7" opacity=".2"/>
      <g fill="#d7eda1" opacity=".24">${repeat(13, (index) => `<circle cx="${35 + index * 17}" cy="${39 + (index % 3) * 13}" r="${3 + (index % 2)}"/>`)}</g>
      ${variant === 1 ? '<g fill="#efb5c0"><circle cx="66" cy="51" r="5"/><circle cx="149" cy="43" r="5"/><circle cx="222" cy="57" r="5"/></g>' : ''}
    </g>`,
    createArtDefs(44 + variant),
  );
}

function createFence(wooden: boolean): string {
  const posts = repeat(8, (index) => {
    const x = 16 + index * 34;
    return wooden
      ? `<path d="M${x} 28 L${x + 13} 18 L${x + 26} 28 V112 H${x}Z" fill="url(#wood)" stroke="#543723" stroke-width="3"/>`
      : `<path d="M${x + 12} 19 V111" stroke="url(#metal)" stroke-width="7" stroke-linecap="round"/>`;
  });
  return createSvg(
    280,
    130,
    `<g filter="url(#small-shadow)">
      <ellipse cx="140" cy="118" rx="132" ry="10" fill="#17363b" opacity=".2"/>
      ${wooden ? `<path d="M8 55 H272 M8 93 H272" stroke="#6a452b" stroke-width="14"/>${posts}` : `<path d="M8 43 H272 M8 91 H272" stroke="url(#metal)" stroke-width="8"/>${posts}`}
    </g>`,
    createArtDefs(53 + Number(wooden)),
  );
}

function createUtilityPole(): string {
  return createSvg(
    150,
    330,
    `<g filter="url(#small-shadow)">
      <ellipse cx="76" cy="316" rx="28" ry="8" fill="#16343c" opacity=".22"/>
      <path d="M68 311 L78 78" stroke="#5b6261" stroke-width="23" stroke-linecap="round"/>
      <path d="M73 308 L82 81" stroke="#9fa7a0" stroke-width="7" opacity=".52"/>
      <path d="M27 83 H129" stroke="#545b5b" stroke-width="14" stroke-linecap="round"/>
      <path d="M42 55 H113" stroke="#646d6b" stroke-width="10" stroke-linecap="round"/>
      <g fill="#e2e6da" stroke="#667270" stroke-width="3"><circle cx="43" cy="82" r="10"/><circle cx="113" cy="82" r="10"/><circle cx="55" cy="54" r="8"/><circle cx="101" cy="54" r="8"/></g>
      <rect x="52" y="141" width="47" height="41" rx="5" fill="#d6d2bd" stroke="#5c6664" stroke-width="4"/>
      <path d="M61 152 H90 M61 162 H90 M61 172 H82" stroke="#746f62" stroke-width="3"/>
      <path d="M30 87 C58 105 95 105 126 87" fill="none" stroke="#29353a" stroke-width="4" opacity=".75"/>
    </g>`,
    createArtDefs(63),
  );
}

function createStreetLamp(): string {
  return createSvg(
    130,
    285,
    `<g filter="url(#small-shadow)">
      <ellipse cx="64" cy="272" rx="29" ry="9" fill="#18353c" opacity=".22"/>
      <path d="M63 270 V89 Q63 51 93 47" fill="none" stroke="#59696b" stroke-width="18" stroke-linecap="round"/>
      <path d="M68 267 V91 Q68 59 94 55" fill="none" stroke="#aab4ae" stroke-width="5" opacity=".48"/>
      <path d="M83 44 H118 L110 68 H79Z" fill="#41545a" stroke="#25383e" stroke-width="4"/>
      <path d="M88 51 H110 L105 62 H85Z" fill="#fff0b6"/>
      <rect x="50" y="181" width="28" height="37" rx="4" fill="#ddd7c2" stroke="#586567" stroke-width="3"/>
    </g>`,
    createArtDefs(65),
  );
}

function createBench(): string {
  return createSvg(
    240,
    145,
    `<g filter="url(#small-shadow)">
      <ellipse cx="120" cy="128" rx="105" ry="12" fill="#18363b" opacity=".22"/>
      <path d="M35 35 H205 Q214 35 214 44 V59 H26 V44Q26 35 35 35Z" fill="url(#wood)" stroke="#4f3424" stroke-width="4"/>
      <path d="M27 69 H213 V90 H27Z" fill="url(#wood)" stroke="#4f3424" stroke-width="4"/>
      <path d="M49 88 L40 127 M191 88 L200 127" stroke="#526166" stroke-width="13" stroke-linecap="round"/>
      <path d="M47 58 V75 M193 58 V75" stroke="#526166" stroke-width="10"/>
      <path d="M44 44 H195 M43 79 H196" stroke="#e1ae70" stroke-width="3" opacity=".35"/>
    </g>`,
    createArtDefs(68),
  );
}

function createVending(): string {
  const drinks = repeat(12, (index) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    const colors = ['#d85651', '#5ba5cf', '#f1c25f', '#78a65e'];
    return `<g><rect x="${25 + col * 24}" y="${45 + row * 35}" width="16" height="25" rx="3" fill="${colors[index % colors.length]}"/><rect x="${28 + col * 24}" y="${49 + row * 35}" width="10" height="4" rx="2" fill="#ffffff" opacity=".58"/></g>`;
  });
  return createSvg(
    150,
    245,
    `<g filter="url(#soft-shadow)">
      <ellipse cx="77" cy="231" rx="55" ry="12" fill="#17343b" opacity=".26"/>
      <rect x="17" y="17" width="116" height="210" rx="13" fill="#a93833" stroke="#562723" stroke-width="6"/>
      <path d="M26 28 H122 V170 H26Z" fill="#f1eee0"/>
      <rect x="29" y="34" width="90" height="112" rx="7" fill="#d8eced" stroke="#6f8586" stroke-width="4"/>
      ${drinks}
      <rect x="91" y="154" width="28" height="34" rx="5" fill="#303c42"/>
      <circle cx="104" cy="165" r="5" fill="#9cd4db"/>
      <rect x="31" y="159" width="47" height="50" rx="6" fill="#81302c"/>
      <path d="M39 174 H69 M39 185 H69" stroke="#e9ba8b" stroke-width="4" opacity=".6"/>
      <rect x="86" y="197" width="35" height="16" rx="4" fill="#26343a"/>
      <path d="M25 219 H126" stroke="#f07464" stroke-width="5" opacity=".42"/>
    </g>`,
    createArtDefs(71),
  );
}

function createSlide(): string {
  return createSvg(
    330,
    270,
    `<g filter="url(#soft-shadow)">
      <ellipse cx="165" cy="250" rx="135" ry="18" fill="#18383c" opacity=".23"/>
      <path d="M157 69 H244 V99 H157Z" fill="#f0b548" stroke="#8e6129" stroke-width="5"/>
      <path d="M164 95 C130 135 91 178 55 232 H120 C153 187 190 148 220 102Z" fill="url(#slide)" stroke="#356781" stroke-width="6"/>
      <path d="M177 93 V239 M236 93 V239" stroke="#57676a" stroke-width="14" stroke-linecap="round"/>
      <path d="M240 104 L302 236 M240 129 L287 231 M239 157 L273 228 M239 186 L260 225" fill="none" stroke="#d88d36" stroke-width="12" stroke-linecap="round"/>
      <path d="M241 106 L301 236" stroke="#7a5c35" stroke-width="4" opacity=".55"/>
      <path d="M172 75 H248" stroke="#ffe09b" stroke-width="8" opacity=".45"/>
    </g>`,
    `${createArtDefs(75)}
      <linearGradient id="slide" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#82c7df"/><stop offset="1" stop-color="#3e86a9"/></linearGradient>`,
  );
}

function createSwing(): string {
  return createSvg(
    330,
    260,
    `<g filter="url(#soft-shadow)">
      <ellipse cx="165" cy="242" rx="132" ry="17" fill="#17353b" opacity=".22"/>
      <path d="M45 235 L92 44 H238 L286 235" fill="none" stroke="#e0a343" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M84 51 H247" stroke="#99652f" stroke-width="7"/>
      <path d="M125 62 V180 M205 62 V180" stroke="#59676b" stroke-width="5"/>
      <path d="M105 63 V181 M225 63 V181" stroke="#59676b" stroke-width="5"/>
      <path d="M98 177 H132 V194 H98Z M198 177 H232 V194 H198Z" fill="#3d79a4" stroke="#244f70" stroke-width="4"/>
      <path d="M54 226 H278" stroke="#78542f" stroke-width="8" opacity=".45"/>
    </g>`,
    createArtDefs(76),
  );
}

function createParkSign(): string {
  return createSvg(
    210,
    180,
    `<g filter="url(#small-shadow)">
      <ellipse cx="105" cy="168" rx="74" ry="10" fill="#17353a" opacity=".22"/>
      <path d="M49 102 V167 M163 102 V167" stroke="#65462d" stroke-width="14"/>
      <path d="M20 24 Q20 13 32 13 H178Q190 13 190 24 V111 H20Z" fill="#f0dfad" stroke="#6c4d31" stroke-width="8"/>
      <path d="M48 79 Q71 45 100 71 Q126 35 160 74" fill="none" stroke="#4b9357" stroke-width="13" stroke-linecap="round"/>
      <circle cx="105" cy="55" r="13" fill="#efc152"/>
      <path d="M41 91 H170" stroke="#c6a875" stroke-width="5"/>
    </g>`,
    createArtDefs(78),
  );
}

function createFlowerbed(): string {
  const flowers = ['#f07f72', '#f3c358', '#9774bf', '#eb91ad', '#6ab6cc', '#f6e5a3'];
  return createSvg(
    240,
    110,
    `<g filter="url(#small-shadow)">
      <ellipse cx="120" cy="88" rx="111" ry="23" fill="#684b39" stroke="#48372f" stroke-width="5"/>
      <ellipse cx="120" cy="75" rx="101" ry="25" fill="#456e42"/>
      ${repeat(11, (index) => {
        const x = 28 + index * 18;
        const y = 48 + (index % 3) * 8;
        return `<path d="M${x} ${y + 22} V${y}" stroke="#37704a" stroke-width="3"/><circle cx="${x}" cy="${y}" r="7" fill="${flowers[index % flowers.length]}"/><circle cx="${x - 2}" cy="${y - 2}" r="2" fill="#fff2cf" opacity=".5"/>`;
      })}
    </g>`,
    createArtDefs(79),
  );
}

function createRoadMirror(): string {
  return createSvg(
    115,
    245,
    `<g filter="url(#small-shadow)">
      <ellipse cx="57" cy="234" rx="24" ry="7" fill="#17343b" opacity=".22"/>
      <path d="M57 232 V88" stroke="#778487" stroke-width="13"/>
      <path d="M61 230 V91" stroke="#c8ceca" stroke-width="4" opacity=".55"/>
      <circle cx="57" cy="57" r="42" fill="#ec8c42" stroke="#9a4c24" stroke-width="7"/>
      <circle cx="57" cy="57" r="32" fill="url(#glass)" stroke="#f5efe0" stroke-width="5"/>
      <path d="M34 48 Q57 26 80 48" fill="none" stroke="#ffffff" stroke-width="7" opacity=".35"/>
    </g>`,
    createArtDefs(81),
  );
}

function createMailbox(): string {
  return createSvg(
    110,
    150,
    `<g filter="url(#small-shadow)">
      <ellipse cx="55" cy="140" rx="35" ry="8" fill="#17343b" opacity=".2"/>
      <path d="M53 139 V87" stroke="#5c4b3b" stroke-width="11"/>
      <rect x="16" y="27" width="78" height="67" rx="9" fill="#bf4b3e" stroke="#6f2c27" stroke-width="5"/>
      <path d="M16 46 Q55 8 94 46" fill="#d45f4d" stroke="#6f2c27" stroke-width="5"/>
      <path d="M31 57 H79" stroke="#f4d9b4" stroke-width="6" stroke-linecap="round"/>
      <circle cx="79" cy="78" r="5" fill="#f2cb69"/>
    </g>`,
    createArtDefs(82),
  );
}

function createBicycle(): string {
  return createSvg(
    220,
    145,
    `<g filter="url(#small-shadow)" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <ellipse cx="110" cy="132" rx="100" ry="9" fill="#17353b" stroke="none" opacity=".16"/>
      <circle cx="54" cy="101" r="35" stroke="#39484e" stroke-width="7"/>
      <circle cx="166" cy="101" r="35" stroke="#39484e" stroke-width="7"/>
      <path d="M54 101 L89 56 L116 101 L70 101 L98 69 L143 69 L166 101 M116 101 L143 69" stroke="#5e91a6" stroke-width="8"/>
      <path d="M86 52 H106 M137 61 L149 43 M143 69 L163 52" stroke="#39484e" stroke-width="7"/>
      <path d="M88 55 L77 40" stroke="#39484e" stroke-width="6"/>
      <circle cx="116" cy="101" r="6" fill="#d6c45c" stroke="#39484e" stroke-width="3"/>
    </g>`,
    createArtDefs(83),
  );
}

function createParkGate(): string {
  return createSvg(
    320,
    185,
    `<g filter="url(#small-shadow)">
      <ellipse cx="160" cy="171" rx="146" ry="12" fill="#17353b" opacity=".2"/>
      <path d="M32 168 V55 M288 168 V55" stroke="#5a4938" stroke-width="20"/>
      <path d="M28 52 H292" stroke="#765b3d" stroke-width="20" stroke-linecap="round"/>
      <path d="M48 68 H272" stroke="#d8c18f" stroke-width="8" opacity=".48"/>
      <path d="M66 168 V83 M105 168 V83 M144 168 V83 M183 168 V83 M222 168 V83 M261 168 V83" stroke="#617177" stroke-width="9"/>
      <path d="M56 91 H269 M56 137 H269" stroke="#617177" stroke-width="8"/>
    </g>`,
    createArtDefs(84),
  );
}

function createSandbox(): string {
  return createSvg(
    280,
    100,
    `<g filter="url(#small-shadow)">
      <ellipse cx="140" cy="84" rx="130" ry="13" fill="#17353b" opacity=".17"/>
      <path d="M15 35 H265 L244 88 H36Z" fill="#9a6841" stroke="#5b3d28" stroke-width="6"/>
      <path d="M30 42 H250 L233 76 H47Z" fill="#e2bd74"/>
      <path d="M77 56 q18 -17 36 0 q18 -15 34 0" fill="none" stroke="#f4d78f" stroke-width="7" opacity=".7"/>
      <path d="M182 45 l14 22 l-28 0Z" fill="#d96b5d"/><path d="M195 42 V73" stroke="#675542" stroke-width="4"/>
    </g>`,
    createArtDefs(85),
  );
}

function createTrashCan(): string {
  return createSvg(
    100,
    150,
    `<g filter="url(#small-shadow)">
      <ellipse cx="50" cy="140" rx="35" ry="8" fill="#17353b" opacity=".2"/>
      <path d="M23 55 H77 L70 135 H30Z" fill="#617574" stroke="#34494b" stroke-width="5"/>
      <path d="M18 47 H82 V62 H18Z" fill="#81918b" stroke="#34494b" stroke-width="5"/>
      <path d="M36 67 V125 M50 67 V125 M64 67 V125" stroke="#b4beb4" stroke-width="3" opacity=".42"/>
    </g>`,
    createArtDefs(86),
  );
}

function createShrub(): string {
  return createSvg(
    150,
    125,
    `<g filter="url(#small-shadow)">
      <ellipse cx="75" cy="111" rx="65" ry="11" fill="#17353b" opacity=".18"/>
      <circle cx="45" cy="76" r="36" fill="url(#leaf-dark)" stroke="#2c5e3e" stroke-width="3"/>
      <circle cx="78" cy="60" r="45" fill="url(#leaf)" stroke="#2c5e3e" stroke-width="3"/>
      <circle cx="109" cy="78" r="34" fill="url(#leaf-dark)" stroke="#2c5e3e" stroke-width="3"/>
      <g fill="#d8ee9f" opacity=".26"><circle cx="59" cy="50" r="8"/><circle cx="92" cy="44" r="7"/><circle cx="110" cy="69" r="6"/></g>
    </g>`,
    createArtDefs(87),
  );
}

export const M11_PROP_ASSETS: Record<string, string> = {
  'house-a': createHouse({ roofTop: '#d96b52', roofBottom: '#873c36', wall: 'url(#warm-wall)', wallShade: '#a98363', trim: '#6e3f32', door: '#77503a', accent: '#b85d47' }, 0),
  'house-b': createHouse({ roofTop: '#58758a', roofBottom: '#314959', wall: 'url(#cool-wall)', wallShade: '#84968d', trim: '#3e5663', door: '#486e78', accent: '#405b67' }, 1),
  'house-c': createHouse({ roofTop: '#8e5a42', roofBottom: '#51362b', wall: '#b98a62', wallShade: '#72513a', trim: '#4f3527', door: '#4f3527', accent: '#76513a' }, 2),
  'house-d': createHouse({ roofTop: '#b55b43', roofBottom: '#71372f', wall: '#eee0c4', wallShade: '#b59b79', trim: '#79513b', door: '#6f4a37', accent: '#a15a45' }, 3),
  'tree-a': createTree(0),
  'tree-b': createTree(1),
  'tree-c': createTree(2),
  tree: createTree(0),
  'hedge-a': createHedge(0),
  'hedge-b': createHedge(1),
  hedge: createHedge(0),
  'fence-metal': createFence(false),
  'fence-wood': createFence(true),
  fence: createFence(false),
  'utility-pole': createUtilityPole(),
  'street-lamp': createStreetLamp(),
  bench: createBench(),
  vending: createVending(),
  'playground-slide': createSlide(),
  'playground-swing': createSwing(),
  playground: createSlide(),
  'park-sign': createParkSign(),
  flowerbed: createFlowerbed(),
  'road-mirror': createRoadMirror(),
  mailbox: createMailbox(),
  bicycle: createBicycle(),
  'park-gate': createParkGate(),
  sandbox: createSandbox(),
  'trash-can': createTrashCan(),
  shrub: createShrub(),
};
