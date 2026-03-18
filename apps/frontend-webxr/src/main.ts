import "./style.css";

import {
  closeSessionSocket,
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
    <section class="start-screen" data-screen="start">
      <div class="start-frame">
        <div class="start-copy">
          <p class="eyebrow">Go | Kubernetes</p>
          <h2>コンテナをオーケストレーションする</h2>
        </div>
        <div class="start-panel">
          <div class="start-meta">
            <span class="pill accent" data-xr-badge>WebXR: checking</span>
            <p class="status-line" data-start-status>セッション開始待機中</p>
          </div>
          <div class="start-actions">
            <button class="start-button" type="button" data-start-session>Start Session</button>
          </div>
        </div>
      </div>
    </section>

    <section class="game-shell hidden" data-screen="game">
      <header class="topbar">
        <div class="topbar-brand">
          <p class="eyebrow">Hackz Megalo</p>
          <h2>Pod Console</h2>
        </div>
        <div class="session-block">
          <span class="session-label">session</span>
          <strong data-session-id>not connected</strong>
        </div>
        <div class="status-pills">
          <span class="pill" data-connection-pill>セッション開始待機中</span>
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
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Pods</p>
              <h3 data-pod-count>0 live / 0 gone</h3>
            </div>
          </div>
          <div class="scene-runtime-root" data-scene-root aria-hidden="true"></div>
          <div class="pod-table-head" aria-hidden="true">
            <span>Pod</span>
            <span>Status</span>
            <span>Stress</span>
            <span>Fear</span>
            <span>Turns</span>
          </div>
          <div class="pod-strip" data-pod-strip></div>
        </section>

        <aside class="side-panel">
          <section class="panel-card">
            <p class="eyebrow">Selected</p>
            <div data-selected-panel class="empty-panel">No pod selected</div>
          </section>

          <section class="panel-card">
            <p class="eyebrow">Events</p>
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
const podCount = requiredElement<HTMLElement>("[data-pod-count]");
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
    void reportPodGone("DEATH_REASON_USER_ACTION", slaveId, "marked gone");
  },
  onDisconnect: () => {
    void disconnectSession("WebXR disconnected.");
  },
  onPodFall: (slaveId) => {
    void reportPodGone("DEATH_REASON_POD_DOWN", slaveId, "fell from board");
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
  void disconnectSession("Session disconnected.");
});

window.addEventListener("beforeunload", () => {
  scene.dispose();
  if (socket) {
    closeSessionSocket(socket);
  }
});

void probeXRSupport();

store.subscribe((state) => {
  const pods = getPods(state);
  const selected = state.selectedPodId ? (state.podsById[state.selectedPodId] ?? null) : null;
  const counts = getEffectiveCounts(state);
  const xrAvailableText = state.xrSupported ? "WebXR ready" : "Desktop only";

  xrBadge.textContent = xrAvailableText;
  startStatus.textContent = state.errorMessage ?? state.connectionMessage;

  startScreen.classList.toggle("hidden", state.phase === "playing");
  gameScreen.classList.toggle("hidden", state.phase !== "playing");

  sessionId.textContent = state.session?.session_id ?? "not connected";
  connectionPill.textContent = state.connectionMessage;
  livePill.textContent = `Live ${counts.live}`;
  gonePill.textContent = `Gone ${counts.gone}`;
  modePill.textContent = state.xrActive ? "WebXR" : "Monitor";
  podCount.textContent = `${counts.live} live / ${counts.gone} gone`;

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
      connectionMessage: "Initial sync...",
    });
    const snapshot = await waitForSessionSnapshot();
    if (attemptId !== connectionAttemptId) {
      return;
    }

    store.hydrateSnapshot(snapshot.session, snapshot.metrics, snapshot.states);
    store.log({
      kind: "system",
      message: `session ${snapshot.session.session_id.slice(0, 8)} started`,
    });
  } catch (error) {
    if (attemptId !== connectionAttemptId) {
      return;
    }

    if (socket) {
      const closingSocket = socket;
      socket = null;
      closeSessionSocket(closingSocket);
    }

    const message = error instanceof Error ? error.message : "セッションを開始できませんでした。";
    store.patch({
      phase: "error",
      errorMessage: "セッション開始に失敗しました。",
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
      message: "webxr active",
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
    closeSessionSocket(closingSocket, true);
  }

  store.log({
    kind: "system",
    message,
  });
  store.resetToDisconnected("セッション開始待機中");
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
        store.patch({ connectionMessage: "Connected" });
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
          message: "session closed",
        });
        store.resetToDisconnected("Session ended");
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
          connectionMessage: "Connection issue",
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
    connectionMessage: "Starting session...",
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
  messageSuffix = "marked gone",
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
      message: `${pod.k8s_pod_name} ${messageSuffix}`,
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
    selectedPanel.innerHTML = "No pod selected";
    return;
  }

  selectedPanel.className = "selected-panel";
  selectedPanel.innerHTML = `
    <div class="selected-header">
      ${renderPodAvatarMarkup(pod)}
      <div>
        <h4>${escapeHTML(pod.k8s_pod_name)}</h4>
        <p class="selected-meta">${escapeHTML(pod.slave_id)}</p>
      </div>
    </div>
    <div class="selected-tags">
      <span class="mini-pill ${statusToneClass(pod)}">${humanizeStatus(pod.status)}</span>
      ${pod.firewall ? '<span class="mini-pill tone-accent">firewall</span>' : ""}
      ${pod.infected ? '<span class="mini-pill tone-muted">infected</span>' : ""}
    </div>
    <dl class="stat-grid">
      <div><dt>Stress</dt><dd>${pod.stress}</dd></div>
      <div><dt>Fear</dt><dd>${pod.fear}</dd></div>
      <div><dt>Turns</dt><dd>${pod.turns_lived}</dd></div>
      <div><dt>Remain</dt><dd>${pod.remaining_turns}</dd></div>
      <div><dt>Reason</dt><dd>${humanizeDeathReason(pod.death_reason)}</dd></div>
      <div><dt>Source</dt><dd>${escapeHTML(pod.source)}</dd></div>
    </dl>
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
    if (pod.status === "SLAVE_STATUS_GONE") {
      button.classList.add("is-gone");
    }
    button.innerHTML = `
      <span class="pod-cell pod-cell-main">
        ${renderPodAvatarMarkup(pod)}
        <span class="pod-ident">
          <strong>${escapeHTML(pod.k8s_pod_name)}</strong>
          <small>${escapeHTML(shortId(pod.slave_id, 12))}</small>
        </span>
      </span>
      <span class="pod-cell" data-label="Status">
        <span class="status-badge ${statusToneClass(pod)}">${humanizeStatus(pod.status)}</span>
      </span>
      <span class="pod-cell" data-label="Stress"><strong>${pod.stress}</strong></span>
      <span class="pod-cell" data-label="Fear"><strong>${pod.fear}</strong></span>
      <span class="pod-cell" data-label="Turns"><strong>${pod.turns_lived}</strong></span>
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

  if (activity.length === 0) {
    const item = document.createElement("li");
    item.className = "activity-empty";
    item.textContent = "No events";
    activityList.append(item);
    return;
  }

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

function renderPodAvatarMarkup(pod: SlaveState): string {
  const classes = [
    "pod-avatar",
    pod.status === "SLAVE_STATUS_GONE" ? "is-gone" : "",
    pod.firewall ? "has-firewall" : "",
    pod.infected ? "is-infected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <span class="${classes}" aria-hidden="true">
      <span class="pod-ear left"></span>
      <span class="pod-ear right"></span>
      <span class="pod-eye left"><span class="pod-pupil"></span></span>
      <span class="pod-eye right"><span class="pod-pupil"></span></span>
      <span class="pod-nose"></span>
      <span class="pod-tooth left"></span>
      <span class="pod-tooth right"></span>
    </span>
  `;
}

function statusToneClass(pod: SlaveState): string {
  if (pod.status === "SLAVE_STATUS_GONE") {
    return "tone-gone";
  }
  if (pod.status === "SLAVE_STATUS_TERMINATING") {
    return "tone-warn";
  }
  if (pod.infected) {
    return "tone-muted";
  }
  if (pod.firewall) {
    return "tone-accent";
  }
  return "tone-live";
}

function shortId(value: string, length = 8): string {
  return value.length <= length ? value : value.slice(0, length);
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
      return "live";
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
      return "hand";
    case "DEATH_REASON_DISEASE":
      return "disease";
    case "DEATH_REASON_LIFESPAN":
      return "lifespan";
    case "DEATH_REASON_PROCESS_DOWN":
      return "process";
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
