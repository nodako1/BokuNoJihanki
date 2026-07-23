/**
 * @typedef {import('./areaGraph.d.mts').AreaGraph} AreaGraph
 * @typedef {import('./navigationValidation.d.mts').AreaGraphIssue} AreaGraphIssue
 * @typedef {import('./navigationValidation.d.mts').AreaGraphIssueCode} AreaGraphIssueCode
 */

const VALID_DIRECTIONS = new Set(['left', 'right', 'up', 'down']);
// Kept as a separate set from VALID_DIRECTIONS even though the values are
// currently identical: Facing and Direction are conceptually different types
// (facing is "which way the sprite looks", direction is "which way an exit
// leads") and this documents that intent independently of the coincidence.
const VALID_FACINGS = new Set(['up', 'down', 'left', 'right']);

/**
 * @param {AreaGraphIssue[]} issues
 * @param {AreaGraphIssueCode} code
 * @param {string} message
 * @param {Partial<AreaGraphIssue>} [extra]
 */
function pushIssue(issues, code, message, extra = {}) {
  issues.push({ code, message, ...extra });
}

/**
 * Validates an area graph for structural and referential correctness.
 * Never throws - always returns an array of issues (empty when valid).
 *
 * @param {AreaGraph} graph
 * @returns {readonly AreaGraphIssue[]}
 */
export function validateAreaGraph(graph) {
  /** @type {AreaGraphIssue[]} */
  const issues = [];

  if (!graph || !Array.isArray(graph.areas) || graph.areas.length === 0) {
    pushIssue(issues, 'no-areas', 'Area graph must define at least one area.');
    return issues;
  }

  const areaIds = new Set(graph.areas.map((area) => area.id));
  const seenAreaIds = new Set();
  for (const area of graph.areas) {
    if (seenAreaIds.has(area.id)) {
      pushIssue(issues, 'duplicate-area-id', `Duplicate area id: "${area.id}".`, { areaId: area.id });
    }
    seenAreaIds.add(area.id);
  }

  for (const area of graph.areas) {
    if (!Number.isFinite(area.worldWidth) || area.worldWidth <= 0) {
      pushIssue(issues, 'invalid-world-width', `Area "${area.id}" has an invalid worldWidth.`, {
        areaId: area.id,
      });
    }
    if (!Number.isFinite(area.groundY)) {
      pushIssue(issues, 'invalid-ground-y', `Area "${area.id}" has an invalid groundY.`, { areaId: area.id });
    }

    const spawnIds = new Set();
    for (const spawn of area.spawnPoints ?? []) {
      if (spawnIds.has(spawn.id)) {
        pushIssue(issues, 'duplicate-spawn-id', `Duplicate spawn id "${spawn.id}" in area "${area.id}".`, {
          areaId: area.id,
          spawnId: spawn.id,
        });
      }
      spawnIds.add(spawn.id);

      if (!Number.isFinite(spawn.x)) {
        pushIssue(issues, 'invalid-spawn-x', `Spawn "${spawn.id}" in area "${area.id}" has a non-finite x.`, {
          areaId: area.id,
          spawnId: spawn.id,
        });
      }
      if (!VALID_FACINGS.has(spawn.facing)) {
        pushIssue(
          issues,
          'invalid-spawn-facing',
          `Spawn "${spawn.id}" in area "${area.id}" has an invalid facing: ${String(spawn.facing)}.`,
          { areaId: area.id, spawnId: spawn.id },
        );
      }
    }

    const exitIds = new Set();
    for (const exit of area.exits ?? []) {
      if (exitIds.has(exit.id)) {
        pushIssue(issues, 'duplicate-exit-id', `Duplicate exit id "${exit.id}" in area "${area.id}".`, {
          areaId: area.id,
          exitId: exit.id,
        });
      }
      exitIds.add(exit.id);

      if (!VALID_DIRECTIONS.has(exit.direction)) {
        pushIssue(
          issues,
          'invalid-direction',
          `Exit "${exit.id}" in area "${area.id}" has an invalid direction: ${String(exit.direction)}.`,
          { areaId: area.id, exitId: exit.id },
        );
      }

      const trigger = exit.trigger;
      if (trigger?.kind === 'range') {
        const isMalformed =
          !Number.isFinite(trigger.minX) || !Number.isFinite(trigger.maxX) || trigger.minX > trigger.maxX;
        // Only compare against worldWidth when it is itself finite/positive -
        // an already-flagged invalid-world-width area would otherwise cause a
        // confusing second issue here (any comparison against a bad width is
        // meaningless, not just falsy).
        const isOutOfAreaBounds =
          !isMalformed &&
          Number.isFinite(area.worldWidth) &&
          area.worldWidth > 0 &&
          (trigger.minX < 0 || trigger.maxX > area.worldWidth);
        if (isMalformed || isOutOfAreaBounds) {
          pushIssue(
            issues,
            'invalid-trigger-range',
            `Exit "${exit.id}" in area "${area.id}" has an invalid trigger range.`,
            { areaId: area.id, exitId: exit.id },
          );
        }
      } else if (trigger?.kind === 'marker') {
        if (!trigger.markerId) {
          pushIssue(
            issues,
            'invalid-trigger-range',
            `Exit "${exit.id}" in area "${area.id}" has an empty marker trigger id.`,
            { areaId: area.id, exitId: exit.id },
          );
        }
      } else {
        pushIssue(
          issues,
          'invalid-trigger-range',
          `Exit "${exit.id}" in area "${area.id}" has an unknown trigger kind.`,
          { areaId: area.id, exitId: exit.id },
        );
      }

      if (!areaIds.has(exit.targetAreaId)) {
        pushIssue(
          issues,
          'missing-target-area',
          `Exit "${exit.id}" in area "${area.id}" targets unknown area "${exit.targetAreaId}".`,
          { areaId: area.id, exitId: exit.id },
        );
      } else {
        const targetArea = graph.areas.find((candidate) => candidate.id === exit.targetAreaId);
        const hasSpawn = targetArea?.spawnPoints?.some((spawn) => spawn.id === exit.targetSpawnId);
        if (!hasSpawn) {
          pushIssue(
            issues,
            'missing-target-spawn',
            `Exit "${exit.id}" in area "${area.id}" targets unknown spawn "${exit.targetSpawnId}" in area "${exit.targetAreaId}".`,
            { areaId: area.id, exitId: exit.id, spawnId: exit.targetSpawnId },
          );
        }
      }
    }
  }

  const [first] = graph.areas;
  if (first) {
    const reachable = new Set([first.id]);
    const queue = [first.id];
    while (queue.length > 0) {
      const currentId = queue.shift();
      const area = graph.areas.find((candidate) => candidate.id === currentId);
      for (const exit of area?.exits ?? []) {
        if (exit.enabled && areaIds.has(exit.targetAreaId) && !reachable.has(exit.targetAreaId)) {
          reachable.add(exit.targetAreaId);
          queue.push(exit.targetAreaId);
        }
      }
    }
    for (const area of graph.areas) {
      if (!reachable.has(area.id)) {
        pushIssue(issues, 'unreachable-area', `Area "${area.id}" is unreachable from "${first.id}".`, {
          areaId: area.id,
        });
      }
    }
  }

  return issues;
}

/**
 * @param {AreaGraph} graph
 * @returns {boolean}
 */
export function isAreaGraphValid(graph) {
  return validateAreaGraph(graph).length === 0;
}
