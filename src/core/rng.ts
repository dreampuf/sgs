export interface RandomResult {
  value: number;
  state: number;
}

export function normalizeSeed(seed: number): number {
  return (seed >>> 0) || 0x6d2b79f5;
}

export function nextRandom(state: number): RandomResult {
  let nextState = (state + 0x6d2b79f5) >>> 0;
  let value = nextState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return {
    value: ((value ^ (value >>> 14)) >>> 0) / 4294967296,
    state: nextState
  };
}

export function shuffle<T>(items: readonly T[], state: number): {
  items: T[];
  state: number;
} {
  const result = [...items];
  let nextState = normalizeSeed(state);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const random = nextRandom(nextState);
    nextState = random.state;
    const target = Math.floor(random.value * (index + 1));
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return { items: result, state: nextState };
}
