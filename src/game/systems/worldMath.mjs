export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizeInput(x, y) {
  const length = Math.hypot(x, y);
  if (length <= 0.0001) {
    return { x: 0, y: 0, magnitude: 0 };
  }

  const limited = Math.min(1, length);
  return {
    x: (x / length) * limited,
    y: (y / length) * limited,
    magnitude: limited,
  };
}

export function chunkIndexForX(x, chunkWidth, chunkCount) {
  return clamp(Math.floor(x / chunkWidth), 0, Math.max(0, chunkCount - 1));
}

export function desiredChunkIds(currentIndex, directionX, chunkCount) {
  const desired = new Set([currentIndex]);
  if (currentIndex > 0) desired.add(currentIndex - 1);
  if (currentIndex < chunkCount - 1) desired.add(currentIndex + 1);

  if (directionX > 0.25 && currentIndex + 2 < chunkCount) {
    desired.add(currentIndex + 2);
  }
  if (directionX < -0.25 && currentIndex - 2 >= 0) {
    desired.add(currentIndex - 2);
  }

  return [...desired].sort((a, b) => a - b);
}

export function depthForFootY(footY, layerOffset = 0) {
  return Math.round(footY * 10 + layerOffset);
}

export function aabbIntersects(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function playerRectAt(position, body) {
  return {
    x: position.x - body.width / 2,
    y: position.y - body.height,
    width: body.width,
    height: body.height,
  };
}

export function resolveMovement(position, delta, body, obstacles, bounds) {
  const next = { x: position.x, y: position.y };

  const tryAxis = (axis, amount) => {
    if (amount === 0) return;
    const candidate = { ...next, [axis]: next[axis] + amount };
    candidate.x = clamp(candidate.x, bounds.left + body.width / 2, bounds.right - body.width / 2);
    candidate.y = clamp(candidate.y, bounds.top + body.height, bounds.bottom);
    const rect = playerRectAt(candidate, body);
    if (!obstacles.some((obstacle) => aabbIntersects(rect, obstacle))) {
      next[axis] = candidate[axis];
    }
  };

  tryAxis('x', delta.x);
  tryAxis('y', delta.y);
  return next;
}

export function areaForX(x) {
  return x < 2560 ? 'residential' : 'park';
}

export function surfaceForPosition(x, y) {
  if (x < 2560) {
    return y >= 492 ? 'asphalt' : y >= 426 ? 'dirt' : 'grass';
  }
  return y >= 505 ? 'dirt' : 'grass';
}
