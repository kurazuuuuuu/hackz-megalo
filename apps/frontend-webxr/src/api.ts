import type { DeathReason, SessionMeta, SessionMetrics, SlaveState } from "./types.ts";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export const apiBaseUrl = trimTrailingSlash(import.meta.env.VITE_API_BASE_URL ?? "");

export const wsUrl =
  import.meta.env.VITE_WS_URL ||
  `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;

async function requestJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function fetchSessionMeta(): Promise<SessionMeta> {
  return requestJSON<SessionMeta>("/internal/session");
}

export async function fetchSessionMetrics(): Promise<SessionMetrics> {
  return requestJSON<SessionMetrics>("/internal/session/metrics");
}

export async function fetchSlaveStates(): Promise<SlaveState[]> {
  return requestJSON<SlaveState[]>("/internal/slaves");
}

export function sendPodStateUpdate(
  socket: WebSocket,
  payload: {
    session_id: string;
    slave_id: string;
    status: "SLAVE_STATUS_GONE";
    death_reason: DeathReason;
  },
): void {
  if (socket.readyState !== WebSocket.OPEN) {
    throw new Error("WebSocket が開いていません。");
  }

  socket.send(
    JSON.stringify({
      type: "pod_state_update",
      ...payload,
    }),
  );
}

export function connectSessionSocket(handlers: {
  onOpen: () => void;
  onMessage: (state: SlaveState) => void;
  onClose: (event: CloseEvent) => void;
  onError: () => void;
}): WebSocket {
  const socket = new WebSocket(wsUrl);

  socket.addEventListener("open", handlers.onOpen);
  socket.addEventListener("message", (event) => {
    try {
      handlers.onMessage(JSON.parse(event.data) as SlaveState);
    } catch {
      handlers.onError();
    }
  });
  socket.addEventListener("close", handlers.onClose);
  socket.addEventListener("error", handlers.onError);

  return socket;
}

export async function waitForSessionSnapshot(): Promise<{
  session: SessionMeta;
  metrics: SessionMetrics;
  states: SlaveState[];
}> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const [session, metrics, states] = await Promise.all([
        fetchSessionMeta(),
        fetchSessionMetrics(),
        fetchSlaveStates(),
      ]);

      return { session, metrics, states };
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => window.setTimeout(resolve, 200));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("session snapshot unavailable");
}
