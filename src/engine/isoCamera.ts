import * as THREE from 'three';

// Orthographic camera at a fixed downward angle (the "diorama" view). It follows a
// target, zooms, and turns in 90° steps so streets stay lined up with the screen.

export class IsoCamera {
  readonly camera: THREE.OrthographicCamera;
  readonly target = new THREE.Vector3();
  /** Half the visible height of the view in metres. */
  viewHalfHeight = 1250;
  minHalf = 60;
  maxHalf = 1700;
  /** Keep the view target inside this rectangle (world metres). */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null;
  /** Looking down at this angle above the horizon (radians). */
  pitch = THREE.MathUtils.degToRad(55);
  private yaw = THREE.MathUtils.degToRad(45);
  private yawGoal = this.yaw;
  private aspect = 1;
  private readonly distance = 1200;

  constructor() {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
  }

  resize(width: number, height: number) {
    this.aspect = width / Math.max(1, height);
    this.applyFrustum();
  }

  /** When the player last panned, zoomed or turned the map themselves (ms, performance.now()). */
  lastUserInput = -Infinity;
  private zoomGoal: number | null = null;

  /** Glide to a zoom level (used by the camera director). */
  zoomTo(half: number) {
    this.zoomGoal = THREE.MathUtils.clamp(half, this.minHalf, this.maxHalf);
  }

  /** Glide so that every given point (world x, z) fits in view, with some margin. */
  frame(points: [number, number][], minHalf = 220, maxHalf = 1300) {
    if (!points.length) return;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of points) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    this.focus((minX + maxX) / 2, (minZ + maxZ) / 2);
    // The view is turned, so use the diagonal; the shorter screen side must hold it.
    const span = Math.hypot(maxX - minX, maxZ - minZ);
    this.zoomTo(THREE.MathUtils.clamp(span * 0.62 + 140, minHalf, maxHalf));
  }

  zoomBy(factor: number) {
    this.zoomGoal = null;
    this.lastUserInput = performance.now();
    this.viewHalfHeight = THREE.MathUtils.clamp(this.viewHalfHeight * factor, this.minHalf, this.maxHalf);
    this.applyFrustum();
  }

  /** Turn the view by quarter turns (+1 = clockwise). */
  rotate(quarters: number) {
    this.lastUserInput = performance.now();
    this.yawGoal += (quarters * Math.PI) / 2;
  }

  /** Turn the shortest way round so north is straight up the screen. */
  faceNorth() {
    this.yawGoal = Math.round(this.yawGoal / (Math.PI * 2)) * Math.PI * 2;
  }

  /** Back to the starting angle (north-west up, the diagonal diorama view). */
  resetAngle() {
    this.yawGoal = Math.round(this.yawGoal / (Math.PI * 2)) * Math.PI * 2 + THREE.MathUtils.degToRad(45);
  }

  /** Current heading of the camera. */
  get heading() {
    return this.yaw;
  }

  /** Pan by a screen-space amount in pixels (drag), given the canvas height in pixels. */
  panPixels(dx: number, dy: number, canvasHeight: number) {
    const perPixel = (2 * this.camera.top) / canvasHeight;
    // Screen right and screen "up" projected onto the ground.
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const ground = perPixel / Math.sin(this.pitch); // vertical screen distance stretches on the ground
    // Screen right on the ground is (cos, -sin); screen up is (-sin, -cos).
    this.target.x -= cos * dx * perPixel + sin * dy * ground;
    this.target.z -= -sin * dx * perPixel + cos * dy * ground;
    this.goal = null;
    this.zoomGoal = null;
    this.lastUserInput = performance.now();
    this.clampTarget();
  }

  /** Glide towards a point (used to follow the action). */
  focus(x: number, z: number) {
    this.goal = new THREE.Vector3(x, 0, z);
  }
  private goal: THREE.Vector3 | null = null;

  private clampTarget() {
    const b = this.bounds;
    if (!b) return;
    this.target.x = THREE.MathUtils.clamp(this.target.x, b.minX, b.maxX);
    this.target.z = THREE.MathUtils.clamp(this.target.z, b.minZ, b.maxZ);
  }

  update(dt: number, follow?: THREE.Vector3) {
    if (follow) this.target.lerp(follow, 1 - Math.exp(-dt * 8));
    if (this.goal) {
      this.target.lerp(this.goal, 1 - Math.exp(-dt * 4));
      if (this.target.distanceTo(this.goal) < 2) this.goal = null;
    }
    if (this.zoomGoal !== null) {
      this.viewHalfHeight += (this.zoomGoal - this.viewHalfHeight) * (1 - Math.exp(-dt * 4));
      if (Math.abs(this.zoomGoal - this.viewHalfHeight) < 1) this.zoomGoal = null;
      this.applyFrustum();
    }
    this.yaw += (this.yawGoal - this.yaw) * (1 - Math.exp(-dt * 10));
    const flat = Math.cos(this.pitch) * this.distance;
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * flat,
      this.target.y + Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * flat,
    );
    this.camera.lookAt(this.target);
  }

  private applyFrustum() {
    // viewHalfHeight sets the shorter side, so phones held upright still see enough of the map.
    const c = this.camera;
    const h = this.aspect >= 1 ? this.viewHalfHeight : (this.viewHalfHeight * 0.8) / this.aspect;
    c.top = h;
    c.bottom = -h;
    c.left = -h * this.aspect;
    c.right = h * this.aspect;
    c.updateProjectionMatrix();
  }
}
