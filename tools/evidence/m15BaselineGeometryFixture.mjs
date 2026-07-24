const BASELINE_COMMIT = '29223ee31fd4fc4fbca21a37b01fe89277279647';

const deepFreeze = (value) => {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

const background = (areaId, phase, sha256, bytes, width) => ({
  path: `/assets/images/m14/bg-${areaId}-${phase}.webp`,
  sha256,
  bytes,
  width,
  height: 720,
});

/**
 * Image-only baseline annotations for like-for-like M1.5 visual Evidence.
 *
 * These coordinates were selected from the baseline raster pixels. They do not
 * import or mirror runtime ground, spawn, arrow, or traversal-trigger values.
 */
export const M15_BASELINE_GEOMETRY_FIXTURE = deepFreeze({
  schemaVersion: 1,
  baselineCommit: BASELINE_COMMIT,
  sourceRevision: 'M1.4',
  officialAreaIds: [
    'home-street',
    'life-road',
    'upper-vending-lane',
  ],
  measurement: {
    measuredDate: '2026-07-24',
    method: [
      'Verified all 12 current M1.4 backgrounds are byte-identical to the baseline commit.',
      'Reviewed each native 720px-high raster at 100% and with a 2x overlay grid.',
      'Marked the continuous horizontal painted road surface independently at left, center, and right.',
      'Cross-checked the same geometry in morning, day, evening, and night rasters.',
      'Measured the life-road uphill mouth where its painted side edges meet the horizontal road.',
      'Inspected the complete upper-vending-lane front edge for any painted downward branch.',
    ],
    sourceIndependence: (
      'Visual raster annotation only; runtime ground, spawn, arrow, and trigger '
      + 'constants are not sources for this fixture.'
    ),
    coordinateSpace: {
      units: 'native-raster-pixels',
      origin: 'top-left',
      xAxis: 'positive-right',
      yAxis: 'positive-down',
      scaling: 'none',
      transforms: 'none',
    },
    overlayGrid: {
      reviewScale: 2,
      xMinorStepPx: 20,
      xMajorStepPx: 100,
      yMinorStepPx: 10,
      yMajorStepPx: 50,
      tracked: false,
    },
    selectedLineUncertaintyPx: 2,
  },
  areas: {
    'home-street': {
      imageSize: { width: 2400, height: 720 },
      backgrounds: {
        morning: background(
          'home-street',
          'morning',
          'cda6e6696196c2e9e9a481bd186b8c352ebd4420edd018f392713c94ae0a6ef9',
          504010,
          2400,
        ),
        day: background(
          'home-street',
          'day',
          'b2a03e97629aa3bf474c093b286b061ce73085c15a8853a0d3de17d6c43ccae2',
          545072,
          2400,
        ),
        evening: background(
          'home-street',
          'evening',
          '3e913e3e6180e298d9395ab2a55c041aae8e320bc74c75de3a9610191d417e6d',
          372122,
          2400,
        ),
        night: background(
          'home-street',
          'night',
          'cfed8aeb413b0dc8e374bbba3ce53d1af306520031eac2744125a795b530d652',
          141698,
          2400,
        ),
      },
      visualGround: {
        surface: 'continuous horizontal asphalt between the rear road seam and near curb',
        paintedSurfaceBand: { topY: 556, bottomY: 600 },
        samples: [
          { position: 'left', x: 240, y: 590 },
          { position: 'center', x: 1200, y: 590 },
          { position: 'right', x: 2160, y: 590 },
        ],
        verifiedPhases: ['morning', 'day', 'evening', 'night'],
      },
    },
    'life-road': {
      imageSize: { width: 2680, height: 720 },
      backgrounds: {
        morning: background(
          'life-road',
          'morning',
          'd32ac9ec7d0e5611b6294da3f3c092d37c368e0d15893a32c1acb19cd8675870',
          517852,
          2680,
        ),
        day: background(
          'life-road',
          'day',
          '79343f8ce844abf35c663caeba80eee1835a6803a5a9263123f3931da06a9116',
          564826,
          2680,
        ),
        evening: background(
          'life-road',
          'evening',
          'ca02ceda2d999f77b2205e1aafdc449d4484f9d33ad5b2e6d99b190815a9b72f',
          386214,
          2680,
        ),
        night: background(
          'life-road',
          'night',
          '28da6dff8f34cb9df34ac51946f1fb3ce1bc35d83e6a84b48c68848a4c1188bb',
          156154,
          2680,
        ),
      },
      visualGround: {
        surface: 'continuous horizontal asphalt below the uphill-road mouth',
        paintedSurfaceBand: { topY: 596, bottomY: 648 },
        samples: [
          { position: 'left', x: 268, y: 634 },
          { position: 'center', x: 1340, y: 634 },
          { position: 'right', x: 2412, y: 634 },
        ],
        verifiedPhases: ['morning', 'day', 'evening', 'night'],
      },
      paintedUphillEntrance: {
        present: true,
        feature: 'receding asphalt lane between the left drain edge and right wall/curb edge',
        mouth: {
          minX: 820,
          maxX: 1300,
          centerX: 1060,
          annotationY: 584,
        },
        centerDerivation: '(820 + 1300) / 2',
        verifiedPhases: ['morning', 'day', 'evening', 'night'],
      },
    },
    'upper-vending-lane': {
      imageSize: { width: 2320, height: 720 },
      backgrounds: {
        morning: background(
          'upper-vending-lane',
          'morning',
          '6419e5500acbb6cf38b26e082d43aed51a7f1d7d56b850956a589e2b02dd0d32',
          352952,
          2320,
        ),
        day: background(
          'upper-vending-lane',
          'day',
          '4907e65f988ecdb27b88a67745fa8782fdf048d6e199b2ab155fb20c5a3185b1',
          388962,
          2320,
        ),
        evening: background(
          'upper-vending-lane',
          'evening',
          'bf123e044df5662df6d15d1a00fbf9e2012bfb82071d3d4a2cbf0bf830f3d451',
          251110,
          2320,
        ),
        night: background(
          'upper-vending-lane',
          'night',
          '741b0f5733eab233149ca87f66764bae95c2d60bd8110bb26e65e04eb30cb0ce',
          87396,
          2320,
        ),
      },
      visualGround: {
        surface: 'continuous horizontal lane in front of the wall, shed, vending machine, and rail',
        paintedSurfaceBand: { topY: 522, bottomY: 599 },
        samples: [
          { position: 'left', x: 232, y: 575 },
          { position: 'center', x: 1160, y: 575 },
          { position: 'right', x: 2088, y: 575 },
        ],
        verifiedPhases: ['morning', 'day', 'evening', 'night'],
      },
      paintedDownwardEntrance: {
        present: false,
        entranceRangeX: null,
        centerX: null,
        inspectedRegion: {
          minX: 0,
          maxX: 2320,
          minY: 522,
          maxY: 640,
        },
        observedFrontEdge: {
          continuity: 'unbroken-retaining-edge',
          approximateY: 604,
          minX: 0,
          maxX: 2320,
        },
        finding: (
          'No stair, ramp, lane opening, T-junction, or other painted route '
          + 'branches downward from the horizontal lane in any phase.'
        ),
        verifiedPhases: ['morning', 'day', 'evening', 'night'],
      },
    },
  },
});

export const getM15BaselineGeometryArea = (areaId) => {
  const area = M15_BASELINE_GEOMETRY_FIXTURE.areas[areaId];
  if (!area) throw new Error(`Unknown M1.5 baseline geometry area: ${areaId}`);
  return area;
};
