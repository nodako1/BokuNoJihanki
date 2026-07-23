import type { SearchAction } from './economyCore.mjs';

export type VendingAreaId = 'residential' | 'park';

export interface VendingMachinePosition {
  x: number;
  y: number;
}

export interface VendingMachine {
  id: string;
  areaId: VendingAreaId;
  displayName: string;
  actions: SearchAction[];
  position: VendingMachinePosition | null;
}

export interface VendingValidationResult {
  ok: boolean;
  errors: string[];
}

export const VENDING_AREA_IDS: VendingAreaId[];
export const VENDING_MACHINES: VendingMachine[];

export function validateVendingMachine(machine: unknown): VendingValidationResult;
export function validateVendingMachineList(machines: unknown): VendingValidationResult;
export function findVendingMachine(machineId: string, machines?: VendingMachine[]): VendingMachine | null;
export function machinesForArea(areaId: VendingAreaId, machines?: VendingMachine[]): VendingMachine[];
