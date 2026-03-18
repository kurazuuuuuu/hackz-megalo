import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { XRHandModelFactory } from "three/examples/jsm/webxr/XRHandModelFactory.js";

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
  visualRoot: THREE.Group;
  bodyMaterial: THREE.MeshStandardMaterial;
  shield: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  pointOutline: THREE.Group;
  phase: number;
  baseMinY: number;
}

type ColliderDebugMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

interface PodPhysicsEntry {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  nextImpulseAt: number;
  fallReported: boolean;
  debugMesh: ColliderDebugMesh | null;
  crushProgress: number;
  crushReported: boolean;
}

interface HandPhysicsState {
  palmBody: RAPIER.RigidBody;
  palmCollider: RAPIER.Collider;
  thumbBody: RAPIER.RigidBody;
  thumbCollider: RAPIER.Collider;
  indexBody: RAPIER.RigidBody;
  indexCollider: RAPIER.Collider;
  middleBody: RAPIER.RigidBody;
  middleCollider: RAPIER.Collider;
  palmDebugMesh: ColliderDebugMesh | null;
  thumbDebugMesh: ColliderDebugMesh | null;
  indexDebugMesh: ColliderDebugMesh | null;
  middleDebugMesh: ColliderDebugMesh | null;
  openPalm: boolean;
  pointingActive: boolean;
  pinchActive: boolean;
  pinchMidpointLocal: THREE.Vector3 | null;
  pinchMidpointWorld: THREE.Vector3 | null;
  pinchCandidateId: string | null;
  fingertipTargetId: string | null;
  grabbedPodId: string | null;
  indexTipLocal: THREE.Vector3 | null;
  lastGrabPointLocal: THREE.Vector3 | null;
  lastGrabAt: number;
}

interface HudData {
  sessionId: string;
  live: number;
  gone: number;
  connection: string;
  xrActive: boolean;
}

type HandGesture = "TRACK LOST" | "IDLE" | "OPEN" | "POINT" | "PINCH" | "GRAB";

interface HudDebugData {
  leftTracked: boolean;
  rightTracked: boolean;
  leftGesture: HandGesture;
  rightGesture: HandGesture;
  pinchTargetId: string | null;
  grabTargetId: string | null;
  fingertipHand: "left" | "right" | null;
  fingertipTargetId: string | null;
  tableHeightCm: number;
  tableAdjustingHand: "left" | "right" | null;
}

interface HandJointTracking {
  wristPose: XRJointPose | null;
  thumbWorld: THREE.Vector3 | null;
  indexWorld: THREE.Vector3 | null;
}

const HAND_PROFILE_ASSET_PATH = `${import.meta.env.BASE_URL}assets/webxr-hands/generic-hand/`;
const POD_VISUAL_RADIUS = 0.034;
const POD_VISUAL_STRETCH_Y = 1.45;
const POD_COLLIDER_RADIUS = POD_VISUAL_RADIUS * POD_VISUAL_STRETCH_Y;
const PINCH_THRESHOLD = 0.025;
const HAND_PARK_Y = -9;
const PALM_COLLIDER_RADIUS = 0.046;
const FINGER_COLLIDER_RADIUS = 0.018;
const DEBUG_MODE = false;
const COLLIDER_DEBUG_ENABLED = DEBUG_MODE;
const POD_MASS = 1;
const POD_MAX_HORIZONTAL_SPEED = 0.06;
const POD_IMPULSE_BASE = 0.0008;
const POD_IMPULSE_VARIANCE = 0.0006;
const POD_IMPULSE_STRESS_FACTOR = 0.00001;
const POD_IMPULSE_FEAR_FACTOR = 0.00001;
const POD_IMPULSE_MAX = 0.0032;
const POD_IMPULSE_INTERVAL_BASE_MS = 1200;
const POD_IMPULSE_INTERVAL_JITTER_MS = 1800;
const POD_CRUSH_DURATION = 0.22;
const POD_CRUSH_TARGET_Y_SCALE = 0.22;
const POD_CRUSH_TARGET_XZ_SCALE = 1.62;
const RENDER_SCALE = 0.8;
const HUD_FACE_WIDTH = 0.222;
const HUD_FACE_HEIGHT = 0.144;
const HUD_TABLE_SLIDER_CENTER_X = 0.043;
const HUD_TABLE_SLIDER_CENTER_Y = -0.05;
const HUD_TABLE_SLIDER_WIDTH = 0.07;
const HUD_TABLE_SLIDER_HEIGHT = 0.026;
const HUD_TABLE_SLIDER_DEPTH_TOLERANCE = 0.05;
const HUD_TABLE_SLIDER_DRAG_MARGIN = 0.018;
const XR_FOVEATION_LEVEL = 0;

function statusColor(pod: SlaveState): string {
  if (pod.status === "SLAVE_STATUS_GONE") {
    return "#aab5c0";
  }
  if (pod.status === "SLAVE_STATUS_TERMINATING") {
    return "#95a3af";
  }
  if (pod.infected) {
    return "#7897a5";
  }
  if (pod.firewall) {
    return "#35c5e8";
  }
  return "#00add8";
}

export class PodScene {
  private static readonly BOARD_WIDTH = 0.5;

  private static readonly BOARD_DEPTH = 0.3;

  private static readonly BOARD_TOP_Y = 0.025;

  private static readonly DEFAULT_BOARD_SURFACE_HEIGHT = 0.3;

  private static readonly MIN_BOARD_SURFACE_HEIGHT = 0.22;

  private static readonly MAX_BOARD_SURFACE_HEIGHT = 0.42;

  private static readonly BOARD_FORWARD_DISTANCE = 0.45;

  private static readonly BOARD_COLLIDER_HALF_HEIGHT = 0.01;

  private static readonly POD_SPAWN_CLEARANCE = 0.012;

  private static readonly UNDER_TABLE_COLLIDER_Y = -0.5;

  private static rapierInitPromise: Promise<void> | null = null;

  private readonly container: HTMLElement;

  private readonly callbacks: PodSceneCallbacks;

  private readonly renderer: THREE.WebGLRenderer;

  private readonly scene: THREE.Scene;

  private readonly camera: THREE.PerspectiveCamera;

  private readonly meshById = new Map<string, PodMeshEntry>();

  private readonly podPhysicsById = new Map<string, PodPhysicsEntry>();

  private readonly podIdByColliderHandle = new Map<number, string>();

  private readonly podGrabOwnerById = new Map<string, "left" | "right">();

  private readonly handPhysics = new Map<"left" | "right", HandPhysicsState>();

  private readonly resizeObserver: ResizeObserver;

  private readonly boardGroup = new THREE.Group();

  private readonly colliderDebugGroup = new THREE.Group();

  private readonly boardSurface: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;

  private readonly boardShadow: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;

  private readonly wristAnchor = new THREE.Group();

  private readonly wristHud = new THREE.Group();

  private readonly handModelFactory = new XRHandModelFactory();

  private readonly activePalmContacts = new Set<string>();

  private readonly hudFaceTexture: THREE.CanvasTexture;

  private readonly hudButtonTexture: THREE.CanvasTexture;

  private readonly hudButtonMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  private readonly tmpMatrix = new THREE.Matrix4();

  private physicsWorld: RAPIER.World | null = null;

  private boardColliderDebugMesh: ColliderDebugMesh | null = null;

  private boardSurfaceHeight = PodScene.DEFAULT_BOARD_SURFACE_HEIGHT;

  private hudSliderActiveHand: "left" | "right" | null = null;

  private hudData: HudData = {
    sessionId: "not connected",
    live: 0,
    gone: 0,
    connection: "セッション開始待機中",
    xrActive: false,
  };

  private hudDebugData: HudDebugData = {
    leftTracked: false,
    rightTracked: false,
    leftGesture: "TRACK LOST",
    rightGesture: "TRACK LOST",
    pinchTargetId: null,
    grabTargetId: null,
    fingertipHand: null,
    fingertipTargetId: null,
    tableHeightCm: Math.round(PodScene.DEFAULT_BOARD_SURFACE_HEIGHT * 100),
    tableAdjustingHand: null,
  };

  private lastHudSignature = "";

  private lastFrameTime = performance.now();

  private pinchLatch = false;

  private lastDisconnectAt = 0;

  constructor(container: HTMLElement, callbacks: PodSceneCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(0, 4.3, 7.4);
    this.camera.lookAt(0, 0.8, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType("local-floor");
    this.applyRenderScale();
    this.renderer.setSize(this.container.clientWidth || 1, this.container.clientHeight || 1, false);
    this.renderer.domElement.className = "pod-scene-canvas";
    this.container.append(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight("#f9fcff", "#d8e1e8", 2.1));

    const keyLight = new THREE.DirectionalLight("#ffffff", 1.8);
    keyLight.position.set(5, 9, 5);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight("#73d6f1", 1);
    fillLight.position.set(-4, 4, -6);
    this.scene.add(fillLight);

    this.boardSurface = new THREE.Mesh(
      new THREE.BoxGeometry(PodScene.BOARD_WIDTH, 0.05, PodScene.BOARD_DEPTH),
      new THREE.MeshStandardMaterial({
        color: "#eef3f6",
        roughness: 0.94,
        metalness: 0.01,
      }),
    );
    this.boardSurface.position.y = 0;
    this.boardGroup.add(this.boardSurface);

    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(PodScene.BOARD_WIDTH + 0.03, 0.02, PodScene.BOARD_DEPTH + 0.03),
      new THREE.MeshStandardMaterial({
        color: "#cfd9e2",
        roughness: 0.94,
        metalness: 0.02,
      }),
    );
    edge.position.y = -0.035;
    this.boardGroup.add(edge);

    const tableLegGeometry = new THREE.BoxGeometry(0.035, 0.42, 0.035);
    const legMaterial = new THREE.MeshStandardMaterial({
      color: "#d7e0e8",
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
        color: "#53606b",
        transparent: true,
        opacity: 0.12,
      }),
    );
    this.boardShadow.rotation.x = -Math.PI / 2;
    this.boardShadow.position.y = -0.44;
    this.boardShadow.scale.setScalar(0.14);
    this.boardGroup.add(this.boardShadow);
    this.colliderDebugGroup.visible = COLLIDER_DEBUG_ENABLED;
    this.boardGroup.add(this.colliderDebugGroup);

    this.scene.add(this.boardGroup);
    this.setupXRHands();

    const hudFaceCanvas = document.createElement("canvas");
    hudFaceCanvas.width = 640;
    hudFaceCanvas.height = 416;
    this.hudFaceTexture = new THREE.CanvasTexture(hudFaceCanvas);

    const hudButtonCanvas = document.createElement("canvas");
    hudButtonCanvas.width = 256;
    hudButtonCanvas.height = 128;
    this.hudButtonTexture = new THREE.CanvasTexture(hudButtonCanvas);

    const hudFace = new THREE.Mesh(
      new THREE.PlaneGeometry(HUD_FACE_WIDTH, HUD_FACE_HEIGHT),
      new THREE.MeshBasicMaterial({
        map: this.hudFaceTexture,
        transparent: true,
      }),
    );
    this.wristHud.add(hudFace);

    this.hudButtonMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.132, 0.041),
      new THREE.MeshBasicMaterial({
        map: this.hudButtonTexture,
        transparent: true,
      }),
    );
    this.hudButtonMesh.position.set(0, -0.085, 0.002);
    this.wristHud.add(this.hudButtonMesh);

    this.wristHud.rotation.x = -Math.PI / 2;
    this.wristHud.position.set(0.036, 0.02, 0.028);
    this.wristHud.scale.setScalar(0.94);
    this.wristAnchor.visible = false;
    this.wristAnchor.add(this.wristHud);
    this.scene.add(this.wristAnchor);

    this.refreshHud();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
    this.renderer.setAnimationLoop(this.renderFrame);

    void this.initializePhysics();
  }

  update(
    pods: SlaveState[],
    selectedPodId: string | null,
    hoveredPodId: string | null,
    xrEliminatedPodIds: Set<string>,
  ): void {
    const activePodIds = new Set(
      pods
        .filter(
          (pod) => pod.status !== "SLAVE_STATUS_GONE" && !xrEliminatedPodIds.has(pod.slave_id),
        )
        .map((pod) => pod.slave_id),
    );

    for (const [slaveId, entry] of this.meshById) {
      if (!activePodIds.has(slaveId)) {
        this.removePodEntry(slaveId, entry);
      }
    }

    for (const pod of pods) {
      const isGone = pod.status === "SLAVE_STATUS_GONE" || xrEliminatedPodIds.has(pod.slave_id);
      if (isGone) {
        const existing = this.meshById.get(pod.slave_id);
        if (existing) {
          this.removePodEntry(pod.slave_id, existing);
        }
        continue;
      }

      let entry = this.meshById.get(pod.slave_id);
      if (!entry) {
        entry = this.createPodMesh(pod.slave_id);
        this.meshById.set(pod.slave_id, entry);
        this.boardGroup.add(entry.group);
        this.spawnPod(pod.slave_id, entry);
      } else if (this.physicsWorld && !this.podPhysicsById.has(pod.slave_id)) {
        this.createPodPhysics(pod.slave_id, entry.group.position);
      }

      entry.group.userData["slaveId"] = pod.slave_id;
      entry.group.userData["stress"] = pod.stress;
      entry.group.userData["fear"] = pod.fear;
      entry.group.userData["status"] = pod.status;
      entry.group.userData["infected"] = pod.infected;
      entry.group.userData["firewall"] = pod.firewall;

      const color = statusColor(pod);

      entry.bodyMaterial.color.set(color);
      entry.bodyMaterial.emissive.set(
        pod.status === "SLAVE_STATUS_TERMINATING"
          ? "#485866"
          : pod.infected
            ? "#415562"
            : "#0b5d78",
      );
      entry.bodyMaterial.emissiveIntensity = 0.18;

      entry.shield.visible = pod.firewall;
      entry.shield.material.opacity = pod.firewall ? 0.88 : 0;

      const isSelected = pod.slave_id === selectedPodId;
      const isHovered = pod.slave_id === hoveredPodId;
      const focusScale = isSelected ? 1.16 : isHovered ? 1.08 : 1;
      entry.group.scale.setScalar(focusScale);
      this.applyPodCrushVisual(entry, this.podPhysicsById.get(pod.slave_id)?.crushProgress ?? 0);
    }

    this.updatePointingHighlights();
  }

  setHudData(data: HudData): void {
    this.hudData = data;
    this.refreshHud();
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

    this.applyRenderScale();
    const session = await maybeXR.xr.requestSession("immersive-ar", {
      requiredFeatures: ["local-floor"],
      optionalFeatures: ["hand-tracking", "dom-overlay", "bounded-floor", "layers"],
      domOverlay: { root: document.body },
    });

    session.addEventListener("end", this.handleXREnd);
    await this.renderer.xr.setSession(session);
    this.applyXRRenderQualitySettings();
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
      this.wristAnchor.visible = false;
      this.resetBoardPlacement();
      this.hudSliderActiveHand = null;
      this.resetHudDebugData();
      return;
    }

    session.removeEventListener("end", this.handleXREnd);
    await session.end();
    this.callbacks.onXRStateChange(false);
    this.setHudData({
      ...this.hudData,
      xrActive: false,
    });
    this.wristAnchor.visible = false;
    this.resetBoardPlacement();
    this.hudSliderActiveHand = null;
    this.resetHudDebugData();
  }

  isXRPresenting(): boolean {
    return this.renderer.xr.isPresenting;
  }

  reset(): void {
    for (const entry of this.meshById.values()) {
      this.disposePodEntry(entry);
    }
    this.meshById.clear();

    for (const podId of Array.from(this.podPhysicsById.keys())) {
      this.removePodPhysics(podId);
    }

    this.wristAnchor.visible = false;
    this.resetBoardPlacement();
    this.pinchLatch = false;
    this.lastDisconnectAt = 0;
    this.hudSliderActiveHand = null;
    this.activePalmContacts.clear();
    this.clearHandState("left", true);
    this.clearHandState("right", true);
    this.podGrabOwnerById.clear();
    this.resetHudDebugData();
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.renderer.setAnimationLoop(null);

    for (const entry of this.meshById.values()) {
      this.disposePodEntry(entry);
    }
    this.meshById.clear();

    for (const podId of Array.from(this.podPhysicsById.keys())) {
      this.removePodPhysics(podId);
    }
    for (const handState of this.handPhysics.values()) {
      this.disposeHandDebugMeshes(handState);
    }
    this.handPhysics.clear();
    this.podGrabOwnerById.clear();

    this.boardSurface.geometry.dispose();
    this.boardSurface.material.dispose();
    this.boardShadow.geometry.dispose();
    this.boardShadow.material.dispose();
    this.hudFaceTexture.dispose();
    this.hudButtonTexture.dispose();
    this.hudButtonMesh.geometry.dispose();
    this.hudButtonMesh.material.dispose();
    if (this.boardColliderDebugMesh) {
      this.colliderDebugGroup.remove(this.boardColliderDebugMesh);
      this.boardColliderDebugMesh.geometry.dispose();
      this.boardColliderDebugMesh.material.dispose();
      this.boardColliderDebugMesh = null;
    }

    this.physicsWorld?.free();
    this.physicsWorld = null;

    this.renderer.dispose();
  }

  private async initializePhysics(): Promise<void> {
    try {
      if (!PodScene.rapierInitPromise) {
        PodScene.rapierInitPromise = RAPIER.init();
      }
      await PodScene.rapierInitPromise;
    } catch (error) {
      console.error("Failed to initialize Rapier", error);
      return;
    }

    if (this.physicsWorld) {
      return;
    }

    this.physicsWorld = new RAPIER.World({ x: 0, y: -1.9, z: 0 });
    this.physicsWorld.timestep = 1 / 72;

    const boardBody = this.physicsWorld.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const boardColliderDesc = RAPIER.ColliderDesc.cuboid(
      PodScene.BOARD_WIDTH * 0.5,
      PodScene.BOARD_COLLIDER_HALF_HEIGHT,
      PodScene.BOARD_DEPTH * 0.5,
    )
      .setTranslation(0, PodScene.BOARD_TOP_Y, 0)
      .setFriction(1.8)
      .setRestitution(0.01);
    this.physicsWorld.createCollider(boardColliderDesc, boardBody);
    if (COLLIDER_DEBUG_ENABLED && !this.boardColliderDebugMesh) {
      const boardColliderDebugMesh = this.createColliderDebugBox(
        new THREE.Vector3(
          PodScene.BOARD_WIDTH,
          PodScene.BOARD_COLLIDER_HALF_HEIGHT * 2,
          PodScene.BOARD_DEPTH,
        ),
        "#00d1ff",
      );
      boardColliderDebugMesh.position.set(0, PodScene.BOARD_TOP_Y, 0);
      this.colliderDebugGroup.add(boardColliderDebugMesh);
      this.boardColliderDebugMesh = boardColliderDebugMesh;
    }

    this.ensureHandPhysics("left");
    this.ensureHandPhysics("right");

    for (const [slaveId, entry] of this.meshById) {
      this.createPodPhysics(slaveId, entry.group.position);
    }
  }

  private createPodMesh(slaveId: string): PodMeshEntry {
    const group = new THREE.Group();
    const visualRoot = new THREE.Group();
    group.add(visualRoot);
    group.userData["slaveId"] = slaveId;

    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: "#00add8",
      roughness: 0.76,
      metalness: 0.02,
      emissive: "#0b5d78",
    });
    const featureMaterial = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.82,
      metalness: 0,
    });
    const muzzleMaterial = new THREE.MeshStandardMaterial({
      color: "#ebf4f7",
      roughness: 0.86,
      metalness: 0,
    });
    const noseMaterial = new THREE.MeshStandardMaterial({
      color: "#243743",
      roughness: 0.72,
      metalness: 0.04,
    });
    const pupilMaterial = new THREE.MeshStandardMaterial({
      color: "#11161b",
      roughness: 0.62,
      metalness: 0.01,
    });

    const hips = new THREE.Mesh(new THREE.SphereGeometry(0.02, 22, 16), bodyMaterial);
    hips.position.set(0, -0.03, -0.002);
    hips.scale.set(0.8, 1.18, 0.78);
    visualRoot.add(hips);

    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.025, 24, 18), bodyMaterial);
    torso.position.set(0, -0.005, 0);
    torso.scale.set(0.84, 1.58, 0.82);
    visualRoot.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.031, 24, 18), bodyMaterial);
    head.position.set(0, 0.034, 0.003);
    head.scale.set(1.02, 1.1, 0.92);
    visualRoot.add(head);

    const brow = new THREE.Mesh(new THREE.SphereGeometry(0.019, 20, 14), bodyMaterial);
    brow.position.set(0, 0.045, 0.012);
    brow.scale.set(1.18, 0.7, 0.78);
    visualRoot.add(brow);

    for (const x of [-0.016, 0.016] as const) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 16, 12), bodyMaterial);
      ear.position.set(x, 0.06, -0.001);
      ear.scale.set(0.86, 0.76, 0.5);
      visualRoot.add(ear);
    }

    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.013, 18, 14), muzzleMaterial);
    muzzle.position.set(0, 0.017, 0.028);
    muzzle.scale.set(1.04, 0.72, 0.94);
    visualRoot.add(muzzle);

    for (const x of [-0.0175, 0.0175] as const) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0115, 16, 12), featureMaterial);
      eye.position.set(x, 0.038, 0.021);
      eye.scale.set(0.9, 1.24, 0.7);
      visualRoot.add(eye);

      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0042, 12, 10), pupilMaterial);
      pupil.position.set(x * 0.9, 0.036, 0.03);
      pupil.scale.set(0.78, 1.12, 0.48);
      visualRoot.add(pupil);
    }

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.0048, 12, 10), noseMaterial);
    nose.position.set(0, 0.016, 0.037);
    nose.scale.set(1.1, 0.84, 0.68);
    visualRoot.add(nose);

    for (const x of [-0.0036, 0.0036] as const) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.0042, 0.013, 0.003), featureMaterial);
      tooth.position.set(x, 0.002, 0.0375);
      visualRoot.add(tooth);
    }

    for (const [x, rotation] of [
      [-0.023, 0.22],
      [0.023, -0.22],
    ] as const) {
      const arm = new THREE.Mesh(new THREE.SphereGeometry(0.007, 14, 10), bodyMaterial);
      arm.position.set(x, -0.006, 0.014);
      arm.scale.set(0.46, 1.18, 0.5);
      arm.rotation.z = rotation;
      visualRoot.add(arm);
    }

    for (const x of [-0.012, 0.012] as const) {
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 14, 10), bodyMaterial);
      foot.position.set(x, -0.053, 0.015);
      foot.scale.set(1.04, 0.44, 1.18);
      visualRoot.add(foot);
    }

    const shield = new THREE.Mesh(
      new THREE.TorusGeometry(0.055, 0.0045, 8, 20),
      new THREE.MeshBasicMaterial({
        color: "#bdeffc",
        transparent: true,
        opacity: 0.88,
      }),
    );
    shield.rotation.x = Math.PI / 2;
    shield.position.y = 0.008;
    shield.visible = false;
    visualRoot.add(shield);

    const pointOutline = new THREE.Group();
    pointOutline.visible = false;
    visualRoot.add(pointOutline);

    const outlineMaterial = new THREE.MeshBasicMaterial({
      color: "#dffbff",
      transparent: true,
      opacity: 0.92,
      side: THREE.BackSide,
      depthWrite: false,
    });

    const addOutlineShell = (
      geometry: THREE.BufferGeometry,
      position: readonly [number, number, number],
      scale: readonly [number, number, number],
      rotation?: readonly [number, number, number],
    ): void => {
      const shell = new THREE.Mesh(geometry, outlineMaterial);
      shell.position.set(position[0], position[1], position[2]);
      shell.scale.set(scale[0], scale[1], scale[2]);
      if (rotation) {
        shell.rotation.set(rotation[0], rotation[1], rotation[2]);
      }
      shell.renderOrder = 3;
      pointOutline.add(shell);
    };

    addOutlineShell(hips.geometry, [0, -0.03, -0.002], [0.95, 1.33, 0.93]);
    addOutlineShell(torso.geometry, [0, -0.005, 0], [0.99, 1.78, 0.97]);
    addOutlineShell(head.geometry, [0, 0.034, 0.003], [1.18, 1.28, 1.06]);
    addOutlineShell(brow.geometry, [0, 0.045, 0.012], [1.36, 0.86, 0.94]);
    addOutlineShell(muzzle.geometry, [0, 0.017, 0.028], [1.2, 0.88, 1.1]);

    for (const x of [-0.016, 0.016] as const) {
      addOutlineShell(new THREE.SphereGeometry(0.0085, 16, 12), [x, 0.06, -0.001], [1, 0.88, 0.72]);
    }
    for (const [x, rotation] of [
      [-0.023, 0.22],
      [0.023, -0.22],
    ] as const) {
      addOutlineShell(
        new THREE.SphereGeometry(0.007, 14, 10),
        [x, -0.006, 0.014],
        [0.58, 1.34, 0.62],
        [0, 0, rotation],
      );
    }
    for (const x of [-0.012, 0.012] as const) {
      addOutlineShell(
        new THREE.SphereGeometry(0.0085, 14, 10),
        [x, -0.053, 0.015],
        [1.2, 0.58, 1.34],
      );
    }
    addOutlineShell(shield.geometry, [0, 0.008, 0], [1.15, 1.15, 1.15], [Math.PI / 2, 0, 0]);

    const baseMinY = new THREE.Box3().setFromObject(visualRoot).min.y;

    return {
      group,
      visualRoot,
      bodyMaterial,
      shield,
      pointOutline,
      phase: Math.random() * Math.PI * 2,
      baseMinY,
    };
  }

  private spawnPod(slaveId: string, entry: PodMeshEntry): void {
    const halfW = Math.max(0.05, PodScene.BOARD_WIDTH * 0.5 - POD_COLLIDER_RADIUS - 0.01);
    const halfD = Math.max(0.04, PodScene.BOARD_DEPTH * 0.5 - POD_COLLIDER_RADIUS - 0.01);
    const spawnY =
      PodScene.BOARD_TOP_Y +
      PodScene.BOARD_COLLIDER_HALF_HEIGHT +
      POD_COLLIDER_RADIUS +
      PodScene.POD_SPAWN_CLEARANCE;
    entry.group.position.set(
      THREE.MathUtils.randFloatSpread(halfW * 2),
      spawnY,
      THREE.MathUtils.randFloatSpread(halfD * 2),
    );
    entry.group.rotation.set(0, Math.random() * Math.PI * 2, 0);

    if (this.physicsWorld) {
      this.createPodPhysics(slaveId, entry.group.position);
    }
  }

  private createPodPhysics(slaveId: string, position: THREE.Vector3): void {
    if (!this.physicsWorld || this.podPhysicsById.has(slaveId)) {
      return;
    }

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setLinearDamping(8)
      .setAngularDamping(18)
      .enabledRotations(false, true, false)
      .setCcdEnabled(true)
      .setCanSleep(false);

    const body = this.physicsWorld.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.ball(POD_COLLIDER_RADIUS)
      .setMass(POD_MASS)
      .setFriction(1.8)
      .setRestitution(0.02);
    const collider = this.physicsWorld.createCollider(colliderDesc, body);
    let debugMesh: ColliderDebugMesh | null = null;
    if (COLLIDER_DEBUG_ENABLED) {
      debugMesh = this.createColliderDebugSphere(POD_COLLIDER_RADIUS, "#ff5d5d");
      debugMesh.position.set(position.x, position.y, position.z);
      this.colliderDebugGroup.add(debugMesh);
    }

    this.podPhysicsById.set(slaveId, {
      body,
      collider,
      nextImpulseAt: performance.now() + 900 + Math.random() * 1400,
      fallReported: false,
      debugMesh,
      crushProgress: 0,
      crushReported: false,
    });
    this.podIdByColliderHandle.set(collider.handle, slaveId);
  }

  private disposePodEntry(entry: PodMeshEntry): void {
    this.boardGroup.remove(entry.group);
    const disposedGeometries = new Set<THREE.BufferGeometry>();
    const disposedMaterials = new Set<THREE.Material>();
    entry.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) {
        return;
      }

      if (!disposedGeometries.has(object.geometry)) {
        object.geometry.dispose();
        disposedGeometries.add(object.geometry);
      }
      if (Array.isArray(object.material)) {
        for (const material of object.material) {
          if (!disposedMaterials.has(material)) {
            material.dispose();
            disposedMaterials.add(material);
          }
        }
      } else {
        if (!disposedMaterials.has(object.material)) {
          object.material.dispose();
          disposedMaterials.add(object.material);
        }
      }
    });
  }

  private removePodEntry(slaveId: string, entry: PodMeshEntry): void {
    const owner = this.podGrabOwnerById.get(slaveId);
    if (owner) {
      this.releaseGrab(owner);
    }
    this.disposePodEntry(entry);
    this.meshById.delete(slaveId);
    this.removePodPhysics(slaveId);
    this.podGrabOwnerById.delete(slaveId);
    this.clearPalmContactsBySlaveId(slaveId);
    for (const handState of this.handPhysics.values()) {
      if (handState.pinchCandidateId === slaveId) {
        handState.pinchCandidateId = null;
      }
    }
  }

  private removePodPhysics(slaveId: string): void {
    const physicsEntry = this.podPhysicsById.get(slaveId);
    if (!physicsEntry) {
      return;
    }

    this.podIdByColliderHandle.delete(physicsEntry.collider.handle);
    if (physicsEntry.debugMesh) {
      this.colliderDebugGroup.remove(physicsEntry.debugMesh);
      physicsEntry.debugMesh.geometry.dispose();
      physicsEntry.debugMesh.material.dispose();
    }
    this.physicsWorld?.removeRigidBody(physicsEntry.body);
    this.podPhysicsById.delete(slaveId);
  }

  private clearPalmContactsBySlaveId(slaveId: string): void {
    for (const contactKey of Array.from(this.activePalmContacts)) {
      if (contactKey.endsWith(`:${slaveId}`)) {
        this.activePalmContacts.delete(contactKey);
      }
    }
  }

  private drawHud(): void {
    const faceCanvas = this.hudFaceTexture.image as HTMLCanvasElement;
    const faceContext = faceCanvas.getContext("2d");
    if (faceContext) {
      const { width, height } = faceCanvas;
      const sessionText = truncateText(this.hudData.sessionId, 22);
      const connectionText = truncateText(this.hudData.connection, 24);
      const trackText = `L ${this.hudDebugData.leftTracked ? "OK" : "--"} / R ${this.hudDebugData.rightTracked ? "OK" : "--"}`;
      const gestureText = `L ${this.hudDebugData.leftGesture} / R ${this.hudDebugData.rightGesture}`;
      const pinchText = this.hudDebugData.pinchTargetId
        ? formatHudId(this.hudDebugData.pinchTargetId)
        : "--";
      const grabText = this.hudDebugData.grabTargetId
        ? formatHudId(this.hudDebugData.grabTargetId)
        : "--";
      const fingertipText = this.hudDebugData.fingertipTargetId
        ? `${this.hudDebugData.fingertipHand === "left" ? "L" : "R"} ${formatHudId(this.hudDebugData.fingertipTargetId, 20)}`
        : "none";
      const sliderCenterX = hudLocalToCanvasX(HUD_TABLE_SLIDER_CENTER_X, width);
      const sliderCenterY = hudLocalToCanvasY(HUD_TABLE_SLIDER_CENTER_Y, height);
      const sliderWidthPx = (HUD_TABLE_SLIDER_WIDTH / HUD_FACE_WIDTH) * width;
      const sliderHeightPx = (HUD_TABLE_SLIDER_HEIGHT / HUD_FACE_HEIGHT) * height;
      const sliderLeft = sliderCenterX - sliderWidthPx * 0.5;
      const sliderTop = sliderCenterY - sliderHeightPx * 0.5;
      const sliderFillWidth = sliderWidthPx * this.tableHeightSliderValue();
      const sliderHandleX = sliderLeft + sliderFillWidth;
      const sliderValueText = `${this.hudDebugData.tableHeightCm} cm`;
      const sliderAccent =
        this.hudDebugData.tableAdjustingHand === "right"
          ? "#ffa646"
          : this.hudDebugData.tableAdjustingHand === "left"
            ? "#8dff72"
            : "#86e7ff";

      faceContext.clearRect(0, 0, width, height);

      const panelGradient = faceContext.createLinearGradient(0, 0, 0, height);
      panelGradient.addColorStop(0, "rgba(20, 24, 28, 0.84)");
      panelGradient.addColorStop(0.58, "rgba(9, 12, 15, 0.76)");
      panelGradient.addColorStop(1, "rgba(6, 9, 12, 0.9)");
      faceContext.fillStyle = panelGradient;
      faceContext.beginPath();
      faceContext.roundRect(18, 16, width - 36, height - 32, 48);
      faceContext.fill();

      faceContext.strokeStyle = "rgba(255, 255, 255, 0.14)";
      faceContext.lineWidth = 2;
      faceContext.beginPath();
      faceContext.roundRect(19, 17, width - 38, height - 34, 47);
      faceContext.stroke();

      const cyanGlow = faceContext.createRadialGradient(
        width - 132,
        150,
        18,
        width - 132,
        150,
        170,
      );
      cyanGlow.addColorStop(0, "rgba(132, 228, 255, 0.22)");
      cyanGlow.addColorStop(0.6, "rgba(108, 208, 240, 0.08)");
      cyanGlow.addColorStop(1, "rgba(108, 208, 240, 0)");
      faceContext.fillStyle = cyanGlow;
      faceContext.beginPath();
      faceContext.roundRect(44, 36, width - 88, height - 72, 36);
      faceContext.fill();

      faceContext.save();
      faceContext.globalAlpha = 0.22;
      faceContext.fillStyle = "#86e7ff";
      faceContext.beginPath();
      faceContext.arc(width - 166, 112, 22, 0, Math.PI * 2);
      faceContext.arc(width - 94, 112, 22, 0, Math.PI * 2);
      faceContext.fill();
      faceContext.beginPath();
      faceContext.ellipse(width - 130, 195, 86, 104, 0, 0, Math.PI * 2);
      faceContext.fill();
      faceContext.globalAlpha = 0.16;
      faceContext.fillStyle = "#dff8ff";
      faceContext.beginPath();
      faceContext.ellipse(width - 154, 180, 18, 28, 0.06, 0, Math.PI * 2);
      faceContext.ellipse(width - 106, 180, 18, 28, -0.06, 0, Math.PI * 2);
      faceContext.fill();
      faceContext.globalAlpha = 0.18;
      faceContext.strokeStyle = "#d9faff";
      faceContext.lineWidth = 3;
      faceContext.beginPath();
      faceContext.moveTo(width - 132, 214);
      faceContext.lineTo(width - 132, 232);
      faceContext.moveTo(width - 120, 232);
      faceContext.lineTo(width - 120, 250);
      faceContext.moveTo(width - 144, 232);
      faceContext.lineTo(width - 144, 250);
      faceContext.stroke();
      faceContext.restore();

      faceContext.save();
      faceContext.strokeStyle = "rgba(132, 228, 255, 0.12)";
      faceContext.lineWidth = 1;
      for (let x = 58; x < width - 58; x += 32) {
        faceContext.beginPath();
        faceContext.moveTo(x, 56);
        faceContext.lineTo(x, height - 54);
        faceContext.stroke();
      }
      for (let y = 56; y < height - 54; y += 28) {
        faceContext.beginPath();
        faceContext.moveTo(52, y);
        faceContext.lineTo(width - 52, y);
        faceContext.stroke();
      }
      faceContext.restore();

      faceContext.fillStyle = "#f5f7f8";
      faceContext.font = "600 18px sans-serif";
      faceContext.fillText("LEFT WRIST DEBUG", 54, 60);
      faceContext.font = "500 14px monospace";
      faceContext.fillStyle = "rgba(227, 234, 238, 0.86)";
      faceContext.fillText(sessionText, 54, 84);

      faceContext.textAlign = "right";
      faceContext.fillStyle = this.hudData.xrActive ? "#9ef0bc" : "#efcf93";
      faceContext.font = "600 14px sans-serif";
      faceContext.fillText(this.hudData.xrActive ? "XR ACTIVE" : "XR STANDBY", width - 56, 60);
      faceContext.fillText(connectionText, width - 56, 84);
      faceContext.textAlign = "left";

      faceContext.fillStyle = "#ffffff";
      faceContext.font = "700 60px sans-serif";
      faceContext.fillText(String(this.hudData.live).padStart(2, "0"), 54, 170);
      faceContext.fillStyle = "rgba(228, 236, 240, 0.86)";
      faceContext.font = "600 16px sans-serif";
      faceContext.fillText("LIVE PODS", 58, 196);

      faceContext.fillStyle = "#c7d2d9";
      faceContext.font = "700 34px sans-serif";
      faceContext.fillText(String(this.hudData.gone).padStart(2, "0"), 54, 244);
      faceContext.fillStyle = "rgba(200, 210, 218, 0.78)";
      faceContext.font = "600 15px sans-serif";
      faceContext.fillText("GONE", 58, 264);

      faceContext.fillStyle = "rgba(7, 11, 14, 0.56)";
      faceContext.beginPath();
      faceContext.roundRect(44, 286, width - 88, 96, 28);
      faceContext.fill();
      faceContext.strokeStyle = "rgba(137, 224, 247, 0.22)";
      faceContext.lineWidth = 2;
      faceContext.stroke();

      faceContext.font = "600 14px sans-serif";
      faceContext.fillStyle = "rgba(217, 226, 232, 0.72)";
      faceContext.fillText("TRACK", 58, 312);
      faceContext.fillText("GESTURE", 58, 336);
      faceContext.fillText("PINCH", 58, 360);
      faceContext.fillText("GRAB", 318, 312);
      faceContext.fillText("FINGERTIP", 318, 336);

      faceContext.fillStyle = "#f3f7f9";
      faceContext.font = "600 15px monospace";
      faceContext.fillText(trackText, 128, 312);
      faceContext.fillText(gestureText, 128, 336);
      faceContext.fillText(pinchText, 128, 360);
      faceContext.fillText(grabText, 392, 312);
      faceContext.fillStyle = this.hudDebugData.fingertipTargetId ? "#a5edff" : "#f3f7f9";
      faceContext.fillText(fingertipText, 392, 336);

      faceContext.fillStyle = "rgba(7, 11, 14, 0.46)";
      faceContext.beginPath();
      faceContext.roundRect(width - 208, 252, 152, 118, 24);
      faceContext.fill();
      faceContext.strokeStyle = "rgba(137, 224, 247, 0.18)";
      faceContext.lineWidth = 2;
      faceContext.stroke();

      faceContext.fillStyle = "rgba(210, 219, 224, 0.72)";
      faceContext.font = "600 14px sans-serif";
      faceContext.fillText("POINT TARGET", width - 188, 280);
      faceContext.fillStyle = this.hudDebugData.fingertipTargetId
        ? "#dff8ff"
        : "rgba(235, 240, 243, 0.82)";
      faceContext.font = "700 16px monospace";
      const pointLines = splitHudLines(fingertipText, 16);
      faceContext.fillText(pointLines[0] ?? "none", width - 188, 306);
      if (pointLines[1]) {
        faceContext.fillText(pointLines[1], width - 188, 326);
      }

      faceContext.fillStyle = "rgba(210, 219, 224, 0.72)";
      faceContext.font = "600 13px sans-serif";
      faceContext.fillText("TABLE HEIGHT", width - 188, 342);
      faceContext.textAlign = "right";
      faceContext.fillStyle = sliderAccent;
      faceContext.fillText(sliderValueText, width - 72, 342);
      faceContext.textAlign = "left";

      faceContext.fillStyle = "rgba(10, 14, 18, 0.8)";
      faceContext.beginPath();
      faceContext.roundRect(sliderLeft, sliderTop, sliderWidthPx, sliderHeightPx, 14);
      faceContext.fill();
      faceContext.strokeStyle = "rgba(255, 255, 255, 0.1)";
      faceContext.lineWidth = 2;
      faceContext.stroke();

      faceContext.fillStyle = sliderAccent;
      faceContext.beginPath();
      faceContext.roundRect(
        sliderLeft,
        sliderTop,
        Math.max(sliderHeightPx, sliderFillWidth),
        sliderHeightPx,
        14,
      );
      faceContext.fill();

      faceContext.fillStyle = "#f4fbff";
      faceContext.beginPath();
      faceContext.arc(
        THREE.MathUtils.clamp(
          sliderHandleX,
          sliderLeft + sliderHeightPx * 0.5,
          sliderLeft + sliderWidthPx,
        ),
        sliderCenterY,
        sliderHeightPx * 0.52,
        0,
        Math.PI * 2,
      );
      faceContext.fill();
      faceContext.strokeStyle = "rgba(13, 17, 20, 0.6)";
      faceContext.lineWidth = 2;
      faceContext.stroke();

      this.hudFaceTexture.needsUpdate = true;
    }

    const buttonCanvas = this.hudButtonTexture.image as HTMLCanvasElement;
    const buttonContext = buttonCanvas.getContext("2d");
    if (buttonContext) {
      buttonContext.clearRect(0, 0, buttonCanvas.width, buttonCanvas.height);
      buttonContext.fillStyle = "rgba(22, 18, 18, 0.84)";
      buttonContext.beginPath();
      buttonContext.roundRect(8, 8, 240, 112, 36);
      buttonContext.fill();
      buttonContext.strokeStyle = "rgba(255, 164, 164, 0.48)";
      buttonContext.lineWidth = 4;
      buttonContext.stroke();
      buttonContext.fillStyle = "#fff0f0";
      buttonContext.font = "600 25px sans-serif";
      buttonContext.textAlign = "center";
      buttonContext.textBaseline = "middle";
      buttonContext.fillText("Disconnect", 128, 64);
      this.hudButtonTexture.needsUpdate = true;
    }
  }

  private applyRenderScale(): void {
    this.renderer.setPixelRatio(Math.max(0.5, Math.min(window.devicePixelRatio, 2) * RENDER_SCALE));
    const xrManager = this.renderer.xr as THREE.WebXRManager & {
      setFramebufferScaleFactor?: (factor: number) => void;
    };
    xrManager.setFramebufferScaleFactor?.(RENDER_SCALE);
  }

  private applyXRRenderQualitySettings(): void {
    const xrManager = this.renderer.xr as THREE.WebXRManager & {
      setFoveation?: (foveation: number) => void;
    };
    xrManager.setFoveation?.(XR_FOVEATION_LEVEL);
  }

  private placeBoardForXR(): void {
    const xrCamera = this.renderer.xr.getCamera();
    const position = new THREE.Vector3();
    const direction = new THREE.Vector3();
    xrCamera.getWorldPosition(position);
    xrCamera.getWorldDirection(direction);
    direction.y = 0;
    if (direction.lengthSq() < 1e-6) {
      direction.set(0, 0, -1);
    } else {
      direction.normalize();
    }

    const boardPosition = position
      .clone()
      .add(direction.multiplyScalar(PodScene.BOARD_FORWARD_DISTANCE));
    boardPosition.y = this.boardSurfaceHeight - PodScene.BOARD_TOP_Y;
    this.boardGroup.position.copy(boardPosition);
    this.boardGroup.lookAt(position.x, boardPosition.y, position.z);
    this.boardGroup.rotateY(Math.PI);
  }

  private resetBoardPlacement(): void {
    this.boardGroup.position.set(0, 0, 0);
    this.boardGroup.rotation.set(0, 0, 0);
  }

  private applyCurrentBoardHeight(): void {
    if (!this.renderer.xr.isPresenting) {
      return;
    }

    this.boardGroup.position.y = this.boardSurfaceHeight - PodScene.BOARD_TOP_Y;
  }

  private readonly handleXREnd = (): void => {
    this.callbacks.onXRStateChange(false);
    this.wristAnchor.visible = false;
    this.setHudData({
      ...this.hudData,
      xrActive: false,
    });
    this.pinchLatch = false;
    this.hudSliderActiveHand = null;
    this.clearHandState("left", true);
    this.clearHandState("right", true);
    this.resetBoardPlacement();
    this.resetHudDebugData();
  };

  private resize(): void {
    if (this.renderer.xr.isPresenting) {
      return;
    }

    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.applyRenderScale();
    this.renderer.setSize(width, height, false);
  }

  private renderFrame = (): void => {
    const now = performance.now();
    const delta = Math.min(0.05, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    this.updateSimulation(delta, now);

    if (!this.renderer.xr.isPresenting) {
      this.wristAnchor.visible = false;
      this.pinchLatch = false;
      this.clearPalmContacts("left");
      this.clearPalmContacts("right");
      this.clearHandState("left", false);
      this.clearHandState("right", false);
      this.updatePointingHighlights();
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.updateWristHud();
    this.renderer.render(this.scene, this.camera);
  };

  private updateSimulation(delta: number, nowMs: number): void {
    if (!this.physicsWorld) {
      return;
    }

    this.physicsWorld.timestep = Math.min(1 / 30, Math.max(1 / 120, delta));
    const completedCrushes: string[] = [];

    for (const [slaveId, physicsEntry] of this.podPhysicsById) {
      const entry = this.meshById.get(slaveId);
      if (!entry) {
        continue;
      }

      const status = String(entry.group.userData["status"] ?? "");
      if (status === "SLAVE_STATUS_GONE") {
        continue;
      }

      if (physicsEntry.crushProgress > 0 && !physicsEntry.crushReported) {
        physicsEntry.crushProgress = Math.min(
          1,
          physicsEntry.crushProgress + delta / POD_CRUSH_DURATION,
        );
        if (physicsEntry.crushProgress >= 1) {
          physicsEntry.crushReported = true;
          completedCrushes.push(slaveId);
        }
      }

      if (
        physicsEntry.crushProgress <= 0 &&
        !physicsEntry.crushReported &&
        physicsEntry.body.isDynamic() &&
        nowMs >= physicsEntry.nextImpulseAt
      ) {
        const stress = Number(entry.group.userData["stress"] ?? 0);
        const fear = Number(entry.group.userData["fear"] ?? 0);
        const impulseMagnitude =
          POD_IMPULSE_BASE +
          Math.min(
            POD_IMPULSE_MAX,
            stress * POD_IMPULSE_STRESS_FACTOR +
              fear * POD_IMPULSE_FEAR_FACTOR +
              Math.random() * POD_IMPULSE_VARIANCE,
          );
        const angle = Math.random() * Math.PI * 2;
        physicsEntry.body.applyImpulse(
          {
            x: Math.cos(angle) * impulseMagnitude,
            y: 0,
            z: Math.sin(angle) * impulseMagnitude,
          },
          true,
        );
        physicsEntry.nextImpulseAt =
          nowMs + POD_IMPULSE_INTERVAL_BASE_MS + Math.random() * POD_IMPULSE_INTERVAL_JITTER_MS;
      }
    }

    this.physicsWorld.step();

    for (const [slaveId, physicsEntry] of this.podPhysicsById) {
      const entry = this.meshById.get(slaveId);
      if (!entry) {
        continue;
      }

      const position = physicsEntry.body.translation();
      const rotation = physicsEntry.body.rotation();
      if (physicsEntry.body.isDynamic()) {
        const velocity = physicsEntry.body.linvel();
        const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
        if (horizontalSpeed > POD_MAX_HORIZONTAL_SPEED) {
          const scale = POD_MAX_HORIZONTAL_SPEED / horizontalSpeed;
          physicsEntry.body.setLinvel(
            { x: velocity.x * scale, y: velocity.y, z: velocity.z * scale },
            true,
          );
        }
      }
      entry.group.position.set(position.x, position.y, position.z);
      entry.group.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
      this.applyPodCrushVisual(entry, physicsEntry.crushProgress);
      if (physicsEntry.debugMesh) {
        physicsEntry.debugMesh.position.copy(entry.group.position);
        physicsEntry.debugMesh.quaternion.copy(entry.group.quaternion);
      }

      const infected = Boolean(entry.group.userData["infected"]);
      entry.bodyMaterial.emissiveIntensity = infected
        ? 0.22 + Math.sin(nowMs * 0.006 + entry.phase) * 0.04
        : 0.18;

      if (position.y < PodScene.UNDER_TABLE_COLLIDER_Y && !physicsEntry.fallReported) {
        physicsEntry.fallReported = true;
        this.callbacks.onPodFall(slaveId);
      }
    }

    for (const slaveId of completedCrushes) {
      this.callbacks.onHit(slaveId);
    }
  }

  private updateWristHud(): void {
    const session = this.renderer.xr.getSession();
    const frame = this.renderer.xr.getFrame();
    const referenceSpace = this.renderer.xr.getReferenceSpace();
    const getJointPose = frame?.getJointPose?.bind(frame);

    if (!session || !frame || !referenceSpace || !getJointPose) {
      this.wristAnchor.visible = false;
      this.clearHandState("left", true);
      this.clearHandState("right", true);
      this.resetHudDebugData();
      return;
    }

    this.boardGroup.updateMatrixWorld(true);

    let leftWristTracked = false;
    let buttonTouched = false;
    let pinchDetected = false;
    const trackedHands = new Set<"left" | "right">();

    const buttonWorld = new THREE.Vector3();
    this.hudButtonMesh.getWorldPosition(buttonWorld);

    for (const inputSource of session.inputSources) {
      if (!inputSource.hand) {
        continue;
      }
      if (inputSource.handedness !== "left" && inputSource.handedness !== "right") {
        continue;
      }

      trackedHands.add(inputSource.handedness);

      const tracking = this.updateHandPhysicsFromJoints(
        inputSource.handedness,
        inputSource.hand,
        referenceSpace,
        getJointPose,
      );

      if (inputSource.handedness === "left" && tracking.wristPose) {
        leftWristTracked = true;
        this.wristAnchor.visible = true;
        this.wristAnchor.matrixAutoUpdate = false;
        this.wristAnchor.matrix.fromArray(tracking.wristPose.transform.matrix);
        this.wristAnchor.matrix.decompose(
          this.wristAnchor.position,
          this.wristAnchor.quaternion,
          this.wristAnchor.scale,
        );
      }

      if (tracking.indexWorld && tracking.thumbWorld) {
        const pinchDistance = tracking.indexWorld.distanceTo(tracking.thumbWorld);
        if (pinchDistance < PINCH_THRESHOLD) {
          pinchDetected = true;
        }

        if (tracking.indexWorld.distanceTo(buttonWorld) < 0.045) {
          buttonTouched = true;
        }
      }
    }

    if (!leftWristTracked) {
      this.wristAnchor.visible = false;
      this.hudSliderActiveHand = null;
    }

    if (!trackedHands.has("left")) {
      this.clearHandState("left", true);
    }
    if (!trackedHands.has("right")) {
      this.clearHandState("right", true);
    }

    if (this.physicsWorld) {
      this.physicsWorld.propagateModifiedBodyPositionsToColliders();
    }
    for (const handState of this.handPhysics.values()) {
      handState.pinchCandidateId = handState.pinchActive
        ? this.findPinchCandidate(handState)
        : null;
      handState.fingertipTargetId = handState.pointingActive
        ? this.findPointingTarget(handState)
        : null;
    }
    this.updateTableHeightSliderInteraction(leftWristTracked, trackedHands);
    this.updateGrabInteraction("left");
    this.updateGrabInteraction("right");
    this.updateHudDebugState(leftWristTracked, trackedHands);
    this.updatePointingHighlights();

    this.processOpenPalmContacts("left");
    this.processOpenPalmContacts("right");

    const now = performance.now();
    if (buttonTouched && pinchDetected && !this.pinchLatch && now - this.lastDisconnectAt > 1200) {
      this.lastDisconnectAt = now;
      this.callbacks.onDisconnect();
    }
    this.pinchLatch = buttonTouched && pinchDetected;
  }

  private updateHandPhysicsFromJoints(
    handedness: "left" | "right",
    hand: XRHand,
    referenceSpace: XRReferenceSpace,
    getJointPose: (joint: XRJointSpace, baseSpace: XRSpace) => XRJointPose | undefined,
  ): HandJointTracking {
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
      this.clearHandState(handedness, true);
      return { wristPose: null, thumbWorld: null, indexWorld: null };
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
      this.clearHandState(handedness, true);
      return { wristPose: null, thumbWorld: null, indexWorld: null };
    }

    const wristPosition = jointPosition(wristPose, this.tmpMatrix);
    const indexPosition = jointPosition(indexTipPose, this.tmpMatrix);
    const middlePosition = jointPosition(middleTipPose, this.tmpMatrix);
    const ringPosition = jointPosition(ringTipPose, this.tmpMatrix);
    const pinkyPosition = jointPosition(pinkyTipPose, this.tmpMatrix);
    const thumbPosition = jointPosition(thumbTipPose, this.tmpMatrix);

    const indexExtended = indexPosition.distanceTo(wristPosition) > 0.09;
    const middleExtended = middlePosition.distanceTo(wristPosition) > 0.085;
    const ringExtended = ringPosition.distanceTo(wristPosition) > 0.08;
    const pinkyExtended = pinkyPosition.distanceTo(wristPosition) > 0.078;
    const fingersExtended = indexExtended && middleExtended && ringExtended && pinkyExtended;
    const thumbExtended = thumbPosition.distanceTo(wristPosition) > 0.07;
    const pinchDistance = indexPosition.distanceTo(thumbPosition);

    const knuckles = [
      jointPosition(indexKnucklePose, this.tmpMatrix),
      jointPosition(middleKnucklePose, this.tmpMatrix),
      jointPosition(ringKnucklePose, this.tmpMatrix),
      jointPosition(pinkyKnucklePose, this.tmpMatrix),
    ];

    const palmCenter = new THREE.Vector3();
    for (const knuckle of knuckles) {
      palmCenter.add(knuckle);
    }
    palmCenter.multiplyScalar(1 / knuckles.length);
    palmCenter.add(wristPosition).multiplyScalar(0.5);

    const handPhysics = this.ensureHandPhysics(handedness);
    if (!handPhysics) {
      return {
        wristPose,
        thumbWorld: thumbPosition,
        indexWorld: indexPosition,
      };
    }

    handPhysics.openPalm = fingersExtended && thumbExtended;
    handPhysics.pointingActive =
      indexExtended &&
      !middleExtended &&
      !ringExtended &&
      !pinkyExtended &&
      pinchDistance > PINCH_THRESHOLD * 1.4;

    this.setHandBodyPosition(
      handPhysics.palmBody,
      this.worldToBoardLocal(palmCenter),
      handPhysics.palmDebugMesh,
    );
    this.setHandBodyPosition(
      handPhysics.thumbBody,
      this.worldToBoardLocal(thumbPosition),
      handPhysics.thumbDebugMesh,
    );
    this.setHandBodyPosition(
      handPhysics.indexBody,
      this.worldToBoardLocal(indexPosition),
      handPhysics.indexDebugMesh,
    );
    this.setHandBodyPosition(
      handPhysics.middleBody,
      this.worldToBoardLocal(middlePosition),
      handPhysics.middleDebugMesh,
    );

    const pinchMidpointLocal = this.worldToBoardLocal(
      indexPosition.clone().add(thumbPosition).multiplyScalar(0.5),
    );
    const pinchMidpointWorld = indexPosition.clone().add(thumbPosition).multiplyScalar(0.5);
    handPhysics.pinchActive = pinchDistance < PINCH_THRESHOLD;
    handPhysics.pinchMidpointLocal = handPhysics.pinchActive ? pinchMidpointLocal : null;
    handPhysics.pinchMidpointWorld = handPhysics.pinchActive ? pinchMidpointWorld : null;
    handPhysics.pinchCandidateId = null;
    handPhysics.fingertipTargetId = null;
    handPhysics.indexTipLocal = this.worldToBoardLocal(indexPosition);

    return {
      wristPose,
      thumbWorld: thumbPosition,
      indexWorld: indexPosition,
    };
  }

  private ensureHandPhysics(handedness: "left" | "right"): HandPhysicsState | null {
    const existing = this.handPhysics.get(handedness);
    if (existing) {
      return existing;
    }
    if (!this.physicsWorld) {
      return null;
    }

    const palmBody = this.physicsWorld.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, HAND_PARK_Y, 0),
    );
    const palmCollider = this.physicsWorld.createCollider(
      RAPIER.ColliderDesc.ball(PALM_COLLIDER_RADIUS).setSensor(true),
      palmBody,
    );

    const thumbBody = this.physicsWorld.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, HAND_PARK_Y, 0),
    );
    const thumbCollider = this.physicsWorld.createCollider(
      RAPIER.ColliderDesc.ball(FINGER_COLLIDER_RADIUS).setSensor(true),
      thumbBody,
    );

    const indexBody = this.physicsWorld.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, HAND_PARK_Y, 0),
    );
    const indexCollider = this.physicsWorld.createCollider(
      RAPIER.ColliderDesc.ball(FINGER_COLLIDER_RADIUS).setSensor(true),
      indexBody,
    );

    const middleBody = this.physicsWorld.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, HAND_PARK_Y, 0),
    );
    const middleCollider = this.physicsWorld.createCollider(
      RAPIER.ColliderDesc.ball(FINGER_COLLIDER_RADIUS).setSensor(true),
      middleBody,
    );
    let palmDebugMesh: ColliderDebugMesh | null = null;
    let thumbDebugMesh: ColliderDebugMesh | null = null;
    let indexDebugMesh: ColliderDebugMesh | null = null;
    let middleDebugMesh: ColliderDebugMesh | null = null;
    if (COLLIDER_DEBUG_ENABLED) {
      palmDebugMesh = this.createColliderDebugSphere(
        PALM_COLLIDER_RADIUS,
        handedness === "left" ? "#8dff72" : "#ffa646",
      );
      thumbDebugMesh = this.createColliderDebugSphere(FINGER_COLLIDER_RADIUS, "#f6ff72");
      indexDebugMesh = this.createColliderDebugSphere(FINGER_COLLIDER_RADIUS, "#f6ff72");
      middleDebugMesh = this.createColliderDebugSphere(FINGER_COLLIDER_RADIUS, "#f6ff72");
      for (const mesh of [palmDebugMesh, thumbDebugMesh, indexDebugMesh, middleDebugMesh]) {
        mesh.position.set(0, HAND_PARK_Y, 0);
        this.colliderDebugGroup.add(mesh);
      }
    }

    const state: HandPhysicsState = {
      palmBody,
      palmCollider,
      thumbBody,
      thumbCollider,
      indexBody,
      indexCollider,
      middleBody,
      middleCollider,
      palmDebugMesh,
      thumbDebugMesh,
      indexDebugMesh,
      middleDebugMesh,
      openPalm: false,
      pointingActive: false,
      pinchActive: false,
      pinchMidpointLocal: null,
      pinchMidpointWorld: null,
      pinchCandidateId: null,
      fingertipTargetId: null,
      grabbedPodId: null,
      indexTipLocal: null,
      lastGrabPointLocal: null,
      lastGrabAt: 0,
    };

    this.handPhysics.set(handedness, state);
    return state;
  }

  private setHandBodyPosition(
    body: RAPIER.RigidBody,
    point: THREE.Vector3,
    debugMesh: ColliderDebugMesh | null,
  ): void {
    body.setTranslation({ x: point.x, y: point.y, z: point.z }, false);
    body.setLinvel({ x: 0, y: 0, z: 0 }, false);
    body.setAngvel({ x: 0, y: 0, z: 0 }, false);
    if (debugMesh) {
      debugMesh.position.copy(point);
    }
  }

  private updateTableHeightSliderInteraction(
    leftWristTracked: boolean,
    trackedHands: ReadonlySet<"left" | "right">,
  ): void {
    if (!leftWristTracked || !this.wristAnchor.visible) {
      this.hudSliderActiveHand = null;
      return;
    }

    if (this.hudSliderActiveHand && !trackedHands.has(this.hudSliderActiveHand)) {
      this.hudSliderActiveHand = null;
    }

    const handOrder: ("left" | "right")[] = this.hudSliderActiveHand
      ? [this.hudSliderActiveHand]
      : ["right", "left"];

    for (const handedness of handOrder) {
      const handState = this.handPhysics.get(handedness);
      if (!handState?.pinchActive || !handState.pinchMidpointWorld) {
        continue;
      }

      const hudPoint = this.wristHud.worldToLocal(handState.pinchMidpointWorld.clone());
      const active = this.hudSliderActiveHand === handedness;
      if (!this.isTableSliderHit(hudPoint, active)) {
        continue;
      }

      this.hudSliderActiveHand = handedness;
      handState.pinchCandidateId = null;
      const sliderValue = THREE.MathUtils.clamp(
        (hudPoint.x - (HUD_TABLE_SLIDER_CENTER_X - HUD_TABLE_SLIDER_WIDTH * 0.5)) /
          HUD_TABLE_SLIDER_WIDTH,
        0,
        1,
      );
      this.boardSurfaceHeight = THREE.MathUtils.lerp(
        PodScene.MIN_BOARD_SURFACE_HEIGHT,
        PodScene.MAX_BOARD_SURFACE_HEIGHT,
        sliderValue,
      );
      this.applyCurrentBoardHeight();
      return;
    }

    this.hudSliderActiveHand = null;
  }

  private isTableSliderHit(point: THREE.Vector3, activeDrag: boolean): boolean {
    const verticalMargin = activeDrag ? HUD_TABLE_SLIDER_DRAG_MARGIN : 0;
    const horizontalMargin = activeDrag ? HUD_TABLE_SLIDER_DRAG_MARGIN * 1.5 : 0;
    return (
      Math.abs(point.z) <= HUD_TABLE_SLIDER_DEPTH_TOLERANCE &&
      Math.abs(point.y - HUD_TABLE_SLIDER_CENTER_Y) <=
        HUD_TABLE_SLIDER_HEIGHT * 0.5 + verticalMargin &&
      point.x >= HUD_TABLE_SLIDER_CENTER_X - HUD_TABLE_SLIDER_WIDTH * 0.5 - horizontalMargin &&
      point.x <= HUD_TABLE_SLIDER_CENTER_X + HUD_TABLE_SLIDER_WIDTH * 0.5 + horizontalMargin
    );
  }

  private applyPodCrushVisual(entry: PodMeshEntry, crushProgress: number): void {
    const clamped = THREE.MathUtils.clamp(crushProgress, 0, 1);
    if (clamped <= 0) {
      entry.visualRoot.scale.set(1, 1, 1);
      entry.visualRoot.position.y = 0;
      return;
    }

    const eased = 1 - Math.pow(1 - clamped, 3);
    const squashY = THREE.MathUtils.lerp(1, POD_CRUSH_TARGET_Y_SCALE, eased);
    const squashXZ = THREE.MathUtils.lerp(1, POD_CRUSH_TARGET_XZ_SCALE, eased);
    entry.visualRoot.scale.set(squashXZ, squashY, squashXZ);
    entry.visualRoot.position.y = entry.baseMinY * (1 - squashY);
  }

  private startPodCrush(slaveId: string): void {
    const entry = this.meshById.get(slaveId);
    const physicsEntry = this.podPhysicsById.get(slaveId);
    if (!entry || !physicsEntry || !this.isPodInteractable(slaveId, entry)) {
      return;
    }

    const owner = this.podGrabOwnerById.get(slaveId);
    if (owner) {
      this.releaseGrab(owner);
    }

    const position = physicsEntry.body.translation();
    physicsEntry.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    physicsEntry.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    physicsEntry.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    physicsEntry.body.setTranslation(position, true);
    physicsEntry.body.setNextKinematicTranslation(position);
    physicsEntry.crushProgress = Number.EPSILON;
    physicsEntry.crushReported = false;
    physicsEntry.nextImpulseAt = Number.POSITIVE_INFINITY;
    this.applyPodCrushVisual(entry, physicsEntry.crushProgress);
  }

  private isPodInteractable(slaveId: string, entry = this.meshById.get(slaveId)): boolean {
    if (!entry || String(entry.group.userData["status"] ?? "") === "SLAVE_STATUS_GONE") {
      return false;
    }

    const physicsEntry = this.podPhysicsById.get(slaveId);
    return !(physicsEntry && (physicsEntry.crushProgress > 0 || physicsEntry.crushReported));
  }

  private tableHeightSliderValue(): number {
    return THREE.MathUtils.clamp(
      (this.boardSurfaceHeight - PodScene.MIN_BOARD_SURFACE_HEIGHT) /
        (PodScene.MAX_BOARD_SURFACE_HEIGHT - PodScene.MIN_BOARD_SURFACE_HEIGHT),
      0,
      1,
    );
  }

  private updateGrabInteraction(handedness: "left" | "right"): void {
    const handState = this.handPhysics.get(handedness);
    if (!handState) {
      return;
    }

    if (this.hudSliderActiveHand === handedness) {
      if (handState.grabbedPodId) {
        this.releaseGrab(handedness);
      }
      return;
    }

    const activeGrabbedPodId = handState.grabbedPodId;
    if (activeGrabbedPodId) {
      const physicsEntry = this.podPhysicsById.get(activeGrabbedPodId);
      if (
        !physicsEntry ||
        !handState.pinchActive ||
        !handState.pinchMidpointLocal ||
        handState.pinchCandidateId !== activeGrabbedPodId
      ) {
        this.releaseGrab(handedness);
        return;
      }

      const target = handState.pinchMidpointLocal;
      physicsEntry.body.setNextKinematicTranslation({ x: target.x, y: target.y, z: target.z });
      handState.lastGrabPointLocal = target.clone();
      handState.lastGrabAt = performance.now();
      return;
    }

    if (!handState.pinchActive || !handState.pinchCandidateId || !handState.pinchMidpointLocal) {
      return;
    }

    const targetPodId = handState.pinchCandidateId;
    const currentOwner = this.podGrabOwnerById.get(targetPodId);
    if (currentOwner && currentOwner !== handedness) {
      return;
    }

    const physicsEntry = this.podPhysicsById.get(targetPodId);
    if (!physicsEntry) {
      return;
    }

    const target = handState.pinchMidpointLocal;
    physicsEntry.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    physicsEntry.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    physicsEntry.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    physicsEntry.body.setTranslation({ x: target.x, y: target.y, z: target.z }, true);
    physicsEntry.body.setNextKinematicTranslation({ x: target.x, y: target.y, z: target.z });
    handState.grabbedPodId = targetPodId;
    handState.lastGrabPointLocal = target.clone();
    handState.lastGrabAt = performance.now();
    this.podGrabOwnerById.set(targetPodId, handedness);
  }

  private releaseGrab(handedness: "left" | "right"): void {
    const handState = this.handPhysics.get(handedness);
    if (!handState?.grabbedPodId) {
      return;
    }

    const podId = handState.grabbedPodId;
    const physicsEntry = this.podPhysicsById.get(podId);
    if (physicsEntry) {
      physicsEntry.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      physicsEntry.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      physicsEntry.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      physicsEntry.nextImpulseAt =
        performance.now() +
        POD_IMPULSE_INTERVAL_BASE_MS +
        Math.random() * POD_IMPULSE_INTERVAL_JITTER_MS;
    }

    this.podGrabOwnerById.delete(podId);
    handState.grabbedPodId = null;
    handState.lastGrabPointLocal = null;
    handState.lastGrabAt = 0;
  }

  private clearHandState(handedness: "left" | "right", clearContacts: boolean): void {
    const handState = this.handPhysics.get(handedness);
    if (handState) {
      if (handState.grabbedPodId) {
        this.releaseGrab(handedness);
      }
      handState.openPalm = false;
      handState.pointingActive = false;
      handState.pinchActive = false;
      handState.pinchMidpointLocal = null;
      handState.pinchMidpointWorld = null;
      handState.pinchCandidateId = null;
      handState.fingertipTargetId = null;
      handState.grabbedPodId = null;
      handState.indexTipLocal = null;
      handState.lastGrabPointLocal = null;
      handState.lastGrabAt = 0;
      for (const [body, debugMesh] of [
        [handState.palmBody, handState.palmDebugMesh],
        [handState.thumbBody, handState.thumbDebugMesh],
        [handState.indexBody, handState.indexDebugMesh],
        [handState.middleBody, handState.middleDebugMesh],
      ] as const) {
        body.setTranslation({ x: 0, y: HAND_PARK_Y, z: 0 }, false);
        body.setLinvel({ x: 0, y: 0, z: 0 }, false);
        body.setAngvel({ x: 0, y: 0, z: 0 }, false);
        if (debugMesh) {
          debugMesh.position.set(0, HAND_PARK_Y, 0);
        }
      }
    }

    if (clearContacts) {
      this.clearPalmContacts(handedness);
    }
  }

  private processOpenPalmContacts(handedness: "left" | "right"): void {
    const handState = this.handPhysics.get(handedness);
    if (!handState || !handState.openPalm || handState.grabbedPodId) {
      this.clearPalmContacts(handedness);
      return;
    }

    const touchedContacts = new Set<string>();
    for (const slaveId of this.collectPodIntersections(handState.palmCollider)) {
      const entry = this.meshById.get(slaveId);
      if (!entry) {
        continue;
      }

      const status = String(entry.group.userData["status"] ?? "");
      if (status === "SLAVE_STATUS_GONE") {
        continue;
      }

      const contactKey = `${handedness}:${slaveId}`;
      touchedContacts.add(contactKey);

      if (!this.activePalmContacts.has(contactKey)) {
        this.activePalmContacts.add(contactKey);
        this.startPodCrush(slaveId);
      }
    }

    this.clearPalmContacts(handedness, touchedContacts);
  }

  private collectPodIntersections(collider: RAPIER.Collider): Set<string> {
    const touched = new Set<string>();
    if (!this.physicsWorld) {
      return touched;
    }

    this.physicsWorld.intersectionPairsWith(collider, (otherCollider) => {
      const slaveId = this.podIdByColliderHandle.get(otherCollider.handle);
      if (slaveId) {
        touched.add(slaveId);
      }
    });

    return touched;
  }

  private findPinchCandidate(handState: HandPhysicsState): string | null {
    const thumbHits = this.collectPodIntersections(handState.thumbCollider);
    const indexHits = this.collectPodIntersections(handState.indexCollider);
    const middleHits = this.collectPodIntersections(handState.middleCollider);

    for (const slaveId of thumbHits) {
      if (!indexHits.has(slaveId)) {
        continue;
      }

      const entry = this.meshById.get(slaveId);
      if (!this.isPodInteractable(slaveId, entry)) {
        continue;
      }

      if (middleHits.has(slaveId)) {
        return slaveId;
      }
    }

    for (const slaveId of thumbHits) {
      if (!indexHits.has(slaveId)) {
        continue;
      }

      const entry = this.meshById.get(slaveId);
      if (!this.isPodInteractable(slaveId, entry)) {
        continue;
      }

      return slaveId;
    }

    return null;
  }

  private findPointingTarget(handState: HandPhysicsState): string | null {
    if (!handState.indexTipLocal) {
      return null;
    }

    return this.findNearestLivePodId(
      this.collectPodIntersections(handState.indexCollider),
      handState.indexTipLocal,
    );
  }

  private findNearestLivePodId(
    candidates: Iterable<string>,
    pointLocal: THREE.Vector3 | null,
  ): string | null {
    let bestId: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const slaveId of candidates) {
      const entry = this.meshById.get(slaveId);
      if (!this.isPodInteractable(slaveId, entry)) {
        continue;
      }
      if (!entry) {
        continue;
      }

      if (!pointLocal) {
        return slaveId;
      }

      const position = this.podPhysicsById.get(slaveId)?.body.translation() ?? entry.group.position;
      const distance = Math.hypot(
        position.x - pointLocal.x,
        position.y - pointLocal.y,
        position.z - pointLocal.z,
      );

      if (distance < bestDistance) {
        bestDistance = distance;
        bestId = slaveId;
      }
    }

    return bestId;
  }

  private updateHudDebugState(
    leftWristTracked: boolean,
    trackedHands: ReadonlySet<"left" | "right">,
  ): void {
    const left = this.handPhysics.get("left");
    const right = this.handPhysics.get("right");
    const fingertipHand = left?.fingertipTargetId
      ? "left"
      : right?.fingertipTargetId
        ? "right"
        : null;

    this.hudDebugData = {
      leftTracked: leftWristTracked,
      rightTracked: trackedHands.has("right"),
      leftGesture: this.describeHandGesture(left, leftWristTracked),
      rightGesture: this.describeHandGesture(right, trackedHands.has("right")),
      pinchTargetId: left?.pinchCandidateId ?? right?.pinchCandidateId ?? null,
      grabTargetId: left?.grabbedPodId ?? right?.grabbedPodId ?? null,
      fingertipHand,
      fingertipTargetId: fingertipHand
        ? ((fingertipHand === "left" ? left?.fingertipTargetId : right?.fingertipTargetId) ?? null)
        : null,
      tableHeightCm: Math.round(this.boardSurfaceHeight * 100),
      tableAdjustingHand: this.hudSliderActiveHand,
    };
    this.refreshHud();
  }

  private describeHandGesture(
    handState: HandPhysicsState | undefined,
    tracked: boolean,
  ): HandGesture {
    if (!tracked || !handState) {
      return "TRACK LOST";
    }
    if (handState.grabbedPodId) {
      return "GRAB";
    }
    if (handState.pinchActive) {
      return "PINCH";
    }
    if (handState.pointingActive) {
      return "POINT";
    }
    if (handState.openPalm) {
      return "OPEN";
    }
    return "IDLE";
  }

  private refreshHud(): void {
    const signature = JSON.stringify([this.hudData, this.hudDebugData]);
    if (signature === this.lastHudSignature) {
      return;
    }
    this.lastHudSignature = signature;
    this.drawHud();
  }

  private resetHudDebugData(): void {
    this.hudDebugData = {
      leftTracked: false,
      rightTracked: false,
      leftGesture: "TRACK LOST",
      rightGesture: "TRACK LOST",
      pinchTargetId: null,
      grabTargetId: null,
      fingertipHand: null,
      fingertipTargetId: null,
      tableHeightCm: Math.round(this.boardSurfaceHeight * 100),
      tableAdjustingHand: null,
    };
    this.refreshHud();
  }

  private updatePointingHighlights(): void {
    const activeTargetId = this.currentFingertipTargetId();
    for (const [slaveId, entry] of this.meshById) {
      entry.pointOutline.visible =
        Boolean(activeTargetId) &&
        slaveId === activeTargetId &&
        this.isPodInteractable(slaveId, entry);
    }
  }

  private currentFingertipTargetId(): string | null {
    return (
      this.handPhysics.get("left")?.fingertipTargetId ??
      this.handPhysics.get("right")?.fingertipTargetId ??
      null
    );
  }

  private worldToBoardLocal(worldPoint: THREE.Vector3): THREE.Vector3 {
    return this.boardGroup.worldToLocal(worldPoint.clone());
  }

  private setupXRHands(): void {
    this.handModelFactory.setPath(HAND_PROFILE_ASSET_PATH);

    const leftHand = this.renderer.xr.getHand(0);
    const rightHand = this.renderer.xr.getHand(1);
    leftHand.add(this.handModelFactory.createHandModel(leftHand, "mesh"));
    rightHand.add(this.handModelFactory.createHandModel(rightHand, "mesh"));
    this.scene.add(leftHand);
    this.scene.add(rightHand);
  }

  private createColliderDebugBox(size: THREE.Vector3, color: string): ColliderDebugMesh {
    return new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      new THREE.MeshBasicMaterial({
        color,
        wireframe: true,
        transparent: true,
        opacity: 0.82,
        depthTest: false,
      }),
    );
  }

  private createColliderDebugSphere(radius: number, color: string): ColliderDebugMesh {
    return new THREE.Mesh(
      new THREE.SphereGeometry(radius, 14, 10),
      new THREE.MeshBasicMaterial({
        color,
        wireframe: true,
        transparent: true,
        opacity: 0.82,
        depthTest: false,
      }),
    );
  }

  private disposeHandDebugMeshes(handState: HandPhysicsState): void {
    for (const mesh of [
      handState.palmDebugMesh,
      handState.thumbDebugMesh,
      handState.indexDebugMesh,
      handState.middleDebugMesh,
    ]) {
      if (!mesh) {
        continue;
      }
      this.colliderDebugGroup.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
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
}

function jointPosition(pose: XRJointPose, reusableMatrix: THREE.Matrix4): THREE.Vector3 {
  reusableMatrix.fromArray(pose.transform.matrix);
  return new THREE.Vector3().setFromMatrixPosition(reusableMatrix);
}

function truncateText(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 3))}...`;
}

function formatHudId(value: string, maxLength = 18): string {
  if (value.length <= maxLength) {
    return value;
  }

  const head = Math.max(4, Math.floor((maxLength - 2) * 0.65));
  const tail = Math.max(4, maxLength - head - 2);
  return `${value.slice(0, head)}..${value.slice(-tail)}`;
}

function splitHudLines(value: string, lineLength: number): string[] {
  if (value.length <= lineLength) {
    return [value];
  }

  return [value.slice(0, lineLength), value.slice(lineLength)];
}

function hudLocalToCanvasX(localX: number, canvasWidth: number): number {
  return (localX / HUD_FACE_WIDTH + 0.5) * canvasWidth;
}

function hudLocalToCanvasY(localY: number, canvasHeight: number): number {
  return (0.5 - localY / HUD_FACE_HEIGHT) * canvasHeight;
}
