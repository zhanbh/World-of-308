import { parseCharacterResponse } from '../../../../shared/src/protocol/session-v2.ts';
import type { CharacterCommand, CharacterResponse, Expected } from '../../../../shared/src/protocol/session-v2.ts';

export interface CharacterTransport {
  send(jsonText: string): Promise<string>;
}

export type CharacterCreateIntent = Readonly<{
  sessionId: string;
  sessionEpoch: number;
  operationId: string;
  classId: 'warrior' | 'hunter';
  characterName: string;
  expected?: Expected[];
}>;

export type CharacterSelectIntent = Readonly<{
  sessionId: string;
  sessionEpoch: number;
  operationId: string;
  characterId: string;
  expected?: Expected[];
}>;

export type CharacterCoordinatorState =
  | { status: 'idle' }
  | { status: 'creating' }
  | { status: 'selecting' }
  | { status: 'unknown'; code: 'RESULT_UNKNOWN' }
  | { status: 'created'; characterId: string; classId: 'warrior' | 'hunter'; characterName: string }
  | { status: 'selected'; characterId: string; rolePlayEpoch: number; innAnchorRef: string }
  | { status: 'rejected'; code: string }
  | { status: 'error'; code: string };

function validateName(name: string): boolean {
  if (typeof name !== 'string') return false;
  return /^(?:[A-Za-z]{1,12}|\p{Unified_Ideograph}{1,6})$/u.test(name);
}

/**
 * Pure client model coordinator for character creation.
 * Manages intention lifecycle, unknown status recovery and late callback isolation.
 */
export class CharacterCoordinator {
  private current: CharacterCoordinatorState = { status: 'idle' };
  private generation = 0;
  private request: CharacterCommand | undefined;
  private intent: CharacterCreateIntent | undefined;
  private readonly transport: CharacterTransport;

  constructor(transport: CharacterTransport) {
    this.transport = transport;
  }

  get state(): CharacterCoordinatorState {
    return structuredClone(this.current);
  }

  async start(intent: CharacterCreateIntent): Promise<void> {
    if (this.current.status === 'creating' || this.current.status === 'unknown') {
      throw new Error('UNRESOLVED_CHARACTER_INTENT');
    }

    if (!validateName(intent.characterName)) {
      this.current = { status: 'rejected', code: 'INVALID_ARGUMENT' };
      return;
    }

    const request: CharacterCommand = {
      protocolVersion: 2,
      command: 'character.create',
      operationId: intent.operationId,
      sessionId: intent.sessionId,
      sessionEpoch: intent.sessionEpoch,
      expected: intent.expected ? [...intent.expected] : [],
      payload: {
        classId: intent.classId,
        characterName: intent.characterName,
      },
    };

    this.intent = { ...intent };
    this.request = request;
    const generation = ++this.generation;
    await this.send(generation, request);
  }

  async select(intent: CharacterSelectIntent): Promise<void> {
    if (this.current.status === 'creating' || this.current.status === 'selecting' || this.current.status === 'unknown') {
      throw new Error('UNRESOLVED_CHARACTER_INTENT');
    }

    const request: CharacterCommand = {
      protocolVersion: 2,
      command: 'character.select',
      operationId: intent.operationId,
      sessionId: intent.sessionId,
      sessionEpoch: intent.sessionEpoch,
      expected: intent.expected ? [...intent.expected] : [],
      payload: {
        characterId: intent.characterId,
      },
    };

    this.request = request;
    const generation = ++this.generation;
    await this.send(generation, request);
  }

  async retry(): Promise<void> {
    if (this.current.status !== 'unknown' || !this.request) {
      throw new Error('NO_PENDING_CHARACTER_INTENT');
    }
    await this.send(++this.generation, this.request);
  }

  reset(): void {
    ++this.generation;
    this.request = undefined;
    this.intent = undefined;
    this.current = { status: 'idle' };
  }

  private async send(generation: number, request: CharacterCommand): Promise<void> {
    this.current = request.command === 'character.select' ? { status: 'selecting' } : { status: 'creating' };
    let text: string;
    try {
      text = await this.transport.send(JSON.stringify(request));
    } catch {
      if (generation === this.generation) {
        this.current = { status: 'unknown', code: 'RESULT_UNKNOWN' };
      }
      return;
    }

    if (generation !== this.generation) return;

    let response: CharacterResponse;
    try {
      response = parseCharacterResponse(JSON.parse(text));
    } catch {
      this.current = { status: 'unknown', code: 'RESULT_UNKNOWN' };
      return;
    }

    if (response.outcome.status === 'unknown') {
      this.current = { status: 'unknown', code: 'RESULT_UNKNOWN' };
      return;
    }

    if (response.outcome.status === 'rejected') {
      this.current = { status: 'rejected', code: response.outcome.code };
      return;
    }

    const data = response.outcome.data;
    if ('classId' in data) {
      this.current = {
        status: 'created',
        characterId: data.characterId,
        classId: data.classId,
        characterName: data.characterName,
      };
    } else if ('innAnchorRef' in data) {
      this.current = {
        status: 'selected',
        characterId: data.characterId,
        rolePlayEpoch: data.rolePlayEpoch,
        innAnchorRef: data.innAnchorRef,
      };
    } else {
      this.current = { status: 'error', code: 'UNEXPECTED_RESPONSE_SHAPE' };
    }
  }
}
