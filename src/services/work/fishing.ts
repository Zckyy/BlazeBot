import { FISH, type FishDefinition } from './config.js';

export function selectFish(random = Math.random): FishDefinition {
  const totalWeight = FISH.reduce((sum, fish) => sum + fish.weight, 0);
  let roll = Math.min(Math.max(random(), 0), 1 - Number.EPSILON) * totalWeight;
  for (const fish of FISH) {
    if (roll < fish.weight) return fish;
    roll -= fish.weight;
  }
  return FISH[FISH.length - 1];
}
