import './style.css';
import * as THREE from 'three';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { FACE_MESH_INDICES, FACE_MESH_UVS } from './faceMeshData.js';

const video = document.querySelector('#webcam');
const preview = document.querySelector('.preview-frame');
const overlay = document.querySelector('#overlay');
const paintCanvas = document.querySelector('#paint-canvas');
const status = document.querySelector('#status');
const undoButton = document.querySelector('#undo-button');
const clearButton = document.querySelector('#clear-button');
const colorButtons = [...document.querySelectorAll('.swatch')];
const glitterButtons = [...document.querySelectorAll('.glitter-swatch')];
const customColor = document.querySelector('#custom-color');
const sizeInput = document.querySelector('#brush-size');
const strengthInput = document.querySelector('#brush-strength');
const softnessInput = document.querySelector('#brush-softness');
const sizeOutput = document.querySelector('#brush-size-value');
const strengthOutput = document.querySelector('#brush-strength-value');
const softnessOutput = document.querySelector('#brush-softness-value');

const paintContext = paintCanvas.getContext('2d', { willReadFrequently: true });
const baseColor = '#d4b5a0';
const canvasSize = 512;
const undoHistory = [];
const maxUndoSteps = 25;
let brushColor = '#ffffff';
let glitterMode = null;
let painting = false;
let previousPoint = null;
let landmarker = null;
let lastVideoTime = -1;

paintContext.fillStyle = baseColor;
paintContext.fillRect(0, 0, canvasSize, canvasSize);

const paintTexture = new THREE.CanvasTexture(paintCanvas);
paintTexture.colorSpace = THREE.SRGBColorSpace;
paintTexture.needsUpdate = true;

const renderer = new THREE.WebGLRenderer({
  canvas: overlay,
  alpha: true,
  antialias: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
camera.position.z = 2;

const geometry = new THREE.BufferGeometry();
const positions = new Float32Array(468 * 3);
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('uv', new THREE.BufferAttribute(FACE_MESH_UVS, 2));
geometry.setIndex(FACE_MESH_INDICES);

const faceMaterial = new THREE.MeshBasicMaterial({
  map: paintTexture,
  transparent: true,
  opacity: 0.88,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const faceMesh = new THREE.Mesh(geometry, faceMaterial);
faceMesh.visible = false;
scene.add(faceMesh);

function updateUndoButton() {
  undoButton.disabled = undoHistory.length === 0;
}

function saveUndoState() {
  undoHistory.push(paintContext.getImageData(0, 0, canvasSize, canvasSize));
  if (undoHistory.length > maxUndoSteps) undoHistory.shift();
  updateUndoButton();
}

function updateTexture() {
  paintTexture.needsUpdate = true;
}

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function paintDab(x, y, radius) {
  const softness = Number(softnessInput.value) / 100;
  const strength = Number(strengthInput.value) / 100;
  const edge = Math.max(0.01, 1 - softness);
  const { r, g, b } = hexToRgb(brushColor);
  const gradient = paintContext.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${strength})`);
  gradient.addColorStop(edge, `rgba(${r}, ${g}, ${b}, ${strength})`);
  gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  paintContext.fillStyle = gradient;
  paintContext.beginPath();
  paintContext.arc(x, y, radius, 0, Math.PI * 2);
  paintContext.fill();

  if (glitterMode) drawSparkles(x, y, radius, strength);
}

function drawSparkles(x, y, radius, strength) {
  const sparkleCount = Math.max(2, Math.round(radius / 4));
  const holoColors = ['#ffffff', '#b9f4ff', '#ffd4f4', '#fff2a8', '#c4b8ff'];

  for (let i = 0; i < sparkleCount; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * radius * 0.78;
    const size = 1 + Math.random() * Math.max(1.5, radius * 0.12);
    const sparkleX = x + Math.cos(angle) * distance;
    const sparkleY = y + Math.sin(angle) * distance;
    const color = glitterMode === 'gold'
      ? (Math.random() > 0.5 ? '#fff1ad' : '#f5bd3f')
      : holoColors[Math.floor(Math.random() * holoColors.length)];

    paintContext.globalAlpha = strength;
    paintContext.fillStyle = color;
    paintContext.beginPath();
    paintContext.arc(sparkleX, sparkleY, size, 0, Math.PI * 2);
    paintContext.fill();
    paintContext.beginPath();
    paintContext.arc(canvasSize - sparkleX, sparkleY, size, 0, Math.PI * 2);
    paintContext.fill();
  }
  paintContext.globalAlpha = 1;
}

function paintSymmetricDab(x, y, radius) {
  paintDab(x, y, radius);
  const mirroredX = canvasSize - x;
  if (Math.abs(mirroredX - x) > 0.5) paintDab(mirroredX, y, radius);
}

function paintSegment(from, to) {
  const brushRadius = Number(sizeInput.value) / 2;
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const spacing = Math.max(1, brushRadius * 0.28);
  const steps = Math.max(1, Math.ceil(distance / spacing));

  for (let i = 1; i <= steps; i += 1) {
    const amount = i / steps;
    const x = from.x + (to.x - from.x) * amount;
    const y = from.y + (to.y - from.y) * amount;
    paintSymmetricDab(x, y, brushRadius);
  }
  updateTexture();
}

function canvasPoint(event) {
  const rect = paintCanvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(canvasSize, ((event.clientX - rect.left) / rect.width) * canvasSize)),
    y: Math.max(0, Math.min(canvasSize, ((event.clientY - rect.top) / rect.height) * canvasSize)),
  };
}

paintCanvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 && event.pointerType === 'mouse') return;
  event.preventDefault();
  saveUndoState();
  painting = true;
  paintCanvas.setPointerCapture(event.pointerId);
  previousPoint = canvasPoint(event);
  paintSymmetricDab(previousPoint.x, previousPoint.y, Number(sizeInput.value) / 2);
  updateTexture();
});

paintCanvas.addEventListener('pointermove', (event) => {
  if (!painting || !previousPoint) return;
  const point = canvasPoint(event);
  paintSegment(previousPoint, point);
  previousPoint = point;
});

function endPainting() {
  painting = false;
  previousPoint = null;
}

paintCanvas.addEventListener('pointerup', endPainting);
paintCanvas.addEventListener('pointercancel', endPainting);
paintCanvas.addEventListener('lostpointercapture', endPainting);

undoButton.addEventListener('click', () => {
  const previous = undoHistory.pop();
  if (!previous) return;
  paintContext.putImageData(previous, 0, 0);
  updateTexture();
  updateUndoButton();
});

clearButton.addEventListener('click', () => {
  saveUndoState();
  paintContext.fillStyle = baseColor;
  paintContext.fillRect(0, 0, canvasSize, canvasSize);
  updateTexture();
});

function selectPaint(color, glitter = null, activeButton = null) {
  brushColor = color;
  glitterMode = glitter;
  for (const button of [...colorButtons, ...glitterButtons]) {
    button.classList.toggle('active', button === activeButton);
  }
}

for (const button of colorButtons) {
  button.addEventListener('click', () => selectPaint(button.dataset.color, null, button));
}

for (const button of glitterButtons) {
  button.addEventListener('click', () => {
    selectPaint(button.dataset.color, button.dataset.glitter, button);
  });
}

customColor.addEventListener('input', () => {
  selectPaint(customColor.value);
});

sizeInput.addEventListener('input', () => {
  sizeOutput.value = sizeInput.value;
});
strengthInput.addEventListener('input', () => {
  strengthOutput.value = `${strengthInput.value}%`;
});
softnessInput.addEventListener('input', () => {
  softnessOutput.value = `${softnessInput.value}%`;
});

function resizeRenderer() {
  const { width, height } = preview.getBoundingClientRect();
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  camera.left = -width / height;
  camera.right = width / height;
  camera.top = 1;
  camera.bottom = -1;
  camera.updateProjectionMatrix();
}

new ResizeObserver(resizeRenderer).observe(preview);
window.addEventListener('resize', resizeRenderer);
resizeRenderer();

async function initializeFaceTracker() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera access is unavailable. Use localhost or HTTPS and enable a camera.');
  }

  status.textContent = 'Loading face tracker…';
  const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
  const options = {
    baseOptions: {
      modelAssetPath: '/models/face_landmarker.task',
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numFaces: 1,
  };

  try {
    landmarker = await FaceLandmarker.createFromOptions(vision, options);
  } catch (gpuError) {
    console.warn('GPU face tracking initialization failed; retrying with CPU.', gpuError);
    landmarker = await FaceLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { modelAssetPath: '/models/face_landmarker.task', delegate: 'CPU' },
    });
    status.textContent = 'GPU unavailable — tracking on CPU';
  }

  status.textContent = 'Requesting camera access…';
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'user',
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  status.textContent = 'Looking for your face…';
}

function normalizedVideoPoint(landmark) {
  const bounds = preview.getBoundingClientRect();
  const videoAspect = video.videoWidth / video.videoHeight;
  const previewAspect = bounds.width / bounds.height;
  let x = 1 - landmark.x;
  let y = landmark.y;

  if (videoAspect > previewAspect) {
    const visibleWidth = previewAspect / videoAspect;
    x = (x - (1 - visibleWidth) / 2) / visibleWidth;
  } else {
    const visibleHeight = videoAspect / previewAspect;
    y = (y - (1 - visibleHeight) / 2) / visibleHeight;
  }

  return { x, y };
}

function updateFaceMesh(landmarks) {
  const aspect = camera.right;
  for (let i = 0; i < 468; i += 1) {
    const landmark = landmarks[i];
    const point = normalizedVideoPoint(landmark);
    positions[i * 3] = (point.x * 2 - 1) * aspect;
    positions[i * 3 + 1] = 1 - point.y * 2;
    positions[i * 3 + 2] = -landmark.z * 0.35;
  }
  geometry.attributes.position.needsUpdate = true;
  faceMesh.visible = true;
  status.textContent = 'Face tracked — paint on the UV canvas';
}

function render(timestamp) {
  if (landmarker && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const results = landmarker.detectForVideo(video, timestamp);
    if (results.faceLandmarks?.length) {
      updateFaceMesh(results.faceLandmarks[0]);
    } else {
      faceMesh.visible = false;
      status.textContent = 'Looking for your face…';
    }
  }
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

async function start() {
  try {
    await initializeFaceTracker();
    resizeRenderer();
    requestAnimationFrame(render);
  } catch (error) {
    console.error('Mirror AR initialization failed:', error);
    status.textContent = error instanceof Error ? error.message : 'Could not start face tracking.';
  }
}

updateUndoButton();
start();
