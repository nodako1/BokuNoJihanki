import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {
  M14_AREA_IDS,
} from '../src/game/areas/m14AreaData.mjs';
import {
  M15_AREA_IDS,
  getM15GeometryArea,
} from '../src/game/areas/m15GeometryFixture.mjs';
import {
  createM14TransitionState,
  reduceM14Transition,
  resolveAreaExit,
} from '../src/game/navigationAdapter/m14NavigationAdapter.mjs';

const BASELINE_SHA = '29223ee31fd4fc4fbca21a37b01fe89277279647';
const OFFICIAL_AREA_IDS = [
  'home-street',
  'life-road',
  'upper-vending-lane',
];

const PROTECTED_BASELINE_MANIFESTS = Object.freeze([
  Object.freeze({
    label: 'M1.3 authored assets and map',
    roots: Object.freeze([
      'public/assets/images/m13',
      'src/game/world/m13Map.ts',
      'src/game/world/residential-m13-map.json',
    ]),
    fileCount: 69,
    sha256: '8751a967954ceb8dbed98d42dfe4b6f475d91b490ff1e42d45ed558ec8b5b9af',
  }),
  Object.freeze({
    label: 'M1.4 runtime assets and reproducible sources',
    roots: Object.freeze([
      'public/assets/images/m14',
      'tools/art/m14-source',
      'tools/art/generate_m14_assets.py',
    ]),
    fileCount: 22,
    sha256: '26edc9e1ed591d8b3c1fa94f91cd5d4e984528a0bcadfa87db1d8de43afc3712',
  }),
  Object.freeze({
    label: 'economy implementation',
    roots: Object.freeze(['src/game/economy']),
    fileCount: 9,
    sha256: '483a7116259deb767d62585a3bb9d9afae80f8e7a0d388b6001a577091669652',
  }),
  Object.freeze({
    label: 'legacy ResidentialScene',
    roots: Object.freeze(['src/game/scenes/ResidentialScene.ts']),
    fileCount: 1,
    sha256: '2faf2cfd979409c1c8c3185badf5b3f9183a40e48d1039caf1ec0a1b46984dce',
  }),
]);

function createEventTarget(extra = {}) {
  const listeners = new Map();
  const target = {
    ...extra,
    addEventListener(type, listener) {
      const entries = listeners.get(type) ?? new Set();
      entries.add(listener);
      listeners.set(type, entries);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent(event) {
      for (const listener of [...(listeners.get(event.type) ?? [])]) {
        listener.call(target, event);
      }
      return true;
    },
  };
  return target;
}

class FakeCustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
}

async function loadTypeScriptModule(
  relativePath,
  dependencies,
  globals,
  compilerOptions = {},
) {
  const source = await readFile(relativePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    fileName: relativePath,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      ...compilerOptions,
    },
  });
  const errors = (transpiled.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  assert.deepEqual(
    errors.map((diagnostic) => ts.flattenDiagnosticMessageText(
      diagnostic.messageText,
      '\n',
    )),
    [],
    `${relativePath} must transpile without syntax errors`,
  );

  const module = { exports: {} };
  const localRequire = (specifier) => {
    assert.ok(
      Object.hasOwn(dependencies, specifier),
      `Unexpected test module dependency: ${relativePath} -> ${specifier}`,
    );
    return dependencies[specifier];
  };
  const wrapper = new vm.Script(
    `(function (require, module, exports) {\n${transpiled.outputText}\n})`,
    { filename: relativePath },
  ).runInNewContext({
    console,
    ...globals,
  });
  wrapper(localRequire, module, module.exports);
  return module.exports;
}

function createKeyboardKey() {
  return {
    isDown: false,
    _justDown: false,
  };
}

async function createInputHarness() {
  const windowTarget = createEventTarget();
  const documentTarget = createEventTarget({ hidden: false });
  const globals = {
    window: windowTarget,
    document: documentTarget,
    CustomEvent: FakeCustomEvent,
  };
  const bridge = await loadTypeScriptModule(
    'src/game/gameBridge.ts',
    {},
    globals,
  );

  const cursors = {
    up: createKeyboardKey(),
    down: createKeyboardKey(),
    left: createKeyboardKey(),
    right: createKeyboardKey(),
  };
  const wasd = {
    W: createKeyboardKey(),
    A: createKeyboardKey(),
    S: createKeyboardKey(),
    D: createKeyboardKey(),
  };
  const KeyCodes = Object.freeze({ W: 87, A: 65, S: 83, D: 68 });
  const keyByCode = new Map([
    [KeyCodes.W, wasd.W],
    [KeyCodes.A, wasd.A],
    [KeyCodes.S, wasd.S],
    [KeyCodes.D, wasd.D],
  ]);
  const Phaser = {
    Math: {
      Clamp: (value, minimum, maximum) => Math.max(
        minimum,
        Math.min(maximum, value),
      ),
    },
    Input: {
      Keyboard: {
        KeyCodes,
        JustDown(key) {
          const justDown = key._justDown;
          key._justDown = false;
          return justDown;
        },
      },
    },
  };
  const phaserModule = { __esModule: true, default: Phaser };
  const inputModule = await loadTypeScriptModule(
    'src/game/systems/SideScrollInputSystem.ts',
    {
      phaser: phaserModule,
      '../gameBridge': bridge,
    },
    globals,
  );
  const scene = {
    input: {
      keyboard: {
        createCursorKeys: () => cursors,
        addKey: (code) => keyByCode.get(code),
      },
    },
  };
  const system = new inputModule.SideScrollInputSystem(scene);
  return {
    bridge,
    cursors,
    documentTarget,
    system,
    wasd,
    windowTarget,
  };
}

function press(key) {
  key._justDown = true;
}

function inputSnapshot(input) {
  return {
    horizontal: input.horizontal,
    source: input.source,
    traversal: input.traversal,
  };
}

function virtualInputSnapshot(input) {
  return {
    x: input.x,
    y: input.y,
    active: input.active,
  };
}

async function collectFiles(relativePath) {
  const metadata = await stat(relativePath);
  if (metadata.isFile()) return [relativePath.split(path.sep).join('/')];
  assert.equal(
    metadata.isDirectory(),
    true,
    `Protected path must be a file or directory: ${relativePath}`,
  );
  const entries = await readdir(relativePath, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => collectFiles(path.join(relativePath, entry.name))),
  );
  return nested.flat();
}

async function protectedManifest(roots) {
  const files = [
    ...new Set((await Promise.all(roots.map(collectFiles))).flat()),
  ].sort();
  const aggregate = createHash('sha256');
  for (const file of files) {
    const content = await readFile(file);
    const contentSha = createHash('sha256').update(content).digest('hex');
    aggregate.update(file);
    aggregate.update('\0');
    aggregate.update(contentSha);
    aggregate.update('\n');
  }
  return {
    fileCount: files.length,
    sha256: aggregate.digest('hex'),
  };
}

async function renderAreaArrowButton(
  bridge,
  renderedPrompt,
  placement,
) {
  const stateQueue = [renderedPrompt, placement];
  const react = {
    useEffect: () => {},
    useLayoutEffect: () => {},
    useRef: (initial) => ({ current: initial }),
    useState(initial) {
      const value = stateQueue.length > 0
        ? stateQueue.shift()
        : typeof initial === 'function'
          ? initial()
          : initial;
      return [value, () => {}];
    },
  };
  const jsxRuntime = {
    Fragment: Symbol('Fragment'),
    jsx: (type, props) => ({ type, props }),
    jsxs: (type, props) => ({ type, props }),
  };
  const module = await loadTypeScriptModule(
    'src/ui/AreaArrowButton.tsx',
    {
      react,
      'react/jsx-runtime': jsxRuntime,
      '../game/gameBridge': bridge,
      './areaPanelDom': {
        AREA_PANEL_HOST_SELECTOR: '.game-ui-layer',
        observeAreaPanelObstacleElements: () => {},
        readAreaPanelObstacles: () => [],
        readAreaPanelPlayerGeometryFromDom: () => null,
        readAreaPanelSafeArea: () => ({
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
        }),
      },
      './areaPanelPlacement.mjs': {
        chooseAreaPanelPlacement: () => placement,
        normalizeAreaPanelPlayerGeometry: () => null,
      },
    },
    {
      window: createEventTarget({
        innerWidth: 1280,
        innerHeight: 720,
        requestAnimationFrame: () => 1,
        cancelAnimationFrame: () => {},
      }),
      document: {
        querySelector: () => null,
      },
      CustomEvent: FakeCustomEvent,
    },
    {
      jsx: ts.JsxEmit.ReactJSX,
    },
  );
  return module.AreaArrowButton();
}

function driveTransition(state, transition) {
  let next = reduceM14Transition(
    structuredClone(state),
    { type: 'start', transition },
  );
  next = reduceM14Transition(structuredClone(next), 'fade-out-complete');
  next = reduceM14Transition(structuredClone(next), 'scene-ready');
  next = reduceM14Transition(structuredClone(next), 'fade-in-complete');
  return next;
}

test('gameBridge keeps traversal requests one-shot and prompt state authoritative', async () => {
  const { bridge, system } = await createInputHarness();
  bridge.publishAreaPrompt({
    visible: true,
    direction: 'up',
    label: '自販機路地へ',
    areaId: 'life-road',
  });
  assert.deepEqual(bridge.readAreaPrompt(), {
    visible: true,
    direction: 'up',
    label: '自販機路地へ',
    areaId: 'life-road',
  });

  bridge.requestAreaTraversal('up');
  assert.equal(bridge.consumeAreaTraversalRequest(), 'up');
  assert.equal(bridge.consumeAreaTraversalRequest(), null);
  bridge.requestAreaTraversal('down');
  bridge.clearAreaTraversalRequest();
  assert.equal(bridge.consumeAreaTraversalRequest(), null);
  system.destroy();
});

test('touch traversal is accepted only for the currently allowed prompt direction', async () => {
  const { bridge, system } = await createInputHarness();

  bridge.requestAreaTraversal('up');
  assert.deepEqual(inputSnapshot(system.read(null)), {
    horizontal: 0,
    source: 'none',
    traversal: null,
  });
  assert.equal(bridge.consumeAreaTraversalRequest(), null);

  bridge.requestAreaTraversal('up');
  assert.equal(system.read('down').traversal, null);
  assert.equal(bridge.consumeAreaTraversalRequest(), null);

  bridge.requestAreaTraversal('up');
  assert.deepEqual(inputSnapshot(system.read('up')), {
    horizontal: 0,
    source: 'touch',
    traversal: 'up',
  });
  assert.equal(system.read('up').traversal, null);
  system.destroy();
});

test('keyboard traversal is accepted only while the matching prompt is allowed', async () => {
  const { cursors, system, wasd } = await createInputHarness();

  press(cursors.up);
  assert.equal(system.read(null).traversal, null);
  cursors.up._justDown = false;

  press(wasd.W);
  assert.equal(system.read('down').traversal, null);
  wasd.W._justDown = false;

  press(cursors.up);
  assert.deepEqual(inputSnapshot(system.read('up')), {
    horizontal: 0,
    source: 'keyboard',
    traversal: 'up',
  });
  press(wasd.S);
  assert.deepEqual(inputSnapshot(system.read('down')), {
    horizontal: 0,
    source: 'keyboard',
    traversal: 'down',
  });
  system.destroy();
});

test('touch joystick produces right, left and release-stop input', async () => {
  const { bridge, system } = await createInputHarness();

  bridge.setVirtualInput({ x: 1, y: 0, active: true });
  assert.deepEqual(inputSnapshot(system.read(null)), {
    horizontal: 1,
    source: 'touch',
    traversal: null,
  });
  bridge.setVirtualInput({ x: -0.72, y: 0, active: true });
  assert.deepEqual(inputSnapshot(system.read(null)), {
    horizontal: -0.72,
    source: 'touch',
    traversal: null,
  });
  bridge.clearVirtualInput();
  assert.deepEqual(inputSnapshot(system.read(null)), {
    horizontal: 0,
    source: 'none',
    traversal: null,
  });

  const joystickSource = await readFile('src/ui/VirtualJoystick.tsx', 'utf8');
  assert.match(
    joystickSource,
    /setVirtualInput\(\{\s*x:\s*x\s*\/\s*MAX_DISTANCE,\s*y:\s*0,\s*active:\s*true\s*\}\)/,
  );
  assert.match(joystickSource, /onPointerMove=/);
  assert.match(joystickSource, /onPointerUp=\{\(event\)\s*=>\s*release\(event\.currentTarget\)\}/);
  assert.match(joystickSource, /onPointerCancel=\{\(event\)\s*=>\s*release\(event\.currentTarget\)\}/);
  assert.match(joystickSource, /onLostPointerCapture=\{\(\)\s*=>\s*release\(\)\}/);
  assert.match(joystickSource, /clearVirtualInput\(\)/);
  system.destroy();
});

test('panel tap rejects hidden, mismatched or unsafe state and accepts a current prompt', async () => {
  const { bridge, system } = await createInputHarness();
  const upPrompt = {
    visible: true,
    direction: 'up',
    label: '自販機路地へ',
    areaId: 'life-road',
  };
  const placement = {
    x: 300,
    y: 180,
    anchor: 'above',
    valid: true,
    playerIntersectionArea: 0,
    playerDistance: 20,
    obstacleIntersections: [],
  };

  bridge.publishAreaPrompt(upPrompt);
  const placedButton = await renderAreaArrowButton(
    bridge,
    upPrompt,
    placement,
  );
  assert.equal(placedButton.type, 'button');
  assert.equal(placedButton.props.disabled, false);

  bridge.publishAreaPrompt({
    visible: false,
    direction: null,
    label: '',
    areaId: null,
  });
  placedButton.props.onClick();
  assert.equal(bridge.consumeAreaTraversalRequest(), null);

  bridge.publishAreaPrompt({
    visible: true,
    direction: 'down',
    label: '生活道路へ戻る',
    areaId: 'upper-vending-lane',
  });
  placedButton.props.onClick();
  assert.equal(bridge.consumeAreaTraversalRequest(), null);

  bridge.publishAreaPrompt(upPrompt);
  placedButton.props.onClick();
  assert.equal(bridge.consumeAreaTraversalRequest(), 'up');

  const unsafeButton = await renderAreaArrowButton(bridge, upPrompt, null);
  assert.equal(unsafeButton.props.disabled, true);
  unsafeButton.props.onClick();
  assert.equal(bridge.consumeAreaTraversalRequest(), null);
  system.destroy();
});

test('visibility and freeze hard-stop input, then visible and active resume cleanly', async () => {
  const {
    bridge,
    documentTarget,
    system,
  } = await createInputHarness();
  bridge.setVirtualInput({ x: 1, y: 0, active: true });

  documentTarget.hidden = true;
  documentTarget.dispatchEvent({ type: 'visibilitychange' });
  assert.deepEqual(inputSnapshot(system.read('up')), {
    horizontal: 0,
    source: 'none',
    traversal: null,
  });
  assert.deepEqual(virtualInputSnapshot(bridge.readVirtualInput()), {
    x: 0,
    y: 0,
    active: false,
  });
  assert.equal(system.consumeHardStop(), true);
  assert.equal(system.consumeHardStop(), false);

  documentTarget.hidden = false;
  documentTarget.dispatchEvent({ type: 'visibilitychange' });
  bridge.setVirtualInput({ x: -1, y: 0, active: true });
  assert.equal(system.read(null).horizontal, -1);

  documentTarget.dispatchEvent({ type: 'freeze' });
  assert.equal(system.read(null).horizontal, 0);
  assert.equal(system.consumeHardStop(), true);
  documentTarget.dispatchEvent({ type: 'resume' });
  bridge.setVirtualInput({ x: 0.5, y: 0, active: true });
  assert.deepEqual(inputSnapshot(system.read(null)), {
    horizontal: 0.5,
    source: 'touch',
    traversal: null,
  });
  system.destroy();
});

test('scene derives traversal allowance and prompt visibility from the same branch gate', async () => {
  const sceneSource = await readFile(
    'src/game/scenes/SideScrollTownScene.ts',
    'utf8',
  );
  assert.match(
    sceneSource,
    /const availableBeforeMove = !locked && this\.started[\s\S]*?getAvailableBranchDirections\(this\.areaId, this\.player\.x\)\[0\][\s\S]*?: null;/,
  );
  assert.match(sceneSource, /this\.inputSystem\.read\(availableBeforeMove\)/);
  assert.match(
    sceneSource,
    /const visible = Boolean\(direction\) && !locked;/,
  );
  assert.match(
    sceneSource,
    /if \(!locked && input\.traversal && branchDirection === input\.traversal\)/,
  );
});

test('sourceSpawnId survives clone/reset and an exact up/down round trip', () => {
  const lifeEntrance = getM15GeometryArea('life-road')
    .branchEntrances.up;
  const upTransition = resolveAreaExit(
    'life-road',
    'up',
    lifeEntrance.triggerCenterX,
  );
  assert.ok(upTransition);

  const initial = createM14TransitionState('life-road', 'from-upper', {
    timeMinutes: 995,
    timePhase: 'evening',
    audioEnabled: false,
  });
  let inFlight = reduceM14Transition(
    structuredClone(initial),
    { type: 'start', transition: upTransition },
  );
  assert.equal(inFlight.sourceSpawnId, 'from-upper');
  inFlight = reduceM14Transition(
    structuredClone(inFlight),
    'fade-out-complete',
  );
  inFlight = reduceM14Transition(structuredClone(inFlight), 'scene-ready');
  assert.equal(inFlight.currentAreaId, 'upper-vending-lane');
  assert.equal(inFlight.currentSpawnId, 'from-life');
  assert.equal(inFlight.sourceSpawnId, 'from-upper');

  const reset = reduceM14Transition(structuredClone(inFlight), 'reset');
  assert.equal(reset.phase, 'idle');
  assert.equal(reset.currentAreaId, 'life-road');
  assert.equal(reset.currentSpawnId, 'from-upper');
  assert.equal(reset.sourceSpawnId, null);
  assert.deepEqual(reset.context, initial.context);

  const upper = driveTransition(initial, upTransition);
  assert.equal(upper.currentAreaId, 'upper-vending-lane');
  assert.equal(upper.currentSpawnId, 'from-life');
  assert.equal(upper.sourceSpawnId, null);

  const upperEntrance = getM15GeometryArea('upper-vending-lane')
    .branchEntrances.down;
  const downTransition = resolveAreaExit(
    'upper-vending-lane',
    'down',
    upperEntrance.triggerCenterX,
  );
  assert.ok(downTransition);
  const returned = driveTransition(upper, downTransition);
  assert.equal(returned.currentAreaId, 'life-road');
  assert.equal(returned.currentSpawnId, 'from-upper');
  assert.equal(returned.sourceSpawnId, null);
  assert.deepEqual(returned.context, initial.context);
});

for (const manifest of PROTECTED_BASELINE_MANIFESTS) {
  test(`${manifest.label} matches baseline ${BASELINE_SHA.slice(0, 12)}`, async () => {
    const actual = await protectedManifest(manifest.roots);
    assert.deepEqual(actual, {
      fileCount: manifest.fileCount,
      sha256: manifest.sha256,
    });
  });
}

test('only official area IDs are active and M2 remains disconnected', async () => {
  assert.deepEqual(M15_AREA_IDS, OFFICIAL_AREA_IDS);
  assert.deepEqual(M14_AREA_IDS, OFFICIAL_AREA_IDS);

  const sourceFiles = (
    await collectFiles('src')
  ).filter((file) => /\.(?:[cm]?[jt]sx?|json)$/.test(file));
  for (const file of sourceFiles) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(
      source,
      /\bhome-yard\b/,
      `${file} must use the official home-street ID`,
    );
  }

  const [createGameSource, phaserGameSource] = await Promise.all([
    readFile('src/game/createGame.ts', 'utf8'),
    readFile('src/game/PhaserGame.tsx', 'utf8'),
  ]);
  assert.match(
    createGameSource,
    /scene:\s*\[SideScrollTownScene,\s*ResidentialScene\]/,
  );
  assert.doesNotMatch(
    `${createGameSource}\n${phaserGameSource}`,
    /\b(?:ExplorationScene|VendingMachineScene|M2Scene)\b/,
  );
  assert.doesNotMatch(
    createGameSource,
    /from\s+['"][^'"]*economy[^'"]*['"]/,
  );
});
