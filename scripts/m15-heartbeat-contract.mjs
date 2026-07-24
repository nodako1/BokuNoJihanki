export const M15_HEARTBEAT_INTERVAL_MS = 40;
export const M15_HEARTBEAT_CALIBRATION_SAMPLE_COUNT = 8;
export const M15_HEARTBEAT_CALIBRATION_MAX_GAP_MS = 750;
export const M15_HEARTBEAT_FREEZE_SEPARATION_RATIO = 4;

function finitePositiveNumber(value) {
  return (
    typeof value === 'number'
    && Number.isFinite(value)
    && value > 0
  );
}

export function evaluateM15HeartbeatCalibration({
  startedTicks,
  finishedTicks,
  gaps,
}) {
  const sampledGaps = Array.isArray(gaps)
    ? gaps.slice(-M15_HEARTBEAT_CALIBRATION_SAMPLE_COUNT)
    : [];
  const tickDelta = finishedTicks - startedTicks;
  const maximumObservedGapMs = sampledGaps.length > 0
    ? Math.max(...sampledGaps)
    : null;
  const minimumObservedGapMs = sampledGaps.length > 0
    ? Math.min(...sampledGaps)
    : null;
  const verified = (
    Number.isSafeInteger(startedTicks)
    && Number.isSafeInteger(finishedTicks)
    && tickDelta >= M15_HEARTBEAT_CALIBRATION_SAMPLE_COUNT
    && sampledGaps.length === M15_HEARTBEAT_CALIBRATION_SAMPLE_COUNT
    && sampledGaps.every(finitePositiveNumber)
    && maximumObservedGapMs <= M15_HEARTBEAT_CALIBRATION_MAX_GAP_MS
  );

  return {
    expectedIntervalMs: M15_HEARTBEAT_INTERVAL_MS,
    requiredSampleCount: M15_HEARTBEAT_CALIBRATION_SAMPLE_COUNT,
    maximumAllowedGapMs: M15_HEARTBEAT_CALIBRATION_MAX_GAP_MS,
    freezeSeparationRatio: M15_HEARTBEAT_FREEZE_SEPARATION_RATIO,
    startedTicks,
    finishedTicks,
    tickDelta,
    sampledGaps,
    minimumObservedGapMs,
    maximumObservedGapMs,
    verified,
  };
}

export function minimumM15SuspensionGapMs({
  frozenWallDurationMs,
  foregroundMaximumGapMs,
}) {
  if (
    !finitePositiveNumber(frozenWallDurationMs)
    || !finitePositiveNumber(foregroundMaximumGapMs)
  ) {
    throw new TypeError(
      'Frozen duration and foreground heartbeat gap must be positive numbers.',
    );
  }
  return Math.max(
    2_500,
    Math.floor(frozenWallDurationMs * 0.78),
    Math.ceil(
      foregroundMaximumGapMs * M15_HEARTBEAT_FREEZE_SEPARATION_RATIO,
    ),
  );
}
