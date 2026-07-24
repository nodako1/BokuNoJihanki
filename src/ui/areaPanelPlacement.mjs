/**
 * Pure M1.5 traversal-panel placement core.
 *
 * This module deliberately has no DOM or React dependency so Node contract
 * tests and Browser Smoke use the exact same placement implementation.
 */
const AREA_PANEL_MIN_PLAYER_GAP = 12;
const AREA_PANEL_MIN_TOUCH_TARGET = 44;
const EPSILON = 1e-3;
const DEFAULT_EDGE_PADDING = 12;
const DEFAULT_OBSTACLE_GAP = 8;
function finiteOr(value, fallback) {
  return Number.isFinite(value) ? Math.max(0, value ?? fallback) : fallback;
}
function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
function rectFromOrigin(left, top, width, height) {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height
  };
}
function createAreaPanelRect(left, top, width, height) {
  const safeLeft = Number.isFinite(left) ? left : 0;
  const safeTop = Number.isFinite(top) ? top : 0;
  const safeWidth = finiteOr(width, 0);
  const safeHeight = finiteOr(height, 0);
  return rectFromOrigin(safeLeft, safeTop, safeWidth, safeHeight);
}
function areaPanelIntersectionArea(first, second) {
  const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
  const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
  return width * height;
}
function areaPanelRectDistance(first, second) {
  const horizontal = Math.max(first.left - second.right, second.left - first.right, 0);
  const vertical = Math.max(first.top - second.bottom, second.top - first.bottom, 0);
  return Math.hypot(horizontal, vertical);
}
function inflateRect(rect, amount) {
  return rectFromOrigin(
    rect.left - amount,
    rect.top - amount,
    rect.width + amount * 2,
    rect.height + amount * 2
  );
}
function evaluateCandidate(candidate, panel, player, obstacles, playerGap, obstacleGap) {
  const rect = rectFromOrigin(candidate.x, candidate.y, panel.width, panel.height);
  const playerIntersectionArea = areaPanelIntersectionArea(rect, player);
  const playerDistance = areaPanelRectDistance(rect, player);
  const obstacleIntersections = obstacles.filter((obstacle) => areaPanelIntersectionArea(rect, inflateRect(obstacle.rect, obstacleGap)) > EPSILON).map((obstacle) => obstacle.id);
  return {
    x: candidate.x,
    y: candidate.y,
    rect,
    anchor: candidate.anchor,
    valid: playerIntersectionArea <= EPSILON && playerDistance + EPSILON >= playerGap && obstacleIntersections.length === 0,
    playerIntersectionArea,
    playerDistance,
    obstacleIntersections
  };
}
function pushCandidate(candidates, seen, candidate, bounds) {
  const x = clamp(candidate.x, bounds.minX, bounds.maxX);
  const y = clamp(candidate.y, bounds.minY, bounds.maxY);
  const key = `${x.toFixed(3)}:${y.toFixed(3)}`;
  if (seen.has(key)) return;
  seen.add(key);
  candidates.push({ ...candidate, x, y });
}
function addPlayerCandidates(candidates, seen, input, bounds, playerGap) {
  const centeredX = input.player.left + (input.player.width - input.panel.width) / 2;
  const centeredY = input.player.top + (input.player.height - input.panel.height) / 2;
  const above = {
    x: centeredX,
    y: input.player.top - playerGap - input.panel.height,
    anchor: "above-player"
  };
  const below = {
    x: centeredX,
    y: input.player.bottom + playerGap,
    anchor: "below-player"
  };
  const left = {
    x: input.player.left - playerGap - input.panel.width,
    y: centeredY,
    anchor: input.facing === "left" ? "ahead-player" : "behind-player"
  };
  const right = {
    x: input.player.right + playerGap,
    y: centeredY,
    anchor: input.facing === "right" ? "ahead-player" : "behind-player"
  };
  const ahead = input.facing === "left" ? left : right;
  const behind = input.facing === "left" ? right : left;
  const ordered = input.direction === "up" ? [above, ahead, behind, below] : [below, ahead, behind, above];
  for (const candidate of ordered) {
    pushCandidate(candidates, seen, candidate, bounds);
  }
}
function addViewportCandidates(candidates, seen, bounds, direction) {
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const top = { x: centerX, y: bounds.minY, anchor: "viewport-top" };
  const bottom = { x: centerX, y: bounds.maxY, anchor: "viewport-bottom" };
  const vertical = direction === "up" ? [top, bottom] : [bottom, top];
  for (const candidate of [
    ...vertical,
    { x: bounds.minX, y: centerY, anchor: "viewport-left" },
    { x: bounds.maxX, y: centerY, anchor: "viewport-right" },
    { x: centerX, y: centerY, anchor: "viewport-center" },
    { x: bounds.minX, y: bounds.minY, anchor: "viewport-top" },
    { x: bounds.maxX, y: bounds.minY, anchor: "viewport-top" },
    { x: bounds.minX, y: bounds.maxY, anchor: "viewport-bottom" },
    { x: bounds.maxX, y: bounds.maxY, anchor: "viewport-bottom" }
  ]) {
    pushCandidate(candidates, seen, candidate, bounds);
  }
}
function addCriticalGridCandidates(candidates, seen, input, bounds, playerGap, obstacleGap) {
  const xCoordinates = /* @__PURE__ */ new Set([
    bounds.minX,
    bounds.maxX,
    (bounds.minX + bounds.maxX) / 2,
    input.player.left - playerGap - input.panel.width,
    input.player.right + playerGap
  ]);
  const yCoordinates = /* @__PURE__ */ new Set([
    bounds.minY,
    bounds.maxY,
    (bounds.minY + bounds.maxY) / 2,
    input.player.top - playerGap - input.panel.height,
    input.player.bottom + playerGap
  ]);
  for (const obstacle of input.obstacles ?? []) {
    xCoordinates.add(obstacle.rect.left - obstacleGap - input.panel.width);
    xCoordinates.add(obstacle.rect.right + obstacleGap);
    yCoordinates.add(obstacle.rect.top - obstacleGap - input.panel.height);
    yCoordinates.add(obstacle.rect.bottom + obstacleGap);
  }
  const xs = [...xCoordinates].sort((first, second) => first - second);
  const ys = [...yCoordinates].sort((first, second) => first - second);
  for (const y of ys) {
    for (const x of xs) {
      pushCandidate(candidates, seen, { x, y, anchor: "fallback-grid" }, bounds);
    }
  }
}
/**
 * Returns the first deterministic safe anchor, then falls back to a critical
 * coordinate grid derived from player and obstacle edges. A valid result has
 * zero player intersection, the requested player clearance, and no expanded
 * obstacle intersection.
 */
function chooseAreaPanelPlacement(input) {
  const safeArea = {
    top: finiteOr(input.safeArea?.top, DEFAULT_EDGE_PADDING),
    right: finiteOr(input.safeArea?.right, DEFAULT_EDGE_PADDING),
    bottom: finiteOr(input.safeArea?.bottom, DEFAULT_EDGE_PADDING),
    left: finiteOr(input.safeArea?.left, DEFAULT_EDGE_PADDING)
  };
  const panel = {
    width: Math.max(AREA_PANEL_MIN_TOUCH_TARGET, finiteOr(input.panel.width, 0)),
    height: Math.max(AREA_PANEL_MIN_TOUCH_TARGET, finiteOr(input.panel.height, 0))
  };
  const bounds = {
    minX: safeArea.left,
    maxX: input.viewport.width - safeArea.right - panel.width,
    minY: safeArea.top,
    maxY: input.viewport.height - safeArea.bottom - panel.height
  };
  const playerGap = Math.max(
    AREA_PANEL_MIN_PLAYER_GAP,
    finiteOr(input.playerGap, AREA_PANEL_MIN_PLAYER_GAP)
  );
  const obstacleGap = finiteOr(input.obstacleGap, DEFAULT_OBSTACLE_GAP);
  if (!Number.isFinite(input.viewport.width) || !Number.isFinite(input.viewport.height) || bounds.maxX < bounds.minX || bounds.maxY < bounds.minY) {
    const rect = rectFromOrigin(bounds.minX, bounds.minY, panel.width, panel.height);
    return {
      x: bounds.minX,
      y: bounds.minY,
      rect,
      anchor: "unavailable",
      valid: false,
      playerIntersectionArea: areaPanelIntersectionArea(rect, input.player),
      playerDistance: areaPanelRectDistance(rect, input.player),
      obstacleIntersections: []
    };
  }
  const candidates = [];
  const seen = /* @__PURE__ */ new Set();
  addPlayerCandidates(candidates, seen, input, bounds, playerGap);
  addViewportCandidates(candidates, seen, bounds, input.direction);
  addCriticalGridCandidates(candidates, seen, input, bounds, playerGap, obstacleGap);
  let bestInvalid = null;
  for (const candidate of candidates) {
    const placement = evaluateCandidate(
      candidate,
      panel,
      input.player,
      input.obstacles ?? [],
      playerGap,
      obstacleGap
    );
    if (placement.valid) return placement;
    if (bestInvalid === null || placement.obstacleIntersections.length < bestInvalid.obstacleIntersections.length || placement.obstacleIntersections.length === bestInvalid.obstacleIntersections.length && placement.playerDistance > bestInvalid.playerDistance) {
      bestInvalid = placement;
    }
  }
  return bestInvalid ?? {
    x: bounds.minX,
    y: bounds.minY,
    rect: rectFromOrigin(bounds.minX, bounds.minY, panel.width, panel.height),
    anchor: "unavailable",
    valid: false,
    playerIntersectionArea: 0,
    playerDistance: 0,
    obstacleIntersections: []
  };
}
function isAreaPanelFacing(value) {
  return value === "left" || value === "right" || value === "up" || value === "down";
}
function normalizeAreaPanelPlayerGeometry(value) {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value;
  const rect = candidate.rect;
  if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.top) || !Number.isFinite(rect.width) || !Number.isFinite(rect.height) || (rect.width ?? 0) <= 0 || (rect.height ?? 0) <= 0) {
    return null;
  }
  return {
    rect: createAreaPanelRect(
      rect.left ?? 0,
      rect.top ?? 0,
      rect.width ?? 0,
      rect.height ?? 0
    ),
    facing: isAreaPanelFacing(candidate.facing) ? candidate.facing : "right"
  };
}
export {
  AREA_PANEL_MIN_PLAYER_GAP,
  AREA_PANEL_MIN_TOUCH_TARGET,
  areaPanelIntersectionArea,
  areaPanelRectDistance,
  chooseAreaPanelPlacement,
  createAreaPanelRect,
  normalizeAreaPanelPlayerGeometry
};
