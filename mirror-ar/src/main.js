import './style.css';
import * as THREE from 'three';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { createFaceMaskGeometry } from '../faceMeshData.js';

const video = document.getElementById('webcam');
const canvas = document.getElementById('overlay');
const paintCanvas = document.getElementById('paintLayer');
const status = document.getElementById('status');
const clearButton = document.getElementById('clearPaint');

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
    opacity: 0.78,
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
    opacity: 0.2,
    side: THREE.DoubleSide,
  }),
);
glow.scale.set(1.3, 1.55, 1);
glow.visible = false;
faceGroup.add(glow);

const paintCtx = paintCanvas.getContext('2d');
let landmarker = null;
let lastFrameTime = -1;
let activeFace = { x: 0, y: 0, width: 0, height: 0, rotation: 0, visible: false };
let brushActive = false;
let lastPointer = { x: 0, y: 0 };

function resizeRenderer() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  paintCanvas.width = window.innerWidth * window.devicePixelRatio;
  paintCanvas.height = window.innerHeight * window.devicePixelRatio;
  paintCanvas.style.width = `${window.innerWidth}px`;
  paintCanvas.style.height = `${window.innerHeight}px`;
  paintCtx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
}

function getPaintPosition(event) {
  const rect = paintCanvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function pointInFace(x, y) {
  if (!activeFace.visible || activeFace.width <= 0 || activeFace.height <= 0) {
    return false;
  }

  const dx = x - activeFace.x;
  const dy = y - activeFace.y;
  const angle = -activeFace.rotation;
  const rx = dx * Math.cos(angle) - dy * Math.sin(angle);
  const ry = dx * Math.sin(angle) + dy * Math.cos(angle);
  const halfW = activeFace.width / 2;
  const halfH = activeFace.height / 2;

  const normX = rx / halfW;
  const normY = ry / halfH;
  return normX * normX + normY * normY <= 1.1;
}

function drawStroke(x, y) {
  if (!pointInFace(x, y)) {
    return;
  }

  paintCtx.beginPath();
  paintCtx.moveTo(lastPointer.x, lastPointer.y);
  paintCtx.lineTo(x, y);
  paintCtx.strokeStyle = '#ff76c1';
  paintCtx.lineWidth = 16;
  paintCtx.lineCap = 'round';
  paintCtx.lineJoin = 'round';
  paintCtx.shadowColor = 'rgba(255, 118, 193, 0.9)';
  paintCtx.shadowBlur = 14;
  paintCtx.stroke();
  paintCtx.shadowBlur = 0;
}

function handlePointerDown(event) {
  const pos = getPaintPosition(event);
  if (!pointInFace(pos.x, pos.y)) {
    return;
  }
  brushActive = true;
  lastPointer = pos;
  drawStroke(pos.x, pos.y);
}

function handlePointerMove(event) {
  if (!brushActive) {
    return;
  }
  const pos = getPaintPosition(event);
  if (!pointInFace(pos.x, pos.y)) {
    lastPointer = pos;
    return;
  }
  drawStroke(pos.x, pos.y);
  lastPointer = pos;
}

function handlePointerUp() {
  brushActive = false;
}

paintCanvas.addEventListener('pointerdown', handlePointerDown);
paintCanvas.addEventListener('pointermove', handlePointerMove);
paintCanvas.addEventListener('pointerup', handlePointerUp);
paintCanvas.addEventListener('pointerleave', handlePointerUp);
paintCanvas.addEventListener('pointercancel', handlePointerUp);

clearButton.addEventListener('click', () => {
  paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
});

window.addEventListener('resize', resizeRenderer);
resizeRenderer();

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

  activeFace = {
    x: (centerX - 0.5) * window.innerWidth,
    y: (0.5 - centerY) * window.innerHeight,
    width: faceWidth * window.innerWidth * 0.9,
    height: faceHeight * window.innerHeight * 0.74,
    rotation,
    visible: true,
  };

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
        activeFace.visible = false;
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
