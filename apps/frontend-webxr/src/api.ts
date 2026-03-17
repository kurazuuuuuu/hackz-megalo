import type { PodAction, SessionMeta, SessionMetrics, SlaveState } from "./types.ts";

const EVENT_ID_BY_ACTION: Record<PodAction, number> = {
  hit: 1,
  scare: 2,
  infect: 3,
  firewall: 4,
  calm: 5,
};

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

export async function sendPodAction(action: PodAction, targetPod: string): Promise<void> {
  await requestJSON("/events", {
    method: "POST",
    body: JSON.stringify({
      event_id: EVENT_ID_BY_ACTION[action],
      seed: Date.now(),
      target_pod: targetPod,
    }),
  });
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

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const [session, metrics, states] = await Promise.all([
        fetchSessionMeta(),
        fetchSessionMetrics(),
        fetchSlaveStates(),
      ]);

      return { session, metrics, states };
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("session snapshot unavailable");
}
