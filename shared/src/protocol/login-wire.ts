import { parseLoginRequest, parseLoginResponse } from './session-v2.ts';
import type { LoginRequest, LoginResponse } from './session-v2.ts';

/** Caller-side wire boundary, not an authentication adapter or a login service. */
export function encodeLoginRequest(request: LoginRequest): string {
  return JSON.stringify(parseLoginRequest(request));
}
export function decodeLoginResponse(request: LoginRequest, text: string): LoginResponse {
  const intent = parseLoginRequest(request);
  if (typeof text !== 'string' || text.length > 65536) throw new TypeError('INVALID_RESPONSE_SIZE');
  const response = parseLoginResponse(JSON.parse(text));
  const operationId = intent.command === 'session.prepare' ? intent.payload.prepareOperationId : intent.payload.openOperationId;
  if (response.command !== intent.command || response.operationId !== operationId) throw new TypeError('LOGIN_RESPONSE_MISMATCH');
  if (response.command === 'session.prepare' && response.outcome.status === 'committed' && response.outcome.data.launchId !== intent.payload.launchId) throw new TypeError('LOGIN_RESPONSE_MISMATCH');
  return response;
}
