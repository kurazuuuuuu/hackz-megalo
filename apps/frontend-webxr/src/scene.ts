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
  onDesktopBinding?: (key: ReservedDesktopBinding, targetId: string | null) => void;
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
  gustBoostUntil: number;
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
  palmCenterWorld: THREE.Vector3 | null;
  palmNormalWorld: THREE.Vector3 | null;
  palmLateralWorld: THREE.Vector3 | null;
  handUpWorld: THREE.Vector3 | null;
  palmVelocityWorld: THREE.Vector3 | null;
  lastPalmCenterWorld: THREE.Vector3 | null;
  lastPalmSampleAt: number;
  sweepSpeed: number;
  gustPoseActive: boolean;
  gustMotionLatch: boolean;
  gustCooldownUntil: number;
  wristRotationLocal: THREE.Quaternion | null;
  grabRotationOffset: THREE.Quaternion | null;
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
  gustStatus: string;
  tableHeightCm: number;
  tableAdjustingHand: "left" | "right" | null;
}

interface HandJointTracking {
  wristPose: XRJointPose | null;
  thumbWorld: THREE.Vector3 | null;
  indexWorld: THREE.Vector3 | null;
}

interface GustEntry {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  directionLocal: THREE.Vector3;
  remaining: number;
  hitPodIds: Set<string>;
  debugMesh: ColliderDebugMesh | null;
  particleMesh: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> | null;
}

type ReservedDesktopBinding = "KeyE" | "KeyR";

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
const DESKTOP_LOOK_SENSITIVITY = 0.0024;
const DESKTOP_MOVE_SPEED = 0.6;
const DESKTOP_MIN_PITCH = -Math.PI * 0.48;
const DESKTOP_MAX_PITCH = Math.PI * 0.48;
const DESKTOP_RETICLE_NDC = new THREE.Vector2(0, 0);
const GUST_COOLDOWN_MS = 680;
const GUST_SWEEP_SPEED = 0.17;
const GUST_SWEEP_RESET_SPEED = 0.07;
const GUST_PALM_VERTICAL_MAX_Y = 0.68;
const GUST_HAND_VERTICAL_MIN_Y = 0.34;
const GUST_BOARD_FACING_DOT = 0.12;
const GUST_SENSOR_RADIUS = 0.12;
const GUST_LIFETIME = 0.28;
const GUST_SPEED = 1.2;
const GUST_PUSH_SPEED = 1.44;
const GUST_UPWARD_SPEED = 0.66;
const GUST_BOOST_DURATION_MS = 420;
const GUST_MAX_HORIZONTAL_SPEED = 1.83;
const GUST_SOURCE_OFFSET = 0.035;
const GUST_PARTICLE_SEGMENTS = 18;
const GUST_PARTICLE_LENGTH = 0.22;
const GUST_PARTICLE_SPREAD = 0.08;

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

  private readonly gusts: GustEntry[] = [];

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

  private readonly desktopRaycaster = new THREE.Raycaster();

  private readonly tmpDirection = new THREE.Vector3();

  private readonly tmpRight = new THREE.Vector3();

  private readonly tmpMove = new THREE.Vector3();

  private readonly tmpVector = new THREE.Vector3();

  private readonly tmpVector2 = new THREE.Vector3();

  private readonly tmpVector3 = new THREE.Vector3();

  private readonly desktopPressedKeys = new Set<string>();

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
    gustStatus: "READY",
    tableHeightCm: Math.round(PodScene.DEFAULT_BOARD_SURFACE_HEIGHT * 100),
    tableAdjustingHand: null,
  };

  private lastHudSignature = "";

  private lastFrameTime = performance.now();

  private pinchLatch = false;

  private lastDisconnectAt = 0;

  private desktopInputActive = false;

  private desktopLookActive = false;

  private desktopYaw = 0;

  private desktopPitch = -0.24;

  private desktopTargetPodId: string | null = null;

  private desktopGustCooldownUntil = 0;

  private lastGustSource: "left" | "right" | "desktop" | null = null;

  constructor(container: HTMLElement, callbacks: PodSceneCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.resetDesktopCamera();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType("local-floor");
    this.applyRenderScale();
    this.renderer.setSize(this.container.clientWidth || 1, this.container.clientHeight || 1, false);
    this.renderer.domElement.className = "pod-scene-canvas";
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute("aria-label", "Desktop Pod scene");
    this.container.append(this.renderer.domElement);
    this.bindDesktopControls();

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

  setDesktopActive(active: boolean): void {
    if (this.desktopInputActive === active) {
      return;
    }

    this.desktopInputActive = active;

    if (active) {
      this.resize();
      this.renderer.domElement.focus();
      return;
    }

    this.exitPointerLock();
    this.desktopPressedKeys.clear();
    this.setDesktopLookActive(false);
    this.setDesktopTargetPod(null, false);
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
        this.createPodPhysics(pod.slave_id, entry.group.position, entry.group.quaternion);
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

    this.exitPointerLock();
    this.desktopPressedKeys.clear();
    this.setDesktopLookActive(false);
    this.setDesktopTargetPod(null, false);
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

    this.clearGusts();

    this.wristAnchor.visible = false;
    this.resetBoardPlacement();
    this.resetDesktopCamera();
    this.exitPointerLock();
    this.desktopPressedKeys.clear();
    this.setDesktopLookActive(false);
    this.setDesktopTargetPod(null, false);
    this.pinchLatch = false;
    this.lastDisconnectAt = 0;
    this.desktopGustCooldownUntil = 0;
    this.lastGustSource = null;
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
    this.unbindDesktopControls();
    this.exitPointerLock();
    this.desktopPressedKeys.clear();
    this.setDesktopLookActive(false);
    this.setDesktopTargetPod(null, false);

    for (const entry of this.meshById.values()) {
      this.disposePodEntry(entry);
    }
    this.meshById.clear();

    for (const podId of Array.from(this.podPhysicsById.keys())) {
      this.removePodPhysics(podId);
    }
    this.clearGusts();
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

  private bindDesktopControls(): void {
    this.renderer.domElement.addEventListener("contextmenu", this.handleDesktopContextMenu);
    this.renderer.domElement.addEventListener("pointerdown", this.handleDesktopPointerDown);
    this.renderer.domElement.addEventListener("dblclick", this.handleDesktopDoubleClick);
    window.addEventListener("pointermove", this.handleDesktopPointerMove);
    window.addEventListener("pointerup", this.handleDesktopPointerUp);
    window.addEventListener("keydown", this.handleDesktopKeyDown);
    window.addEventListener("keyup", this.handleDesktopKeyUp);
    window.addEventListener("blur", this.handleDesktopWindowBlur);
    document.addEventListener("pointerlockchange", this.handlePointerLockChange);
    document.addEventListener("pointerlockerror", this.handlePointerLockError);
  }

  private unbindDesktopControls(): void {
    this.renderer.domElement.removeEventListener("contextmenu", this.handleDesktopContextMenu);
    this.renderer.domElement.removeEventListener("pointerdown", this.handleDesktopPointerDown);
    this.renderer.domElement.removeEventListener("dblclick", this.handleDesktopDoubleClick);
    window.removeEventListener("pointermove", this.handleDesktopPointerMove);
    window.removeEventListener("pointerup", this.handleDesktopPointerUp);
    window.removeEventListener("keydown", this.handleDesktopKeyDown);
    window.removeEventListener("keyup", this.handleDesktopKeyUp);
    window.removeEventListener("blur", this.handleDesktopWindowBlur);
    document.removeEventListener("pointerlockchange", this.handlePointerLockChange);
    document.removeEventListener("pointerlockerror", this.handlePointerLockError);
  }

  private resetDesktopCamera(): void {
    this.desktopYaw = 0;
    this.desktopPitch = -0.24;
    this.camera.position.set(0, 0.36, 0.82);
    this.camera.rotation.order = "YXZ";
    this.applyDesktopCameraRotation();
  }

  private applyDesktopCameraRotation(): void {
    this.camera.rotation.set(this.desktopPitch, this.desktopYaw, 0);
    this.camera.updateMatrixWorld();
  }

  private setDesktopLookActive(active: boolean): void {
    if (this.desktopLookActive === active) {
      return;
    }

    this.desktopLookActive = active;
    this.renderer.domElement.classList.toggle("is-looking", active);
  }

  private setDesktopTargetPod(slaveId: string | null, notifyHover = true): void {
    if (this.desktopTargetPodId === slaveId) {
      return;
    }

    this.desktopTargetPodId = slaveId;
    if (notifyHover) {
      this.callbacks.onHover(slaveId);
    }
    this.updatePointingHighlights();
  }

  private isDesktopSceneActive(): boolean {
    return this.desktopInputActive && !this.renderer.xr.isPresenting;
  }

  private isPointerLocked(): boolean {
    return document.pointerLockElement === this.renderer.domElement;
  }

  private requestPointerLock(): void {
    if (!this.isDesktopSceneActive() || this.isPointerLocked()) {
      return;
    }

    this.renderer.domElement.focus();
    void this.renderer.domElement.requestPointerLock?.();
  }

  private exitPointerLock(): void {
    if (!this.isPointerLocked()) {
      return;
    }

    document.exitPointerLock?.();
  }

  private updateDesktopMovement(delta: number): void {
    if (!this.isDesktopSceneActive() || this.desktopPressedKeys.size === 0) {
      return;
    }

    this.camera.getWorldDirection(this.tmpDirection).normalize();
    this.tmpRight.crossVectors(this.tmpDirection, this.camera.up);
    if (this.tmpRight.lengthSq() > 1e-6) {
      this.tmpRight.normalize();
    }

    this.tmpMove.set(0, 0, 0);
    if (this.desktopPressedKeys.has("KeyW")) {
      this.tmpMove.add(this.tmpDirection);
    }
    if (this.desktopPressedKeys.has("KeyS")) {
      this.tmpMove.sub(this.tmpDirection);
    }
    if (this.desktopPressedKeys.has("KeyD")) {
      this.tmpMove.add(this.tmpRight);
    }
    if (this.desktopPressedKeys.has("KeyA")) {
      this.tmpMove.sub(this.tmpRight);
    }

    if (this.tmpMove.lengthSq() <= 1e-6) {
      return;
    }

    this.tmpMove.normalize().multiplyScalar(DESKTOP_MOVE_SPEED * delta);
    this.camera.position.add(this.tmpMove);
    this.camera.updateMatrixWorld();
  }

  private updateDesktopTargeting(): void {
    if (!this.isDesktopSceneActive()) {
      this.setDesktopTargetPod(null);
      return;
    }

    const targets = Array.from(this.meshById.values(), (entry) => entry.group);
    if (targets.length === 0) {
      this.setDesktopTargetPod(null);
      return;
    }

    this.camera.updateMatrixWorld();
    this.boardGroup.updateMatrixWorld(true);
    this.desktopRaycaster.setFromCamera(DESKTOP_RETICLE_NDC, this.camera);
    const intersections = this.desktopRaycaster.intersectObjects(targets, true);

    for (const intersection of intersections) {
      const slaveId = this.resolvePodIdFromObject(intersection.object);
      if (slaveId && this.isPodInteractable(slaveId)) {
        this.setDesktopTargetPod(slaveId);
        return;
      }
    }

    this.setDesktopTargetPod(null);
  }

  private resolvePodIdFromObject(object: THREE.Object3D | null): string | null {
    let current: THREE.Object3D | null = object;
    while (current) {
      const slaveId = current.userData["slaveId"];
      if (typeof slaveId === "string" && slaveId.length > 0) {
        return slaveId;
      }
      current = current.parent;
    }
    return null;
  }

  private readonly handleDesktopContextMenu = (event: MouseEvent): void => {
    if (!this.isDesktopSceneActive()) {
      return;
    }
    event.preventDefault();
  };

  private readonly handleDesktopPointerDown = (event: PointerEvent): void => {
    if (!this.isDesktopSceneActive()) {
      return;
    }

    this.renderer.domElement.focus();

    if (event.button === 2) {
      if (this.isPointerLocked()) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      this.setDesktopLookActive(true);
      try {
        this.renderer.domElement.setPointerCapture(event.pointerId);
      } catch {
        // Ignore capture failures; desktop look still works with window-level listeners.
      }
      return;
    }

    if (
      event.button !== 0 ||
      (this.desktopLookActive && !this.isPointerLocked()) ||
      !this.desktopTargetPodId
    ) {
      return;
    }

    const targetId = this.desktopTargetPodId;
    if (!this.isPodInteractable(targetId)) {
      return;
    }

    event.preventDefault();
    this.callbacks.onSelect(targetId);
    this.startPodCrush(targetId);
  };

  private readonly handleDesktopDoubleClick = (event: MouseEvent): void => {
    if (!this.isDesktopSceneActive()) {
      return;
    }

    event.preventDefault();
    this.requestPointerLock();
  };

  private readonly handleDesktopPointerMove = (event: PointerEvent): void => {
    if (!this.isDesktopSceneActive() || (!this.desktopLookActive && !this.isPointerLocked())) {
      return;
    }

    event.preventDefault();
    this.desktopYaw -= event.movementX * DESKTOP_LOOK_SENSITIVITY;
    this.desktopPitch = THREE.MathUtils.clamp(
      this.desktopPitch - event.movementY * DESKTOP_LOOK_SENSITIVITY,
      DESKTOP_MIN_PITCH,
      DESKTOP_MAX_PITCH,
    );
    this.applyDesktopCameraRotation();
  };

  private readonly handleDesktopPointerUp = (event: PointerEvent): void => {
    if (event.button !== 2) {
      return;
    }

    if (this.isPointerLocked()) {
      return;
    }

    this.setDesktopLookActive(false);
    try {
      this.renderer.domElement.releasePointerCapture(event.pointerId);
    } catch {
      // Capture may not be held, which is fine.
    }
  };

  private readonly handleDesktopKeyDown = (event: KeyboardEvent): void => {
    if (!this.isDesktopSceneActive() || shouldIgnoreKeyboardEvent(event)) {
      return;
    }

    const { code } = event;
    if (code === "Escape") {
      if (this.isPointerLocked()) {
        event.preventDefault();
        this.exitPointerLock();
        return;
      }
      if (this.desktopLookActive) {
        event.preventDefault();
        this.setDesktopLookActive(false);
      }
      return;
    }

    if (code === "KeyW" || code === "KeyA" || code === "KeyS" || code === "KeyD") {
      event.preventDefault();
      event.stopPropagation();
      this.desktopPressedKeys.add(code);
      return;
    }

    if (code === "KeyE" && !event.repeat) {
      event.preventDefault();
      event.stopPropagation();
      this.triggerDesktopGust();
      return;
    }

    if (code === "KeyR" && !event.repeat) {
      event.preventDefault();
      this.callbacks.onDesktopBinding?.(code, this.desktopTargetPodId);
    }
  };

  private readonly handleDesktopKeyUp = (event: KeyboardEvent): void => {
    if (!this.isDesktopSceneActive() || shouldIgnoreKeyboardEvent(event)) {
      return;
    }

    const { code } = event;
    if (code === "KeyW" || code === "KeyA" || code === "KeyS" || code === "KeyD") {
      event.preventDefault();
      this.desktopPressedKeys.delete(code);
    }
  };

  private readonly handleDesktopWindowBlur = (): void => {
    this.desktopPressedKeys.clear();
    this.setDesktopLookActive(false);
    this.exitPointerLock();
  };

  private readonly handlePointerLockChange = (): void => {
    const pointerLocked = this.isPointerLocked();
    this.renderer.domElement.classList.toggle("is-pointer-locked", pointerLocked);
    this.setDesktopLookActive(false);
    if (pointerLocked) {
      this.renderer.domElement.focus();
      return;
    }

    this.desktopPressedKeys.clear();
  };

  private readonly handlePointerLockError = (): void => {
    this.renderer.domElement.classList.remove("is-pointer-locked");
  };

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
      this.createPodPhysics(slaveId, entry.group.position, entry.group.quaternion);
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
      this.createPodPhysics(slaveId, entry.group.position, entry.group.quaternion);
    }
  }

  private createPodPhysics(
    slaveId: string,
    position: THREE.Vector3,
    rotation = new THREE.Quaternion(),
  ): void {
    if (!this.physicsWorld || this.podPhysicsById.has(slaveId)) {
      return;
    }

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w })
      .setLinearDamping(8)
      .setAngularDamping(18)
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
      gustBoostUntil: 0,
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
    if (this.desktopTargetPodId === slaveId) {
      this.setDesktopTargetPod(null, false);
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
      const gustText = this.hudDebugData.gustStatus;
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
      faceContext.fillText("GUST", 318, 360);

      faceContext.fillStyle = "#f3f7f9";
      faceContext.font = "600 15px monospace";
      faceContext.fillText(trackText, 128, 312);
      faceContext.fillText(gestureText, 128, 336);
      faceContext.fillText(pinchText, 128, 360);
      faceContext.fillText(grabText, 392, 312);
      faceContext.fillStyle = this.hudDebugData.fingertipTargetId ? "#a5edff" : "#f3f7f9";
      faceContext.fillText(fingertipText, 392, 336);
      faceContext.fillStyle = gustText.startsWith("CD") ? "#ffd3a0" : "#baf4ff";
      faceContext.fillText(gustText, 392, 360);

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
    this.desktopPressedKeys.clear();
    this.setDesktopLookActive(false);
    this.setDesktopTargetPod(null, false);
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
      this.updateDesktopMovement(delta);
      this.updateDesktopTargeting();
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

    this.advanceGusts(delta, nowMs);
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
        const maxHorizontalSpeed =
          nowMs < physicsEntry.gustBoostUntil
            ? GUST_MAX_HORIZONTAL_SPEED
            : POD_MAX_HORIZONTAL_SPEED;
        if (horizontalSpeed > maxHorizontalSpeed) {
          const scale = maxHorizontalSpeed / horizontalSpeed;
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

  private advanceGusts(delta: number, nowMs: number): void {
    if (!this.physicsWorld || this.gusts.length === 0) {
      return;
    }

    const expired: GustEntry[] = [];

    for (const gust of this.gusts) {
      gust.remaining -= delta;
      if (gust.remaining <= 0) {
        expired.push(gust);
        continue;
      }

      const translation = gust.body.translation();
      this.tmpVector
        .set(translation.x, translation.y, translation.z)
        .addScaledVector(gust.directionLocal, GUST_SPEED * delta);
      gust.body.setTranslation(
        { x: this.tmpVector.x, y: this.tmpVector.y, z: this.tmpVector.z },
        false,
      );
      if (gust.debugMesh) {
        gust.debugMesh.position.copy(this.tmpVector);
      }
      if (gust.particleMesh) {
        gust.particleMesh.position.copy(this.tmpVector);
        gust.particleMesh.material.opacity = 0.78 * Math.max(0.18, gust.remaining / GUST_LIFETIME);
      }
    }

    this.physicsWorld.propagateModifiedBodyPositionsToColliders();

    for (const gust of this.gusts) {
      if (gust.remaining <= 0) {
        continue;
      }

      for (const slaveId of this.collectPodIntersections(gust.collider)) {
        if (gust.hitPodIds.has(slaveId)) {
          continue;
        }
        gust.hitPodIds.add(slaveId);
        this.applyGustToPod(slaveId, gust.directionLocal, nowMs);
      }
    }

    for (const gust of expired) {
      this.removeGust(gust);
    }
  }

  private applyGustToPod(slaveId: string, directionLocal: THREE.Vector3, nowMs: number): void {
    if (!this.isPodInteractable(slaveId) || this.podGrabOwnerById.has(slaveId)) {
      return;
    }

    const physicsEntry = this.podPhysicsById.get(slaveId);
    if (!physicsEntry || !physicsEntry.body.isDynamic()) {
      return;
    }

    const currentVelocity = physicsEntry.body.linvel();
    this.tmpVector.copy(directionLocal).multiplyScalar(GUST_PUSH_SPEED);
    const nextVelocity = {
      x: currentVelocity.x + this.tmpVector.x,
      y: Math.max(currentVelocity.y + GUST_UPWARD_SPEED * 0.45, GUST_UPWARD_SPEED),
      z: currentVelocity.z + this.tmpVector.z,
    };

    physicsEntry.body.setLinvel(nextVelocity, true);
    physicsEntry.body.applyImpulse(
      {
        x: this.tmpVector.x * 0.14,
        y: GUST_UPWARD_SPEED * 0.22,
        z: this.tmpVector.z * 0.14,
      },
      true,
    );
    physicsEntry.gustBoostUntil = nowMs + GUST_BOOST_DURATION_MS;
    physicsEntry.nextImpulseAt =
      nowMs + POD_IMPULSE_INTERVAL_BASE_MS + Math.random() * POD_IMPULSE_INTERVAL_JITTER_MS;
  }

  private triggerDesktopGust(): void {
    if (!this.isDesktopSceneActive()) {
      return;
    }

    const nowMs = performance.now();
    if (nowMs < this.desktopGustCooldownUntil) {
      return;
    }

    const launch = this.createDesktopGustLaunch();
    if (!launch) {
      return;
    }

    if (this.launchGust(launch.sourceLocal, launch.directionLocal, "desktop")) {
      this.desktopGustCooldownUntil = nowMs + GUST_COOLDOWN_MS;
    }
  }

  private createDesktopGustLaunch(): {
    sourceLocal: THREE.Vector3;
    directionLocal: THREE.Vector3;
  } | null {
    this.camera.updateMatrixWorld();
    const cameraWorld = new THREE.Vector3();
    const directionWorld = new THREE.Vector3();
    this.camera.getWorldPosition(cameraWorld);
    this.camera.getWorldDirection(directionWorld);

    this.tmpVector.copy(directionWorld);
    this.tmpVector.y = 0;
    if (this.tmpVector.lengthSq() <= 1e-6) {
      this.tmpVector.set(0, 0, -1);
    } else {
      this.tmpVector.normalize();
    }

    const sourceWorld = new THREE.Vector3(
      cameraWorld.x,
      this.boardTopWorldY() + 0.08,
      cameraWorld.z,
    );

    return {
      sourceLocal: this.worldToBoardLocal(sourceWorld),
      directionLocal: this.worldDirectionToBoardLocal(this.tmpVector),
    };
  }

  private tryTriggerHandGust(handedness: "left" | "right"): void {
    const handState = this.handPhysics.get(handedness);
    if (!handState) {
      return;
    }

    if (!handState.gustPoseActive || handState.grabbedPodId || handState.pinchActive) {
      handState.gustMotionLatch = false;
      return;
    }

    if (handState.sweepSpeed <= GUST_SWEEP_RESET_SPEED) {
      handState.gustMotionLatch = false;
    }

    const nowMs = performance.now();
    if (
      nowMs < handState.gustCooldownUntil ||
      handState.gustMotionLatch ||
      handState.sweepSpeed < GUST_SWEEP_SPEED ||
      !handState.palmCenterWorld ||
      !handState.palmNormalWorld
    ) {
      return;
    }

    if (
      this.launchGust(
        this.worldToBoardLocal(handState.palmCenterWorld),
        this.worldDirectionToBoardLocal(handState.palmNormalWorld),
        handedness,
      )
    ) {
      handState.gustMotionLatch = true;
      handState.gustCooldownUntil = nowMs + GUST_COOLDOWN_MS;
    }
  }

  private isHandInGustPose(handState: HandPhysicsState): boolean {
    if (
      !handState.openPalm ||
      !handState.palmCenterWorld ||
      !handState.palmNormalWorld ||
      !handState.handUpWorld
    ) {
      return false;
    }

    return (
      Math.abs(handState.palmNormalWorld.y) <= GUST_PALM_VERTICAL_MAX_Y &&
      Math.abs(handState.handUpWorld.y) >= GUST_HAND_VERTICAL_MIN_Y &&
      this.handFacesBoard(handState)
    );
  }

  private handFacesBoard(handState: HandPhysicsState): boolean {
    if (!handState.palmCenterWorld || !handState.palmNormalWorld) {
      return false;
    }

    this.tmpVector
      .set(0, PodScene.BOARD_TOP_Y, 0)
      .applyMatrix4(this.boardGroup.matrixWorld)
      .sub(handState.palmCenterWorld);
    this.tmpVector.y = 0;
    this.tmpVector2.copy(handState.palmNormalWorld);
    this.tmpVector2.y = 0;

    if (this.tmpVector.lengthSq() <= 1e-6 || this.tmpVector2.lengthSq() <= 1e-6) {
      return false;
    }

    this.tmpVector.normalize();
    this.tmpVector2.normalize();
    return this.tmpVector.dot(this.tmpVector2) >= GUST_BOARD_FACING_DOT;
  }

  private launchGust(
    sourceLocal: THREE.Vector3,
    directionLocal: THREE.Vector3,
    source: "left" | "right" | "desktop",
  ): boolean {
    if (!this.physicsWorld) {
      return false;
    }

    const gustDirection = this.normalizeGustDirection(directionLocal);
    const gustStart = sourceLocal.clone().addScaledVector(gustDirection, GUST_SOURCE_OFFSET);
    gustStart.y = THREE.MathUtils.clamp(
      gustStart.y,
      PodScene.BOARD_TOP_Y + 0.045,
      PodScene.BOARD_TOP_Y + 0.18,
    );

    const body = this.physicsWorld.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        gustStart.x,
        gustStart.y,
        gustStart.z,
      ),
    );
    const collider = this.physicsWorld.createCollider(
      RAPIER.ColliderDesc.ball(GUST_SENSOR_RADIUS).setSensor(true),
      body,
    );

    let debugMesh: ColliderDebugMesh | null = null;
    if (COLLIDER_DEBUG_ENABLED) {
      debugMesh = this.createColliderDebugSphere(GUST_SENSOR_RADIUS, "#7fe8ff");
      debugMesh.position.copy(gustStart);
      this.colliderDebugGroup.add(debugMesh);
    }

    const particleMesh = this.createGustParticleMesh(gustDirection);
    particleMesh.position.copy(gustStart);
    this.boardGroup.add(particleMesh);

    this.gusts.push({
      body,
      collider,
      directionLocal: gustDirection,
      remaining: GUST_LIFETIME,
      hitPodIds: new Set<string>(),
      debugMesh,
      particleMesh,
    });
    this.lastGustSource = source;
    return true;
  }

  private normalizeGustDirection(directionLocal: THREE.Vector3): THREE.Vector3 {
    this.tmpVector.set(directionLocal.x, 0, directionLocal.z);
    if (this.tmpVector.lengthSq() <= 1e-6) {
      this.tmpVector.set(0, 0, -1);
    } else {
      this.tmpVector.normalize();
    }

    return this.tmpVector3.copy(this.tmpVector).setY(0.14).normalize();
  }

  private worldDirectionToBoardLocal(worldDirection: THREE.Vector3): THREE.Vector3 {
    const quaternion = new THREE.Quaternion();
    this.boardGroup.getWorldQuaternion(quaternion);
    return worldDirection.clone().normalize().applyQuaternion(quaternion.invert()).normalize();
  }

  private worldQuaternionToBoardLocal(worldQuaternion: THREE.Quaternion): THREE.Quaternion {
    const boardQuaternion = new THREE.Quaternion();
    this.boardGroup.getWorldQuaternion(boardQuaternion);
    return boardQuaternion.invert().multiply(worldQuaternion.clone()).normalize();
  }

  private createGustParticleMesh(
    directionLocal: THREE.Vector3,
  ): THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> {
    const positions = new Float32Array(GUST_PARTICLE_SEGMENTS * 2 * 3);
    let offset = 0;
    for (let index = 0; index < GUST_PARTICLE_SEGMENTS; index += 1) {
      const x = THREE.MathUtils.randFloatSpread(GUST_PARTICLE_SPREAD);
      const y = THREE.MathUtils.randFloatSpread(GUST_PARTICLE_SPREAD * 0.42);
      const startZ =
        -GUST_PARTICLE_LENGTH * THREE.MathUtils.randFloat(0.35, 0.9) +
        THREE.MathUtils.randFloatSpread(0.03);
      const endZ = startZ + THREE.MathUtils.randFloat(0.05, GUST_PARTICLE_LENGTH * 0.7);

      positions[offset++] = x;
      positions[offset++] = y;
      positions[offset++] = startZ;
      positions[offset++] = x;
      positions[offset++] = y;
      positions[offset++] = endZ;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));

    const material = new THREE.LineBasicMaterial({
      color: "#c7f6ff",
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const mesh = new THREE.LineSegments(geometry, material);
    mesh.renderOrder = 4;
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), directionLocal.clone());
    return mesh;
  }

  private boardTopWorldY(): number {
    return this.boardGroup.localToWorld(this.tmpVector.set(0, PodScene.BOARD_TOP_Y, 0)).y;
  }

  private removeGust(gust: GustEntry): void {
    const index = this.gusts.indexOf(gust);
    if (index >= 0) {
      this.gusts.splice(index, 1);
    }

    if (gust.debugMesh) {
      this.colliderDebugGroup.remove(gust.debugMesh);
      gust.debugMesh.geometry.dispose();
      gust.debugMesh.material.dispose();
    }
    if (gust.particleMesh) {
      this.boardGroup.remove(gust.particleMesh);
      gust.particleMesh.geometry.dispose();
      gust.particleMesh.material.dispose();
    }
    this.physicsWorld?.removeRigidBody(gust.body);
  }

  private clearGusts(): void {
    while (this.gusts.length > 0) {
      this.removeGust(this.gusts[this.gusts.length - 1]!);
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
        performance.now(),
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
    this.tryTriggerHandGust("left");
    this.tryTriggerHandGust("right");
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
    nowMs: number,
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

    const knuckleCenter = new THREE.Vector3();
    for (const knuckle of knuckles) {
      knuckleCenter.add(knuckle);
    }
    knuckleCenter.multiplyScalar(1 / knuckles.length);

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

    const wristRotation = jointRotation(wristPose, this.tmpMatrix);
    const palmNormalWorld = new THREE.Vector3(0, -1, 0).applyQuaternion(wristRotation).normalize();
    const handUpWorld = knuckleCenter.sub(wristPosition).normalize();
    const palmLateralWorld = new THREE.Vector3()
      .subVectors(knuckles[3] ?? palmCenter, knuckles[0] ?? wristPosition)
      .normalize();
    let sweepSpeed = 0;
    let palmVelocityWorld: THREE.Vector3 | null = null;

    if (handPhysics.lastPalmCenterWorld && handPhysics.lastPalmSampleAt > 0) {
      const elapsedSeconds = Math.max(1 / 120, (nowMs - handPhysics.lastPalmSampleAt) / 1000);
      palmVelocityWorld = palmCenter
        .clone()
        .sub(handPhysics.lastPalmCenterWorld)
        .multiplyScalar(1 / elapsedSeconds);
      sweepSpeed = Math.abs(palmVelocityWorld.dot(palmLateralWorld));
    }

    handPhysics.palmCenterWorld = palmCenter.clone();
    handPhysics.palmNormalWorld = palmNormalWorld;
    handPhysics.palmLateralWorld = palmLateralWorld;
    handPhysics.handUpWorld = handUpWorld;
    handPhysics.palmVelocityWorld = palmVelocityWorld;
    handPhysics.lastPalmCenterWorld = palmCenter.clone();
    handPhysics.lastPalmSampleAt = nowMs;
    handPhysics.sweepSpeed = sweepSpeed;
    handPhysics.gustPoseActive = this.isHandInGustPose(handPhysics);
    handPhysics.wristRotationLocal = this.worldQuaternionToBoardLocal(wristRotation);

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
      palmCenterWorld: null,
      palmNormalWorld: null,
      palmLateralWorld: null,
      handUpWorld: null,
      palmVelocityWorld: null,
      lastPalmCenterWorld: null,
      lastPalmSampleAt: 0,
      sweepSpeed: 0,
      gustPoseActive: false,
      gustMotionLatch: false,
      gustCooldownUntil: 0,
      wristRotationLocal: null,
      grabRotationOffset: null,
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
      if (handState.wristRotationLocal) {
        const targetRotation = handState.grabRotationOffset
          ? handState.wristRotationLocal.clone().multiply(handState.grabRotationOffset)
          : handState.wristRotationLocal;
        physicsEntry.body.setNextKinematicRotation({
          x: targetRotation.x,
          y: targetRotation.y,
          z: targetRotation.z,
          w: targetRotation.w,
        });
      }
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
    const currentRotation = physicsEntry.body.rotation();
    const currentRotationQuaternion = new THREE.Quaternion(
      currentRotation.x,
      currentRotation.y,
      currentRotation.z,
      currentRotation.w,
    );
    physicsEntry.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    physicsEntry.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    physicsEntry.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    physicsEntry.body.setTranslation({ x: target.x, y: target.y, z: target.z }, true);
    physicsEntry.body.setNextKinematicTranslation({ x: target.x, y: target.y, z: target.z });
    if (handState.wristRotationLocal) {
      handState.grabRotationOffset = handState.wristRotationLocal
        .clone()
        .invert()
        .multiply(currentRotationQuaternion);
      const targetRotation = handState.wristRotationLocal
        .clone()
        .multiply(handState.grabRotationOffset);
      physicsEntry.body.setRotation(
        {
          x: targetRotation.x,
          y: targetRotation.y,
          z: targetRotation.z,
          w: targetRotation.w,
        },
        true,
      );
      physicsEntry.body.setNextKinematicRotation({
        x: targetRotation.x,
        y: targetRotation.y,
        z: targetRotation.z,
        w: targetRotation.w,
      });
    } else {
      handState.grabRotationOffset = null;
    }
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
    handState.grabRotationOffset = null;
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
      handState.palmCenterWorld = null;
      handState.palmNormalWorld = null;
      handState.palmLateralWorld = null;
      handState.handUpWorld = null;
      handState.palmVelocityWorld = null;
      handState.lastPalmCenterWorld = null;
      handState.lastPalmSampleAt = 0;
      handState.sweepSpeed = 0;
      handState.gustPoseActive = false;
      handState.gustMotionLatch = false;
      handState.gustCooldownUntil = 0;
      handState.wristRotationLocal = null;
      handState.grabRotationOffset = null;
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
    if (!handState || !handState.openPalm || handState.grabbedPodId || handState.gustPoseActive) {
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
      gustStatus: this.describeGustStatus(),
      tableHeightCm: Math.round(this.boardSurfaceHeight * 100),
      tableAdjustingHand: this.hudSliderActiveHand,
    };
    this.refreshHud();
  }

  private describeGustStatus(): string {
    const nowMs = performance.now();
    const leftCooldown = Math.max(
      0,
      (this.handPhysics.get("left")?.gustCooldownUntil ?? 0) - nowMs,
    );
    const rightCooldown = Math.max(
      0,
      (this.handPhysics.get("right")?.gustCooldownUntil ?? 0) - nowMs,
    );
    const desktopCooldown = Math.max(0, this.desktopGustCooldownUntil - nowMs);
    const activeCooldown = Math.max(leftCooldown, rightCooldown, desktopCooldown);

    if (activeCooldown > 0) {
      const seconds = (activeCooldown / 1000).toFixed(1);
      const source =
        desktopCooldown >= leftCooldown && desktopCooldown >= rightCooldown
          ? "D"
          : leftCooldown >= rightCooldown
            ? "L"
            : "R";
      return `CD ${source} ${seconds}s`;
    }

    if (this.lastGustSource === "desktop") {
      return "DESKTOP READY";
    }
    if (this.lastGustSource === "left") {
      return "LEFT READY";
    }
    if (this.lastGustSource === "right") {
      return "RIGHT READY";
    }
    return "READY";
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
      gustStatus: "READY",
      tableHeightCm: Math.round(this.boardSurfaceHeight * 100),
      tableAdjustingHand: null,
    };
    this.refreshHud();
  }

  private updatePointingHighlights(): void {
    const activeTargetId = this.currentAimTargetId();
    for (const [slaveId, entry] of this.meshById) {
      entry.pointOutline.visible =
        Boolean(activeTargetId) &&
        slaveId === activeTargetId &&
        this.isPodInteractable(slaveId, entry);
    }
  }

  private currentAimTargetId(): string | null {
    if (this.renderer.xr.isPresenting) {
      return this.currentFingertipTargetId();
    }

    return this.desktopTargetPodId;
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

function jointRotation(pose: XRJointPose, reusableMatrix: THREE.Matrix4): THREE.Quaternion {
  reusableMatrix.fromArray(pose.transform.matrix);
  return new THREE.Quaternion().setFromRotationMatrix(reusableMatrix);
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

function shouldIgnoreKeyboardEvent(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return true;
  }

  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}
