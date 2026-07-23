import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

export const LOGICAL_VIEWPORT = Object.freeze({ width: 1280, height: 720 });
export const PLAYER_SCALE = 0.68;
export const PLAYER_HALF_WIDTH = 36;

export function decodeRgbaWithFfmpeg(imagePath, width, height) {
  const expectedBytes = width * height * 4;
  const result = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      imagePath,
      '-frames:v',
      '1',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgba',
      'pipe:1',
    ],
    {
      encoding: null,
      maxBuffer: expectedBytes + 1024 * 1024,
    },
  );
  if (result.error) {
    throw new Error(`ffmpeg could not decode ${imagePath}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = Buffer.from(result.stderr ?? '').toString('utf8').trim();
    throw new Error(`ffmpeg failed to decode ${imagePath}: ${stderr || `status ${result.status}`}`);
  }
  if (result.stdout.length !== expectedBytes) {
    throw new Error(
      `Decoded byte length mismatch for ${imagePath}: expected ${expectedBytes}, got ${result.stdout.length}.`,
    );
  }
  return result.stdout;
}

export function readAtlasMasks(atlasImagePath, atlasJsonPath, alphaThreshold) {
  const atlas = JSON.parse(fs.readFileSync(atlasJsonPath, 'utf8'));
  const atlasWidth = atlas.meta?.size?.w;
  const atlasHeight = atlas.meta?.size?.h;
  if (!Number.isInteger(atlasWidth) || !Number.isInteger(atlasHeight)) {
    throw new Error('Player atlas metadata must contain integer width and height.');
  }
  const rgba = decodeRgbaWithFfmpeg(atlasImagePath, atlasWidth, atlasHeight);
  const masks = {};
  for (const [frameName, frameDefinition] of Object.entries(atlas.frames ?? {})) {
    const frame = frameDefinition.frame;
    const opaquePixels = [];
    const edgePixels = [];
    let maxOpaqueY = -1;
    for (let localY = 0; localY < frame.h; localY += 1) {
      for (let localX = 0; localX < frame.w; localX += 1) {
        const atlasX = frame.x + localX;
        const atlasY = frame.y + localY;
        const alpha = rgba[(atlasY * atlasWidth + atlasX) * 4 + 3];
        if (alpha <= alphaThreshold) continue;
        const pixel = { x: localX, y: localY, alpha };
        opaquePixels.push(pixel);
        maxOpaqueY = Math.max(maxOpaqueY, localY);
        if (
          localX === 0
          || localY === 0
          || localX === frame.w - 1
          || localY === frame.h - 1
        ) {
          edgePixels.push(pixel);
        }
      }
    }
    if (opaquePixels.length === 0) {
      throw new Error(`Player frame ${frameName} has no opaque pixels.`);
    }
    const bottomPixels = opaquePixels.filter((pixel) => pixel.y === maxOpaqueY);
    const totalAlpha = bottomPixels.reduce((sum, pixel) => sum + pixel.alpha, 0);
    const bottomCenterX = bottomPixels.reduce(
      (sum, pixel) => sum + pixel.x * pixel.alpha,
      0,
    ) / totalAlpha;
    masks[frameName] = {
      frame,
      opaquePixels,
      edgePixels,
      bottomCenter: { x: bottomCenterX, y: maxOpaqueY },
    };
  }
  return masks;
}

export function pointInPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const crosses = (
      (currentPoint.y > point.y) !== (previousPoint.y > point.y)
      && point.x < (
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y))
        / ((previousPoint.y - currentPoint.y) || Number.EPSILON)
        + currentPoint.x
      )
    );
    if (crosses) inside = !inside;
  }
  return inside;
}

export function interpolateGroundY(points, x) {
  if (!Array.isArray(points) || points.length < 2) {
    throw new Error('A ground line needs at least two points.');
  }
  if (x <= points[0].x) return points[0].y;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    if (x > end.x) continue;
    const progress = (x - start.x) / Math.max(Number.EPSILON, end.x - start.x);
    return start.y + (end.y - start.y) * progress;
  }
  return points.at(-1).y;
}

export function sampleWorldPositions(area) {
  const positions = new Map();
  const add = (label, x) => {
    const clamped = Math.max(PLAYER_HALF_WIDTH, Math.min(area.worldWidth - PLAYER_HALF_WIDTH, x));
    const key = clamped.toFixed(3);
    if (!positions.has(key)) positions.set(key, { label, x: clamped });
    else positions.get(key).label += `+${label}`;
  };
  add('start', PLAYER_HALF_WIDTH);
  add('25%', area.worldWidth * 0.25);
  add('50%', area.worldWidth * 0.5);
  add('75%', area.worldWidth * 0.75);
  add('end', area.worldWidth - PLAYER_HALF_WIDTH);
  for (const [spawnId, spawn] of Object.entries(area.spawnPoints ?? {})) {
    add(`spawn:${spawnId}`, spawn.x);
  }
  for (const direction of ['up', 'down']) {
    const exit = area[`${direction}Exit`];
    if (exit?.kind !== 'connected' || exit.trigger !== 'branch') continue;
    add(`branch:${direction}:start`, exit.activationRange.minX);
    add(
      `branch:${direction}:center`,
      (exit.activationRange.minX + exit.activationRange.maxX) / 2,
    );
    add(`branch:${direction}:end`, exit.activationRange.maxX);
  }
  return [...positions.values()].sort((left, right) => left.x - right.x);
}

export function cameraScrollX(area, playerX, velocityX, viewportWidth = 1280) {
  const lookAhead = Math.max(-96, Math.min(96, velocityX * 0.55));
  const maximum = Math.max(0, area.worldWidth - viewportWidth);
  return Math.max(0, Math.min(maximum, playerX + lookAhead - viewportWidth / 2));
}

export function canvasProjection(viewport) {
  const scale = Math.min(
    viewport.width / LOGICAL_VIEWPORT.width,
    viewport.height / LOGICAL_VIEWPORT.height,
  );
  return {
    scale,
    offsetX: (viewport.width - LOGICAL_VIEWPORT.width * scale) / 2,
    offsetY: (viewport.height - LOGICAL_VIEWPORT.height * scale) / 2,
  };
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function declarationsForRule(css, selector, startAt = 0) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^}]+)\\}`, 'm').exec(css.slice(startAt));
  if (!match) return {};
  return Object.fromEntries(
    match[1]
      .split(';')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const separator = entry.indexOf(':');
        return [
          entry.slice(0, separator).trim(),
          entry.slice(separator + 1).trim(),
        ];
      }),
  );
}

function cssLength(value, viewport, axis) {
  if (!value || value === 'auto') return null;
  const basis = axis === 'x' ? viewport.width : viewport.height;
  const units = {
    px: 1,
    vw: viewport.width / 100,
    vh: viewport.height / 100,
    '%': basis / 100,
  };
  const simple = /^(-?\d+(?:\.\d+)?)(px|vw|vh|%)$/.exec(value);
  if (simple) return Number(simple[1]) * units[simple[2]];
  const clampMatch = /^clamp\(([^,]+),([^,]+),([^)]+)\)$/.exec(value);
  if (clampMatch) {
    return clamp(
      cssLength(clampMatch[2].trim(), viewport, axis),
      cssLength(clampMatch[1].trim(), viewport, axis),
      cssLength(clampMatch[3].trim(), viewport, axis),
    );
  }
  const firstPixelValue = /(-?\d+(?:\.\d+)?)px/.exec(value);
  if (firstPixelValue && /^(?:max|min|calc)\(/.test(value)) {
    return Number(firstPixelValue[1]);
  }
  throw new Error(`Unsupported M1.5 panel CSS length: ${value}`);
}

function paddingBlock(declarations, viewport) {
  if (declarations['padding-block']) {
    const values = declarations['padding-block'].split(/\s+/);
    const start = cssLength(values[0], viewport, 'y');
    return [start, cssLength(values[1] ?? values[0], viewport, 'y')];
  }
  const values = (declarations.padding ?? '0').split(/\s+/);
  const top = cssLength(values[0], viewport, 'y');
  const bottom = cssLength(values[2] ?? values[0], viewport, 'y');
  return [top, bottom];
}

export function panelRectFromCss(cssPath, viewport, direction) {
  const css = fs.readFileSync(cssPath, 'utf8');
  const mediaStart = css.indexOf('@media (max-height: 520px)');
  const compact = viewport.height <= 520 && mediaStart >= 0;
  const mainCss = mediaStart >= 0 ? css.slice(0, mediaStart) : css;
  const declarations = {
    ...declarationsForRule(mainCss, '.area-arrow-button'),
    ...declarationsForRule(mainCss, `.area-arrow-button--${direction}`),
    ...(compact ? declarationsForRule(css, '.area-arrow-button', mediaStart) : {}),
    ...(compact
      ? declarationsForRule(css, `.area-arrow-button--${direction}`, mediaStart)
      : {}),
  };
  const glyphDeclarations = {
    ...declarationsForRule(mainCss, '.area-arrow-glyph'),
    ...(compact ? declarationsForRule(css, '.area-arrow-glyph', mediaStart) : {}),
  };
  const width = cssLength(
    declarations.width ?? declarations['min-width'],
    viewport,
    'x',
  );
  const glyphHeight = cssLength(
    glyphDeclarations.height ?? glyphDeclarations.width,
    viewport,
    'y',
  );
  const [paddingTop, paddingBottom] = paddingBlock(declarations, viewport);
  const border = cssLength(
    /(\d+(?:\.\d+)?px)/.exec(declarations.border ?? '')?.[1] ?? '0px',
    viewport,
    'x',
  );
  const height = cssLength(declarations.height, viewport, 'y')
    ?? glyphHeight + paddingTop + paddingBottom + border * 2;
  const left = cssLength(declarations.left, viewport, 'x');
  const right = cssLength(declarations.right, viewport, 'x');
  const top = cssLength(declarations.top, viewport, 'y');
  const bottom = cssLength(declarations.bottom, viewport, 'y');
  const translateHalf = /translateX\(\s*-50%\s*\)/.test(declarations.transform ?? '');
  const x = left !== null
    ? left - (translateHalf ? width / 2 : 0)
    : viewport.width - right - width;
  const y = top !== null ? top : viewport.height - bottom - height;
  return {
    x,
    y,
    width,
    height,
  };
}

export function projectMaskToCssPixels({
  mask,
  playerX,
  playerY,
  cameraX,
  viewport,
}) {
  const projection = canvasProjection(viewport);
  const cssPixels = new Map();
  for (const pixel of mask.opaquePixels) {
    const logicalLeft = (
      playerX
      - cameraX
      + (pixel.x - mask.frame.w / 2) * PLAYER_SCALE
    );
    const logicalRight = logicalLeft + PLAYER_SCALE;
    const logicalTop = playerY + (pixel.y - mask.frame.h) * PLAYER_SCALE;
    const logicalBottom = logicalTop + PLAYER_SCALE;
    const cssLeft = projection.offsetX + logicalLeft * projection.scale;
    const cssRight = projection.offsetX + logicalRight * projection.scale;
    const cssTop = projection.offsetY + logicalTop * projection.scale;
    const cssBottom = projection.offsetY + logicalBottom * projection.scale;
    const deviceLeft = Math.floor(cssLeft * viewport.deviceScaleFactor);
    const deviceRight = Math.ceil(cssRight * viewport.deviceScaleFactor) - 1;
    const deviceTop = Math.floor(cssTop * viewport.deviceScaleFactor);
    const deviceBottom = Math.ceil(cssBottom * viewport.deviceScaleFactor) - 1;

    for (let deviceY = deviceTop; deviceY <= deviceBottom; deviceY += 1) {
      for (let deviceX = deviceLeft; deviceX <= deviceRight; deviceX += 1) {
        const key = `${deviceX},${deviceY}`;
        if (cssPixels.has(key)) continue;
        cssPixels.set(key, {
          x: (deviceX + 0.5) / viewport.deviceScaleFactor,
          y: (deviceY + 0.5) / viewport.deviceScaleFactor,
          deviceX,
          deviceY,
        });
      }
    }
  }
  return [...cssPixels.values()];
}

export function maskRectMetrics(maskPixels, rectangle) {
  let intersectionPixels = 0;
  let minimumDistance = Number.POSITIVE_INFINITY;
  for (const pixel of maskPixels) {
    const inside = (
      pixel.x >= rectangle.x
      && pixel.x < rectangle.x + rectangle.width
      && pixel.y >= rectangle.y
      && pixel.y < rectangle.y + rectangle.height
    );
    if (inside) intersectionPixels += 1;
    const dx = Math.max(rectangle.x - pixel.x, 0, pixel.x - (rectangle.x + rectangle.width));
    const dy = Math.max(rectangle.y - pixel.y, 0, pixel.y - (rectangle.y + rectangle.height));
    minimumDistance = Math.min(minimumDistance, Math.hypot(dx, dy));
  }
  return { intersectionPixels, minimumDistance };
}
