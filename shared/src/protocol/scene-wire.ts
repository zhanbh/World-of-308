import { parseSceneRequest, parseRoomRequest, parseSceneQuery, parseSceneResponse, parseRoomResponse, parseRecoveryPage, parseSimulationResponse, parseChallengeRequest, parseChallengeResponse, parseChallengeQueryResponse, parseDungeonEntryQuery, parseDungeonEntryResponse } from './scene-v2.ts';
import { decodeSimulationSubmit } from './simulation-v2.ts';

function route(value: unknown) {
  if (!value || typeof value !== 'object') throw new TypeError('INVALID_ARGUMENT');
  const command = Object.getOwnPropertyDescriptor(value, 'command')?.value;
  if (command === 'simulation.submit') return decodeSimulationSubmit(JSON.stringify(value));
  if (command === 'challenge.prepareRoom' || command === 'challenge.activateRoom') return parseRoomRequest(value);
  if (command === 'challenge.start' || command === 'challenge.revive' || command === 'challenge.leave' || command === 'drop.collect') return parseChallengeRequest(value);
  if (Object.getOwnPropertyDescriptor(value, 'query')?.value === 'dungeon.entry') return parseDungeonEntryQuery(value);
  if (Object.hasOwn(value, 'query')) return parseSceneQuery(value);
  return parseSceneRequest(value);
}
export function encodeSceneMessage(value: unknown): string {
  const text = JSON.stringify(route(value));
  if (new TextEncoder().encode(text).length > 16384) throw new TypeError('REQUEST_TOO_LARGE');
  return text;
}
export function decodeSceneReply(request: unknown, text: string) {
  const intent = route(request);
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > 32768) throw new TypeError('RESPONSE_TOO_LARGE');
  const value: unknown = JSON.parse(text);
  if ('query' in intent) {
    if (intent.query === 'dungeon.entry') {
      const r = parseDungeonEntryResponse(value);
      if (r.requestId !== intent.requestId || ('data' in r && r.data.dungeonId !== intent.payload.dungeonId)) throw new TypeError('RESPONSE_MISMATCH');
      return r;
    }
    if (intent.query === 'scene.recoveryPage') {
      const page = parseRecoveryPage(value), p = intent.payload;
      if (page.requestId !== intent.requestId || page.pageIndex !== p.pageIndex || page.readyTicketId !== p.readyTicketId || page.sceneEpoch !== p.sceneEpoch || page.timelineEpoch !== p.timelineEpoch || page.checkpointRevision !== p.checkpointRevision || page.manifestHash !== p.manifestHash || page.publicStateHash !== p.publicStateHash) throw new TypeError('RESPONSE_MISMATCH');
      return page;
    }
    const r = parseChallengeQueryResponse(value);
    if (r.requestId !== intent.requestId || ('data' in r && r.data.challengeId !== intent.payload.challengeId)) throw new TypeError('RESPONSE_MISMATCH');
    return r;
  }
  if (intent.command === 'simulation.submit') {
    const response = parseSimulationResponse(value);
    if (response.operationId !== intent.operationId) throw new TypeError('RESPONSE_MISMATCH');
    return response;
  }
  if (intent.command === 'challenge.prepareRoom' || intent.command === 'challenge.activateRoom') {
    const response = parseRoomResponse(value);
    if (response.command !== intent.command || response.operationId !== intent.operationId) throw new TypeError('RESPONSE_MISMATCH');
    return response;
  }
  if (intent.command === 'challenge.start' || intent.command === 'challenge.revive' || intent.command === 'challenge.leave' || intent.command === 'drop.collect') {
    const response = parseChallengeResponse(value);
    if (response.command !== intent.command || response.operationId !== intent.operationId) throw new TypeError('RESPONSE_MISMATCH');
    return response;
  }
  const response = parseSceneResponse(value);
  if (response.command !== intent.command || ('heartbeatSeq' in intent ? !('heartbeatSeq' in response) || response.heartbeatSeq !== intent.heartbeatSeq : !('controlSeq' in response) || response.controlSeq !== intent.controlSeq)) throw new TypeError('RESPONSE_MISMATCH');
  if (response.outcome.status === 'committed') {
    const { state, readyTicket } = response.outcome.data;
    if (state.challengeId !== intent.payload.challengeId) throw new TypeError('RESPONSE_MISMATCH');
    if (intent.command === 'scene.ready') {
      const p = intent.payload;
      if (state.sceneEpoch !== p.sceneEpoch || state.timelineEpoch !== p.timelineEpoch || state.checkpointRevision < p.checkpointRevision || state.manifestHash !== p.manifestHash) throw new TypeError('READY_RESPONSE_MISMATCH');
      if (readyTicket && (readyTicket.readyTicketId !== p.readyTicketId || readyTicket.checkpointRevision !== p.checkpointRevision || readyTicket.publicStateHash !== p.publicStateHash)) throw new TypeError('READY_RESPONSE_MISMATCH');
    }
  }
  return response;
}
