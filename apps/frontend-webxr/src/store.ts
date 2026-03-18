import type { ActivityEntry, SessionMeta, SessionMetrics, SlaveState } from "./types.ts";

export type GamePhase = "idle" | "connecting" | "playing" | "error";

export interface GameState {
  phase: GamePhase;
  session: SessionMeta | null;
  metrics: SessionMetrics | null;
  podsById: Record<string, SlaveState>;
  selectedPodId: string | null;
  hoveredPodId: string | null;
  connectionMessage: string;
  errorMessage: string | null;
  actionInFlight: boolean;
  activity: ActivityEntry[];
  xrSupported: boolean;
  xrActive: boolean;
  xrEliminatedPodIds: string[];
}

type Listener = (state: GameState) => void;

function initialState(xrSupported = false): GameState {
  return {
    phase: "idle",
    session: null,
    metrics: null,
    podsById: {},
    selectedPodId: null,
    hoveredPodId: null,
    connectionMessage: "セッション開始待機中",
    errorMessage: null,
    actionInFlight: false,
    activity: [],
    xrSupported,
    xrActive: false,
    xrEliminatedPodIds: [],
  };
}

export class GameStore {
  private state: GameState = initialState(typeof navigator !== "undefined" && "xr" in navigator);

  private readonly listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): GameState {
    return this.state;
  }

  patch(update: Partial<GameState>): void {
    this.state = {
      ...this.state,
      ...update,
    };
    this.emit();
  }

  resetToDisconnected(message: string): void {
    this.state = {
      ...initialState(this.state.xrSupported),
      connectionMessage: message,
    };
    this.emit();
  }

  hydrateSnapshot(session: SessionMeta, metrics: SessionMetrics, pods: SlaveState[]): void {
    const podsById = Object.fromEntries(pods.map((pod) => [pod.slave_id, pod]));
    const selectedPodId =
      this.state.selectedPodId && podsById[this.state.selectedPodId]
        ? this.state.selectedPodId
        : (pods[0]?.slave_id ?? null);

    this.state = {
      ...this.state,
      phase: "playing",
      session,
      metrics,
      podsById,
      selectedPodId,
      errorMessage: null,
      connectionMessage: "接続中",
      xrEliminatedPodIds: [],
    };
    this.emit();
  }

  upsertPod(pod: SlaveState): void {
    const selectedPodId =
      this.state.selectedPodId === null ? pod.slave_id : this.state.selectedPodId;

    this.state = {
      ...this.state,
      podsById: {
        ...this.state.podsById,
        [pod.slave_id]: pod,
      },
      selectedPodId,
    };
    this.emit();
  }

  setSelectedPod(slaveId: string | null): void {
    this.state = {
      ...this.state,
      selectedPodId: slaveId,
    };
    this.emit();
  }

  setHoveredPod(slaveId: string | null): void {
    this.state = {
      ...this.state,
      hoveredPodId: slaveId,
    };
    this.emit();
  }

  setMetrics(metrics: SessionMetrics): void {
    this.state = {
      ...this.state,
      metrics,
    };
    this.emit();
  }

  setActionInFlight(actionInFlight: boolean): void {
    this.state = {
      ...this.state,
      actionInFlight,
    };
    this.emit();
  }

  setXRSupport(xrSupported: boolean): void {
    this.state = {
      ...this.state,
      xrSupported,
    };
    this.emit();
  }

  setXRActive(xrActive: boolean): void {
    this.state = {
      ...this.state,
      xrActive,
    };
    this.emit();
  }

  markXrPodEliminated(slaveId: string): void {
    if (this.state.xrEliminatedPodIds.includes(slaveId)) {
      return;
    }

    this.state = {
      ...this.state,
      xrEliminatedPodIds: [...this.state.xrEliminatedPodIds, slaveId],
    };
    this.emit();
  }

  log(entry: Omit<ActivityEntry, "id" | "createdAt">): void {
    const activity: ActivityEntry[] = [
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        createdAt: new Date().toISOString(),
        ...entry,
      },
      ...this.state.activity,
    ].slice(0, 8);

    this.state = {
      ...this.state,
      activity,
    };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

export function getPods(state: GameState): SlaveState[] {
  return Object.values(state.podsById).toSorted((left, right) =>
    left.k8s_pod_name.localeCompare(right.k8s_pod_name),
  );
}

export function getEffectiveCounts(state: GameState): { live: number; gone: number } {
  const pods = getPods(state);
  return {
    live:
      state.metrics?.live_slaves ?? pods.filter((pod) => pod.status !== "SLAVE_STATUS_GONE").length,
    gone:
      state.metrics?.gone_slaves ?? pods.filter((pod) => pod.status === "SLAVE_STATUS_GONE").length,
  };
}
