import "./style.css";

import {
  connectSessionSocket,
  fetchSessionMetrics,
  sendPodStateUpdate,
  waitForSessionSnapshot,
} from "./api.ts";
import { PodScene } from "./scene.ts";
import { GameStore, getEffectiveCounts, getPods } from "./store.ts";
import type { DeathReason, SlaveState } from "./types.ts";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("app root not found");
}

app.innerHTML = `
  <div class="shell">
    <section class="start-card" data-screen="start">
      <p class="eyebrow">Hackz Megalo</p>
      <h1>Pod たちの箱庭</h1>
      <p class="lead">
        先生は観察者です。まず新しいセッションを開始して WebSocket 接続を確立し、
        接続完了後のメイン画面から WebXR モードを開始できます。
      </p>
      <div class="start-meta">
        <span>Start で WebSocket 接続開始</span>
        <span>接続完了後にメイン画面へ移動</span>
        <span data-xr-badge>WebXR: checking</span>
      </div>
      <div class="start-actions">
        <button class="start-button" type="button" data-start-session>新しいセッションを開始</button>
      </div>
      <p class="status-line" data-start-status>待機中です。</p>
    </section>

    <section class="game-shell hidden" data-screen="game">
      <header class="topbar">
        <div>
          <p class="eyebrow">Session</p>
          <h2 data-session-id>not connected</h2>
        </div>
        <div class="status-pills">
          <span class="pill" data-connection-pill>待機中</span>
          <span class="pill" data-live-pill>Live 0</span>
          <span class="pill" data-gone-pill>Gone 0</span>
          <span class="pill" data-mode-pill>Desktop</span>
        </div>
        <div class="session-actions">
          <button type="button" class="session-button" data-enter-xr hidden>Enter WebXR</button>
          <button type="button" class="session-button danger" data-disconnect>Disconnect</button>
        </div>
      </header>

      <div class="layout">
        <section class="field-panel">
          <div class="field-header">
            <div>
              <p class="eyebrow">Pod Field</p>
              <h3>デスクトップは監視専用です。3D空間は WebXR で表示されます</h3>
            </div>
            <div class="field-help">Desktop: monitor only / WebXR: hand tracking + Rapier collider</div>
          </div>
          <div class="scene-runtime-root" data-scene-root aria-hidden="true"></div>
          <div class="pod-strip" data-pod-strip></div>
        </section>

        <aside class="side-panel">
          <section class="panel-card">
            <p class="eyebrow">Selected Pod</p>
            <div data-selected-panel class="empty-panel">Pod を選ぶと詳細が見えます。</div>
            <p class="selected-note">XR では手をパーにして POD に触れると Gone を通知します。</p>
          </section>

          <section class="panel-card">
            <p class="eyebrow">Activity</p>
            <ul class="activity-list" data-activity-list></ul>
          </section>
        </aside>
      </div>
    </section>
  </div>
`;

const store = new GameStore();

const startScreen = requiredElement<HTMLElement>("[data-screen='start']");
const gameScreen = requiredElement<HTMLElement>("[data-screen='game']");
const startButton = requiredElement<HTMLButtonElement>("[data-start-session]");
const startStatus = requiredElement<HTMLElement>("[data-start-status]");
const xrBadge = requiredElement<HTMLElement>("[data-xr-badge]");
const sessionId = requiredElement<HTMLElement>("[data-session-id]");
const connectionPill = requiredElement<HTMLElement>("[data-connection-pill]");
const livePill = requiredElement<HTMLElement>("[data-live-pill]");
const gonePill = requiredElement<HTMLElement>("[data-gone-pill]");
const modePill = requiredElement<HTMLElement>("[data-mode-pill]");
const selectedPanel = requiredElement<HTMLElement>("[data-selected-panel]");
const podStrip = requiredElement<HTMLElement>("[data-pod-strip]");
const activityList = requiredElement<HTMLUListElement>("[data-activity-list]");
const sceneRoot = requiredElement<HTMLElement>("[data-scene-root]");
const disconnectButton = requiredElement<HTMLButtonElement>("[data-disconnect]");
const enterXRButton = requiredElement<HTMLButtonElement>("[data-enter-xr]");

const scene = new PodScene(sceneRoot, {
  onSelect: (slaveId) => {
    store.setSelectedPod(slaveId);
  },
  onHover: (slaveId) => {
    store.setHoveredPod(slaveId);
  },
  onHit: (slaveId) => {
    void reportPodGone("DEATH_REASON_USER_ACTION", slaveId, "押しつぶしました。");
  },
  onDisconnect: () => {
    void disconnectSession("WebXR セッションを終了しました。");
  },
  onPodFall: (slaveId) => {
    void reportPodGone("DEATH_REASON_POD_DOWN", slaveId, "机から落下しました。");
  },
  onXRStateChange: (active) => {
    store.setXRActive(active);
  },
});

let socket: WebSocket | null = null;
let metricsRefreshTimer = 0;
let connectionAttemptId = 0;

startButton.addEventListener("click", () => {
  void startSession();
});

enterXRButton.addEventListener("click", () => {
  void enterXRMode();
});

disconnectButton.addEventListener("click", () => {
  void disconnectSession("セッションを切断しました。");
});

window.addEventListener("beforeunload", () => {
  scene.dispose();
  socket?.close();
});

void probeXRSupport();

store.subscribe((state) => {
  const pods = getPods(state);
  const selected = state.selectedPodId ? (state.podsById[state.selectedPodId] ?? null) : null;
  const counts = getEffectiveCounts(state);
  const xrAvailableText = state.xrSupported
    ? "WebXR: Quest Browser ready"
    : "WebXR: desktop fallback";

  xrBadge.textContent = xrAvailableText;
  startStatus.textContent = state.errorMessage ?? state.connectionMessage;

  startScreen.classList.toggle("hidden", state.phase === "playing");
  gameScreen.classList.toggle("hidden", state.phase !== "playing");

  sessionId.textContent = state.session?.session_id ?? "not connected";
  connectionPill.textContent = state.connectionMessage;
  livePill.textContent = `Live ${counts.live}`;
  gonePill.textContent = `Gone ${counts.gone}`;
  modePill.textContent = state.xrActive ? "WebXR" : "Monitor";

  startButton.disabled = state.phase === "connecting";
  enterXRButton.hidden = !state.xrSupported || state.xrActive || state.phase !== "playing";
  disconnectButton.textContent = state.xrActive ? "Disconnect + Exit XR" : "Disconnect";

  renderSelectedPanel(selected);
  renderPodStrip(pods, state.selectedPodId, state.hoveredPodId);
  renderActivity(state.activity);
  scene.update(pods, state.selectedPodId, state.hoveredPodId, new Set(state.xrEliminatedPodIds));
  scene.setHudData({
    sessionId: state.session?.session_id ?? "not connected",
    live: counts.live,
    gone: counts.gone,
    connection: state.connectionMessage,
    xrActive: state.xrActive,
  });
});

store.log({
  kind: "system",
  message: "先生、新しいセッションを開始すると監視画面から WebXR に入れます。",
});

async function probeXRSupport(): Promise<void> {
  const maybeXR = navigator as Navigator & {
    xr?: { isSessionSupported(mode: string): Promise<boolean> };
  };

  if (!maybeXR.xr) {
    store.setXRSupport(false);
    return;
  }

  try {
    const supported = await maybeXR.xr.isSessionSupported("immersive-ar");
    store.setXRSupport(supported);
  } catch {
    store.setXRSupport(false);
  }
}

async function startSession(): Promise<void> {
  if (store.getState().phase === "connecting") {
    return;
  }

  if (socket && socket.readyState === WebSocket.OPEN) {
    return;
  }

  const attemptId = ++connectionAttemptId;
  prepareSessionInitialization();

  startButton.disabled = true;

  try {
    const connectedSocket = await openSocket(attemptId);
    if (attemptId !== connectionAttemptId) {
      connectedSocket.close();
      return;
    }

    store.patch({
      connectionMessage: "初期スナップショット同期中...",
    });
    const snapshot = await waitForSessionSnapshot();
    if (attemptId !== connectionAttemptId) {
      return;
    }

    store.hydrateSnapshot(snapshot.session, snapshot.metrics, snapshot.states);
    store.log({
      kind: "system",
      message: `セッション ${snapshot.session.session_id.slice(0, 8)} を開始しました。`,
    });
  } catch (error) {
    if (attemptId !== connectionAttemptId) {
      return;
    }

    if (socket) {
      const closingSocket = socket;
      socket = null;
      closingSocket.close();
    }

    const message = error instanceof Error ? error.message : "セッションを開始できませんでした。";
    store.patch({
      phase: "error",
      errorMessage:
        "セッション開始に失敗しました。別のプレイヤーが使用中か、バックエンドに接続できません。",
      connectionMessage: message,
    });
  } finally {
    if (attemptId === connectionAttemptId) {
      startButton.disabled = false;
    }
  }
}

async function enterXRMode(): Promise<void> {
  if (!store.getState().xrSupported) {
    store.patch({
      errorMessage: "このブラウザでは immersive WebXR を開始できません。",
    });
    return;
  }

  try {
    await scene.enterXR();
    store.log({
      kind: "system",
      message: "WebXR モードを開始しました。左手首の HUD からいつでも切断できます。",
    });
  } catch (error) {
    store.patch({
      errorMessage: error instanceof Error ? error.message : "WebXR の開始に失敗しました。",
    });
  }
}

async function disconnectSession(message: string): Promise<void> {
  connectionAttemptId += 1;
  window.clearTimeout(metricsRefreshTimer);
  metricsRefreshTimer = 0;

  if (scene.isXRPresenting()) {
    await scene.exitXR();
  }

  scene.reset();

  if (socket) {
    const closingSocket = socket;
    socket = null;
    closingSocket.close();
  }

  store.log({
    kind: "system",
    message,
  });
  store.resetToDisconnected("待機中");
  startButton.disabled = false;
}

function openSocket(attemptId: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    let opened = false;

    const nextSocket = connectSessionSocket({
      onOpen: () => {
        if (attemptId !== connectionAttemptId) {
          nextSocket.close();
          reject(new Error("stale socket attempt"));
          return;
        }

        opened = true;
        socket = nextSocket;
        store.patch({ connectionMessage: "WebSocket 接続済み" });
        resolve(nextSocket);
      },
      onMessage: (pod) => {
        if (attemptId !== connectionAttemptId || socket !== nextSocket) {
          return;
        }
        handlePodUpdate(pod);
      },
      onClose: () => {
        if (attemptId !== connectionAttemptId) {
          return;
        }

        if (!opened) {
          reject(new Error("socket closed before session start"));
          return;
        }

        if (socket !== nextSocket) {
          return;
        }

        store.log({
          kind: "system",
          message: "セッションが終了しました。もう一度「新しいセッションを開始」で入り直せます。",
        });
        store.resetToDisconnected("セッション終了");
        socket = null;
        startButton.disabled = false;
        scene.reset();
        void scene.exitXR();
      },
      onError: () => {
        if (attemptId !== connectionAttemptId) {
          return;
        }

        if (!opened) {
          reject(new Error("socket error"));
          return;
        }

        if (socket !== nextSocket) {
          return;
        }

        store.patch({
          connectionMessage: "接続に問題があります",
        });
      },
    });
  });
}

function prepareSessionInitialization(): void {
  window.clearTimeout(metricsRefreshTimer);
  metricsRefreshTimer = 0;
  scene.reset();
  store.patch({
    phase: "connecting",
    session: null,
    metrics: null,
    podsById: {},
    selectedPodId: null,
    hoveredPodId: null,
    errorMessage: null,
    actionInFlight: false,
    xrActive: false,
    xrEliminatedPodIds: [],
    connectionMessage: "セッション初期化中...",
  });
}

function handlePodUpdate(pod: SlaveState): void {
  const previous = store.getState().podsById[pod.slave_id];
  store.upsertPod(pod);

  if (!previous || previous.status !== pod.status) {
    store.log({
      kind: "state",
      message: `${pod.k8s_pod_name} -> ${humanizeStatus(pod.status)}`,
    });
  }

  scheduleMetricsRefresh();
}

function scheduleMetricsRefresh(): void {
  if (metricsRefreshTimer !== 0) {
    window.clearTimeout(metricsRefreshTimer);
  }

  metricsRefreshTimer = window.setTimeout(async () => {
    try {
      const metrics = await fetchSessionMetrics();
      store.setMetrics(metrics);
    } catch {
      // Ignore metrics refresh failures; the field remains playable with local state.
    }
  }, 250);
}

async function reportPodGone(
  deathReason: DeathReason,
  explicitSlaveId?: string,
  messageSuffix = "Gone を通知しました。",
): Promise<void> {
  const state = store.getState();
  const targetId = explicitSlaveId ?? state.selectedPodId;
  if (!targetId || !state.session || !socket) {
    return;
  }

  const pod = state.podsById[targetId];
  if (!pod || pod.status === "SLAVE_STATUS_GONE") {
    return;
  }

  const observedAt = new Date().toISOString();
  store.setActionInFlight(true);
  store.markXrPodEliminated(targetId);
  store.upsertPod({
    ...pod,
    status: "SLAVE_STATUS_GONE",
    death_reason: deathReason,
    observed_at: observedAt,
    source: "frontend-webxr",
  });

  try {
    sendPodStateUpdate(socket, {
      session_id: state.session.session_id,
      slave_id: pod.slave_id,
      status: "SLAVE_STATUS_GONE",
      death_reason: deathReason,
    });
    store.log({
      kind: "action",
      message: `${pod.k8s_pod_name} を ${messageSuffix}`,
    });
    scheduleMetricsRefresh();
  } catch (error) {
    store.patch({
      errorMessage: error instanceof Error ? error.message : "状態更新の送信に失敗しました。",
    });
  } finally {
    store.setActionInFlight(false);
  }
}

function renderSelectedPanel(pod: SlaveState | null): void {
  if (!pod) {
    selectedPanel.className = "empty-panel";
    selectedPanel.innerHTML = "Pod を選ぶと詳細が見えます。";
    return;
  }

  selectedPanel.className = "selected-panel";
  selectedPanel.innerHTML = `
    <h4>${escapeHTML(pod.k8s_pod_name)}</h4>
    <p class="selected-meta">${escapeHTML(pod.slave_id)}</p>
    <dl class="stat-grid">
      <div><dt>Status</dt><dd>${humanizeStatus(pod.status)}</dd></div>
      <div><dt>Stress</dt><dd>${pod.stress}</dd></div>
      <div><dt>Fear</dt><dd>${pod.fear}</dd></div>
      <div><dt>Turns</dt><dd>${pod.turns_lived}</dd></div>
      <div><dt>Remaining</dt><dd>${pod.remaining_turns}</dd></div>
      <div><dt>Reason</dt><dd>${humanizeDeathReason(pod.death_reason)}</dd></div>
    </dl>
    <p class="selected-note">
      ${
        pod.status === "SLAVE_STATUS_GONE"
          ? "この Pod は Gone 状態として同期済みです。"
          : "XR では手をパーにして触れると Gone を通知できます。"
      }
    </p>
  `;
}

function renderPodStrip(
  pods: SlaveState[],
  selectedPodId: string | null,
  hoveredPodId: string | null,
): void {
  podStrip.innerHTML = "";

  for (const pod of pods) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pod-chip";
    if (pod.slave_id === selectedPodId) {
      button.classList.add("is-selected");
    }
    if (pod.slave_id === hoveredPodId) {
      button.classList.add("is-hovered");
    }
    button.innerHTML = `
      <span>${escapeHTML(pod.k8s_pod_name)}</span>
      <small>${humanizeStatus(pod.status)}</small>
    `;
    button.addEventListener("click", () => {
      store.setSelectedPod(pod.slave_id);
    });
    button.addEventListener("mouseenter", () => {
      store.setHoveredPod(pod.slave_id);
    });
    button.addEventListener("mouseleave", () => {
      store.setHoveredPod(null);
    });
    podStrip.append(button);
  }
}

function renderActivity(activity: ReturnType<GameStore["getState"]>["activity"]): void {
  activityList.innerHTML = "";

  for (const entry of activity) {
    const item = document.createElement("li");
    item.className = `activity-item is-${entry.kind}`;
    item.innerHTML = `
      <span>${escapeHTML(entry.message)}</span>
      <time>${new Date(entry.createdAt).toLocaleTimeString()}</time>
    `;
    activityList.append(item);
  }
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`missing element: ${selector}`);
  }
  return element;
}

function humanizeStatus(status: SlaveState["status"]): string {
  switch (status) {
    case "SLAVE_STATUS_LIVE":
      return "alive";
    case "SLAVE_STATUS_TERMINATING":
      return "terminating";
    case "SLAVE_STATUS_GONE":
      return "gone";
    default:
      return "unknown";
  }
}

function humanizeDeathReason(reason: SlaveState["death_reason"]): string {
  switch (reason) {
    case "DEATH_REASON_POD_DOWN":
      return "fell";
    case "DEATH_REASON_USER_ACTION":
      return "crushed";
    case "DEATH_REASON_DISEASE":
      return "disease";
    case "DEATH_REASON_LIFESPAN":
      return "lifespan";
    case "DEATH_REASON_PROCESS_DOWN":
      return "process down";
    default:
      return "unspecified";
  }
}

function escapeHTML(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
