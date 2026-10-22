import { encodeLoginRequest, decodeLoginResponse } from '../../../../shared/src/protocol/login-wire.ts';
import type { LoginRequest, SessionView } from '../../../../shared/src/protocol/session-v2.ts';

export interface LoginTransport { send(jsonText: string): Promise<string>; }
export type LoginIntent = Readonly<{ launchId: string; prepareOperationId: string; openOperationId: string }>;
export type LoginState =
  | { status: 'idle' }
  | { status: 'preparing' | 'committing' }
  | { status: 'unknown'; phase: 'prepare' | 'commit'; code: 'RESULT_UNKNOWN' }
  | { status: 'authenticated'; session: SessionView }
  | { status: 'superseded'; code: 'SESSION_REVOKED' | 'VERSION_CONFLICT' }
  | { status: 'error'; code: string };

/** Platform-independent caller. A transport failure never proves that a commit did not happen. */
export class LoginCoordinator {
  private current: LoginState = { status: 'idle' };
  private generation = 0;
  private request: LoginRequest | undefined;
  private intent: LoginIntent | undefined;
  private readonly transport: LoginTransport;
  constructor(transport: LoginTransport) { this.transport = transport; }
  get state(): LoginState { return structuredClone(this.current); }

  async start(intent: LoginIntent): Promise<void> {
    if (this.current.status === 'committing' || this.current.status === 'unknown') throw new Error('UNRESOLVED_LOGIN_INTENT');
    const request: LoginRequest = { protocolVersion: 2, command: 'session.prepare', payload: { launchId: intent.launchId, prepareOperationId: intent.prepareOperationId } };
    encodeLoginRequest(request);
    encodeLoginRequest({ protocolVersion: 2, command: 'session.commit', payload: { launchId: intent.launchId, ticketId: 'intent-validation', openOperationId: intent.openOperationId } });
    this.intent = { ...intent };
    this.request = request;
    const generation = ++this.generation;
    await this.send(generation, request);
  }

  async retry(): Promise<void> {
    if (this.current.status !== 'unknown' || !this.request) throw new Error('NO_PENDING_LOGIN_INTENT');
    await this.send(++this.generation, this.request);
  }

  cancel(): void {
    ++this.generation;
    if (this.request?.command === 'session.commit' && (this.current.status === 'committing' || this.current.status === 'unknown')) {
      this.current = { status: 'unknown', phase: 'commit', code: 'RESULT_UNKNOWN' };
      return;
    }
    this.request = undefined;
    this.intent = undefined;
    this.current = { status: 'idle' };
  }

  private async send(generation: number, request: LoginRequest): Promise<void> {
    this.current = { status: request.command === 'session.prepare' ? 'preparing' : 'committing' };
    let text: string;
    try { text = await this.transport.send(encodeLoginRequest(request)); }
    catch {
      if (generation === this.generation) this.current = { status: 'unknown', phase: request.command === 'session.prepare' ? 'prepare' : 'commit', code: 'RESULT_UNKNOWN' };
      return;
    }
    if (generation !== this.generation) return;
    let response;
    try { response = decodeLoginResponse(request, text); }
    catch { this.current = { status: 'unknown', phase: request.command === 'session.prepare' ? 'prepare' : 'commit', code: 'RESULT_UNKNOWN' }; return; }
    if (response.outcome.status === 'unknown') {
      this.current = { status: 'unknown', phase: request.command === 'session.prepare' ? 'prepare' : 'commit', code: 'RESULT_UNKNOWN' }; return;
    }
    if (response.outcome.status === 'rejected') {
      const code = response.outcome.code;
      this.current = code === 'SESSION_REVOKED' || code === 'VERSION_CONFLICT' ? { status: 'superseded', code } : { status: 'error', code };
      return;
    }
    if (response.command === 'session.commit') {
      this.current = response.outcome.data.sessionState === 'current'
        ? { status: 'authenticated', session: response.outcome.data }
        : { status: 'superseded', code: 'SESSION_REVOKED' };
      return;
    }
    const intent = this.intent!;
    const next: LoginRequest = { protocolVersion: 2, command: 'session.commit', payload: { launchId: intent.launchId, ticketId: response.outcome.data.ticketId, openOperationId: intent.openOperationId } };
    this.request = next;
    await this.send(generation, next);
  }
}
