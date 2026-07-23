import assert from 'node:assert/strict';
import test from 'node:test';
import {
  M14_AREA_DEFINITIONS,
  M14_AREA_IDS,
  M14_INITIAL_LOCATION,
  getM14AreaDefinition,
  getM14SpawnPoint,
} from '../src/game/areas/m14AreaData.mjs';
import {
  HORIZONTAL_MOTION_CONFIG,
  M14_TRANSITION_PHASES,
  assertValidM14AreaGraph,
  clampCameraScrollX,
  createM14TransitionState,
  getAvailableBranchDirections,
  getM14CameraScrollX,
  interpretM14Input,
  isM14InputLocked,
  nextM14TransitionPhase,
  reduceM14Transition,
  resolveAreaExit,
  stepHorizontalMovement,
  stepHorizontalVelocity,
  validateM14AreaGraph,
} from '../src/game/navigationAdapter/m14NavigationAdapter.mjs';

test('M1.4 defines the three authored areas, dimensions and fixed ground lines', () => {
  assert.deepEqual(M14_AREA_IDS, [
    'home-street',
    'life-road',
    'upper-vending-lane',
  ]);
  assert.deepEqual(M14_INITIAL_LOCATION, {
    areaId: 'home-street',
    spawnId: 'start',
  });

  const home = getM14AreaDefinition('home-street');
  const life = getM14AreaDefinition('life-road');
  const upper = getM14AreaDefinition('upper-vending-lane');
  assert.deepEqual(
    [home.worldWidth, home.groundY, home.label],
    [2400, 525, '自宅前'],
  );
  assert.deepEqual(
    [life.worldWidth, life.groundY, life.label],
    [2680, 614, '生活道路'],
  );
  assert.deepEqual(
    [upper.worldWidth, upper.groundY, upper.label],
    [2320, 535, '自販機路地'],
  );
  assert.equal(home.cameraBounds.width, home.worldWidth);
  assert.equal(life.cameraBounds.width, life.worldWidth);
  assert.equal(upper.cameraBounds.width, upper.worldWidth);
  assert.notEqual(home.backgroundAssetId, life.backgroundAssetId);
  assert.notEqual(life.backgroundAssetId, upper.backgroundAssetId);
});

test('all four sides are explicit and future horizontal edges stay closed', () => {
  for (const area of Object.values(M14_AREA_DEFINITIONS)) {
    assert.deepEqual(Object.keys(area.exits), ['left', 'right', 'up', 'down']);
    assert.equal(area.exits.left, area.leftExit);
    assert.equal(area.exits.right, area.rightExit);
    assert.equal(area.exits.up, area.upExit);
    assert.equal(area.exits.down, area.downExit);
  }

  assert.equal(M14_AREA_DEFINITIONS['home-street'].exits.left.enabled, false);
  assert.equal(M14_AREA_DEFINITIONS['life-road'].exits.right.enabled, false);
  assert.equal(
    M14_AREA_DEFINITIONS['upper-vending-lane'].exits.left.enabled,
    false,
  );
  assert.equal(
    M14_AREA_DEFINITIONS['upper-vending-lane'].exits.right.enabled,
    false,
  );
  assert.equal(resolveAreaExit('life-road', 'right'), null);
  assert.equal(resolveAreaExit('upper-vending-lane', 'left'), null);
});

test('horizontal motion accelerates to 175 and decelerates naturally at 1150', () => {
  assert.deepEqual(HORIZONTAL_MOTION_CONFIG, {
    maxSpeed: 175,
    acceleration: 850,
    deceleration: 1150,
    stopEpsilon: 0.01,
  });

  let velocity = 0;
  velocity = stepHorizontalVelocity(velocity, 1, 0.1);
  assert.equal(velocity, 85);
  velocity = stepHorizontalVelocity(velocity, 1, 0.2);
  assert.equal(velocity, 175);
  velocity = stepHorizontalVelocity(velocity, 0, 0.1);
  assert.equal(velocity, 60);
  velocity = stepHorizontalVelocity(velocity, 0, 0.1);
  assert.equal(velocity, 0);
});

test('left and right input move only on X while vertical input does not move', () => {
  const right = stepHorizontalMovement({
    x: 100,
    velocity: 0,
    input: { right: true },
    deltaMs: 100,
    worldWidth: 2400,
    locked: false,
  });
  assert.equal(right.velocity, 85);
  assert.equal(right.moved, 8.5);
  assert.equal(right.x, 108.5);

  const left = stepHorizontalMovement({
    x: 100,
    velocity: 0,
    input: { left: true },
    deltaMs: 100,
    worldWidth: 2400,
    locked: false,
  });
  assert.equal(left.velocity, -85);
  assert.equal(left.moved, -8.5);
  assert.equal(left.x, 91.5);

  for (const input of [{ up: true }, { down: true }, { y: -1 }, { y: 1 }]) {
    const vertical = stepHorizontalMovement({
      x: 100,
      velocity: 0,
      input,
      deltaMs: 100,
      worldWidth: 2400,
      locked: false,
    });
    assert.equal(vertical.x, 100);
    assert.equal(vertical.velocity, 0);
    assert.equal(vertical.moved, 0);
  }
});

test('movement clamps to world bounds and input lock stops movement immediately', () => {
  const rightEdge = stepHorizontalMovement({
    x: 2399,
    velocity: 175,
    input: 1,
    deltaMs: 100,
    worldWidth: 2400,
    locked: false,
  });
  assert.deepEqual(rightEdge, {
    x: 2400,
    velocity: 0,
    moved: 1,
    blocked: true,
  });

  const leftEdge = stepHorizontalMovement({
    x: 1,
    velocity: -175,
    input: -1,
    deltaMs: 100,
    worldWidth: 2400,
    locked: false,
  });
  assert.deepEqual(leftEdge, {
    x: 0,
    velocity: 0,
    moved: -1,
    blocked: true,
  });

  const locked = stepHorizontalMovement({
    x: 800,
    velocity: 175,
    input: 1,
    deltaMs: 100,
    worldWidth: 2400,
    locked: true,
  });
  assert.deepEqual(locked, {
    x: 800,
    velocity: 0,
    moved: 0,
    blocked: false,
  });
});

test('branch prompts appear only inside authored up and down ranges', () => {
  assert.deepEqual(getAvailableBranchDirections('life-road', 1219), []);
  assert.deepEqual(getAvailableBranchDirections('life-road', 1220), ['up']);
  assert.deepEqual(getAvailableBranchDirections('life-road', 1400), ['up']);
  assert.deepEqual(getAvailableBranchDirections('life-road', 1480), ['up']);
  assert.deepEqual(getAvailableBranchDirections('life-road', 1481), []);

  assert.deepEqual(
    getAvailableBranchDirections('upper-vending-lane', 1039),
    [],
  );
  assert.deepEqual(
    getAvailableBranchDirections('upper-vending-lane', 1040),
    ['down'],
  );
  assert.deepEqual(
    getAvailableBranchDirections('upper-vending-lane', 1320),
    ['down'],
  );
  assert.deepEqual(
    getAvailableBranchDirections('upper-vending-lane', 1321),
    [],
  );
  assert.deepEqual(getAvailableBranchDirections('home-street', 1300), []);
});

test('up and down input resolve only at the matching branch', () => {
  const outside = interpretM14Input(
    'life-road',
    1000,
    { up: true },
  );
  assert.equal(outside.horizontalAxis, 0);
  assert.equal(outside.transition, null);

  const upward = interpretM14Input(
    'life-road',
    1300,
    { up: true },
  );
  assert.deepEqual(upward.branchDirections, ['up']);
  assert.equal(upward.transition?.targetAreaId, 'upper-vending-lane');
  assert.equal(upward.transition?.spawnId, 'from-life');
  assert.equal(upward.transition?.x, 1160);
  assert.equal(upward.transition?.facing, 'right');

  const downward = interpretM14Input(
    'upper-vending-lane',
    1200,
    { down: true },
  );
  assert.deepEqual(downward.branchDirections, ['down']);
  assert.equal(downward.transition?.targetAreaId, 'life-road');
  assert.equal(downward.transition?.spawnId, 'from-upper');
  assert.equal(downward.transition?.x, 1340);
  assert.equal(downward.transition?.facing, 'left');
});

test('right and left boundaries resolve to their exact target spawns', () => {
  const toLife = resolveAreaExit('home-street', 'right', 2380);
  assert.deepEqual(
    {
      areaId: toLife?.targetAreaId,
      spawnId: toLife?.spawnId,
      x: toLife?.x,
      facing: toLife?.facing,
    },
    {
      areaId: 'life-road',
      spawnId: 'from-home',
      x: 150,
      facing: 'right',
    },
  );
  assert.equal(resolveAreaExit('home-street', 'right', 2200), null);

  const toHome = resolveAreaExit('life-road', 'left', 30);
  assert.deepEqual(
    {
      areaId: toHome?.targetAreaId,
      spawnId: toHome?.spawnId,
      x: toHome?.x,
      facing: toHome?.facing,
    },
    {
      areaId: 'home-street',
      spawnId: 'from-life',
      x: 2180,
      facing: 'left',
    },
  );
  assert.deepEqual(getM14SpawnPoint('home-street', 'from-life'), {
    id: 'from-life',
    x: 2180,
    facing: 'left',
  });
});

test('transition reducer locks input through fade, load and fade-in', () => {
  assert.deepEqual(M14_TRANSITION_PHASES, [
    'idle',
    'fading-out',
    'loading',
    'fading-in',
  ]);
  assert.equal(nextM14TransitionPhase('idle', 'scene-ready'), 'idle');
  assert.equal(reduceM14Transition('idle', 'start'), 'fading-out');

  const context = {
    timeMinutes: 995,
    timePhase: 'evening',
    audioEnabled: false,
  };
  const transition = resolveAreaExit('home-street', 'right', 2380);
  assert.ok(transition);
  let state = createM14TransitionState('home-street', 'start', context);
  assert.equal(isM14InputLocked(state), false);

  state = reduceM14Transition(state, { type: 'start', transition });
  assert.equal(state.phase, 'fading-out');
  assert.equal(isM14InputLocked(state), true);
  assert.equal(
    interpretM14Input('home-street', 2380, { right: true }, state).locked,
    true,
  );
  state = reduceM14Transition(state, 'fade-out-complete');
  assert.equal(state.phase, 'loading');
  state = reduceM14Transition(state, 'scene-ready');
  assert.equal(state.phase, 'fading-in');
  assert.equal(state.currentAreaId, 'life-road');
  assert.equal(state.currentSpawnId, 'from-home');
  state = reduceM14Transition(state, 'fade-in-complete');
  assert.equal(state.phase, 'idle');
  assert.equal(state.pendingTransition, null);
  assert.equal(isM14InputLocked(state), false);
  assert.deepEqual(state.context, context);
});

test('horizontal camera look-ahead follows movement without exposing background', () => {
  const centered = getM14CameraScrollX('life-road', 1400, 0, 1280);
  const lookingRight = getM14CameraScrollX('life-road', 1400, 175, 1280);
  const lookingLeft = getM14CameraScrollX('life-road', 1400, -175, 1280);
  assert.ok(lookingRight > centered);
  assert.ok(lookingLeft < centered);
  assert.equal(clampCameraScrollX('life-road', -500, 1280), 0);
  assert.equal(clampCameraScrollX('life-road', 9999, 1280), 1400);
  assert.equal(
    getM14CameraScrollX('life-road', 2680, 175, 1280),
    1400,
  );
});

test('area graph validation accepts production data and reports broken targets', () => {
  assert.deepEqual(validateM14AreaGraph(), []);
  assert.equal(assertValidM14AreaGraph(), M14_AREA_DEFINITIONS);

  const broken = structuredClone(M14_AREA_DEFINITIONS);
  broken['home-street'].rightExit.targetSpawnId = 'missing-spawn';
  const errors = validateM14AreaGraph(broken);
  assert.ok(
    errors.some((message) => message.includes('missing spawn')),
    errors.join('\n'),
  );
  assert.throws(
    () => assertValidM14AreaGraph(broken),
    /Invalid M1\.4 area graph/,
  );
});
