import { validateAreaGraph as validateAreaGraphIssues } from './navigationValidation.mjs';

/**
 * @typedef {import('./areaGraph.d.mts').AreaGraph} AreaGraph
 * @typedef {import('./areaGraph.d.mts').AreaDefinition} AreaDefinition
 * @typedef {import('./areaGraph.d.mts').SpawnPoint} SpawnPoint
 * @typedef {import('./areaGraph.d.mts').AreaExit} AreaExit
 * @typedef {import('./areaGraph.d.mts').ExitLocator} ExitLocator
 * @typedef {import('./areaGraph.d.mts').ExitTrigger} ExitTrigger
 * @typedef {import('./areaGraph.d.mts').M14AreaGraphOverrides} M14AreaGraphOverrides
 */

/**
 * @param {AreaGraph} graph
 * @param {string} areaId
 * @returns {AreaDefinition | undefined}
 */
export function getArea(graph, areaId) {
  return graph.areas.find((area) => area.id === areaId);
}

/**
 * @param {AreaGraph} graph
 * @param {string} areaId
 * @param {string} spawnId
 * @returns {SpawnPoint | undefined}
 */
export function getSpawnPoint(graph, areaId, spawnId) {
  const area = getArea(graph, areaId);
  if (!area) return undefined;
  return area.spawnPoints.find((spawn) => spawn.id === spawnId);
}

/**
 * @param {ExitTrigger} trigger
 * @param {ExitLocator} locator
 * @returns {boolean}
 */
function triggerMatches(trigger, locator) {
  if (!trigger) return false;
  if (trigger.kind === 'range') {
    return locator.x >= trigger.minX && locator.x <= trigger.maxX;
  }
  if (trigger.kind === 'marker') {
    return locator.markerId != null && locator.markerId === trigger.markerId;
  }
  return false;
}

/**
 * @param {AreaGraph} graph
 * @param {string} areaId
 * @param {import('./areaGraph.d.mts').Direction} direction
 * @param {ExitLocator} locator
 * @returns {AreaExit | undefined}
 */
function findExit(graph, areaId, direction, locator) {
  const area = getArea(graph, areaId);
  if (!area) return undefined;
  return area.exits.find(
    (exit) => exit.enabled && exit.direction === direction && triggerMatches(exit.trigger, locator),
  );
}

/**
 * @param {AreaGraph} graph
 * @param {string} areaId
 * @param {'left' | 'right'} direction
 * @param {ExitLocator} locator
 * @returns {AreaExit | undefined}
 */
export function findHorizontalExit(graph, areaId, direction, locator) {
  if (direction !== 'left' && direction !== 'right') return undefined;
  return findExit(graph, areaId, direction, locator);
}

/**
 * @param {AreaGraph} graph
 * @param {string} areaId
 * @param {'up' | 'down'} direction
 * @param {ExitLocator} locator
 * @returns {AreaExit | undefined}
 */
export function findDirectionalExit(graph, areaId, direction, locator) {
  if (direction !== 'up' && direction !== 'down') return undefined;
  return findExit(graph, areaId, direction, locator);
}

/**
 * @param {AreaGraph} graph
 * @param {string} areaId
 * @param {'up' | 'down'} direction
 * @param {ExitLocator} locator
 * @returns {boolean}
 */
export function isDirectionalPromptVisible(graph, areaId, direction, locator) {
  return findDirectionalExit(graph, areaId, direction, locator) !== undefined;
}

/**
 * @param {AreaGraph} graph
 */
export function validateAreaGraph(graph) {
  return validateAreaGraphIssues(graph);
}

/**
 * @param {AreaGraph} graph
 */
export function isAreaGraphValid(graph) {
  return validateAreaGraphIssues(graph).length === 0;
}

const DEFAULT_HOME_STREET_WIDTH = 1600;
const DEFAULT_LIFE_ROAD_WIDTH = 2200;
const DEFAULT_UPPER_VENDING_LANE_WIDTH = 1400;
const DEFAULT_GROUND_Y = 520;
const EDGE_TRIGGER_WIDTH = 48;
const MARKER_TRIGGER_HALF_WIDTH = 64;

/**
 * Builds the M1.4 three-area navigation graph (home-street / life-road /
 * upper-vending-lane). All placement numbers are plain configuration data,
 * not hardcoded logic - ChatGPT/Scene integration is expected to override
 * them once real background widths and marker positions are finalized.
 * See docs/specs/M1_4_NAVIGATION_CORE.md for the full rationale.
 *
 * @param {M14AreaGraphOverrides} [overrides]
 * @returns {AreaGraph}
 */
export function createM14AreaGraph(overrides = {}) {
  const homeStreetWidth = overrides.homeStreetWidth ?? DEFAULT_HOME_STREET_WIDTH;
  const lifeRoadWidth = overrides.lifeRoadWidth ?? DEFAULT_LIFE_ROAD_WIDTH;
  const upperVendingLaneWidth = overrides.upperVendingLaneWidth ?? DEFAULT_UPPER_VENDING_LANE_WIDTH;
  const groundY = overrides.groundY ?? DEFAULT_GROUND_Y;
  const verticalMarkerX = lifeRoadWidth * 0.6;

  return {
    areas: [
      {
        id: 'home-street',
        label: '自宅前',
        worldWidth: homeStreetWidth,
        groundY,
        spawnPoints: [
          { id: 'default', x: homeStreetWidth / 2, facing: 'down' },
          { id: 'from-life-road', x: homeStreetWidth - EDGE_TRIGGER_WIDTH * 2, facing: 'left' },
        ],
        exits: [
          {
            id: 'home-street-to-life-road',
            direction: 'right',
            trigger: { kind: 'range', minX: homeStreetWidth - EDGE_TRIGGER_WIDTH, maxX: homeStreetWidth },
            targetAreaId: 'life-road',
            targetSpawnId: 'from-home-street',
            transitionType: 'fade',
            enabled: true,
          },
        ],
        metadata: {},
      },
      {
        id: 'life-road',
        label: '住宅街の生活道路',
        worldWidth: lifeRoadWidth,
        groundY,
        spawnPoints: [
          { id: 'from-home-street', x: EDGE_TRIGGER_WIDTH * 2, facing: 'right' },
          { id: 'from-upper-vending-lane', x: verticalMarkerX, facing: 'down' },
        ],
        exits: [
          {
            id: 'life-road-to-home-street',
            direction: 'left',
            trigger: { kind: 'range', minX: 0, maxX: EDGE_TRIGGER_WIDTH },
            targetAreaId: 'home-street',
            targetSpawnId: 'from-life-road',
            transitionType: 'fade',
            enabled: true,
          },
          {
            id: 'life-road-to-upper-vending-lane',
            direction: 'up',
            trigger: {
              kind: 'range',
              minX: verticalMarkerX - MARKER_TRIGGER_HALF_WIDTH,
              maxX: verticalMarkerX + MARKER_TRIGGER_HALF_WIDTH,
            },
            targetAreaId: 'upper-vending-lane',
            targetSpawnId: 'from-life-road',
            transitionType: 'fade',
            enabled: true,
            prompt: '上側の自販機路地へ',
          },
        ],
        metadata: {},
      },
      {
        id: 'upper-vending-lane',
        label: '上側の自販機路地',
        worldWidth: upperVendingLaneWidth,
        groundY,
        spawnPoints: [{ id: 'from-life-road', x: upperVendingLaneWidth / 2, facing: 'down' }],
        exits: [
          {
            id: 'upper-vending-lane-to-life-road',
            direction: 'down',
            trigger: {
              kind: 'range',
              minX: upperVendingLaneWidth / 2 - MARKER_TRIGGER_HALF_WIDTH,
              maxX: upperVendingLaneWidth / 2 + MARKER_TRIGGER_HALF_WIDTH,
            },
            targetAreaId: 'life-road',
            targetSpawnId: 'from-upper-vending-lane',
            transitionType: 'fade',
            enabled: true,
            prompt: '住宅街の生活道路へ',
          },
        ],
        metadata: {},
      },
    ],
  };
}
