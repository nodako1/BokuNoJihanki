const AREA_IDS = Object.freeze([
  'home-street',
  'life-road',
  'upper-vending-lane',
]);

const TIME_PHASES = Object.freeze(['morning', 'day', 'evening', 'night']);
const EDGE_TRIGGER_WIDTH = 64;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function horizontalRange(minX, maxX) {
  return { minX, maxX };
}

function centerOf(range) {
  return (range.minX + range.maxX) / 2;
}

function edgeTriggers(worldWidth) {
  return {
    left: horizontalRange(0, EDGE_TRIGGER_WIDTH),
    right: horizontalRange(worldWidth - EDGE_TRIGGER_WIDTH, worldWidth),
  };
}

function branchEntrance(backgroundRange, triggerRange, groundY, annotation) {
  const backgroundCenterX = centerOf(backgroundRange);
  const triggerCenterX = centerOf(triggerRange);
  return {
    backgroundRange,
    backgroundCenterX,
    triggerRange,
    triggerCenterX,
    centerDeltaX: Math.abs(backgroundCenterX - triggerCenterX),
    groundY,
    annotation,
  };
}

function backgroundAssets(stem, hashes) {
  const backgroundPaths = {};
  for (const phase of TIME_PHASES) {
    backgroundPaths[phase] = `/assets/images/m15/bg-${stem}-${phase}.webp`;
  }
  return {
    backgroundAssetId: `m15-bg-${stem}`,
    foregroundAssetId: `m15-fg-${stem}`,
    backgroundPathPattern: `/assets/images/m15/bg-${stem}-{phase}.webp`,
    backgroundPaths,
    backgroundSha256: hashes.backgrounds,
    foregroundPath: `/assets/images/m15/fg-${stem}.webp`,
    foregroundSha256: hashes.foreground,
  };
}

/**
 * Independent visual annotation fixture for the immutable M1.5 raster assets.
 *
 * Coordinates were measured directly in the 1 CSS pixel = 1 image pixel,
 * 720 px-tall runtime coordinate space. Runtime area definitions, contract
 * tests, debug overlays and evidence generators must consume this object
 * rather than restating its geometry.
 */
export const M15_GEOMETRY_FIXTURE = deepFreeze({
  schemaVersion: 1,
  revision: 'M1.5',
  measuredAt: '2026-07-23',
  measurementMethod:
    'Direct visual annotation of the current decoded morning WebP at native runtime dimensions; ground samples select the middle of the flat horizontal walking surface.',
  coordinateSpace: {
    origin: 'top-left',
    unit: 'css-px',
    worldHeight: 720,
    imageToRuntimeScale: 1,
  },
  tolerances: {
    renderedFootToGroundCssPx: 2,
    spawnFootToGroundCssPx: 6,
    entranceToTriggerCenterCssPx: 5,
  },
  player: {
    atlasImagePath:
      '/assets/images/m15/player-atlas-c02fff1f264e.webp',
    atlasImageSha256:
      'acf3cf78c2dba0c30ed078de5e6b0ee6fe32b7f0cf8dd8f15fc52a8dd41d46b0',
    atlasJsonPath:
      '/assets/images/m15/player-atlas-c02fff1f264e.json',
    atlasJsonSha256:
      'fc0f7e4a495dbdf40a7e08b1305d68c57ec15b8b43f87bdcb3710a15c8458f0e',
    frameSize: { width: 256, height: 384 },
    footPivot: { x: 0.5, y: 0.9609375, pixelX: 128, pixelY: 369 },
    runtimeScale: 0.38,
  },
  areas: {
    'home-street': {
      areaId: 'home-street',
      worldWidth: 2400,
      worldHeight: 720,
      assets: backgroundAssets('home-street-ffd941607bd3', {
        backgrounds: {
          morning:
            '939713113f709a86a10cd142ea35fbd88917fd61640862f7a7406c4780f1a29d',
          day:
            'da954c4a4978633e6674e928e7db87724b23380ece3f2abdace10818cde7ccd4',
          evening:
            '9b763027835568845ef5b2f3b7ede934bca8eda4cf6ebe8f6bc3e145ae2b22e2',
          night:
            '64b95f47cb5c86dda9deb5237686fe80f671b00d7b2a7dd651b4717e86a44cd4',
        },
        foreground:
          'b955e02c5f11fb34180da06d83376d0dcc6d78f2592122a98255211b02a0bb73',
      }),
      ground: {
        y: 590,
        annotation:
          'Flat asphalt lane between the far gutter and the foreground curb.',
        samples: [
          { x: 240, y: 590, position: 'left' },
          { x: 1200, y: 590, position: 'center' },
          { x: 2160, y: 590, position: 'right' },
        ],
      },
      spawns: {
        start: { x: 360, y: 590, facing: 'right' },
        'from-life': { x: 2180, y: 590, facing: 'left' },
      },
      edgeTriggers: edgeTriggers(2400),
      branchEntrances: {},
    },
    'life-road': {
      areaId: 'life-road',
      worldWidth: 2680,
      worldHeight: 720,
      assets: backgroundAssets('life-road-bd033f51dd48', {
        backgrounds: {
          morning:
            '340d4c5fe4acb920384ae1ddcf671ce92d20f31bf433283914d25a79a26100a9',
          day:
            '9bc2fbff19140cd35851dd043a1111282422f25f97767ff1b8386f16fd430573',
          evening:
            'bf04dc7a68470dbcde2212b8b6230a48eea3cc21f45824631eaf1c37c926237f',
          night:
            '3f0792a19ebfa66fb4cc8479b2be3f2d8fae2df06cc8c11f784f6e9099d35dee',
        },
        foreground:
          '3266fab0fd7e0361ceefe2f00fe7eea7c552b33e947a9bfbbdd242d9e058dcd4',
      }),
      ground: {
        y: 634,
        annotation:
          'Flat foreground asphalt lane; the uphill branch meets it at the same foot line.',
        samples: [
          { x: 268, y: 634, position: 'left' },
          { x: 1340, y: 634, position: 'center' },
          { x: 2412, y: 634, position: 'right' },
        ],
      },
      spawns: {
        'from-home': { x: 150, y: 634, facing: 'right' },
        'from-upper': { x: 1150, y: 634, facing: 'left' },
      },
      edgeTriggers: edgeTriggers(2680),
      branchEntrances: {
        up: branchEntrance(
          horizontalRange(1000, 1300),
          horizontalRange(1060, 1240),
          634,
          'Painted uphill road mouth between the two roadside walls.',
        ),
      },
    },
    'upper-vending-lane': {
      areaId: 'upper-vending-lane',
      worldWidth: 2320,
      worldHeight: 720,
      assets: backgroundAssets('upper-vending-lane-58218a55afc2', {
        backgrounds: {
          morning:
            'f39da4d603f531ce33ab6533719ee913f86bb69ae3b781a9418c892502adb6a3',
          day:
            '6055cc308fb3796ed6fdf1a20729657777b3455c7072b0e3a4a8704d2a76dbe9',
          evening:
            'e29518020eb7fac052312484d9ccb36c7334c6d7125f26e3e167498361f13ed4',
          night:
            '4de5bdbc38212b0a4718402e9b89c880cff8db497986cf7b6ff439d0010e8127',
        },
        foreground:
          '5318e24590c33561f8456444675e8e16fd1ae202944e48cd6ed1dc6eae58b396',
      }),
      ground: {
        y: 495,
        annotation:
          'Flat top lane of the T junction, behind the retaining edge and above the descending steps.',
        samples: [
          { x: 232, y: 495, position: 'left' },
          { x: 1160, y: 495, position: 'center' },
          { x: 2088, y: 495, position: 'right' },
        ],
      },
      spawns: {
        'from-life': { x: 1420, y: 495, facing: 'right' },
      },
      edgeTriggers: edgeTriggers(2320),
      branchEntrances: {
        down: branchEntrance(
          horizontalRange(1240, 1600),
          horizontalRange(1340, 1500),
          495,
          'Top landing of the painted stone stair branch at the T junction.',
        ),
      },
    },
  },
});

export const M15_AREA_IDS = AREA_IDS;
export const M15_TIME_PHASES = TIME_PHASES;

export function isM15AreaId(value) {
  return AREA_IDS.includes(value);
}

export function getM15GeometryArea(areaId) {
  const area = M15_GEOMETRY_FIXTURE.areas[areaId];
  if (!area) {
    throw new RangeError(`Unknown M1.5 geometry area: ${String(areaId)}`);
  }
  return area;
}
