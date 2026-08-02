import { observeForPlayer } from "../ai/observation";
import type { ContentRegistry } from "../core/registry";
import type {
  DomainEvent,
  GameCommand,
  GameState,
  PlayerId
} from "../core/types";
import { GameSession } from "../session/game-session";

export interface ReplayMetaLine {
  kind: "meta";
  formatVersion: 1;
  scenario: string;
  initialState: GameState;
}

export interface ReplayCommandLine {
  kind: "command";
  index: number;
  command: GameCommand;
}

export interface ReplayEventLine {
  kind: "event";
  index: number;
  event: DomainEvent;
}

export interface ReplayCheckpointLine {
  kind: "checkpoint";
  index: number;
  stateHash: string;
  observationHashes: Record<PlayerId, string>;
}

export interface ReplayFailureLine {
  kind: "failure";
  index: number;
  stage: "dispatch" | "invariant";
  message: string;
  command?: GameCommand;
  diagnostics?: {
    stack?: string;
    url?: string;
    userAgent?: string;
    context?: Record<string, unknown>;
    state?: GameState;
    legalActions?: GameCommand[];
    visualEvents?: unknown[];
  };
}

export type ReplayLine =
  | ReplayMetaLine
  | ReplayCommandLine
  | ReplayEventLine
  | ReplayCheckpointLine
  | ReplayFailureLine;

const OPAQUE_ID = /^(decision|frame|judgment|trigger|virtual-card)-\d+$/;
const STABLE_OPAQUE_ID =
  /^(decision|frame|judgment|trigger|virtual-card):\$(\d+)$/;

type JsonObject = Record<string, unknown>;

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  const result: JsonObject = {};
  for (const key of Object.keys(value as JsonObject).sort()) {
    const child = (value as JsonObject)[key];
    if (child !== undefined) result[key] = canonicalValue(child);
  }
  return result;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")}`;
}

export class ReplayIdNormalizer {
  readonly #actualToStable = new Map<string, string>();
  readonly #stableToActual = new Map<string, string>();
  readonly #counts = new Map<string, number>();

  normalize<T>(value: T): T {
    return this.#transform(value, (text) => this.#normalizeString(text)) as T;
  }

  denormalize<T>(value: T): T {
    return this.#transform(
      value,
      (text) => this.#stableToActual.get(text) ?? text
    ) as T;
  }

  seedStableIds(value: unknown): void {
    this.#transform(value, (text) => {
      const match = STABLE_OPAQUE_ID.exec(text);
      if (!match) return text;
      const prefix = match[1]!;
      const ordinal = Number(match[2]);
      this.#actualToStable.set(text, text);
      this.#stableToActual.set(text, text);
      this.#counts.set(
        prefix,
        Math.max(this.#counts.get(prefix) ?? 0, ordinal)
      );
      return text;
    });
  }

  #normalizeString(value: string): string {
    if (!OPAQUE_ID.test(value)) return value;
    const known = this.#actualToStable.get(value);
    if (known) return known;
    const prefix = value.slice(0, value.lastIndexOf("-"));
    const next = (this.#counts.get(prefix) ?? 0) + 1;
    this.#counts.set(prefix, next);
    const stable = `${prefix}:$${next}`;
    this.#actualToStable.set(value, stable);
    this.#stableToActual.set(stable, value);
    return stable;
  }

  #transform(value: unknown, stringTransform: (value: string) => string): unknown {
    if (typeof value === "string") return stringTransform(value);
    if (Array.isArray(value)) {
      return value.map((child) => this.#transform(child, stringTransform));
    }
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value as JsonObject).map(([key, child]) => [
        key,
        this.#transform(child, stringTransform)
      ])
    );
  }
}

async function checkpoint(
  session: GameSession,
  registry: ContentRegistry,
  normalizer: ReplayIdNormalizer,
  index: number
): Promise<ReplayCheckpointLine> {
  const state = session.state();
  const normalizedState = normalizer.normalize(state);
  const observationHashes: Record<PlayerId, string> = {};
  for (const playerId of [...state.turnOrder].sort()) {
    observationHashes[playerId] = await sha256(
      normalizer.normalize(observeForPlayer(state, playerId, registry))
    );
  }
  return {
    kind: "checkpoint",
    index,
    stateHash: await sha256(normalizedState),
    observationHashes
  };
}

export class JsonlReplayRecorder {
  readonly #session: GameSession;
  readonly #registry: ContentRegistry;
  readonly #normalizer = new ReplayIdNormalizer();
  readonly #lines: ReplayLine[];
  #commandIndex = 0;

  constructor(
    session: GameSession,
    registry: ContentRegistry,
    scenario: string
  ) {
    this.#session = session;
    this.#registry = registry;
    this.#lines = [{
      kind: "meta",
      formatVersion: 1,
      scenario,
      initialState: this.#normalizer.normalize(session.state())
    }];
  }

  async dispatch(command: GameCommand): Promise<void> {
    const index = this.#commandIndex++;
    this.#lines.push({
      kind: "command",
      index,
      command: this.#normalizer.normalize(command)
    });
    const result = this.#session.dispatch(command);
    for (const event of result.events) {
      this.#lines.push({
        kind: "event",
        index,
        event: this.#normalizer.normalize(event)
      });
    }
    this.#lines.push(await checkpoint(
      this.#session,
      this.#registry,
      this.#normalizer,
      index
    ));
  }

  session(): GameSession {
    return this.#session;
  }

  lines(): ReplayLine[] {
    return structuredClone(this.#lines);
  }

  recordFailure(input: Omit<ReplayFailureLine, "kind">): void {
    if (this.#lines.at(-1)?.kind === "failure") {
      throw new Error("replay already ends with a failure");
    }
    this.#lines.push({
      kind: "failure",
      ...this.#normalizer.normalize(input)
    });
  }

  hasFailure(): boolean {
    return this.#lines.at(-1)?.kind === "failure";
  }

  jsonl(): string {
    return `${this.#lines.map(canonicalJson).join("\n")}\n`;
  }
}

function assertSame(
  label: string,
  expected: unknown,
  actual: unknown
): void {
  const expectedJson = canonicalJson(expected);
  const actualJson = canonicalJson(actual);
  if (expectedJson !== actualJson) {
    throw new Error(
      `${label} mismatch\nexpected: ${expectedJson}\nactual:   ${actualJson}`
    );
  }
}

export function parseReplayJsonl(jsonl: string): ReplayLine[] {
  return jsonl
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      const value = JSON.parse(line) as ReplayLine;
      if (!value || typeof value !== "object" || !("kind" in value)) {
        throw new Error(`invalid replay line ${index + 1}`);
      }
      return value;
    });
}

export async function verifyReplayJsonl(
  jsonl: string,
  registry: ContentRegistry
): Promise<GameSession> {
  const lines = parseReplayJsonl(jsonl);
  const meta = lines[0];
  if (meta?.kind !== "meta" || meta.formatVersion !== 1) {
    throw new Error("replay must start with formatVersion 1 metadata");
  }
  const session = new GameSession(meta.initialState, registry);
  const normalizer = new ReplayIdNormalizer();
  normalizer.seedStableIds(meta.initialState);
  let cursor = 1;
  while (cursor < lines.length) {
    if (lines[cursor]?.kind === "failure") {
      if (cursor !== lines.length - 1) {
        throw new Error("failure must be the final replay line");
      }
      return session;
    }
    const commandLine = lines[cursor++];
    if (commandLine?.kind !== "command") {
      throw new Error(`expected command at replay line ${cursor}`);
    }
    const command = normalizer.denormalize(commandLine.command);
    const legal = session.legalActions();
    const actualCommand = legal.find(
      (candidate) =>
        canonicalJson(candidate) === canonicalJson(command)
    );
    if (!actualCommand) {
      throw new Error(
        `recorded command ${commandLine.index} is not legal: ${canonicalJson(command)}`
      );
    }
    const result = session.dispatch(actualCommand);
    const expectedEvents: ReplayEventLine[] = [];
    while (lines[cursor]?.kind === "event") {
      const eventLine = lines[cursor++] as ReplayEventLine;
      if (eventLine.index !== commandLine.index) {
        throw new Error(
          `event index ${eventLine.index} does not match command ${commandLine.index}`
        );
      }
      expectedEvents.push(eventLine);
    }
    const actualEvents = result.events.map((event) =>
      normalizer.normalize(event)
    );
    assertSame(
      `events after command ${commandLine.index}`,
      expectedEvents.map((line) => line.event),
      actualEvents
    );
    const expectedCheckpoint = lines[cursor++];
    if (expectedCheckpoint?.kind !== "checkpoint") {
      throw new Error(
        `missing checkpoint after command ${commandLine.index}`
      );
    }
    if (expectedCheckpoint.index !== commandLine.index) {
      throw new Error(
        `checkpoint index ${expectedCheckpoint.index} does not match command ${commandLine.index}`
      );
    }
    const actualCheckpoint = await checkpoint(
      session,
      registry,
      normalizer,
      commandLine.index
    );
    assertSame(
      `checkpoint after command ${commandLine.index}`,
      expectedCheckpoint,
      actualCheckpoint
    );
  }
  return session;
}
