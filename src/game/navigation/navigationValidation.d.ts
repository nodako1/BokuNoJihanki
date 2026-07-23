import type { AreaGraph } from './areaGraph.d.mts';

export type AreaGraphIssueCode =
  | 'no-areas'
  | 'duplicate-area-id'
  | 'duplicate-spawn-id'
  | 'duplicate-exit-id'
  | 'invalid-direction'
  | 'invalid-world-width'
  | 'invalid-ground-y'
  | 'invalid-spawn-x'
  | 'invalid-spawn-facing'
  | 'invalid-trigger-range'
  | 'missing-target-area'
  | 'missing-target-spawn'
  | 'unreachable-area';

export interface AreaGraphIssue {
  readonly code: AreaGraphIssueCode;
  readonly message: string;
  readonly areaId?: string;
  readonly exitId?: string;
  readonly spawnId?: string;
}

export function validateAreaGraph(graph: AreaGraph): readonly AreaGraphIssue[];
export function isAreaGraphValid(graph: AreaGraph): boolean;
