import * as THREE from 'three';

// Glowing arrows arcing over the city: an attack (thick, in the attacker's colour) or a move of
// members (thinner, paler). They draw themselves from start to end, then fade on request.
// They render on top of the buildings so they're never hidden behind a tower.

type Kind = 'attack' | 'move';

interface Arrow {
  group: THREE.Group;
  tube: THREE.Mesh;
  head: THREE.Mesh;
  materials: THREE.MeshBasicMaterial[];
  grow: number; // 0..1
  fade: number | null; // seconds left while fading out
  indexCount: number;
}

export class Arrows {
  readonly group = new THREE.Group();
  private arrows: Arrow[] = [];

  constructor() {
    this.group.name = 'arrows';
  }

  /** Draw an arrow from one world point (x, z) to another. */
  show(from: [number, number], to: [number, number], color: string, kind: Kind = 'attack') {
    const [x0, z0] = from;
    const [x1, z1] = to;
    const d = Math.hypot(x1 - x0, z1 - z0) || 1;
    const lift = kind === 'attack' ? 45 : 30;
    const radius = kind === 'attack' ? Math.min(9, 3 + d / 140) : Math.min(5, 2 + d / 250);
    const headLen = radius * 7;
    // Stop short of the target so the head lands on it.
    const ux = (x1 - x0) / d, uz = (z1 - z0) / d;
    const start = new THREE.Vector3(x0, lift, z0);
    const end = new THREE.Vector3(x1 - ux * headLen, lift, z1 - uz * headLen);
    // A low arc: high ones look like vertical beams when they point along the view.
    const peak = new THREE.Vector3((x0 + x1) / 2, lift + Math.min(60, 15 + d * 0.08), (z0 + z1) / 2);
    const curve = new THREE.QuadraticBezierCurve3(start, peak, end);

    const c = new THREE.Color(color);
    if (kind === 'move') c.lerp(new THREE.Color('#ffffff'), 0.45);
    const bright = c.clone().multiplyScalar(kind === 'attack' ? 2.2 : 1.4); // over 1 so bloom catches it
    const mat = () =>
      new THREE.MeshBasicMaterial({ color: bright, transparent: true, opacity: kind === 'attack' ? 0.95 : 0.75, depthTest: false, depthWrite: false });
    const tubeMat = mat();
    const headMat = mat();

    const tubeGeo = new THREE.TubeGeometry(curve, 64, radius, 10, false);
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    const head = new THREE.Mesh(new THREE.ConeGeometry(radius * 3.4, headLen, 16), headMat);
    // Point the cone along the curve's end direction.
    const tangent = curve.getTangent(1).normalize();
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
    head.position.copy(end).addScaledVector(tangent, headLen / 2);
    head.visible = false;
    for (const m of [tube, head]) m.renderOrder = 10;

    const group = new THREE.Group();
    group.add(tube, head);
    this.group.add(group);
    const indexCount = tubeGeo.index!.count;
    tubeGeo.setDrawRange(0, 0);
    this.arrows.push({ group, tube, head, materials: [tubeMat, headMat], grow: 0, fade: null, indexCount });
  }

  /** Fade out every arrow. */
  fadeAll() {
    for (const a of this.arrows) if (a.fade === null) a.fade = 0.6;
  }

  clear() {
    for (const a of this.arrows) this.dispose(a);
    this.arrows = [];
  }

  update(dt: number) {
    for (const a of this.arrows) {
      if (a.grow < 1) {
        a.grow = Math.min(1, a.grow + dt / 0.45);
        // Draw whole rings only, so the tube grows cleanly along its length.
        const ring = 10 * 6;
        a.tube.geometry.setDrawRange(0, Math.floor((a.indexCount * a.grow) / ring) * ring);
        a.head.visible = a.grow >= 1;
      }
      if (a.fade !== null) {
        a.fade -= dt;
        const k = Math.max(0, a.fade / 0.6);
        a.materials.forEach((m) => (m.opacity = 0.95 * k));
      }
    }
    const gone = this.arrows.filter((a) => a.fade !== null && a.fade <= 0);
    gone.forEach((a) => this.dispose(a));
    this.arrows = this.arrows.filter((a) => !gone.includes(a));
  }

  private dispose(a: Arrow) {
    this.group.remove(a.group);
    a.tube.geometry.dispose();
    a.head.geometry.dispose();
    a.materials.forEach((m) => m.dispose());
  }
}
