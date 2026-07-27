export interface Ruleset {
  id: string;
  contentPacks: string[];
  minPlayers: number;
  maxPlayers: number;
  startingHandSize: number;
  handLimit: "current-hp";
}

export const STANDARD_RULESET: Ruleset = Object.freeze({
  id: "standard-rules@0.1.0",
  contentPacks: ["standard@0.3.0"],
  minPlayers: 2,
  maxPlayers: 8,
  startingHandSize: 4,
  handLimit: "current-hp"
});
