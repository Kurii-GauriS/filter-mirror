import './style.css';
import * as THREE from 'three';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { createFaceMaskGeometry } from '../faceMeshData.js';

const video = document.getElementById('webcam');
const canvas = document.getElementById('overlay');
const status = document.getElementById('status');

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
camera.position.z = 2;

const faceGroup = new THREE.Group();
scene.add(faceGroup);

const faceMask = new THREE.Mesh(
  createFaceMaskGeometry(),
  new THREE.MeshBasicMaterial({
    color: 0xff4f86,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  }),
);
faceMask.visible = false;
faceGroup.add(faceMask);

const glow = new THREE.Mesh(
  new THREE.CircleGeometry(1, 40),
  new THREE.MeshBasicMaterial({
    color: 0xff7bc7,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
  }),
);
glow.scale.set(1.3, 1.55, 1);
glow.visible = false;
faceGroup.add(glow);

let landmarker = null;
let lastFrameTime = -1;

function resizeRenderer() {
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resizeRenderer);

async function initFaceTracking() {
  status.textContent = 'Loading face tracker...';

  const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
  landmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: '/models/face_landmarker.task',
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numFaces: 1,
  });

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: 'user',
    },
    audio: false,
  });

  video.srcObject = stream;
  video.playsInline = true;
  video.muted = true;
  await video.play();

  status.textContent = 'Tracking your face';
}

function updateMaskFromLandmarks(landmarks) {
  const leftEye = landmarks[133];
  const rightEye = landmarks[362];
  const nose = landmarks[1];
  const mouth = landmarks[14];

  const centerX = (leftEye.x + rightEye.x) / 2;
  const centerY = (leftEye.y + rightEye.y + nose.y + mouth.y) / 4;
  const eyeDistance = Math.abs(rightEye.x - leftEye.x);
  const faceHeight = Math.max(1.2, Math.abs(mouth.y - nose.y) * 12);
  const faceWidth = Math.max(0.9, eyeDistance * 14);

  const dx = rightEye.x - leftEye.x;
  const dy = rightEye.y - leftEye.y;
  const rotation = Math.atan2(dy, dx);

  faceMask.visible = true;
  glow.visible = true;

  faceMask.position.set((centerX - 0.5) * 2.3, -(centerY - 0.5) * 2.3, -0.15);
  faceMask.rotation.z = -rotation;
  faceMask.scale.set(faceWidth, faceHeight, 1);

  glow.position.copy(faceMask.position);
  glow.rotation.z = faceMask.rotation.z;
  glow.scale.set(faceWidth * 1.3, faceHeight * 1.3, 1);
}

function renderLoop(timestamp) {
  if (landmarker && video.readyState >= 2) {
    const detectionTime = timestamp || performance.now();
    if (video.currentTime !== lastFrameTime) {
      lastFrameTime = video.currentTime;
      const results = landmarker.detectForVideo(video, detectionTime);

      if (results.faceLandmarks?.length) {
        updateMaskFromLandmarks(results.faceLandmarks[0]);
      } else {
        faceMask.visible = false;
        glow.visible = false;
      }
    }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(renderLoop);
}

async function start() {
  try {
    await initFaceTracking();
    requestAnimationFrame(renderLoop);
  } catch (error) {
    console.error(error);
    status.textContent = 'Camera access is blocked or unavailable.';
  }
}

start();
