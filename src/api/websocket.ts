/**
 * WebSocket client for real-time synchronization.
 * Connects to Django Channels with JWT authentication.
 * Features: auto-reconnect, exponential backoff, heartbeat, presence/typing.
 */

import { getAccessToken, refreshAccessToken } from './auth';

// Resolve WS base URL: in production, use env var; in dev, use Vite proxy (same origin)
const WS_BASE = import.meta.env.VITE_WS_BASE || '';

// Unique session ID per tab — allows same user on multiple devices to sync
export const SESSION_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export type WSEventType =
  | 'workspace_updated'
  | 'record_changed'
  | 'pong'
  | 'presence_update'
  | 'user_activity';

export interface WSMessage {
  type: WSEventType;
  payload?: any;
  action?: 'create' | 'update' | 'delete';
  model?: string;
  source?: string;
  session_id?: string;
}

type MessageHandler = (msg: WSMessage) => void;
type StatusHandler = (connected: boolean) => void;

class RealtimeClient {
  private ws: WebSocket | null = null;
  private messageHandlers: MessageHandler[] = [];
  private statusHandlers: StatusHandler[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 20;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private intentionalClose = false;

  /**
   * Connect to WebSocket server.
   * Refreshes token if needed, then builds URL with JWT as query parameter.
   */
  async connect() {
    let token = getAccessToken();

    // Try refreshing if no token (page reload edge case)
    if (!token) {
      token = await refreshAccessToken();
    }

    if (!token) {
      console.warn('[WS] No valid token, skipping connection');
      return;
    }

    this.intentionalClose = false;
    this._doConnect(token);
  }

  private _doConnect(token: string) {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    let url: string;
    if (WS_BASE) {
      url = `${WS_BASE}/ws/sync/?token=${token}&session_id=${SESSION_ID}`;
    } else {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      url = `${proto}//${window.location.host}/ws/sync/?token=${token}&session_id=${SESSION_ID}`;
    }

    try {
      this.ws = new WebSocket(url);
    } catch (e) {
      console.error('[WS] Failed to create WebSocket:', e);
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log('[WS] Connected');
      this.reconnectAttempts = 0;
      this._notifyStatus(true);
      this._startPing();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        for (const handler of this.messageHandlers) {
          handler(msg);
        }
      } catch (e) {
        console.error('[WS] Failed to parse message:', e);
      }
    };

    this.ws.onclose = (event) => {
      console.log(`[WS] Disconnected (code=${event.code})`);
      this._stopPing();
      this._notifyStatus(false);

      if (this.intentionalClose) return;

      if (event.code === 4001) {
        this._reconnectWithFreshToken();
      } else {
        this._scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror, so reconnect is handled there
    };
  }

  /**
   * Send a message to the server.
   * Automatically attaches session_id.
   */
  send(data: Record<string, any>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ ...data, session_id: SESSION_ID }));
    }
  }

  /**
   * Send workspace state update through WebSocket.
   */
  sendWorkspaceUpdate(payload: any) {
    this.send({
      type: 'workspace_update',
      payload,
    });
  }

  /**
   * Send a user activity event (e.g., editing a field).
   */
  sendActivity(activity: { action: string; detail?: string }) {
    this.send({
      type: 'user_activity',
      payload: activity,
    });
  }

  /**
   * Cleanly disconnect.
   */
  disconnect() {
    this.intentionalClose = true;
    this._stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this._notifyStatus(false);
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter((h) => h !== handler);
    };
  }

  onStatusChange(handler: StatusHandler): () => void {
    this.statusHandlers.push(handler);
    return () => {
      this.statusHandlers = this.statusHandlers.filter((h) => h !== handler);
    };
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // ── Internal helpers ──

  private async _reconnectWithFreshToken() {
    const newToken = await refreshAccessToken();
    if (newToken) {
      console.log('[WS] Token refreshed, reconnecting...');
      this._doConnect(newToken);
    } else {
      console.warn('[WS] Token refresh failed, cannot reconnect');
    }
  }

  private _scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('[WS] Max reconnect attempts reached');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private _startPing() {
    this._stopPing();
    this.pingTimer = setInterval(() => {
      this.send({ type: 'ping' });
    }, 25000);
  }

  private _stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private _notifyStatus(connected: boolean) {
    for (const handler of this.statusHandlers) {
      handler(connected);
    }
  }
}

// Singleton instance
export const realtimeClient = new RealtimeClient();
