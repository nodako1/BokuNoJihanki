export function createSvg(width: number, height: number, body: string, defs = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>
${defs}
</defs>
${body}
</svg>`;
}

export function createArtDefs(seed = 11): string {
  return `
    <filter id="soft-shadow" x="-35%" y="-35%" width="170%" height="190%">
      <feDropShadow dx="0" dy="8" stdDeviation="7" flood-color="#18313a" flood-opacity=".30"/>
    </filter>
    <filter id="small-shadow" x="-30%" y="-30%" width="160%" height="180%">
      <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#17323c" flood-opacity=".26"/>
    </filter>
    <filter id="paper-grain" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency=".72" numOctaves="2" seed="${seed}" result="noise"/>
      <feColorMatrix in="noise" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .13 0" result="soft-noise"/>
      <feBlend in="SourceGraphic" in2="soft-noise" mode="soft-light"/>
    </filter>
    <filter id="leaf-texture" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="3" seed="${seed + 7}" result="noise"/>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="3.5" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <linearGradient id="warm-wall" x1="0" y1="0" x2="0" y2="1">
      <stop stop-color="#fff4d8"/>
      <stop offset=".56" stop-color="#ead5aa"/>
      <stop offset="1" stop-color="#c8a879"/>
    </linearGradient>
    <linearGradient id="cool-wall" x1="0" y1="0" x2="0" y2="1">
      <stop stop-color="#eef2e8"/>
      <stop offset=".58" stop-color="#cdd8cd"/>
      <stop offset="1" stop-color="#9db0a4"/>
    </linearGradient>
    <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#b9824f"/>
      <stop offset=".5" stop-color="#865435"/>
      <stop offset="1" stop-color="#553724"/>
    </linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#d4f1f2"/>
      <stop offset=".42" stop-color="#9bc8cc"/>
      <stop offset="1" stop-color="#527e8d"/>
    </linearGradient>
    <linearGradient id="leaf" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#9ac968"/>
      <stop offset=".45" stop-color="#57924d"/>
      <stop offset="1" stop-color="#2e6140"/>
    </linearGradient>
    <linearGradient id="leaf-dark" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#5f9b4f"/>
      <stop offset="1" stop-color="#244f38"/>
    </linearGradient>
    <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#e9eff0"/>
      <stop offset=".45" stop-color="#9baeb2"/>
      <stop offset="1" stop-color="#586d73"/>
    </linearGradient>
  `;
}

export function repeat(count: number, create: (index: number) => string): string {
  return Array.from({ length: count }, (_, index) => create(index)).join('\n');
}

export function seededPoints(
  count: number,
  seed: number,
  width: number,
  height: number,
): Array<{ x: number; y: number; r: number }> {
  let value = seed >>> 0;
  const next = (): number => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0xffffffff;
  };

  return Array.from({ length: count }, () => ({
    x: Math.round(next() * width),
    y: Math.round(next() * height),
    r: 1 + Math.round(next() * 3),
  }));
}
