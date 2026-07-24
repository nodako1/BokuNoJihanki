import assert from 'node:assert/strict';
import test from 'node:test';
import {
  M15_HEARTBEAT_CALIBRATION_MAX_GAP_MS,
  M15_HEARTBEAT_CALIBRATION_SAMPLE_COUNT,
  M15_HEARTBEAT_FREEZE_SEPARATION_RATIO,
  evaluateM15HeartbeatCalibration,
  minimumM15SuspensionGapMs,
} from '../scripts/m15-heartbeat-contract.mjs';

const CI_OBSERVATIONS = Object.freeze([
  [212, 212, 212, 212, 213, 230, 229, 213],
  [181, 178, 177, 176, 181, 217, 182, 180],
  [186, 185, 186, 183, 183, 205, 200, 187],
]);

test('fresh headed Chrome heartbeat observations calibrate under CI load', () => {
  for (const gaps of CI_OBSERVATIONS) {
    const result = evaluateM15HeartbeatCalibration({
      startedTicks: 100,
      finishedTicks: 108,
      gaps,
    });
    assert.equal(result.verified, true);
    assert.deepEqual(result.sampledGaps, gaps);
    assert.equal(result.tickDelta, M15_HEARTBEAT_CALIBRATION_SAMPLE_COUNT);
    assert.ok(
      result.maximumObservedGapMs <= M15_HEARTBEAT_CALIBRATION_MAX_GAP_MS,
    );
  }
});

test('heartbeat calibration rejects stale, malformed and overloaded samples', () => {
  const cases = [
    { startedTicks: 100, finishedTicks: 107, gaps: Array(8).fill(40) },
    { startedTicks: 100, finishedTicks: 108, gaps: Array(7).fill(40) },
    {
      startedTicks: 100,
      finishedTicks: 108,
      gaps: [40, 40, 0, 40, 40, 40, 40, 40],
    },
    {
      startedTicks: 100,
      finishedTicks: 108,
      gaps: [40, 40, 40, 40, 40, 40, 40, Number.NaN],
    },
    {
      startedTicks: 100,
      finishedTicks: 108,
      gaps: [
        40,
        40,
        40,
        40,
        40,
        40,
        40,
        M15_HEARTBEAT_CALIBRATION_MAX_GAP_MS + 1,
      ],
    },
  ];
  for (const input of cases) {
    assert.equal(evaluateM15HeartbeatCalibration(input).verified, false);
  }
});

test('freeze gap remains absolute, duration-relative and calibration-relative', () => {
  assert.equal(
    minimumM15SuspensionGapMs({
      frozenWallDurationMs: 3_200,
      foregroundMaximumGapMs: 230,
    }),
    2_500,
  );
  assert.equal(
    minimumM15SuspensionGapMs({
      frozenWallDurationMs: 4_000,
      foregroundMaximumGapMs: 230,
    }),
    3_120,
  );
  assert.equal(
    minimumM15SuspensionGapMs({
      frozenWallDurationMs: 3_200,
      foregroundMaximumGapMs: 700,
    }),
    700 * M15_HEARTBEAT_FREEZE_SEPARATION_RATIO,
  );
});

test('freeze gap calculation rejects non-positive inputs', () => {
  for (const input of [
    { frozenWallDurationMs: 0, foregroundMaximumGapMs: 200 },
    { frozenWallDurationMs: 3_200, foregroundMaximumGapMs: 0 },
    { frozenWallDurationMs: Number.NaN, foregroundMaximumGapMs: 200 },
  ]) {
    assert.throws(
      () => minimumM15SuspensionGapMs(input),
      /positive numbers/,
    );
  }
});
