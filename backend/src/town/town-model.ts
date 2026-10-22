export interface TownPosition {
  x: number;
  y: number;
}

export interface TownState {
  mapRef: string;
  sceneEpoch: number;
  position: TownPosition;
  velocityRemainder: number;
  acceptedSeq: number;
  locationRevision: number;
  updatedAt: number;
}

export interface TownMovementStep {
  seq: number;
  dx: number;
  dy: number;
  dtMs: number;
}

export interface TownMapBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface TownAnchor {
  anchorId: string;
  x: number;
  y: number;
}

export interface TownServiceAnchor extends TownAnchor {
  serviceKind: 'bank' | 'mailbox' | 'shop' | 'repair' | 'enhance' | 'pointsShop';
}

export interface TownMapManifest {
  mapId: string;
  bounds: TownMapBounds;
  innDoorAnchor: TownAnchor;
  serviceAnchors: Record<string, TownServiceAnchor>;
  speedLimit: number; // px per second
}

export const DEFAULT_TOWN_MAP: TownMapManifest = {
  mapId: 'town-map-1',
  bounds: { minX: 0, maxX: 1000, minY: 0, maxY: 1000 },
  innDoorAnchor: { anchorId: 'inn-door', x: 100, y: 100 },
  serviceAnchors: {
    bank: { anchorId: 'bank', serviceKind: 'bank', x: 110, y: 100 },       // dist = 10px <= 24px
    mailbox: { anchorId: 'mailbox', serviceKind: 'mailbox', x: 100, y: 115 }, // dist = 15px <= 24px
    blacksmith: { anchorId: 'blacksmith', serviceKind: 'repair', x: 300, y: 300 }, // dist = 282px > 24px
    shop: { anchorId: 'shop', serviceKind: 'shop', x: 310, y: 300 },           // dist = 290px > 24px
  },
  speedLimit: 160,
};

export interface ServiceContextEntity {
  schemaVersion: 2;
  id: string; // contextId
  accountId: string;
  characterId: string;
  rolePlayEpoch: number;
  sceneEpoch: number;
  locationRevision: number;
  anchorId: string;
  serviceKind: 'bank' | 'mailbox' | 'shop' | 'repair' | 'enhance' | 'pointsShop';
  issuedAt: number;
  status: 'open' | 'closed' | 'invalidated';
}
