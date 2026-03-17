import "./style.css";

import {
  connectSessionSocket,
  fetchSessionMetrics,
  sendPodAction,
  waitForSessionSnapshot,
} from "./api.ts";
import { PodScene } from "./scene.ts";
import { GameStore, getPods } from "./store.ts";
import type { PodAction, SlaveState } from "./types.ts";

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
        先生は観察者であり、ちょっとだけ加害者です。セッションを開始すると、Pod の群れが現れて、
        叩く・驚かす・感染させる・防御を切り替える操作ができます。
      </p>
      <div class="start-meta">
        <span>ダブルクリックで叩く</span>
        <span>選択して右パネルから細かく操作</span>
        <span data-xr-badge>WebXR: checking</span>
      </div>
      <button class="start-button" type="button" data-start-session>Start Session</button>
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
        </div>
      </header>

      <div class="layout">
        <section class="field-panel">
          <div class="field-header">
            <div>
              <p class="eyebrow">Pod Field</p>
              <h3>群れを観察して、狙いを定めてください</h3>
            </div>
            <div class="field-help">Single click: select / Double click: hit</div>
          </div>
          <div class="scene-root" data-scene-root></div>
          <div class="pod-strip" data-pod-strip></div>
        </section>

        <aside class="side-panel">
          <section class="panel-card">
            <p class="eyebrow">Selected Pod</p>
            <div data-selected-panel class="empty-panel">Pod を選ぶと詳細が見えます。</div>
            <div class="action-grid">
              <button type="button" data-action="hit">叩く</button>
              <button type="button" data-action="scare">驚かす</button>
              <button type="button" data-action="infect">感染</button>
              <button type="button" data-action="firewall">防御切替</button>
              <button type="button" data-action="calm">落ち着かせる</button>
            </div>
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
const selectedPanel = requiredElement<HTMLElement>("[data-selected-panel]");
const podStrip = requiredElement<HTMLElement>("[data-pod-strip]");
const activityList = requiredElement<HTMLUListElement>("[data-activity-list]");
const sceneRoot = requiredElement<HTMLElement>("[data-scene-root]");
const actionButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-action]"));

const scene = new PodScene(sceneRoot, {
  onSelect: (slaveId) => {
    store.setSelectedPod(slaveId);
  },
  onHover: (slaveId) => {
    store.setHoveredPod(slaveId);
  },
  onHit: (slaveId) => {
    void triggerAction("hit", slaveId);
  },
});

let socket: WebSocket | null = null;
let metricsRefreshTimer = 0;

startButton.addEventListener("click", () => {
  void startSession();
});

actionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.action as PodAction | undefined;
    if (!action) {
      return;
    }
    void triggerAction(action);
  });
});

window.addEventListener("beforeunload", () => {
  scene.dispose();
  socket?.close();
});

store.subscribe((state) => {
  const pods = getPods(state);
  const selected = state.selectedPodId ? (state.podsById[state.selectedPodId] ?? null) : null;

  xrBadge.textContent = state.xrSupported ? "WebXR: capable browser" : "WebXR: desktop fallback";
  startStatus.textContent = state.errorMessage ?? state.connectionMessage;

  startScreen.classList.toggle("hidden", state.phase === "playing");
  gameScreen.classList.toggle("hidden", state.phase !== "playing");

  sessionId.textContent = state.session?.session_id ?? "not connected";
  connectionPill.textContent = state.connectionMessage;
  livePill.textContent = `Live ${state.metrics?.live_slaves ?? pods.filter((pod) => pod.status !== "SLAVE_STATUS_GONE").length}`;
  gonePill.textContent = `Gone ${state.metrics?.gone_slaves ?? pods.filter((pod) => pod.status === "SLAVE_STATUS_GONE").length}`;

  renderSelectedPanel(selected);
  renderPodStrip(pods, state.selectedPodId, state.hoveredPodId);
  renderActivity(state.activity);
  scene.update(pods, state.selectedPodId, state.hoveredPodId);

  actionButtons.forEach((button) => {
    button.disabled = !selected || state.actionInFlight || state.phase !== "playing";
  });
});

store.log({
  kind: "system",
  message: "先生、Start Session を押すと Pod たちの観察を始められます。",
});

async function startSession(): Promise<void> {
  if (socket && socket.readyState === WebSocket.OPEN) {
    return;
  }

  store.patch({
    phase: "connecting",
    errorMessage: null,
    connectionMessage: "セッションへ接続中...",
  });

  startButton.disabled = true;

  try {
    socket = await openSocket();
    const snapshot = await waitForSessionSnapshot();
    store.hydrateSnapshot(snapshot.session, snapshot.metrics, snapshot.states);
    store.log({
      kind: "system",
      message: `セッション ${snapshot.session.session_id.slice(0, 8)} を開始しました。`,
    });
  } catch (error) {
    socket?.close();
    socket = null;
    const message = error instanceof Error ? error.message : "セッションを開始できませんでした。";
    store.patch({
      phase: "error",
      errorMessage:
        "セッション開始に失敗しました。別のプレイヤーが使用中か、バックエンドに接続できません。",
      connectionMessage: message,
    });
  } finally {
    startButton.disabled = false;
  }
}

function openSocket(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    let opened = false;

    const nextSocket = connectSessionSocket({
      onOpen: () => {
        opened = true;
        store.patch({ connectionMessage: "WebSocket 接続済み" });
        resolve(nextSocket);
      },
      onMessage: (pod) => {
        handlePodUpdate(pod);
      },
      onClose: () => {
        if (!opened) {
          reject(new Error("socket closed before session start"));
          return;
        }

        store.log({
          kind: "system",
          message: "セッションが終了しました。もう一度 Start Session で入り直せます。",
        });
        store.resetToDisconnected("セッション終了");
        socket = null;
        startButton.disabled = false;
      },
      onError: () => {
        if (!opened) {
          reject(new Error("socket error"));
          return;
        }

        store.patch({
          connectionMessage: "接続に問題があります",
        });
      },
    });
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

async function triggerAction(action: PodAction, explicitSlaveId?: string): Promise<void> {
  const state = store.getState();
  const targetId = explicitSlaveId ?? state.selectedPodId;
  if (!targetId) {
    return;
  }

  const pod = state.podsById[targetId];
  if (!pod) {
    return;
  }

  store.setActionInFlight(true);

  try {
    await sendPodAction(action, pod.slave_id);
    store.log({
      kind: "action",
      message: `${pod.k8s_pod_name} に ${humanizeAction(action)} を実行しました。`,
    });
  } catch (error) {
    store.patch({
      errorMessage: error instanceof Error ? error.message : "イベント送信に失敗しました。",
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
      <div><dt>Flags</dt><dd>${
        [pod.infected ? "infected" : null, pod.firewall ? "firewall" : null]
          .filter(Boolean)
          .join(" / ") || "none"
      }</dd></div>
    </dl>
    <p class="selected-note">
      ${
        pod.status === "SLAVE_STATUS_GONE"
          ? "この Pod はもう倒れています。"
          : "ダブルクリックですぐ叩けます。"
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

function humanizeAction(action: PodAction): string {
  switch (action) {
    case "hit":
      return "叩く";
    case "scare":
      return "驚かす";
    case "infect":
      return "感染";
    case "firewall":
      return "防御切替";
    case "calm":
      return "落ち着かせる";
  }
}

function escapeHTML(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
