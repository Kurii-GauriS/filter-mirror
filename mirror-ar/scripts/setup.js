import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { generateFaceMesh } from './generateMesh.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = path.join(rootDir, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const wasmDest = path.join(rootDir, 'public', 'mediapipe', 'wasm');
const modelDir = path.join(rootDir, 'public', 'models');
const modelDest = path.join(modelDir, 'face_landmarker.task');
const modelUrl = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function setup() {
  console.log('Setting up Mirror AR assets...');

  if (!(await exists(path.join(rootDir, 'src', 'faceMeshData.js')))) await generateFaceMesh();

  try {
    const files = await fs.readdir(wasmSrc);
    await fs.mkdir(wasmDest, { recursive: true });
    await Promise.all(files.map((file) =>
      fs.copyFile(path.join(wasmSrc, file), path.join(wasmDest, file)),
    ));
    console.log(`Copied ${files.length} MediaPipe WASM files.`);
  } catch (error) {
    throw new Error(`Could not copy MediaPipe WASM files from ${wasmSrc}: ${error.message}`, { cause: error });
  }

  await fs.mkdir(modelDir, { recursive: true });
  if (await exists(modelDest)) {
    console.log('Face landmarker model already exists.');
  } else {
    console.log('Downloading face_landmarker.task...');
    const response = await fetch(modelUrl);
    if (!response.ok || !response.body) {
      throw new Error(`Failed to download face landmarker model: ${response.status} ${response.statusText}`);
    }

    const temporaryPath = `${modelDest}.download`;
    try {
      await pipeline(Readable.fromWeb(response.body), createWriteStream(temporaryPath));
      await fs.rename(temporaryPath, modelDest);
    } catch (error) {
      await fs.rm(temporaryPath, { force: true });
      throw error;
    }
    console.log('Downloaded face landmarker model.');
  }
}

setup().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
