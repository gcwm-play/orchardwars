import * as THREE from 'three';

// Orthographic camera at a fixed downward angle (the "diorama" view). It follows a
// target, zooms, and turns in 90° steps so streets stay lined up with the screen.

export class IsoCamera {
  readonly camera: THREE.OrthographicCamera;
  readonly target = new THREE.Vector3();
  /** Half the visible height of the view in metres. */
  viewHalfHeight = 38;
  minHalf = 18;
  maxHalf = 650;
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

  /** Current heading of the camera, used to make movement keys screen-relative. */
  get heading() {
    return this.yaw;
  }

  update(dt: number, follow?: THREE.Vector3) {
    if (follow) this.target.lerp(follow, 1 - Math.exp(-dt * 8));
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
    // viewHalfHeight sets the shorter side, so phones held upright still see enough street.
    const c = this.camera;
    const h = this.aspect >= 1 ? this.viewHalfHeight : (this.viewHalfHeight * 0.8) / this.aspect;
    c.top = h;
    c.bottom = -h;
    c.left = -h * this.aspect;
    c.right = h * this.aspect;
    c.updateProjectionMatrix();
  }
}
