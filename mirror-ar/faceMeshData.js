import * as THREE from 'three';

export function createFaceMaskGeometry() {
  const shape = new THREE.Shape();
  const points = [];

  for (let i = 0; i <= 64; i += 1) {
    const angle = (i / 64) * Math.PI * 2;
    const x = Math.cos(angle) * 0.95;
    const y = Math.sin(angle) * 1.15;
    points.push(new THREE.Vector2(x, y));
  }

  shape.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    shape.lineTo(points[i].x, points[i].y);
  }
  shape.closePath();

  return new THREE.ShapeGeometry(shape);
}