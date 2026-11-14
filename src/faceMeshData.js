import * as THREE from 'three';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { FACE_MESH_UVS, FACE_MESH_INDICES } from './faceMeshData.js';

const video = document.getElementById('webcam');
const canvas = document.getElementById('overlay');

// 1. Initialize Three.js renderer and scene
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -10, 10);

// 2. Build the face geometry using the generated mesh data
const geometry = new THREE.BufferGeometry();
const positions = new Float32Array(468 * 3);
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('uv', new THREE.BufferAttribute(FACE_MESH_UVS, 2));
geometry.setIndex(FACE_MESH_INDICES);

// 3. Face paint material
const material = new THREE.MeshBasicMaterial({
  color: 0xff2a6d,
  transparent: true,
  opacity: 0.6,
  side: THREE.DoubleSide,
});

const faceMesh = new THREE.Mesh(geometry, material);
scene.add(faceMesh);

// 4. Initialize MediaPipe FaceLandmarker and webcam stream
async function init() {
  const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
  const landmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: '/models/face_landmarker.task',
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numFaces: 1,
  });

  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
  video.srcObject = stream;
  await new Promise((resolve) => (video.onloadedmetadata = resolve));

  let lastVideoTime = -1;

  function renderLoop(timestamp) {
    if (video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const results = landmarker.detectForVideo(video, timestamp);

      if (results.faceLandmarks?.length) {
        const landmarks = results.faceLandmarks[0];
        const posAttr = geometry.attributes.position;
        
        for (let i = 0; i < 468; i++) {
          posAttr.setXYZ(i, landmarks[i].x, -landmarks[i].y, -landmarks[i].z);
        }
        posAttr.needsUpdate = true;
        faceMesh.visible = true;
      } else {
        faceMesh.visible = false;
      }
    }

    renderer.render(scene, camera);
    requestAnimationFrame(renderLoop);
  }

  requestAnimationFrame(renderLoop);
}

init();