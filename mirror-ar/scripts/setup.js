import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

const rootDir = process.cwd();
const wasmSrc = path.join(rootDir, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const wasmDest = path.join(rootDir, 'public', 'mediapipe', 'wasm');
const modelDir = path.join(rootDir, 'public', 'models');
const modelDest = path.join(modelDir, 'face_landmarker.task');

async function setup() {
  console.log('Setting up MediaPipe assets...');

  if (fs.existsSync(wasmSrc)) {
    fs.mkdirSync(wasmDest, { recursive: true });
    const files = fs.readdirSync(wasmSrc);
    for (const file of files) {
      const srcFile = path.join(wasmSrc, file);
      const destFile = path.join(wasmDest, file);
      if (fs.existsSync(destFile) && fs.statSync(destFile).mtimeMs >= fs.statSync(srcFile).mtimeMs) {
        continue;
      }
      fs.copyFileSync(srcFile, destFile);
    }
    console.log('Copied MediaPipe WASM files to public/mediapipe/wasm');
  } else {
    console.warn('Warning: @mediapipe/tasks-vision not found in node_modules. Run npm install first.');
  }

  fs.mkdirSync(modelDir, { recursive: true });

  if (!fs.existsSync(modelDest)) {
    console.log('Downloading face_landmarker.task model...');
    const url = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download model: ${response.status} ${response.statusText}`);
    }
    await pipeline(response.body, fs.createWriteStream(modelDest));
    console.log('Downloaded face_landmarker.task to public/models');
  } else {
    console.log('Face landmarker model already exists locally.');
  }
}

setup().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
