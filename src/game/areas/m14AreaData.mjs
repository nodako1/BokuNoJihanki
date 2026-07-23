const VIEWPORT_HEIGHT = 720;
const EDGE_TRIGGER_WIDTH = 64;

function range(minX, maxX) {
  return Object.freeze({ minX, maxX });
}

function spawn(id, x, facing) {
  return Object.freeze({ id, x, facing });
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

function areaAssets(areaId) {
  return Object.freeze({
    backgroundAssetId: `m14-bg-${areaId}`,
    foregroundAssetId: `m14-fg-${areaId}`,
    backgroundPathPattern: `/assets/images/m14/bg-${areaId}-{phase}.webp`,
    foregroundPath: `/assets/images/m14/fg-${areaId}.webp`,
  });
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

export const M14_AREA_IDS = Object.freeze([
  'home-street',
  'life-road',
  'upper-vending-lane',
]);

export const M14_INITIAL_LOCATION = Object.freeze({
  areaId: 'home-street',
  spawnId: 'start',
});

const homeStreetWidth = 2400;
const lifeRoadWidth = 2680;
const upperVendingLaneWidth = 2320;

export const M14_AREA_DEFINITIONS = Object.freeze({
  'home-street': freezeArea({
    areaId: 'home-street',
    displayName: '自宅前',
    sceneKey: 'M14SideScrollScene',
    backgroundAssetId: 'm14-bg-home-street',
    worldWidth: homeStreetWidth,
    groundY: 525,
    cameraBounds: { x: 0, y: 0, width: homeStreetWidth, height: VIEWPORT_HEIGHT },
    spawnPoints: {
      start: spawn('start', 360, 'right'),
      'from-life': spawn('from-life', 2180, 'left'),
    },
    leftExit: closedExit(
      'home-left-closed',
      'left',
      'boundary',
      range(0, EDGE_TRIGGER_WIDTH),
      'この先は、まだ工事中です',
    ),
    rightExit: connectedExit(
      'home-to-life',
      'right',
      'boundary',
      range(homeStreetWidth - EDGE_TRIGGER_WIDTH, homeStreetWidth),
      'life-road',
      'from-home',
      'right',
    ),
    upExit: closedExit('home-up-closed', 'up', 'branch', null, ''),
    downExit: closedExit('home-down-closed', 'down', 'branch', null, ''),
    arrowRanges: {},
    assets: areaAssets('home-street'),
    metadata: areaMetadata('quiet-residential'),
  }),

  'life-road': freezeArea({
    areaId: 'life-road',
    displayName: '生活道路',
    sceneKey: 'M14SideScrollScene',
    backgroundAssetId: 'm14-bg-life-road',
    worldWidth: lifeRoadWidth,
    groundY: 614,
    cameraBounds: { x: 0, y: 0, width: lifeRoadWidth, height: VIEWPORT_HEIGHT },
    spawnPoints: {
      'from-home': spawn('from-home', 150, 'right'),
      'from-upper': spawn('from-upper', 1340, 'left'),
    },
    leftExit: connectedExit(
      'life-to-home',
      'left',
      'boundary',
      range(0, EDGE_TRIGGER_WIDTH),
      'home-street',
      'from-life',
      'left',
    ),
    rightExit: closedExit(
      'life-right-closed',
      'right',
      'boundary',
      range(lifeRoadWidth - EDGE_TRIGGER_WIDTH, lifeRoadWidth),
      'この先は、次の街エリアで開通します',
    ),
    upExit: connectedExit(
      'life-to-upper',
      'up',
      'branch',
      range(1220, 1480),
      'upper-vending-lane',
      'from-life',
      'right',
    ),
    downExit: closedExit('life-down-closed', 'down', 'branch', null, ''),
    arrowRanges: {
      up: range(1220, 1480),
    },
    assets: areaAssets('life-road'),
    metadata: areaMetadata('neighborhood-road'),
  }),

  'upper-vending-lane': freezeArea({
    areaId: 'upper-vending-lane',
    displayName: '自販機路地',
    sceneKey: 'M14SideScrollScene',
    backgroundAssetId: 'm14-bg-upper-vending-lane',
    worldWidth: upperVendingLaneWidth,
    groundY: 535,
    cameraBounds: {
      x: 0,
      y: 0,
      width: upperVendingLaneWidth,
      height: VIEWPORT_HEIGHT,
    },
    spawnPoints: {
      'from-life': spawn('from-life', 1160, 'right'),
    },
    leftExit: closedExit(
      'upper-left-closed',
      'left',
      'boundary',
      range(0, EDGE_TRIGGER_WIDTH),
      'この先は、まだ工事中です',
    ),
    rightExit: closedExit(
      'upper-right-closed',
      'right',
      'boundary',
      range(upperVendingLaneWidth - EDGE_TRIGGER_WIDTH, upperVendingLaneWidth),
      'この先は、まだ工事中です',
    ),
    upExit: closedExit('upper-up-closed', 'up', 'branch', null, ''),
    downExit: connectedExit(
      'upper-to-life',
      'down',
      'branch',
      range(1040, 1320),
      'life-road',
      'from-upper',
      'left',
    ),
    arrowRanges: {
      down: range(1040, 1320),
    },
    assets: areaAssets('upper-vending-lane'),
    metadata: areaMetadata('shaded-vending-alley'),
  }),
});

export function isM14AreaId(value) {
  return M14_AREA_IDS.includes(value);
}

export function getM14AreaDefinition(areaId) {
  const area = M14_AREA_DEFINITIONS[areaId];
  if (!area) {
    throw new RangeError(`Unknown M1.4 area: ${String(areaId)}`);
  }
  return area;
}

export function getM14SpawnPoint(areaId, spawnId) {
  const area = getM14AreaDefinition(areaId);
  const spawnPoint = area.spawnPoints[spawnId];
  if (!spawnPoint) {
    throw new RangeError(`Unknown M1.4 spawn: ${areaId}/${String(spawnId)}`);
  }
  return spawnPoint;
}
