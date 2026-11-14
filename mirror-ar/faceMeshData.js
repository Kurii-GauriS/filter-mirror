import * as THREE from 'three';

export function createFaceMaskGeometry() {
  const shape = new THREE.Shape();
  const points = [];

  for (let i = 0; i <= 128; i += 1) {
    const angle = (i / 128) * Math.PI * 2;
    const offset = 0.14 + 0.06 * Math.sin(angle * 3.4);
    const x = Math.cos(angle) * (1.05 + offset);
    const y = Math.sin(angle) * (1.3 + 0.08 * Math.cos(angle * 2.5));
    points.push(new THREE.Vector2(x, y));
  }

  shape.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    shape.lineTo(points[i].x, points[i].y);
  }
  shape.closePath();

  return new THREE.ShapeGeometry(shape);
}