export interface Ruleset {
  id: string;
  contentPacks: string[];
  minPlayers: number;
  maxPlayers: number;
  startingHandSize: number;
  handLimit: "current-hp";
}

export const MIN_STANDARD_PLAYERS = 2;
export const MAX_STANDARD_PLAYERS = 20;

export const STANDARD_RULESET: Ruleset = Object.freeze({
  id: "standard-rules@0.1.0",
  contentPacks: ["standard@0.3.0"],
  minPlayers: MIN_STANDARD_PLAYERS,
  maxPlayers: MAX_STANDARD_PLAYERS,
  startingHandSize: 4,
  handLimit: "current-hp"
});
