import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const meshUrl = 'https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/mediapipe/modules/face_geometry/data/canonical_face_model.obj';
const outputPath = path.join(rootDir, 'src', 'faceMeshData.js');

function resolveObjIndex(index, length) {
  const parsed = Number.parseInt(index, 10);
  if (!Number.isInteger(parsed) || parsed === 0) {
    throw new Error(`Invalid OBJ index: ${index}`);
  }
  return parsed > 0 ? parsed - 1 : length + parsed;
}

export function parseFaceMeshObj(source) {
  const textureCoordinates = [];
  const uvByVertex = [];
  const triangleIndices = [];
  let vertexCount = 0;

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);

    if (parts[0] === 'v') {
      vertexCount += 1;
    } else if (parts[0] === 'vt') {
      textureCoordinates.push([Number(parts[1]), Number(parts[2])]);
    } else if (parts[0] === 'f') {
      const face = parts.slice(1).map((token) => {
        const [vertexIndex, textureIndex] = token.split('/');
        if (!vertexIndex || !textureIndex) {
          throw new Error('Face mesh OBJ faces must include vertex and UV indices.');
        }
        return {
          vertex: resolveObjIndex(vertexIndex, vertexCount),
          texture: resolveObjIndex(textureIndex, textureCoordinates.length),
        };
      });

      for (const corner of face) {
        if (corner.vertex < 0 || corner.vertex >= vertexCount ||
            corner.texture < 0 || corner.texture >= textureCoordinates.length) {
          throw new Error('Face mesh OBJ contains an out-of-range vertex or UV index.');
        }

        const uv = textureCoordinates[corner.texture];
        const previousUv = uvByVertex[corner.vertex];
        if (previousUv && (Math.abs(previousUv[0] - uv[0]) > 1e-6 ||
            Math.abs(previousUv[1] - uv[1]) > 1e-6)) {
          throw new Error(`OBJ vertex ${corner.vertex + 1} has multiple UV coordinates.`);
        }
        uvByVertex[corner.vertex] = uv;
      }

      for (let i = 1; i < face.length - 1; i += 1) {
        triangleIndices.push(face[0].vertex, face[i].vertex, face[i + 1].vertex);
      }
    }
  }

  if (vertexCount !== 468) {
    throw new Error(`Expected 468 canonical face vertices; found ${vertexCount}.`);
  }
  if (uvByVertex.some((uv) => !uv) || triangleIndices.length === 0) {
    throw new Error('Canonical face mesh is missing UV coordinates or triangles.');
  }

  return {
    uvs: uvByVertex.flatMap(([u, v]) => [u, v]),
    indices: triangleIndices,
  };
}

export async function generateFaceMesh() {
  const response = await fetch(meshUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch canonical face mesh: ${response.status} ${response.statusText}`);
  }

  const mesh = parseFaceMeshObj(await response.text());
  const formatArray = (values) => values.join(', ');
  const generatedFile = `// Generated from Google's canonical_face_model.obj by scripts/generateMesh.js.\n` +
    `export const FACE_MESH_UVS = new Float32Array([\n  ${formatArray(mesh.uvs)},\n]);\n` +
    `export const FACE_MESH_INDICES = new Uint16Array([\n  ${formatArray(mesh.indices)},\n]);\n`;

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, generatedFile, 'utf8');
  console.log(`Generated ${path.relative(rootDir, outputPath)} (${mesh.indices.length / 3} triangles).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  generateFaceMesh().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
