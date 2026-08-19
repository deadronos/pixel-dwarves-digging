export function hashSeed(seed: string, runNumber = 0): number {
  let hash = 2166136261 ^ runNumber

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

export function createRng(seed: number): () => number {
  let value = seed || 1

  return () => {
    value = Math.imul(value ^ (value >>> 15), 1 | value)
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export function randomBetween(
  random: () => number,
  min: number,
  max: number,
): number {
  return min + random() * (max - min)
}

export function randomInt(
  random: () => number,
  min: number,
  max: number,
): number {
  return Math.floor(randomBetween(random, min, max + 1))
}
