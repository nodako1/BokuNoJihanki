export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (!a || !b) continue;
    const intersects =
      (a.y > point.y) !== (b.y > point.y) &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || Number.EPSILON) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function distancePointToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= Number.EPSILON) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  const x = start.x + dx * t;
  const y = start.y + dy * t;
  return Math.hypot(point.x - x, point.y - y);
}

export function circleIntersectsPolygon(center, radius, polygon) {
  if (pointInPolygon(center, polygon)) return true;
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    if (!start || !end) continue;
    if (distancePointToSegment(center, start, end) < radius) return true;
  }
  return false;
}

export function circleInsideWalkable(center, radius, polygons) {
  const samples = [
    center,
    { x: center.x + radius, y: center.y },
    { x: center.x - radius, y: center.y },
    { x: center.x, y: center.y + radius },
    { x: center.x, y: center.y - radius },
    { x: center.x + radius * 0.72, y: center.y + radius * 0.72 },
    { x: center.x - radius * 0.72, y: center.y + radius * 0.72 },
    { x: center.x + radius * 0.72, y: center.y - radius * 0.72 },
    { x: center.x - radius * 0.72, y: center.y - radius * 0.72 },
  ];
  return samples.every((sample) => polygons.some((polygon) => pointInPolygon(sample, polygon)));
}

export function isFootprintValid(center, radius, walkablePolygons, obstaclePolygons) {
  if (!circleInsideWalkable(center, radius, walkablePolygons)) return false;
  return !obstaclePolygons.some((polygon) => circleIntersectsPolygon(center, radius, polygon));
}

export function resolveWalkableMovement(position, delta, radius, walkablePolygons, obstaclePolygons, maxSubstep = 4) {
  const distance = Math.hypot(delta.x, delta.y);
  if (distance <= 0.0001) return { ...position, movedX: 0, movedY: 0, blockedX: false, blockedY: false };
  const steps = Math.max(1, Math.ceil(distance / Math.max(1, maxSubstep)));
  const step = { x: delta.x / steps, y: delta.y / steps };
  const next = { x: position.x, y: position.y };
  let blockedX = false;
  let blockedY = false;

  const tryCandidate = (x, y) => {
    const candidate = { x, y };
    if (!isFootprintValid(candidate, radius, walkablePolygons, obstaclePolygons)) return false;
    next.x = x;
    next.y = y;
    return true;
  };

  for (let index = 0; index < steps; index += 1) {
    if (tryCandidate(next.x + step.x, next.y + step.y)) continue;

    const xFirst = Math.abs(step.x) >= Math.abs(step.y);
    const candidates = xFirst
      ? [
          { axis: 'x', x: next.x + step.x, y: next.y },
          { axis: 'y', x: next.x, y: next.y + step.y },
        ]
      : [
          { axis: 'y', x: next.x, y: next.y + step.y },
          { axis: 'x', x: next.x + step.x, y: next.y },
        ];

    let moved = false;
    for (const candidate of candidates) {
      if (tryCandidate(candidate.x, candidate.y)) {
        moved = true;
        if (candidate.axis === 'x') blockedY = Math.abs(step.y) > 0.0001;
        else blockedX = Math.abs(step.x) > 0.0001;
        break;
      }
    }
    if (!moved) {
      blockedX ||= Math.abs(step.x) > 0.0001;
      blockedY ||= Math.abs(step.y) > 0.0001;
    }
  }

  return {
    ...next,
    movedX: next.x - position.x,
    movedY: next.y - position.y,
    blockedX,
    blockedY,
  };
}

export function approach(current, target, maximumDelta) {
  if (current < target) return Math.min(target, current + maximumDelta);
  if (current > target) return Math.max(target, current - maximumDelta);
  return target;
}

export function chooseFacing(x, y, fallback = 'down') {
  if (Math.abs(x) > Math.abs(y) && Math.abs(x) > 0.02) return x < 0 ? 'left' : 'right';
  if (Math.abs(y) > 0.02) return y < 0 ? 'up' : 'down';
  return fallback;
}

export function sectionIndexForX(x, sectionWidth, count) {
  return clamp(Math.floor(x / sectionWidth), 0, Math.max(0, count - 1));
}
