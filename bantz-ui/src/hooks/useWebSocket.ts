import { useEffect, useRef, useState, useCallback } from "react";

export type WsStatus =
  | "idle"
  | "connecting"
  | "open"
  | "closing"
  | "closed"
  | "error";

export interface WsMessage {
  ts: number;
  raw: string;
  data?: unknown;
}

interface UseWebSocketOpts {
  url: string;
  /** Try to reconnect after this many ms on close. Set to 0 to disable. */
  reconnectDelay?: number;
  /** Cap consecutive reconnect attempts. */
  maxAttempts?: number;
  /** Auto-connect on mount. Default true. */
  autoConnect?: boolean;
}

/**
 * useWebSocket
 *
 * Lightweight WebSocket hook with auto-reconnect and exponential backoff.
 * The Bantz backend is expected at ws://localhost:8765 and may not be running
 * yet — the hook surfaces a friendly `status` so the UI can render an
 * "AWAITING TRANSMISSION" state without crashing.
 */
export function useWebSocket({
  url,
  reconnectDelay = 2000,
  maxAttempts = 30,
  autoConnect = true,
}: UseWebSocketOpts) {
  const [status, setStatus] = useState<WsStatus>("idle");
  const [lastMessage, setLastMessage] = useState<WsMessage | null>(null);
  const [attempts, setAttempts] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<number | null>(null);
  const attemptsRef = useRef(0);
  const manuallyClosedRef = useRef(false);

  const connect = useCallback(() => {
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    manuallyClosedRef.current = false;
    setStatus("connecting");

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      console.warn("[bantz/ws] construction failed", err);
      setStatus("error");
      scheduleReconnect();
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      attemptsRef.current = 0;
      setAttempts(0);
      setStatus("open");
    };

    ws.onmessage = (ev) => {
      let parsed: unknown = undefined;
      try {
        parsed = JSON.parse(ev.data);
      } catch {
        /* leave as raw */
      }
      setLastMessage({ ts: Date.now(), raw: String(ev.data), data: parsed });
    };

    ws.onerror = () => {
      setStatus("error");
    };

    ws.onclose = () => {
      setStatus("closed");
      wsRef.current = null;
      if (!manuallyClosedRef.current) scheduleReconnect();
    };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleReconnect = useCallback(() => {
    if (reconnectDelay <= 0) return;
    if (attemptsRef.current >= maxAttempts) return;
    if (timerRef.current != null) return;

    const next = attemptsRef.current + 1;
    attemptsRef.current = next;
    setAttempts(next);

    // Exponential backoff capped at 30s.
    const delay = Math.min(reconnectDelay * Math.pow(1.6, next - 1), 30_000);

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      connect();
    }, delay);
  }, [reconnectDelay, maxAttempts, connect]);

  const send = useCallback((payload: unknown) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    const data =
      typeof payload === "string" ? payload : JSON.stringify(payload);
    ws.send(data);
    return true;
  }, []);

  const close = useCallback(() => {
    manuallyClosedRef.current = true;
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    wsRef.current?.close();
    wsRef.current = null;
    setStatus("closed");
  }, []);

  useEffect(() => {
    if (autoConnect) connect();
    return () => {
      manuallyClosedRef.current = true;
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return { status, lastMessage, attempts, send, connect, close };
}
