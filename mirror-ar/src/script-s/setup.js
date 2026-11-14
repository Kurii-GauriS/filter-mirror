import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

const wasmSrc = path.resolve('node_modules/@mediapipe/tasks-vision/wasm');
const wasmDest = path.resolve('public/mediapipe/wasm');
const modelDir = path.resolve('public/models');
const modelDest = path.join(modelDir, 'face_landmarker.task');

async function setup() {
  console.log('Setting up MediaPipe assets...');

  // 1. Copy MediaPipe WASM files from node_modules
  if (fs.existsSync(wasmSrc)) {
    fs.mkdirSync(wasmDest, { recursive: true });
    for (const file of fs.readdirSync(wasmSrc)) {
      fs.copyFileSync(path.join(wasmSrc, file), path.join(wasmDest, file));
    }
    console.log('Copied MediaPipe WASM files to public/mediapipe/wasm');
  } else {
    console.warn('Warning: @mediapipe/tasks-vision not found in node_modules. Run npm install first.');
  }

  // 2. Download face_landmarker.task model if missing
  fs.mkdirSync(modelDir, { recursive: true });
  if (!fs.existsSync(modelDest)) {
    console.log('Downloading face_landmarker.task model...');
    const url =
      'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download model: ${res.statusText}`);
    await pipeline(res.body, fs.createWriteStream(modelDest));
    console.log('Downloaded face_landmarker.task to public/models');
  } else {
    console.log('Face landmarker model already exists locally.');
  }
}

setup().catch(console.error);