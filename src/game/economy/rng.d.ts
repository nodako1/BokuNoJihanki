export function hashSeed(...parts: Array<string | number>): number;
export function mulberry32(seed: number): () => number;
export function rollFromSeed(seed: number): number;
