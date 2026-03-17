import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

import type { SlaveState } from "./types.ts";

interface PodSceneCallbacks {
  onSelect: (slaveId: string) => void;
  onHover: (slaveId: string | null) => void;
  onHit: (slaveId: string) => void;
  onDisconnect: () => void;
  onPodFall: (slaveId: string) => void;
  onXRStateChange: (active: boolean) => void;
}

interface PodMeshEntry {
  group: THREE.Group;
  body: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>;
  head: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  shield: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  modelRoot: THREE.Group;
  modelMaterials: THREE.MeshStandardMaterial[];
  pieces: THREE.Object3D[];
  velocity: THREE.Vector3;
  phase: number;
  wanderAngle: number;
  wanderTimer: number;
  locallyFallen: boolean;
  falling: boolean;
  fallElapsed: number;
  goneReported: boolean;
  shattered: boolean;
  shardVelocities: THREE.Vector3[];
}

interface HudData {
  sessionId: string;
  live: number;
  gone: number;
  connection: string;
  xrActive: boolean;
}

const HAND_CONNECTIONS = [
  ["wrist", "thumb-metacarpal"],
  ["thumb-metacarpal", "thumb-phalanx-proximal"],
  ["thumb-phalanx-proximal", "thumb-phalanx-distal"],
  ["thumb-phalanx-distal", "thumb-tip"],
  ["wrist", "index-finger-metacarpal"],
  ["index-finger-metacarpal", "index-finger-phalanx-proximal"],
  ["index-finger-phalanx-proximal", "index-finger-phalanx-intermediate"],
  ["index-finger-phalanx-intermediate", "index-finger-phalanx-distal"],
  ["index-finger-phalanx-distal", "index-finger-tip"],
  ["wrist", "middle-finger-metacarpal"],
  ["middle-finger-metacarpal", "middle-finger-phalanx-proximal"],
  ["middle-finger-phalanx-proximal", "middle-finger-phalanx-intermediate"],
  ["middle-finger-phalanx-intermediate", "middle-finger-phalanx-distal"],
  ["middle-finger-phalanx-distal", "middle-finger-tip"],
  ["wrist", "ring-finger-metacarpal"],
  ["ring-finger-metacarpal", "ring-finger-phalanx-proximal"],
  ["ring-finger-phalanx-proximal", "ring-finger-phalanx-intermediate"],
  ["ring-finger-phalanx-intermediate", "ring-finger-phalanx-distal"],
  ["ring-finger-phalanx-distal", "ring-finger-tip"],
  ["wrist", "pinky-finger-metacarpal"],
  ["pinky-finger-metacarpal", "pinky-finger-phalanx-proximal"],
  ["pinky-finger-phalanx-proximal", "pinky-finger-phalanx-intermediate"],
  ["pinky-finger-phalanx-intermediate", "pinky-finger-phalanx-distal"],
  ["pinky-finger-phalanx-distal", "pinky-finger-tip"],
] as const;

function statusColor(pod: SlaveState): string {
  if (pod.status === "SLAVE_STATUS_GONE") {
    return "#31536a";
  }
  if (pod.status === "SLAVE_STATUS_TERMINATING") {
    return "#f59e0b";
  }
  if (pod.infected) {
    return "#7fd26c";
  }
  if (pod.firewall) {
    return "#a7efff";
  }
  return "#8fe6ff";
}

export class PodScene {
  private static readonly BOARD_WIDTH = 0.5;

  private static readonly BOARD_DEPTH = 0.3;

  private readonly container: HTMLElement;

  private readonly callbacks: PodSceneCallbacks;

  private readonly renderer: THREE.WebGLRenderer;

  private readonly scene: THREE.Scene;

  private readonly camera: THREE.PerspectiveCamera;

  private readonly raycaster = new THREE.Raycaster();

  private readonly pointer = new THREE.Vector2();

  private readonly meshById = new Map<string, PodMeshEntry>();

  private readonly resizeObserver: ResizeObserver;

  private readonly boardGroup = new THREE.Group();

  private readonly boardSurface: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;

  private readonly boardShadow: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;

  private readonly wristAnchor = new THREE.Group();

  private readonly wristHud = new THREE.Group();

  private readonly handSkeletons = new Map<"left" | "right", THREE.LineSegments>();

  private readonly activePalmContacts = new Set<string>();

  private readonly objLoader = new OBJLoader();

  private gopherTemplate: THREE.Group | null = null;

  private gopherLoadPromise: Promise<void> | null = null;

  private readonly hudFaceTexture: THREE.CanvasTexture;

  private readonly hudButtonTexture: THREE.CanvasTexture;

  private readonly hudButtonMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  private hudData: HudData = {
    sessionId: "not connected",
    live: 0,
    gone: 0,
    connection: "待機中",
    xrActive: false,
  };

  private lastFrameTime = performance.now();

  private pinchLatch = false;

  private lastDisconnectAt = 0;

  private static readonly UNDER_TABLE_COLLIDER_Y = -0.5;

  constructor(container: HTMLElement, callbacks: PodSceneCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(0, 4.3, 7.4);
    this.camera.lookAt(0, 0.8, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.container.clientWidth || 1, this.container.clientHeight || 1, false);
    this.renderer.domElement.className = "pod-scene-canvas";
    this.renderer.xr.enabled = true;
    this.container.append(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight("#eefcff", "#5f4b36", 1.9));

    const keyLight = new THREE.DirectionalLight("#ffffff", 1.8);
    keyLight.position.set(5, 9, 5);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight("#88ddff", 0.8);
    fillLight.position.set(-4, 4, -6);
    this.scene.add(fillLight);

    this.boardSurface = new THREE.Mesh(
      new THREE.BoxGeometry(PodScene.BOARD_WIDTH, 0.05, PodScene.BOARD_DEPTH),
      new THREE.MeshStandardMaterial({
        color: "#77513a",
        roughness: 0.88,
        metalness: 0.04,
      }),
    );
    this.boardSurface.position.y = 0;
    this.boardGroup.add(this.boardSurface);

    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(PodScene.BOARD_WIDTH + 0.03, 0.02, PodScene.BOARD_DEPTH + 0.03),
      new THREE.MeshStandardMaterial({
        color: "#4a2f23",
        roughness: 0.94,
        metalness: 0.02,
      }),
    );
    edge.position.y = -0.035;
    this.boardGroup.add(edge);

    const tableLegGeometry = new THREE.BoxGeometry(0.035, 0.42, 0.035);
    const legMaterial = new THREE.MeshStandardMaterial({
      color: "#5a3829",
      roughness: 0.95,
    });
    for (const [x, z] of [
      [-0.21, -0.11],
      [0.21, -0.11],
      [-0.21, 0.11],
      [0.21, 0.11],
    ] as const) {
      const leg = new THREE.Mesh(tableLegGeometry, legMaterial);
      leg.position.set(x, -0.22, z);
      this.boardGroup.add(leg);
    }

    this.boardShadow = new THREE.Mesh(
      new THREE.CircleGeometry(3.1, 48),
      new THREE.MeshBasicMaterial({
        color: "#0b0f12",
        transparent: true,
        opacity: 0.18,
      }),
    );
    this.boardShadow.rotation.x = -Math.PI / 2;
    this.boardShadow.position.y = -0.44;
    this.boardShadow.scale.setScalar(0.14);
    this.boardGroup.add(this.boardShadow);

    this.scene.add(this.boardGroup);
    this.scene.add(this.createHandSkeleton("left"));
    this.scene.add(this.createHandSkeleton("right"));

    const hudFaceCanvas = document.createElement("canvas");
    hudFaceCanvas.width = 512;
    hudFaceCanvas.height = 512;
    this.hudFaceTexture = new THREE.CanvasTexture(hudFaceCanvas);

    const hudButtonCanvas = document.createElement("canvas");
    hudButtonCanvas.width = 256;
    hudButtonCanvas.height = 128;
    this.hudButtonTexture = new THREE.CanvasTexture(hudButtonCanvas);

    const hudFace = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 0.16),
      new THREE.MeshBasicMaterial({
        map: this.hudFaceTexture,
        transparent: true,
      }),
    );
    hudFace.position.set(0, 0, 0);
    this.wristHud.add(hudFace);

    this.hudButtonMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.12, 0.042),
      new THREE.MeshBasicMaterial({
        map: this.hudButtonTexture,
        transparent: true,
      }),
    );
    this.hudButtonMesh.position.set(0, -0.07, 0.002);
    this.wristHud.add(this.hudButtonMesh);

    this.wristHud.rotation.x = -Math.PI / 2;
    this.wristHud.position.set(0.028, 0.02, 0.028);
    this.wristHud.scale.setScalar(0.88);
    this.wristAnchor.visible = false;
    this.wristAnchor.add(this.wristHud);
    this.scene.add(this.wristAnchor);

    this.drawHud();
    void this.loadGopherModel();

    this.renderer.domElement.addEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.addEventListener("pointerleave", this.handlePointerLeave);
    this.renderer.domElement.addEventListener("click", this.handleClick);
    this.renderer.domElement.addEventListener("dblclick", this.handleDoubleClick);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
    this.renderer.setAnimationLoop(this.renderFrame);
  }

  update(
    pods: SlaveState[],
    selectedPodId: string | null,
    hoveredPodId: string | null,
    xrEliminatedPodIds: Set<string>,
  ): void {
    const nextIds = new Set(pods.map((pod) => pod.slave_id));

    for (const [slaveId, entry] of this.meshById) {
      if (!nextIds.has(slaveId)) {
        this.disposePodEntry(entry);
        this.meshById.delete(slaveId);
      }
    }

    for (const pod of pods) {
      let entry = this.meshById.get(pod.slave_id);
      if (!entry) {
        entry = this.createPodMesh(pod.slave_id);
        this.meshById.set(pod.slave_id, entry);
        this.boardGroup.add(entry.group);
        this.spawnPod(entry);
      }

      entry.group.userData["slaveId"] = pod.slave_id;
      entry.group.userData["stress"] = pod.stress;
      entry.group.userData["fear"] = pod.fear;
      entry.group.userData["status"] = pod.status;
      entry.group.userData["infected"] = pod.infected;
      entry.group.userData["firewall"] = pod.firewall;

      entry.locallyFallen = xrEliminatedPodIds.has(pod.slave_id);
      const isGone = pod.status === "SLAVE_STATUS_GONE" || entry.locallyFallen;
      const color = statusColor(pod);

      entry.body.material.color.set(color);
      entry.head.material.color.set(color);
      entry.body.material.emissive.set(
        pod.status === "SLAVE_STATUS_TERMINATING"
          ? "#6d3a08"
          : pod.infected
            ? "#2c5b27"
            : "#1c4f61",
      );
      entry.body.material.emissiveIntensity = isGone ? 0.04 : 0.28;
      entry.head.material.emissive.copy(entry.body.material.emissive);
      entry.head.material.emissiveIntensity = entry.body.material.emissiveIntensity;
      for (const material of entry.modelMaterials) {
        material.color.set(color);
        material.emissive.copy(entry.body.material.emissive);
        material.emissiveIntensity = entry.body.material.emissiveIntensity * 0.75;
      }

      entry.shield.visible = pod.firewall && !isGone;
      entry.shield.material.opacity = pod.firewall && !isGone ? 0.88 : 0;

      const isSelected = pod.slave_id === selectedPodId;
      const isHovered = pod.slave_id === hoveredPodId;
      const focusScale = isGone ? 0.82 : isSelected ? 1.16 : isHovered ? 1.08 : 1;
      entry.group.scale.setScalar(focusScale);
    }
  }

  setHudData(data: HudData): void {
    this.hudData = data;
    this.drawHud();
  }

  async enterXR(): Promise<void> {
    const maybeXR = navigator as Navigator & {
      xr?: {
        requestSession(
          mode: string,
          init?: {
            requiredFeatures?: string[];
            optionalFeatures?: string[];
            domOverlay?: { root: Element };
          },
        ): Promise<XRSession>;
      };
    };

    if (!maybeXR.xr) {
      throw new Error("WebXR API がありません。");
    }

    if (this.renderer.xr.getSession()) {
      return;
    }

    const session = await maybeXR.xr.requestSession("immersive-ar", {
      requiredFeatures: ["local-floor"],
      optionalFeatures: ["hand-tracking", "dom-overlay", "bounded-floor", "layers"],
      domOverlay: { root: document.body },
    });

    session.addEventListener("end", this.handleXREnd);
    await this.renderer.xr.setSession(session);
    this.placeBoardForXR();
    this.callbacks.onXRStateChange(true);
    this.setHudData({
      ...this.hudData,
      xrActive: true,
    });
  }

  async exitXR(): Promise<void> {
    const session = this.renderer.xr.getSession();
    if (!session) {
      this.callbacks.onXRStateChange(false);
      this.setHudData({
        ...this.hudData,
        xrActive: false,
      });
      return;
    }

    session.removeEventListener("end", this.handleXREnd);
    await session.end();
    this.callbacks.onXRStateChange(false);
    this.setHudData({
      ...this.hudData,
      xrActive: false,
    });
  }

  isXRPresenting(): boolean {
    return this.renderer.xr.isPresenting;
  }

  reset(): void {
    for (const entry of this.meshById.values()) {
      this.disposePodEntry(entry);
    }
    this.meshById.clear();
    this.wristAnchor.visible = false;
    this.boardGroup.position.set(0, 0, 0);
    this.boardGroup.rotation.set(0, 0, 0);
    this.pinchLatch = false;
    this.lastDisconnectAt = 0;
    this.activePalmContacts.clear();
    this.setHandSkeletonVisible("left", false);
    this.setHandSkeletonVisible("right", false);
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.renderer.setAnimationLoop(null);
    this.renderer.domElement.removeEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.removeEventListener("pointerleave", this.handlePointerLeave);
    this.renderer.domElement.removeEventListener("click", this.handleClick);
    this.renderer.domElement.removeEventListener("dblclick", this.handleDoubleClick);

    for (const entry of this.meshById.values()) {
      this.disposePodEntry(entry);
    }
    this.meshById.clear();

    this.boardSurface.geometry.dispose();
    this.boardSurface.material.dispose();
    this.boardShadow.geometry.dispose();
    this.boardShadow.material.dispose();
    this.hudFaceTexture.dispose();
    this.hudButtonTexture.dispose();
    this.hudButtonMesh.geometry.dispose();
    this.hudButtonMesh.material.dispose();
    for (const skeleton of this.handSkeletons.values()) {
      skeleton.geometry.dispose();
      (skeleton.material as THREE.Material).dispose();
    }
    this.handSkeletons.clear();
    this.renderer.dispose();
  }

  private createPodMesh(slaveId: string): PodMeshEntry {
    const group = new THREE.Group();
    group.userData["slaveId"] = slaveId;

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.04, 0.09, 16),
      new THREE.MeshStandardMaterial({
        color: "#8fe6ff",
        roughness: 0.4,
        metalness: 0.05,
        emissive: "#1c4f61",
        transparent: true,
        opacity: 0.06,
      }),
    );
    body.position.y = 0.06;
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.032, 14, 10), body.material.clone());
    head.position.set(0, 0.125, 0);
    group.add(head);

    const eyeGeometry = new THREE.SphereGeometry(0.008, 8, 8);
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: "#0f1720" });
    const eyeLeft = new THREE.Mesh(eyeGeometry, eyeMaterial);
    eyeLeft.position.set(-0.012, 0.128, 0.024);
    group.add(eyeLeft);

    const eyeRight = eyeLeft.clone();
    eyeRight.position.x = 0.012;
    group.add(eyeRight);

    const footGeometry = new THREE.CylinderGeometry(0.008, 0.01, 0.02, 8);
    const footMaterial = new THREE.MeshStandardMaterial({ color: "#6dd3f8", roughness: 0.65 });
    for (const x of [-0.09, 0.09]) {
      const foot = new THREE.Mesh(footGeometry, footMaterial);
      foot.position.set(x * 0.22, 0.008, 0.006);
      group.add(foot);
    }

    const shield = new THREE.Mesh(
      new THREE.TorusGeometry(0.055, 0.006, 8, 16),
      new THREE.MeshBasicMaterial({
        color: "#d0f7ff",
        transparent: true,
        opacity: 0.88,
      }),
    );
    shield.rotation.x = Math.PI / 2;
    shield.position.y = 0.075;
    shield.visible = false;
    group.add(shield);

    const modelRoot = new THREE.Group();
    modelRoot.position.y = 0.006;
    group.add(modelRoot);

    const pieces = [...group.children];
    const entry: PodMeshEntry = {
      group,
      body,
      head,
      shield,
      modelRoot,
      modelMaterials: [],
      pieces,
      velocity: new THREE.Vector3(),
      phase: Math.random() * Math.PI * 2,
      wanderAngle: Math.random() * Math.PI * 2,
      wanderTimer: 3.0 + Math.random(),
      locallyFallen: false,
      falling: false,
      fallElapsed: 0,
      goneReported: false,
      shattered: false,
      shardVelocities: pieces.map(() => new THREE.Vector3()),
    };
    this.attachGopherModel(entry);

    return entry;
  }

  private spawnPod(entry: PodMeshEntry): void {
    const halfW = Math.max(0.06, PodScene.BOARD_WIDTH * 0.5 - 0.06);
    const halfD = Math.max(0.04, PodScene.BOARD_DEPTH * 0.5 - 0.04);
    entry.group.position.set(
      THREE.MathUtils.randFloatSpread(halfW * 2),
      0.02,
      THREE.MathUtils.randFloatSpread(halfD * 2),
    );
    entry.group.rotation.set(0, Math.random() * Math.PI * 2, 0);
    entry.velocity.set(0, 0, 0);
    entry.locallyFallen = false;
    entry.falling = false;
    entry.fallElapsed = 0;
    entry.goneReported = false;
    entry.shattered = false;
    entry.group.children.forEach((piece) => {
      piece.visible = true;
    });
    entry.shardVelocities.forEach((velocity) => velocity.set(0, 0, 0));
  }

  private disposePodEntry(entry: PodMeshEntry): void {
    this.boardGroup.remove(entry.group);
    entry.body.geometry.dispose();
    entry.body.material.dispose();
    entry.head.geometry.dispose();
    entry.head.material.dispose();
    entry.shield.geometry.dispose();
    entry.shield.material.dispose();
  }

  private drawHud(): void {
    const faceCanvas = this.hudFaceTexture.image as HTMLCanvasElement;
    const faceContext = faceCanvas.getContext("2d");
    if (faceContext) {
      faceContext.clearRect(0, 0, faceCanvas.width, faceCanvas.height);
      faceContext.fillStyle = "rgba(9, 18, 24, 0.88)";
      faceContext.beginPath();
      faceContext.roundRect(24, 24, 464, 464, 100);
      faceContext.fill();
      faceContext.strokeStyle = "rgba(166, 235, 255, 0.8)";
      faceContext.lineWidth = 14;
      faceContext.stroke();
      faceContext.fillStyle = "#dff8ff";
      faceContext.font = "bold 30px sans-serif";
      faceContext.fillText("SESSION", 58, 92);
      faceContext.font = "22px monospace";
      faceContext.fillText(this.hudData.sessionId.slice(0, 12), 58, 128);
      faceContext.font = "bold 66px sans-serif";
      faceContext.fillText(String(this.hudData.live), 58, 248);
      faceContext.font = "24px sans-serif";
      faceContext.fillText("LIVE PODS", 58, 282);
      faceContext.font = "bold 42px sans-serif";
      faceContext.fillText(`Gone ${this.hudData.gone}`, 58, 350);
      faceContext.font = "20px sans-serif";
      faceContext.fillStyle = this.hudData.xrActive ? "#8bf2b5" : "#f7d28f";
      faceContext.fillText(this.hudData.connection.slice(0, 22), 58, 410);
      this.hudFaceTexture.needsUpdate = true;
    }

    const buttonCanvas = this.hudButtonTexture.image as HTMLCanvasElement;
    const buttonContext = buttonCanvas.getContext("2d");
    if (buttonContext) {
      buttonContext.clearRect(0, 0, buttonCanvas.width, buttonCanvas.height);
      buttonContext.fillStyle = "rgba(160, 37, 37, 0.94)";
      buttonContext.beginPath();
      buttonContext.roundRect(8, 8, 240, 112, 36);
      buttonContext.fill();
      buttonContext.strokeStyle = "rgba(255, 225, 225, 0.9)";
      buttonContext.lineWidth = 6;
      buttonContext.stroke();
      buttonContext.fillStyle = "#fff5f5";
      buttonContext.font = "bold 28px sans-serif";
      buttonContext.textAlign = "center";
      buttonContext.textBaseline = "middle";
      buttonContext.fillText("Disconnect", 128, 64);
      this.hudButtonTexture.needsUpdate = true;
    }
  }

  private placeBoardForXR(): void {
    const xrCamera = this.renderer.xr.getCamera();
    const position = new THREE.Vector3();
    const direction = new THREE.Vector3();
    xrCamera.getWorldPosition(position);
    xrCamera.getWorldDirection(direction);
    direction.y = 0;
    direction.normalize();

    const boardPosition = position.clone().add(direction.multiplyScalar(0.45));
    boardPosition.y = Math.max(0.68, position.y - 0.3);
    this.boardGroup.position.copy(boardPosition);
    this.boardGroup.lookAt(position.x, boardPosition.y, position.z);
    this.boardGroup.rotateY(Math.PI);
  }

  private readonly handleXREnd = (): void => {
    this.callbacks.onXRStateChange(false);
    this.wristAnchor.visible = false;
    this.setHudData({
      ...this.hudData,
      xrActive: false,
    });
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.renderer.xr.isPresenting) {
      return;
    }

    const slaveId = this.pick(event)?.userData["slaveId"];
    this.callbacks.onHover(typeof slaveId === "string" ? slaveId : null);
    this.renderer.domElement.style.cursor = slaveId ? "pointer" : "default";
  };

  private readonly handlePointerLeave = (): void => {
    if (this.renderer.xr.isPresenting) {
      return;
    }
    this.callbacks.onHover(null);
    this.renderer.domElement.style.cursor = "default";
  };

  private readonly handleClick = (event: PointerEvent): void => {
    if (this.renderer.xr.isPresenting) {
      return;
    }
    const slaveId = this.pick(event)?.userData["slaveId"];
    if (typeof slaveId === "string") {
      this.callbacks.onSelect(slaveId);
    }
  };

  private readonly handleDoubleClick = (event: MouseEvent): void => {
    if (this.renderer.xr.isPresenting) {
      return;
    }
    const slaveId = this.pick(event)?.userData["slaveId"];
    if (typeof slaveId === "string") {
      this.callbacks.onHit(slaveId);
    }
  };

  private pick(event: { clientX: number; clientY: number }): THREE.Object3D | null {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    this.pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const intersections = this.raycaster.intersectObjects(
      Array.from(this.meshById.values(), (entry) => entry.body),
      false,
    );

    return intersections[0]?.object.parent ?? null;
  }

  private resize(): void {
    if (this.renderer.xr.isPresenting) {
      return;
    }

    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private renderFrame = (): void => {
    const now = performance.now();
    const delta = Math.min(0.05, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    this.updateSimulation(delta);

    if (this.renderer.xr.isPresenting) {
      this.updateWristHud();
    } else {
      this.wristAnchor.visible = false;
      this.boardGroup.position.set(0, 0, 0);
      this.boardGroup.rotation.set(0, 0, 0);
    }

    this.renderer.render(this.scene, this.camera);
  };

  private updateSimulation(delta: number): void {
    const halfW = PodScene.BOARD_WIDTH * 0.5;
    const halfD = PodScene.BOARD_DEPTH * 0.5;

    this.meshById.forEach((entry) => {
      const status = String(entry.group.userData["status"] ?? "");
      const stress = Number(entry.group.userData["stress"] ?? 0);
      const fear = Number(entry.group.userData["fear"] ?? 0);
      const infected = Boolean(entry.group.userData["infected"]);
      const isGone = status === "SLAVE_STATUS_GONE" || entry.locallyFallen;

      if (entry.falling || isGone) {
        entry.fallElapsed += delta;

        if (!entry.goneReported && entry.fallElapsed >= 0.3) {
          entry.goneReported = true;
          entry.locallyFallen = true;
          const slaveId = String(entry.group.userData["slaveId"] ?? "");
          if (slaveId) {
            this.callbacks.onPodFall(slaveId);
          }
          this.shatterPod(entry);
        }

        if (entry.shattered) {
          entry.shardVelocities.forEach((velocity, index) => {
            const piece = entry.pieces[index];
            velocity.y -= 1.8 * delta;
            piece.position.addScaledVector(velocity, delta);
            if (piece.position.y < PodScene.UNDER_TABLE_COLLIDER_Y - entry.group.position.y) {
              piece.position.y = PodScene.UNDER_TABLE_COLLIDER_Y - entry.group.position.y;
              velocity.y = 0;
              velocity.x *= 0.82;
              velocity.z *= 0.82;
            }
            piece.rotation.x += velocity.x * 5 * delta;
            piece.rotation.y += velocity.z * 5 * delta;
            piece.rotation.z += 2.4 * delta;
          });
        } else {
          entry.velocity.y -= 2.8 * delta;
          entry.group.position.addScaledVector(entry.velocity, delta);
          entry.group.rotation.z += 0.8 * delta;
          entry.group.rotation.x += 0.5 * delta;
          if (entry.group.position.y < PodScene.UNDER_TABLE_COLLIDER_Y) {
            entry.group.position.y = PodScene.UNDER_TABLE_COLLIDER_Y;
            entry.velocity.y = 0;
          }
        }
      } else {
        entry.wanderTimer -= delta;
        if (entry.wanderTimer <= 0) {
          entry.wanderTimer = 3.0 + Math.random() * 0.6;
          entry.wanderAngle = Math.random() * Math.PI * 2;
          const stepSpeed = 0.012 + stress * 0.00004 + fear * 0.00003;
          entry.velocity.set(
            Math.cos(entry.wanderAngle) * stepSpeed,
            0,
            Math.sin(entry.wanderAngle) * stepSpeed,
          );
        } else {
          entry.velocity.multiplyScalar(0.9);
        }

        entry.velocity.clampLength(0, 0.03);
        entry.group.position.addScaledVector(entry.velocity, delta);

        const bob = 0.003 + stress * 0.00002;
        entry.group.position.y = 0.02 + Math.sin(nowSeconds() * 3 + entry.phase) * bob;
        entry.group.rotation.y = Math.atan2(entry.velocity.x || 0.0001, entry.velocity.z || 0.0001);
        entry.group.rotation.z = Math.sin(nowSeconds() * 2 + entry.phase) * 0.012;
        entry.group.rotation.x = Math.cos(nowSeconds() * 2 + entry.phase) * 0.009;
        entry.shield.rotation.z += entry.shield.visible ? 0.03 : 0;

        if (
          Math.abs(entry.group.position.x) > halfW + 0.015 ||
          Math.abs(entry.group.position.z) > halfD + 0.015
        ) {
          entry.falling = true;
          entry.fallElapsed = 0;
          entry.velocity.set(
            entry.velocity.x * 0.6,
            -0.35 - Math.random() * 0.3,
            entry.velocity.z * 0.6,
          );
        }
      }

      if (infected && !isGone) {
        entry.body.material.emissiveIntensity += Math.sin(nowSeconds() * 6 + entry.phase) * 0.02;
        entry.head.material.emissiveIntensity = entry.body.material.emissiveIntensity;
      }
    });
  }

  private updateWristHud(): void {
    const session = this.renderer.xr.getSession();
    const frame = this.renderer.xr.getFrame();
    const referenceSpace = this.renderer.xr.getReferenceSpace();
    const getJointPose = frame?.getJointPose?.bind(frame);

    if (!session || !frame || !referenceSpace || !getJointPose) {
      this.wristAnchor.visible = false;
      this.setHandSkeletonVisible("left", false);
      this.setHandSkeletonVisible("right", false);
      return;
    }

    let leftWristTracked = false;
    let buttonTouched = false;
    let pinchDetected = false;
    let leftHandTracked = false;
    let rightHandTracked = false;
    const buttonWorld = new THREE.Vector3();
    this.hudButtonMesh.getWorldPosition(buttonWorld);

    for (const inputSource of session.inputSources) {
      if (!inputSource.hand) {
        continue;
      }

      if (inputSource.handedness === "left" || inputSource.handedness === "right") {
        if (inputSource.handedness === "left") {
          leftHandTracked = true;
        } else {
          rightHandTracked = true;
        }
        this.updateHandSkeleton(
          inputSource.handedness,
          inputSource.hand,
          referenceSpace,
          getJointPose,
        );
        this.handleOpenPalmTouch(
          inputSource.handedness,
          inputSource.hand,
          referenceSpace,
          getJointPose,
        );
      }

      const wristJoint = inputSource.hand.get("wrist");
      if (wristJoint) {
        const wristPose = getJointPose(wristJoint, referenceSpace);
        if (wristPose && inputSource.handedness === "left") {
          leftWristTracked = true;
          this.wristAnchor.visible = true;
          this.wristAnchor.matrixAutoUpdate = false;
          this.wristAnchor.matrix.fromArray(wristPose.transform.matrix);
          this.wristAnchor.matrix.decompose(
            this.wristAnchor.position,
            this.wristAnchor.quaternion,
            this.wristAnchor.scale,
          );
        }
      }

      const indexTip = inputSource.hand.get("index-finger-tip");
      const thumbTip = inputSource.hand.get("thumb-tip");
      if (!indexTip || !thumbTip) {
        continue;
      }

      const indexPose = getJointPose(indexTip, referenceSpace);
      const thumbPose = getJointPose(thumbTip, referenceSpace);
      if (!indexPose || !thumbPose) {
        continue;
      }

      const indexPosition = new THREE.Vector3().setFromMatrixPosition(
        new THREE.Matrix4().fromArray(indexPose.transform.matrix),
      );
      const thumbPosition = new THREE.Vector3().setFromMatrixPosition(
        new THREE.Matrix4().fromArray(thumbPose.transform.matrix),
      );

      const pinchDistance = indexPosition.distanceTo(thumbPosition);
      if (pinchDistance < 0.025) {
        pinchDetected = true;
      }

      if (indexPosition.distanceTo(buttonWorld) < 0.045) {
        buttonTouched = true;
      }
    }

    if (!leftWristTracked) {
      this.wristAnchor.visible = false;
    }

    if (!leftHandTracked) {
      this.setHandSkeletonVisible("left", false);
      this.clearPalmContacts("left");
    }
    if (!rightHandTracked) {
      this.setHandSkeletonVisible("right", false);
      this.clearPalmContacts("right");
    }

    const now = performance.now();
    if (buttonTouched && pinchDetected && !this.pinchLatch && now - this.lastDisconnectAt > 1200) {
      this.lastDisconnectAt = now;
      this.callbacks.onDisconnect();
    }
    this.pinchLatch = buttonTouched && pinchDetected;
  }

  private handleOpenPalmTouch(
    handedness: "left" | "right",
    hand: XRHand,
    referenceSpace: XRReferenceSpace,
    getJointPose: (joint: XRJointSpace, baseSpace: XRSpace) => XRJointPose | undefined,
  ): void {
    const wrist = hand.get("wrist");
    const indexTip = hand.get("index-finger-tip");
    const middleTip = hand.get("middle-finger-tip");
    const ringTip = hand.get("ring-finger-tip");
    const pinkyTip = hand.get("pinky-finger-tip");
    const thumbTip = hand.get("thumb-tip");
    const indexKnuckle = hand.get("index-finger-metacarpal");
    const middleKnuckle = hand.get("middle-finger-metacarpal");
    const ringKnuckle = hand.get("ring-finger-metacarpal");
    const pinkyKnuckle = hand.get("pinky-finger-metacarpal");

    if (
      !wrist ||
      !indexTip ||
      !middleTip ||
      !ringTip ||
      !pinkyTip ||
      !thumbTip ||
      !indexKnuckle ||
      !middleKnuckle ||
      !ringKnuckle ||
      !pinkyKnuckle
    ) {
      return;
    }

    const wristPose = getJointPose(wrist, referenceSpace);
    const indexTipPose = getJointPose(indexTip, referenceSpace);
    const middleTipPose = getJointPose(middleTip, referenceSpace);
    const ringTipPose = getJointPose(ringTip, referenceSpace);
    const pinkyTipPose = getJointPose(pinkyTip, referenceSpace);
    const thumbTipPose = getJointPose(thumbTip, referenceSpace);
    const indexKnucklePose = getJointPose(indexKnuckle, referenceSpace);
    const middleKnucklePose = getJointPose(middleKnuckle, referenceSpace);
    const ringKnucklePose = getJointPose(ringKnuckle, referenceSpace);
    const pinkyKnucklePose = getJointPose(pinkyKnuckle, referenceSpace);

    if (
      !wristPose ||
      !indexTipPose ||
      !middleTipPose ||
      !ringTipPose ||
      !pinkyTipPose ||
      !thumbTipPose ||
      !indexKnucklePose ||
      !middleKnucklePose ||
      !ringKnucklePose ||
      !pinkyKnucklePose
    ) {
      return;
    }

    const wristPosition = jointPosition(wristPose);
    const fingerTips = [
      jointPosition(indexTipPose),
      jointPosition(middleTipPose),
      jointPosition(ringTipPose),
      jointPosition(pinkyTipPose),
    ];
    const thumbPosition = jointPosition(thumbTipPose);
    const knuckles = [
      jointPosition(indexKnucklePose),
      jointPosition(middleKnucklePose),
      jointPosition(ringKnucklePose),
      jointPosition(pinkyKnucklePose),
    ];

    const fingersExtended = fingerTips.every((tip) => tip.distanceTo(wristPosition) > 0.09);
    const thumbExtended = thumbPosition.distanceTo(wristPosition) > 0.07;
    if (!fingersExtended || !thumbExtended) {
      this.clearPalmContacts(handedness);
      return;
    }

    const palmCenter = new THREE.Vector3();
    for (const knuckle of knuckles) {
      palmCenter.add(knuckle);
    }
    palmCenter.multiplyScalar(1 / knuckles.length);
    palmCenter.add(wristPosition).multiplyScalar(0.5);

    const touchedContacts = new Set<string>();
    for (const entry of this.meshById.values()) {
      const slaveId = String(entry.group.userData["slaveId"] ?? "");
      const status = String(entry.group.userData["status"] ?? "");
      if (!slaveId || status === "SLAVE_STATUS_GONE" || entry.falling || entry.shattered) {
        continue;
      }

      const podPosition = new THREE.Vector3();
      entry.group.getWorldPosition(podPosition);
      if (palmCenter.distanceTo(podPosition) > 0.07) {
        continue;
      }

      const contactKey = `${handedness}:${slaveId}`;
      touchedContacts.add(contactKey);
      if (!this.activePalmContacts.has(contactKey)) {
        this.activePalmContacts.add(contactKey);
        this.callbacks.onHit(slaveId);
      }
    }

    this.clearPalmContacts(handedness, touchedContacts);
  }

  private createHandSkeleton(handedness: "left" | "right"): THREE.LineSegments {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(HAND_CONNECTIONS.length * 2 * 3), 3),
    );
    const material = new THREE.LineBasicMaterial({
      color: handedness === "left" ? "#7dd3fc" : "#a7f3d0",
      transparent: true,
      opacity: 0.9,
    });
    const skeleton = new THREE.LineSegments(geometry, material);
    skeleton.visible = false;
    this.handSkeletons.set(handedness, skeleton);
    return skeleton;
  }

  private setHandSkeletonVisible(handedness: "left" | "right", visible: boolean): void {
    const skeleton = this.handSkeletons.get(handedness);
    if (skeleton) {
      skeleton.visible = visible;
    }
  }

  private updateHandSkeleton(
    handedness: "left" | "right",
    hand: XRHand,
    referenceSpace: XRReferenceSpace,
    getJointPose: (joint: XRJointSpace, baseSpace: XRSpace) => XRJointPose | undefined,
  ): void {
    const skeleton = this.handSkeletons.get(handedness);
    if (!skeleton) {
      return;
    }

    const positionAttribute = skeleton.geometry.getAttribute("position") as THREE.BufferAttribute;
    let offset = 0;
    let visible = false;

    for (const [fromName, toName] of HAND_CONNECTIONS) {
      const fromJoint = hand.get(fromName);
      const toJoint = hand.get(toName);
      const fromPose = fromJoint ? getJointPose(fromJoint, referenceSpace) : undefined;
      const toPose = toJoint ? getJointPose(toJoint, referenceSpace) : undefined;

      if (fromPose && toPose) {
        const fromPosition = new THREE.Vector3().setFromMatrixPosition(
          new THREE.Matrix4().fromArray(fromPose.transform.matrix),
        );
        const toPosition = new THREE.Vector3().setFromMatrixPosition(
          new THREE.Matrix4().fromArray(toPose.transform.matrix),
        );
        positionAttribute.setXYZ(offset, fromPosition.x, fromPosition.y, fromPosition.z);
        positionAttribute.setXYZ(offset + 1, toPosition.x, toPosition.y, toPosition.z);
        visible = true;
      } else {
        positionAttribute.setXYZ(offset, 0, 0, 0);
        positionAttribute.setXYZ(offset + 1, 0, 0, 0);
      }

      offset += 2;
    }

    positionAttribute.needsUpdate = true;
    skeleton.visible = visible;
  }

  private clearPalmContacts(handedness: "left" | "right", keep = new Set<string>()): void {
    for (const contactKey of Array.from(this.activePalmContacts)) {
      if (!contactKey.startsWith(`${handedness}:`)) {
        continue;
      }
      if (!keep.has(contactKey)) {
        this.activePalmContacts.delete(contactKey);
      }
    }
  }

  private shatterPod(entry: PodMeshEntry): void {
    if (entry.shattered) {
      return;
    }

    entry.shattered = true;
    entry.shardVelocities.forEach((velocity) => {
      velocity.set(
        THREE.MathUtils.randFloatSpread(0.08),
        0.06 + Math.random() * 0.06,
        THREE.MathUtils.randFloatSpread(0.08),
      );
    });
  }

  private attachGopherModel(entry: PodMeshEntry): void {
    if (!this.gopherTemplate || entry.modelRoot.children.length > 0) {
      return;
    }

    const clone = this.gopherTemplate.clone(true);
    const materials: THREE.MeshStandardMaterial[] = [];
    clone.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) {
        return;
      }
      node.castShadow = false;
      node.receiveShadow = false;
      const source = Array.isArray(node.material) ? node.material[0] : node.material;
      if (!(source instanceof THREE.MeshStandardMaterial)) {
        return;
      }
      const material = source.clone();
      node.material = material;
      materials.push(material);
    });

    entry.modelRoot.add(clone);
    entry.modelMaterials = materials;
  }

  private async loadGopherModel(): Promise<void> {
    if (this.gopherLoadPromise) {
      return this.gopherLoadPromise;
    }

    this.gopherLoadPromise = new Promise((resolve) => {
      this.objLoader.load(
        "https://raw.githubusercontent.com/golang-samples/gopher-3d/refs/heads/master/gopher.obj",
        (object) => {
          const template = new THREE.Group();
          template.add(object);

          const box = new THREE.Box3().setFromObject(template);
          const size = new THREE.Vector3();
          box.getSize(size);
          const targetHeight = 0.13;
          const scale = targetHeight / Math.max(size.y, 0.0001);
          template.scale.setScalar(scale);

          const normalizedBox = new THREE.Box3().setFromObject(template);
          const center = new THREE.Vector3();
          normalizedBox.getCenter(center);
          template.position.x -= center.x;
          template.position.z -= center.z;
          template.position.y -= normalizedBox.min.y;
          template.rotation.y = Math.PI;

          template.traverse((node) => {
            if (!(node instanceof THREE.Mesh)) {
              return;
            }
            const source = Array.isArray(node.material) ? node.material[0] : node.material;
            const material =
              source instanceof THREE.MeshStandardMaterial
                ? source
                : new THREE.MeshStandardMaterial({
                    color: "#8fe6ff",
                    roughness: 0.55,
                    metalness: 0.02,
                  });
            node.material = material;
          });

          this.gopherTemplate = template;
          for (const entry of this.meshById.values()) {
            this.attachGopherModel(entry);
          }
          resolve();
        },
        undefined,
        () => {
          // Keep primitive fallback if loading fails.
          resolve();
        },
      );
    });

    return this.gopherLoadPromise;
  }
}

function nowSeconds(): number {
  return performance.now() * 0.001;
}

function jointPosition(pose: XRJointPose): THREE.Vector3 {
  return new THREE.Vector3().setFromMatrixPosition(
    new THREE.Matrix4().fromArray(pose.transform.matrix),
  );
}
