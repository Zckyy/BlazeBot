/** XP needed to advance from `level` to `level + 1`. */
export function xpForLevel(level: number): number {
  return 5 * level ** 2 + 50 * level + 100;
}

/** Total XP required to reach `level` from zero. */
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let l = 0; l < level; l += 1) total += xpForLevel(l);
  return total;
}

/** Level reached with `totalXp` accumulated XP. */
export function levelFromXp(totalXp: number): number {
  let level = 0;
  let remaining = totalXp;
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level += 1;
  }
  return level;
}

/** Random XP awarded per eligible message: 15–25 inclusive. */
export function randomXpAward(): number {
  return 15 + Math.floor(Math.random() * 11);
}
