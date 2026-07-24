import {
  M15_AREA_IDS,
  M15_GEOMETRY_FIXTURE,
  getM15GeometryArea,
} from './m15GeometryFixture.mjs';

const VIEWPORT_HEIGHT =
  M15_GEOMETRY_FIXTURE.coordinateSpace.worldHeight;

function spawn(id, annotation) {
  return Object.freeze({
    id,
    x: annotation.x,
    y: annotation.y,
    facing: annotation.facing,
  });
}

function connectedExit(
  id,
  direction,
  trigger,
  activationRange,
  targetAreaId,
  targetSpawnId,
  targetFacing,
) {
  return Object.freeze({
    id,
    kind: 'connected',
    enabled: true,
    direction,
    trigger,
    activationRange,
    zone: activationRange,
    arrowRange: trigger === 'branch' ? activationRange : null,
    targetAreaId,
    targetSpawnId,
    targetFacing,
    target: Object.freeze({
      areaId: targetAreaId,
      spawnId: targetSpawnId,
      facing: targetFacing,
    }),
  });
}

function closedExit(id, direction, trigger, activationRange, hint) {
  return Object.freeze({
    id,
    kind: 'closed',
    enabled: false,
    direction,
    trigger,
    activationRange,
    zone: activationRange,
    arrowRange: null,
    target: null,
    reason: 'future-area',
    hint,
  });
}

function areaMetadata(ambientProfile) {
  return Object.freeze({
    ambientProfile,
    preserveAcrossTransition: Object.freeze([
      'timeMinutes',
      'timePhase',
      'audioEnabled',
    ]),
  });
}

function areaAssets(geometry) {
  return geometry.assets;
}

function freezeArea(area) {
  const exits = Object.freeze({
    left: area.leftExit,
    right: area.rightExit,
    up: area.upExit,
    down: area.downExit,
  });
  return Object.freeze({
    ...area,
    label: area.displayName,
    cameraBounds: Object.freeze(area.cameraBounds),
    spawnPoints: Object.freeze(area.spawnPoints),
    exits,
    arrowRanges: Object.freeze(area.arrowRanges),
    assets: Object.freeze(area.assets),
    metadata: Object.freeze(area.metadata),
  });
}

export const M14_AREA_IDS = M15_AREA_IDS;

export const M14_INITIAL_LOCATION = Object.freeze({
  areaId: 'home-street',
  spawnId: 'start',
});

const homeGeometry = getM15GeometryArea('home-street');
const lifeGeometry = getM15GeometryArea('life-road');
const upperGeometry = getM15GeometryArea('upper-vending-lane');

export const M14_AREA_DEFINITIONS = Object.freeze({
  'home-street': freezeArea({
    areaId: 'home-street',
    displayName: '自宅前',
    sceneKey: 'M14SideScrollScene',
    backgroundAssetId: homeGeometry.assets.backgroundAssetId,
    worldWidth: homeGeometry.worldWidth,
    groundY: homeGeometry.ground.y,
    cameraBounds: {
      x: 0,
      y: 0,
      width: homeGeometry.worldWidth,
      height: VIEWPORT_HEIGHT,
    },
    spawnPoints: {
      start: spawn('start', homeGeometry.spawns.start),
      'from-life': spawn('from-life', homeGeometry.spawns['from-life']),
    },
    leftExit: closedExit(
      'home-left-closed',
      'left',
      'boundary',
      homeGeometry.edgeTriggers.left,
      'この先は、まだ工事中です',
    ),
    rightExit: connectedExit(
      'home-to-life',
      'right',
      'boundary',
      homeGeometry.edgeTriggers.right,
      'life-road',
      'from-home',
      'right',
    ),
    upExit: closedExit('home-up-closed', 'up', 'branch', null, ''),
    downExit: closedExit('home-down-closed', 'down', 'branch', null, ''),
    arrowRanges: {},
    assets: areaAssets(homeGeometry),
    metadata: areaMetadata('quiet-residential'),
  }),

  'life-road': freezeArea({
    areaId: 'life-road',
    displayName: '生活道路',
    sceneKey: 'M14SideScrollScene',
    backgroundAssetId: lifeGeometry.assets.backgroundAssetId,
    worldWidth: lifeGeometry.worldWidth,
    groundY: lifeGeometry.ground.y,
    cameraBounds: {
      x: 0,
      y: 0,
      width: lifeGeometry.worldWidth,
      height: VIEWPORT_HEIGHT,
    },
    spawnPoints: {
      'from-home': spawn('from-home', lifeGeometry.spawns['from-home']),
      'from-upper': spawn('from-upper', lifeGeometry.spawns['from-upper']),
    },
    leftExit: connectedExit(
      'life-to-home',
      'left',
      'boundary',
      lifeGeometry.edgeTriggers.left,
      'home-street',
      'from-life',
      'left',
    ),
    rightExit: closedExit(
      'life-right-closed',
      'right',
      'boundary',
      lifeGeometry.edgeTriggers.right,
      'この先は、次の街エリアで開通します',
    ),
    upExit: connectedExit(
      'life-to-upper',
      'up',
      'branch',
      lifeGeometry.branchEntrances.up.triggerRange,
      'upper-vending-lane',
      'from-life',
      'right',
    ),
    downExit: closedExit('life-down-closed', 'down', 'branch', null, ''),
    arrowRanges: {
      up: lifeGeometry.branchEntrances.up.triggerRange,
    },
    assets: areaAssets(lifeGeometry),
    metadata: areaMetadata('neighborhood-road'),
  }),

  'upper-vending-lane': freezeArea({
    areaId: 'upper-vending-lane',
    displayName: '自販機路地',
    sceneKey: 'M14SideScrollScene',
    backgroundAssetId: upperGeometry.assets.backgroundAssetId,
    worldWidth: upperGeometry.worldWidth,
    groundY: upperGeometry.ground.y,
    cameraBounds: {
      x: 0,
      y: 0,
      width: upperGeometry.worldWidth,
      height: VIEWPORT_HEIGHT,
    },
    spawnPoints: {
      'from-life': spawn('from-life', upperGeometry.spawns['from-life']),
    },
    leftExit: closedExit(
      'upper-left-closed',
      'left',
      'boundary',
      upperGeometry.edgeTriggers.left,
      'この先は、まだ工事中です',
    ),
    rightExit: closedExit(
      'upper-right-closed',
      'right',
      'boundary',
      upperGeometry.edgeTriggers.right,
      'この先は、まだ工事中です',
    ),
    upExit: closedExit('upper-up-closed', 'up', 'branch', null, ''),
    downExit: connectedExit(
      'upper-to-life',
      'down',
      'branch',
      upperGeometry.branchEntrances.down.triggerRange,
      'life-road',
      'from-upper',
      'left',
    ),
    arrowRanges: {
      down: upperGeometry.branchEntrances.down.triggerRange,
    },
    assets: areaAssets(upperGeometry),
    metadata: areaMetadata('shaded-vending-alley'),
  }),
});

export function isM14AreaId(value) {
  return M14_AREA_IDS.includes(value);
}

export function getM14AreaDefinition(areaId) {
  const area = M14_AREA_DEFINITIONS[areaId];
  if (!area) {
    throw new RangeError(`Unknown M1.5 area: ${String(areaId)}`);
  }
  return area;
}

export function getM14SpawnPoint(areaId, spawnId) {
  const area = getM14AreaDefinition(areaId);
  const spawnPoint = area.spawnPoints[spawnId];
  if (!spawnPoint) {
    throw new RangeError(`Unknown M1.5 spawn: ${areaId}/${String(spawnId)}`);
  }
  return spawnPoint;
}
