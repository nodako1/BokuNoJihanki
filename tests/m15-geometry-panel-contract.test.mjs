import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  M14_AREA_DEFINITIONS,
  getM14AreaDefinition,
} from '../src/game/areas/m14AreaData.mjs';
import {
  M15_AREA_IDS,
  M15_GEOMETRY_FIXTURE,
  M15_TIME_PHASES,
  getM15GeometryArea,
} from '../src/game/areas/m15GeometryFixture.mjs';
import {
  AREA_PANEL_MIN_PLAYER_GAP,
  AREA_PANEL_MIN_TOUCH_TARGET,
  areaPanelIntersectionArea,
  areaPanelRectDistance,
  chooseAreaPanelPlacement,
  createAreaPanelRect,
} from '../src/ui/areaPanelPlacement.mjs';

const PUBLIC_ROOT = new URL('../public/', import.meta.url);
const RUNTIME_AREA_SOURCE = new URL(
  '../src/game/areas/m14AreaData.mjs',
  import.meta.url,
);
const PANEL_VIEWPORTS = Object.freeze([
  { width: 1280, height: 720 },
  { width: 844, height: 390 },
  { width: 932, height: 430 },
]);
const PANEL_SIZE = Object.freeze({ width: 260, height: 88 });
const SAFE_AREA = Object.freeze({
  top: 12,
  right: 12,
  bottom: 12,
  left: 12,
});
const OBSTACLE_GAP = 8;

function sha256ForPublicAsset(assetPath) {
  const relativePath = assetPath.replace(/^\/+/, '');
  return createHash('sha256')
    .update(readFileSync(new URL(relativePath, PUBLIC_ROOT)))
    .digest('hex');
}

function panelObstacles(viewport) {
  const clockWidth = Math.min(210, viewport.width * 0.25);
  const actionWidth = Math.min(224, viewport.width * 0.27);
  const joystickSize = Math.min(136, viewport.height * 0.34);
  const controlWidth = Math.min(260, viewport.width * 0.32);

  return [
    {
      id: 'clock-hud',
      rect: createAreaPanelRect(12, 12, clockWidth, 58),
    },
    {
      id: 'audio-actions',
      rect: createAreaPanelRect(
        viewport.width - actionWidth - 12,
        12,
        actionWidth,
        58,
      ),
    },
    {
      id: 'touch-joystick',
      rect: createAreaPanelRect(
        12,
        viewport.height - joystickSize - 12,
        joystickSize,
        joystickSize,
      ),
    },
    {
      id: 'control-hint',
      rect: createAreaPanelRect(
        (viewport.width - controlWidth) / 2,
        viewport.height - 56,
        controlWidth,
        44,
      ),
    },
    {
      id: 'build-badge',
      rect: createAreaPanelRect(
        viewport.width - 112,
        viewport.height - 44,
        100,
        32,
      ),
    },
  ];
}

function triggerSamples(entrance) {
  return [
    { name: 'start', worldX: entrance.triggerRange.minX, ratio: 0 },
    { name: 'center', worldX: entrance.triggerCenterX, ratio: 0.5 },
    { name: 'end', worldX: entrance.triggerRange.maxX, ratio: 1 },
  ];
}

function playerRectForMatrix(viewport, area, triggerSample) {
  const { frameSize, footPivot, runtimeScale } =
    M15_GEOMETRY_FIXTURE.player;
  const worldToCssScale =
    viewport.height / M15_GEOMETRY_FIXTURE.coordinateSpace.worldHeight;
  const renderedWidth = frameSize.width * runtimeScale * worldToCssScale;
  const renderedHeight = frameSize.height * runtimeScale * worldToCssScale;
  const screenFootX =
    viewport.width * (0.36 + triggerSample.ratio * 0.28);
  const screenFootY = area.ground.y * worldToCssScale;

  return createAreaPanelRect(
    screenFootX - renderedWidth * footPivot.x,
    screenFootY - renderedHeight * footPivot.y,
    renderedWidth,
    renderedHeight,
  );
}

test('M1.5 fixture is immutable and owns the complete official geometry domain', () => {
  assert.deepEqual(M15_AREA_IDS, [
    'home-street',
    'life-road',
    'upper-vending-lane',
  ]);
  assert.deepEqual(M15_TIME_PHASES, ['morning', 'day', 'evening', 'night']);
  assert.equal('home-yard' in M15_GEOMETRY_FIXTURE.areas, false);
  assert.ok(Object.isFrozen(M15_GEOMETRY_FIXTURE));
  assert.ok(Object.isFrozen(M15_GEOMETRY_FIXTURE.player));

  const runtimeSource = readFileSync(RUNTIME_AREA_SOURCE, 'utf8');
  assert.match(runtimeSource, /getM15GeometryArea/);
  assert.doesNotMatch(
    runtimeSource,
    /groundY:\s*\d/,
    'runtime must not duplicate fixture ground coordinates',
  );
  assert.doesNotMatch(
    runtimeSource,
    /(?:triggerRange|backgroundRange):\s*\{\s*minX:\s*\d/,
    'runtime must not duplicate fixture entrance coordinates',
  );
});

test('background, foreground and player paths are bound to fixture SHA-256 values', () => {
  const boundPaths = new Set();

  for (const areaId of M15_AREA_IDS) {
    const area = getM15GeometryArea(areaId);
    assert.equal(area.areaId, areaId);
    assert.equal(
      Object.keys(area.assets.backgroundPaths).length,
      M15_TIME_PHASES.length,
    );

    for (const phase of M15_TIME_PHASES) {
      const assetPath = area.assets.backgroundPaths[phase];
      assert.match(assetPath, /^\/assets\/images\/m15\/.+\.webp$/);
      assert.equal(
        sha256ForPublicAsset(assetPath),
        area.assets.backgroundSha256[phase],
        `${areaId}/${phase} background must match its visual annotation hash`,
      );
      assert.equal(boundPaths.has(assetPath), false, `${assetPath} is duplicated`);
      boundPaths.add(assetPath);
    }

    assert.equal(
      sha256ForPublicAsset(area.assets.foregroundPath),
      area.assets.foregroundSha256,
      `${areaId} foreground must match its visual annotation hash`,
    );
    assert.equal(boundPaths.has(area.assets.foregroundPath), false);
    boundPaths.add(area.assets.foregroundPath);
  }

  const player = M15_GEOMETRY_FIXTURE.player;
  assert.equal(
    sha256ForPublicAsset(player.atlasImagePath),
    player.atlasImageSha256,
  );
  assert.equal(
    sha256ForPublicAsset(player.atlasJsonPath),
    player.atlasJsonSha256,
  );
  assert.equal(boundPaths.size, M15_AREA_IDS.length * (M15_TIME_PHASES.length + 1));
});

test('three independent grounds, left/center/right samples, foot pivot and spawns stay grounded', () => {
  const { player, tolerances } = M15_GEOMETRY_FIXTURE;
  const expectedSampleNames = ['left', 'center', 'right'];

  assert.equal(
    player.footPivot.pixelX,
    player.frameSize.width * player.footPivot.x,
  );
  assert.equal(
    player.footPivot.pixelY,
    player.frameSize.height * player.footPivot.y,
  );
  assert.ok(player.footPivot.x > 0 && player.footPivot.x < 1);
  assert.ok(player.footPivot.y > 0.9 && player.footPivot.y <= 1);
  assert.ok(player.runtimeScale > 0);

  const groundValues = new Set();
  for (const areaId of M15_AREA_IDS) {
    const area = getM15GeometryArea(areaId);
    const runtimeArea = getM14AreaDefinition(areaId);
    groundValues.add(area.ground.y);

    assert.deepEqual(
      area.ground.samples.map(({ position }) => position),
      expectedSampleNames,
    );
    assert.ok(area.ground.annotation.length > 20);
    assert.equal(runtimeArea.groundY, area.ground.y);
    assert.strictEqual(runtimeArea.assets, area.assets);

    let previousX = -Infinity;
    for (const sample of area.ground.samples) {
      assert.ok(sample.x > previousX, `${areaId}/${sample.position} sample order`);
      assert.ok(sample.x >= 0 && sample.x <= area.worldWidth);
      assert.equal(sample.y, area.ground.y);
      previousX = sample.x;
    }

    assert.deepEqual(
      Object.keys(runtimeArea.spawnPoints).sort(),
      Object.keys(area.spawns).sort(),
    );
    for (const [spawnId, spawn] of Object.entries(area.spawns)) {
      const runtimeSpawn = runtimeArea.spawnPoints[spawnId];
      const spriteTop =
        spawn.y
        - player.frameSize.height * player.runtimeScale * player.footPivot.y;
      const renderedFootY =
        spriteTop
        + player.frameSize.height * player.runtimeScale * player.footPivot.y;

      assert.equal(runtimeSpawn.x, spawn.x);
      assert.equal(runtimeSpawn.y, spawn.y);
      assert.equal(runtimeSpawn.facing, spawn.facing);
      assert.ok(spawn.x >= 0 && spawn.x <= area.worldWidth);
      assert.ok(
        Math.abs(spawn.y - area.ground.y)
          <= tolerances.spawnFootToGroundCssPx,
        `${areaId}/${spawnId} fixture spawn-ground delta`,
      );
      assert.ok(
        Math.abs(renderedFootY - area.ground.y)
          <= tolerances.renderedFootToGroundCssPx,
        `${areaId}/${spawnId} rendered foot-ground delta`,
      );
    }
  }

  assert.equal(
    groundValues.size,
    M15_AREA_IDS.length,
    'each raster has its own independently measured walking surface',
  );
  assert.deepEqual(Object.keys(M14_AREA_DEFINITIONS).sort(), [...M15_AREA_IDS].sort());
});

test('painted branch entrances and traversal triggers share a <=5 CSS px center', () => {
  const expectedDirections = new Map([
    ['life-road', 'up'],
    ['upper-vending-lane', 'down'],
  ]);
  let entranceCount = 0;

  for (const areaId of M15_AREA_IDS) {
    const area = getM15GeometryArea(areaId);
    const entries = Object.entries(area.branchEntrances);
    if (!expectedDirections.has(areaId)) {
      assert.deepEqual(entries, []);
      continue;
    }

    assert.deepEqual(entries.map(([direction]) => direction), [
      expectedDirections.get(areaId),
    ]);
    for (const [direction, entrance] of entries) {
      entranceCount += 1;
      const backgroundCenter =
        (entrance.backgroundRange.minX + entrance.backgroundRange.maxX) / 2;
      const triggerCenter =
        (entrance.triggerRange.minX + entrance.triggerRange.maxX) / 2;
      const independentlyCalculatedDelta =
        Math.abs(backgroundCenter - triggerCenter);
      const runtimeExit = getM14AreaDefinition(areaId).exits[direction];

      assert.equal(entrance.backgroundCenterX, backgroundCenter);
      assert.equal(entrance.triggerCenterX, triggerCenter);
      assert.equal(entrance.centerDeltaX, independentlyCalculatedDelta);
      assert.ok(
        independentlyCalculatedDelta
          <= M15_GEOMETRY_FIXTURE.tolerances.entranceToTriggerCenterCssPx,
      );
      assert.ok(
        entrance.triggerRange.minX >= entrance.backgroundRange.minX
          && entrance.triggerRange.maxX <= entrance.backgroundRange.maxX,
      );
      assert.equal(entrance.groundY, area.ground.y);
      assert.strictEqual(runtimeExit.activationRange, entrance.triggerRange);
      assert.strictEqual(runtimeExit.arrowRange, entrance.triggerRange);
    }
  }

  assert.equal(entranceCount, expectedDirections.size);
});

test('36 panel matrix states clear player and HUD obstacles with a 44px touch target', () => {
  const directionAreas = new Map([
    ['up', getM15GeometryArea('life-road')],
    ['down', getM15GeometryArea('upper-vending-lane')],
  ]);
  const facings = ['left', 'right'];
  let matrixCount = 0;

  for (const viewport of PANEL_VIEWPORTS) {
    const obstacles = panelObstacles(viewport);
    for (const [direction, area] of directionAreas) {
      const entrance = area.branchEntrances[direction];
      for (const triggerSample of triggerSamples(entrance)) {
        assert.ok(
          triggerSample.worldX >= entrance.triggerRange.minX
            && triggerSample.worldX <= entrance.triggerRange.maxX,
        );
        const player = playerRectForMatrix(viewport, area, triggerSample);

        for (const facing of facings) {
          matrixCount += 1;
          const stateLabel = [
            `${viewport.width}x${viewport.height}`,
            direction,
            triggerSample.name,
            facing,
          ].join('/');
          const placement = chooseAreaPanelPlacement({
            viewport,
            panel: PANEL_SIZE,
            player,
            facing,
            direction,
            obstacles,
            safeArea: SAFE_AREA,
            playerGap: AREA_PANEL_MIN_PLAYER_GAP,
            obstacleGap: OBSTACLE_GAP,
          });

          assert.equal(placement.valid, true, `${stateLabel} placement`);
          assert.equal(
            areaPanelIntersectionArea(placement.rect, player),
            0,
            `${stateLabel} player overlap`,
          );
          assert.ok(
            areaPanelRectDistance(placement.rect, player)
              >= AREA_PANEL_MIN_PLAYER_GAP,
            `${stateLabel} player clearance`,
          );
          assert.ok(
            placement.rect.width >= AREA_PANEL_MIN_TOUCH_TARGET
              && placement.rect.height >= AREA_PANEL_MIN_TOUCH_TARGET,
            `${stateLabel} touch target`,
          );
          assert.ok(placement.rect.left >= SAFE_AREA.left);
          assert.ok(placement.rect.top >= SAFE_AREA.top);
          assert.ok(
            placement.rect.right <= viewport.width - SAFE_AREA.right,
          );
          assert.ok(
            placement.rect.bottom <= viewport.height - SAFE_AREA.bottom,
          );
          assert.deepEqual(
            placement.obstacleIntersections,
            [],
            `${stateLabel} expanded obstacle collision`,
          );
          for (const obstacle of obstacles) {
            assert.equal(
              areaPanelIntersectionArea(placement.rect, obstacle.rect),
              0,
              `${stateLabel}/${obstacle.id} raw obstacle overlap`,
            );
            assert.ok(
              areaPanelRectDistance(placement.rect, obstacle.rect)
                >= OBSTACLE_GAP,
              `${stateLabel}/${obstacle.id} obstacle clearance`,
            );
          }
        }
      }
    }
  }

  assert.equal(matrixCount, 36);
});
