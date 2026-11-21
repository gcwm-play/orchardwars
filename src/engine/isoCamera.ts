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

  zoomBy(factor: number) {
    this.viewHalfHeight = THREE.MathUtils.clamp(this.viewHalfHeight * factor, this.minHalf, this.maxHalf);
    this.applyFrustum();
  }

  /** Turn the view by quarter turns (+1 = clockwise). */
  rotate(quarters: number) {
    this.yawGoal += (quarters * Math.PI) / 2;
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
