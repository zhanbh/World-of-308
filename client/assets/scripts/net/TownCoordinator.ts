export interface TownTransport {
  send(jsonText: string): Promise<string>;
}

export type TownSceneKind = 'inn' | 'town';

export type TownServicePanelState =
  | { status: 'closed' }
  | { status: 'opening'; serviceKind: string; anchorId: string }
  | { status: 'open'; serviceKind: string; anchorId: string; contextId: string; locationRevision: number }
  | { status: 'rejected'; code: string };

export type TownCoordinatorState = {
  scene: TownSceneKind;
  characterId: string | null;
  rolePlayEpoch: number;
  position: { x: number; y: number };
  acceptedSeq: number;
  locationRevision: number;
  servicePanel: TownServicePanelState;
  isMoving: boolean;
};

export interface TownExitInnIntent {
  sessionId: string;
  sessionEpoch: number;
  operationId: string;
  exitAnchorId?: string;
}

export interface TownMoveIntent {
  sessionId: string;
  sessionEpoch: number;
  operationId: string;
  steps: { dx: number; dy: number; dtMs: number }[];
}

export interface TownOpenServiceIntent {
  sessionId: string;
  sessionEpoch: number;
  operationId: string;
  serviceKind: 'bank' | 'mailbox' | 'shop' | 'repair' | 'enhance' | 'pointsShop';
  anchorId: string;
}

export interface TownCloseServiceIntent {
  sessionId: string;
  sessionEpoch: number;
  operationId: string;
}

const DEFAULT_ANCHORS: Record<string, { x: number; y: number }> = {
  'inn-door': { x: 100, y: 100 },
  bank: { x: 110, y: 100 },
  mailbox: { x: 100, y: 115 },
  blacksmith: { x: 300, y: 300 },
  shop: { x: 310, y: 300 },
};

/**
 * Pure client model coordinator for town movement, inn exits, and service location context lifecycle.
 * Protects against late responses and guarantees panels close prior to movement.
 */
export class TownCoordinator {
  private current: TownCoordinatorState = {
    scene: 'inn',
    characterId: null,
    rolePlayEpoch: 0,
    position: { x: 0, y: 0 },
    acceptedSeq: 0,
    locationRevision: 0,
    servicePanel: { status: 'closed' },
    isMoving: false,
  };

  private generation = 0;
  private readonly transport: TownTransport;

  constructor(transport: TownTransport) {
    this.transport = transport;
  }

  get state(): TownCoordinatorState {
    return structuredClone(this.current);
  }

  init(characterId: string, rolePlayEpoch: number, initialScene: TownSceneKind = 'inn'): void {
    ++this.generation;
    this.current = {
      scene: initialScene,
      characterId,
      rolePlayEpoch,
      position: initialScene === 'town' ? { x: 100, y: 100 } : { x: 0, y: 0 },
      acceptedSeq: 0,
      locationRevision: initialScene === 'town' ? 1 : 0,
      servicePanel: { status: 'closed' },
      isMoving: false,
    };
  }

  async exitInn(intent: TownExitInnIntent): Promise<void> {
    if (!this.current.characterId || this.current.scene !== 'inn') {
      return;
    }

    const generation = ++this.generation;
    const request = {
      protocolVersion: 2,
      command: 'scene.exitInn',
      operationId: intent.operationId,
      sessionId: intent.sessionId,
      sessionEpoch: intent.sessionEpoch,
      expected: [],
      payload: {
        characterId: this.current.characterId,
        exitAnchorId: intent.exitAnchorId ?? 'inn-door',
      },
    };

    let text: string;
    try {
      text = await this.transport.send(JSON.stringify(request));
    } catch {
      return;
    }

    if (generation !== this.generation) return;

    try {
      const response = JSON.parse(text);
      if (response?.outcome?.status === 'committed') {
        const data = response.outcome.data;
        const anchorPos = DEFAULT_ANCHORS[data.anchorId] ?? { x: 100, y: 100 };
        this.current.scene = 'town';
        this.current.position = { ...anchorPos };
        this.current.locationRevision = data.locationRevision;
        this.current.acceptedSeq = 0;
      }
    } catch {
      // malformed response
    }
  }

  async move(intent: TownMoveIntent): Promise<void> {
    if (!this.current.characterId || this.current.scene !== 'town') {
      return;
    }

    // Rule: moving closes any open or opening service panel locally
    if (this.current.servicePanel.status !== 'closed') {
      this.current.servicePanel = { status: 'closed' };
    }

    const generation = ++this.generation;
    this.current.isMoving = true;

    // Build sequential steps starting after acceptedSeq
    let currentSeq = this.current.acceptedSeq;
    const stepsWithSeq = intent.steps.map(s => {
      currentSeq += 1;
      return {
        seq: currentSeq,
        dx: s.dx,
        dy: s.dy,
        dtMs: s.dtMs,
      };
    });

    // Local client prediction
    for (const step of intent.steps) {
      this.current.position.x += step.dx;
      this.current.position.y += step.dy;
    }

    const request = {
      protocolVersion: 2,
      command: 'town.move',
      operationId: intent.operationId,
      sessionId: intent.sessionId,
      sessionEpoch: intent.sessionEpoch,
      payload: {
        characterId: this.current.characterId,
        steps: stepsWithSeq,
      },
    };

    let text: string;
    try {
      text = await this.transport.send(JSON.stringify(request));
    } catch {
      if (generation === this.generation) {
        this.current.isMoving = false;
      }
      return;
    }

    if (generation !== this.generation) return;

    this.current.isMoving = false;

    try {
      const response = JSON.parse(text);
      if (response?.outcome?.status === 'committed') {
        const data = response.outcome.data;
        this.current.position = { ...data.position };
        this.current.acceptedSeq = data.acceptedSeq;
        this.current.locationRevision = data.locationRevision;
      }
    } catch {
      // malformed response
    }
  }

  async openService(intent: TownOpenServiceIntent): Promise<void> {
    if (!this.current.characterId || this.current.scene !== 'town') {
      return;
    }

    // Local distance verification
    const anchor = DEFAULT_ANCHORS[intent.anchorId];
    if (anchor) {
      const distSq = (this.current.position.x - anchor.x) ** 2 + (this.current.position.y - anchor.y) ** 2;
      if (distSq > 576) {
        this.current.servicePanel = { status: 'rejected', code: 'LOCATION_NOT_ALLOWED' };
        return;
      }
    }

    const generation = ++this.generation;
    this.current.servicePanel = { status: 'opening', serviceKind: intent.serviceKind, anchorId: intent.anchorId };

    const request = {
      protocolVersion: 2,
      command: 'service.open',
      operationId: intent.operationId,
      sessionId: intent.sessionId,
      sessionEpoch: intent.sessionEpoch,
      expected: [],
      payload: {
        characterId: this.current.characterId,
        serviceKind: intent.serviceKind,
        anchorId: intent.anchorId,
      },
    };

    let text: string;
    try {
      text = await this.transport.send(JSON.stringify(request));
    } catch {
      if (generation === this.generation) {
        this.current.servicePanel = { status: 'rejected', code: 'TRANSPORT_ERROR' };
      }
      return;
    }

    if (generation !== this.generation) return;

    try {
      const response = JSON.parse(text);
      if (response?.outcome?.status === 'committed') {
        const data = response.outcome.data;
        this.current.servicePanel = {
          status: 'open',
          serviceKind: data.serviceKind,
          anchorId: intent.anchorId,
          contextId: data.contextId,
          locationRevision: data.locationRevision,
        };
      } else if (response?.outcome?.status === 'rejected') {
        this.current.servicePanel = { status: 'rejected', code: response.outcome.code };
      }
    } catch {
      this.current.servicePanel = { status: 'rejected', code: 'MALFORMED_RESPONSE' };
    }
  }

  async closeService(intent: TownCloseServiceIntent): Promise<void> {
    if (this.current.servicePanel.status !== 'open') {
      this.current.servicePanel = { status: 'closed' };
      return;
    }

    const contextId = this.current.servicePanel.contextId;
    this.current.servicePanel = { status: 'closed' };

    const request = {
      protocolVersion: 2,
      command: 'service.close',
      operationId: intent.operationId,
      sessionId: intent.sessionId,
      sessionEpoch: intent.sessionEpoch,
      expected: [],
      payload: {
        characterId: this.current.characterId,
        contextId,
      },
    };

    try {
      await this.transport.send(JSON.stringify(request));
    } catch {
      // best-effort close
    }
  }

  reset(): void {
    ++this.generation;
    this.current = {
      scene: 'inn',
      characterId: null,
      rolePlayEpoch: 0,
      position: { x: 0, y: 0 },
      acceptedSeq: 0,
      locationRevision: 0,
      servicePanel: { status: 'closed' },
      isMoving: false,
    };
  }
}
