import * as THREE from "three";

import type { SlaveState } from "./types.ts";

interface PodSceneCallbacks {
  onSelect: (slaveId: string) => void;
  onHover: (slaveId: string | null) => void;
  onHit: (slaveId: string) => void;
}

interface PodMeshEntry {
  group: THREE.Group;
  shell: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  shield: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
}

function statusColor(pod: SlaveState): string {
  if (pod.status === "SLAVE_STATUS_GONE") {
    return "#2c2838";
  }
  if (pod.status === "SLAVE_STATUS_TERMINATING") {
    return "#f97316";
  }
  if (pod.infected) {
    return "#9ac54d";
  }
  if (pod.firewall) {
    return "#43b9f6";
  }
  return "#f4dcc1";
}

export class PodScene {
  private readonly container: HTMLElement;

  private readonly callbacks: PodSceneCallbacks;

  private readonly renderer: THREE.WebGLRenderer;

  private readonly scene: THREE.Scene;

  private readonly camera: THREE.PerspectiveCamera;

  private readonly raycaster = new THREE.Raycaster();

  private readonly pointer = new THREE.Vector2();

  private readonly meshById = new Map<string, PodMeshEntry>();

  private animationFrame = 0;

  private readonly resizeObserver: ResizeObserver;

  constructor(container: HTMLElement, callbacks: PodSceneCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#17120f");
    this.scene.fog = new THREE.Fog("#17120f", 8, 24);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(0, 7.5, 13);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.className = "pod-scene-canvas";
    this.container.append(this.renderer.domElement);

    this.scene.add(new THREE.AmbientLight("#fef3c7", 1.7));

    const keyLight = new THREE.DirectionalLight("#ffe6b5", 2.6);
    keyLight.position.set(8, 12, 10);
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight("#5bd0ff", 1.2);
    rimLight.position.set(-8, 5, -6);
    this.scene.add(rimLight);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(7.2, 48),
      new THREE.MeshStandardMaterial({
        color: "#2a1c17",
        roughness: 1,
        metalness: 0,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.75;
    this.scene.add(floor);

    this.renderer.domElement.addEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.addEventListener("pointerleave", this.handlePointerLeave);
    this.renderer.domElement.addEventListener("click", this.handleClick);
    this.renderer.domElement.addEventListener("dblclick", this.handleDoubleClick);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
    this.animate();
  }

  update(pods: SlaveState[], selectedPodId: string | null, hoveredPodId: string | null): void {
    const nextIds = new Set(pods.map((pod) => pod.slave_id));

    for (const [slaveId, entry] of this.meshById) {
      if (!nextIds.has(slaveId)) {
        this.scene.remove(entry.group);
        entry.shell.geometry.dispose();
        entry.shell.material.dispose();
        entry.shield.geometry.dispose();
        entry.shield.material.dispose();
        this.meshById.delete(slaveId);
      }
    }

    pods.forEach((pod, index) => {
      let entry = this.meshById.get(pod.slave_id);
      if (!entry) {
        entry = this.createPodMesh(pod.slave_id);
        this.meshById.set(pod.slave_id, entry);
        this.scene.add(entry.group);
      }

      const count = Math.max(pods.length, 1);
      const columns = Math.ceil(Math.sqrt(count));
      const row = Math.floor(index / columns);
      const column = index % columns;
      const spacing = 2.8;
      const offsetX = (columns - 1) * spacing * 0.5;
      const rows = Math.ceil(count / columns);
      const offsetZ = (rows - 1) * spacing * 0.5;

      entry.group.position.set(column * spacing - offsetX, -0.4, row * spacing - offsetZ);
      entry.group.userData["slaveId"] = pod.slave_id;
      entry.group.userData["stress"] = pod.stress;
      entry.group.userData["fear"] = pod.fear;
      entry.group.userData["status"] = pod.status;
      entry.group.userData["infected"] = pod.infected;
      entry.group.userData["firewall"] = pod.firewall;

      entry.shell.material.color.set(statusColor(pod));
      entry.shell.material.emissive.set(
        pod.status === "SLAVE_STATUS_TERMINATING"
          ? "#65250b"
          : pod.infected
            ? "#365314"
            : "#1f1720",
      );
      entry.shell.material.emissiveIntensity = pod.status === "SLAVE_STATUS_GONE" ? 0 : 0.45;
      entry.shell.scale.setScalar(pod.status === "SLAVE_STATUS_GONE" ? 0.4 : 1);
      entry.shell.position.y = pod.status === "SLAVE_STATUS_GONE" ? -0.9 : 0;

      entry.shield.visible = pod.firewall;
      entry.shield.material.opacity = pod.firewall ? 0.9 : 0;

      const isSelected = pod.slave_id === selectedPodId;
      const isHovered = pod.slave_id === hoveredPodId;
      const focusScale = isSelected ? 1.22 : isHovered ? 1.1 : 1;
      entry.group.scale.setScalar(focusScale);
    });
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    window.cancelAnimationFrame(this.animationFrame);
    this.renderer.domElement.removeEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.removeEventListener("pointerleave", this.handlePointerLeave);
    this.renderer.domElement.removeEventListener("click", this.handleClick);
    this.renderer.domElement.removeEventListener("dblclick", this.handleDoubleClick);
    this.renderer.dispose();
  }

  private createPodMesh(slaveId: string): PodMeshEntry {
    const group = new THREE.Group();
    group.userData["slaveId"] = slaveId;

    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(0.86, 32, 24),
      new THREE.MeshStandardMaterial({
        color: "#f4dcc1",
        roughness: 0.35,
        metalness: 0.05,
      }),
    );
    group.add(shell);

    const eyes = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 12, 12),
      new THREE.MeshBasicMaterial({ color: "#120d16" }),
    );
    eyes.position.set(-0.19, 0.12, 0.75);
    group.add(eyes);

    const eyesRight = eyes.clone();
    eyesRight.position.x = 0.19;
    group.add(eyesRight);

    const shield = new THREE.Mesh(
      new THREE.TorusGeometry(1.08, 0.08, 12, 40),
      new THREE.MeshBasicMaterial({
        color: "#49c8ff",
        transparent: true,
        opacity: 0.9,
      }),
    );
    shield.rotation.x = Math.PI / 2;
    shield.visible = false;
    group.add(shield);

    return { group, shell, shield };
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const slaveId = this.pick(event)?.userData["slaveId"];
    this.callbacks.onHover(typeof slaveId === "string" ? slaveId : null);
    this.renderer.domElement.style.cursor = slaveId ? "pointer" : "default";
  };

  private readonly handlePointerLeave = (): void => {
    this.callbacks.onHover(null);
    this.renderer.domElement.style.cursor = "default";
  };

  private readonly handleClick = (event: PointerEvent): void => {
    const slaveId = this.pick(event)?.userData["slaveId"];
    if (typeof slaveId === "string") {
      this.callbacks.onSelect(slaveId);
    }
  };

  private readonly handleDoubleClick = (event: MouseEvent): void => {
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
      Array.from(this.meshById.values(), (entry) => entry.shell),
      false,
    );

    return intersections[0]?.object ?? null;
  }

  private resize(): void {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private animate = (): void => {
    const now = performance.now() * 0.001;

    this.meshById.forEach((entry) => {
      const stress = Number(entry.group.userData["stress"] ?? 0);
      const fear = Number(entry.group.userData["fear"] ?? 0);
      const status = String(entry.group.userData["status"] ?? "");
      const infected = Boolean(entry.group.userData["infected"]);

      const wobble = status === "SLAVE_STATUS_GONE" ? 0 : 0.04 + stress * 0.0007 + fear * 0.0005;
      entry.group.position.y = -0.4 + Math.sin(now * 1.5 + entry.group.position.x) * wobble;
      entry.group.rotation.z = Math.sin(now * 2 + entry.group.position.z) * wobble * 0.8;
      entry.group.rotation.x = Math.cos(now * 1.4 + entry.group.position.x) * wobble * 0.4;
      entry.shield.rotation.z += entry.shield.visible ? 0.02 : 0;

      if (infected && status === "SLAVE_STATUS_LIVE") {
        entry.shell.material.emissiveIntensity = 0.55 + Math.sin(now * 4) * 0.08;
      }
    });

    this.renderer.render(this.scene, this.camera);
    this.animationFrame = window.requestAnimationFrame(this.animate);
  };
}
