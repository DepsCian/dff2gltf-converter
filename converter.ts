import { Document, Primitive, PropertyType, Node } from '@gltf-transform/core';
import { DffParser, RwBinMesh, RwMatrix3, RwTextureCoordinate, RwTxd, RwVector3, TxdParser, RwBone, RwFrame } from 'rw-parser';
import { PNG } from 'pngjs';
import { dedup } from '@gltf-transform/functions';
import { mat4, quat, vec3 } from 'gl-matrix';

interface Bone {
  name: string,
  boneData: RwBone,
  frameData: RwFrame
}

export default async function convertDffToGlb (dff: Buffer, txd: Buffer): Promise<Document> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene();
  const meshNode = doc.createNode('SkinnedMesh');
  const texturesMap: Map<String, Buffer> = new Map();

   /// TEXTURES
  try {
    const rwTxd: RwTxd = new TxdParser(txd).parse();

    if (rwTxd.textureDictionary.textureCount < 1) {
      throw new Error("Textures not found.");
    }
    for (const textureNative of rwTxd.textureDictionary.textureNatives) {
      const pngBuffer = await createPNGBufferFromRGBA(Buffer.from(textureNative.mipmaps[0]), textureNative.width, textureNative.height);
      texturesMap.set(textureNative.textureName, pngBuffer);
    }
  } catch(e) {
    console.error('Invalid .txd file.');
    return null;
  }

  // GEOMETRIES
  try {
    const rwDff = new DffParser(dff).parse();
  
    for (const rwGeometry of rwDff.geometryList.geometries) {
      const mesh = doc.createMesh();
      const rwTextureInfo = rwGeometry.textureMappingInformation;
      const rwUvsArray :RwTextureCoordinate[] = rwTextureInfo && rwTextureInfo.length > 0 ? rwTextureInfo[0] : undefined;
      const rwVerticesArray :RwVector3[] = rwGeometry.hasVertices && rwGeometry.vertexInformation.length > 0 ? rwGeometry.vertexInformation : undefined;
      const rwNormalsArray :RwVector3[] = rwGeometry.hasNormals && rwGeometry.normalInformation.length > 0 ? rwGeometry.normalInformation : undefined;
      const rwBinMesh :RwBinMesh = rwGeometry.binMesh && rwGeometry.binMesh.meshes.length > 0 ? rwGeometry.binMesh : undefined;

      if (rwTextureInfo == undefined || rwUvsArray == undefined || rwVerticesArray == undefined || rwBinMesh == undefined) {
        throw new Error(`Invalid .dff file.`);
      }
    
      const vertices = new Float32Array(rwVerticesArray.length * 3);
      rwVerticesArray.forEach((vertex, i) => {
        vertices[i * 3] = vertex.x;
        vertices[i * 3 + 1] = vertex.y;
        vertices[i * 3 + 2] = vertex.z;
      });
    
      const uvs = new Float32Array(rwUvsArray.length * 2);
      rwUvsArray.forEach((uv, i) => {
        uvs[i * 2] = uv.u;
        uvs[i * 2 + 1] = uv.v;
      });

      let normals = undefined;
    
      if (rwNormalsArray != undefined && rwBinMesh.meshCount == 1) {
        normals = new Float32Array(rwNormalsArray.length * 3);
        rwNormalsArray.forEach((normal, i) => {
          normals[i * 3] = normal.x;
          normals[i * 3 + 1] = normal.y;
          normals[i * 3 + 2] = normal.z;
        }); 
      }
  
      const positionsAccessor = doc.createAccessor().setType("VEC3").setArray(vertices);
      const uvsAccessor = doc.createAccessor().setType("VEC2").setArray(uvs);
      const sharedIndicesArray :number[] = [];
      rwGeometry.binMesh.meshes.forEach((mesh) => { sharedIndicesArray.push(...mesh.indices) });
      const indices :Uint32Array = new Uint32Array(sharedIndicesArray);

      if (normals == undefined || rwBinMesh.meshCount > 1) {
        normals = await computeNormals(vertices, indices);
      }

      const normalsAccessor = doc.createAccessor().setType("VEC3").setArray(normals);
      let primitiveMode = Primitive.Mode.TRIANGLES; // TRIANGLES for models and TRIANGLE.STRIP for cars

      for (const rwPrimitive of rwBinMesh.meshes) {
        const indices = new Uint32Array(rwPrimitive.indices);
        const materialIndex = rwPrimitive.materialIndex;
        const rwMaterial = rwGeometry.materialList.materialData[materialIndex];

        const material = doc.createMaterial(`${materialIndex}_Mtl`)
        .setBaseColorFactor([1, 1, 1, 1])
        .setMetallicFactor(0)
        .setRoughnessFactor(1);

        if (rwMaterial.isTextured) {
          const textureName = rwMaterial.texture.textureName;
          const pngBuffer :Buffer = texturesMap.get(textureName);
          if (pngBuffer != undefined) {
            const texture = doc.createTexture()
            .setImage(pngBuffer)
            .setMimeType("image/png")
            .setName(textureName);

          material.setBaseColorTexture(texture);
          } else {
            console.error(`Texture ${textureName} not found in .txd`);
          }

        }

        // WEIGHTS / JOINTS
        const jointsArray = []
        for (const bonesMap of rwGeometry.skin.boneVertexIndices) {
          jointsArray.push(...bonesMap);
        }

        const weightsArray = []
        for (const weights of rwGeometry.skin.vertexWeights) {
          weightsArray.push(...normalizeWeights(weights));
        }
        const normalizedJoints = normalizeJoints(jointsArray, weightsArray);
        const jointsData :Uint16Array = new Uint16Array(normalizedJoints);
        const weightsData :Float32Array = new Float32Array(weightsArray);
  
        let primitive = doc.createPrimitive() 
          .setMode(primitiveMode)
          .setAttribute("POSITION", positionsAccessor)
          .setMaterial(material)
          .setAttribute("TEXCOORD_0", uvsAccessor)
          .setIndices(doc.createAccessor()
            .setType("SCALAR")
            .setArray(indices))
          .setAttribute("NORMAL", normalsAccessor)
          .setAttribute('JOINTS_0', doc.createAccessor()
            .setType('VEC4')
            .setArray(jointsData))
          .setAttribute('WEIGHTS_0', doc.createAccessor()
            .setType('VEC4')
            .setArray(weightsData));
        mesh.addPrimitive(primitive);
      }

      meshNode.setMesh(mesh);
      scene.addChild(meshNode);
    }
    
    // SKELETON
    try {
      const rwFrames = rwDff.frameList.frames;
      const skin = doc.createSkin('Skin');
      meshNode.setSkin(skin); 
      let bones :Node[] = [];
      let bonesTable :Bone[] = [];
      const BONES_ORDER :number[] = [0, 1, 2, 3, 4, 5, 8, 6, 7, 31, 32, 33, 34, 35, 36, 21, 22, 23, 24, 25, 26, 302, 301, 201, 41, 42, 43, 44, 51, 52, 53, 54];
      const PARENTS_ORDER :number[] = [0, 1, 2, 3, 4, 5, 6, 6, 6, 5, 10, 11, 12, 13, 14, 5, 16, 17, 18, 19, 20, 4, 4, 3, 2, 25, 26, 27, 2, 29, 30, 31];
      rwDff.animNodes.unshift({boneId: -1 , bones: [], bonesCount: 0});

      for (let i = 0; i < rwFrames.length; i++) {
        let boneId = rwDff.animNodes[i].boneId;
        bonesTable.push({
          name: rwDff.dummies[i-1],
          boneData: {
            boneId: boneId, 
            boneIndex: BONES_ORDER.indexOf(boneId) + 1,
            flags: 0
          },
          frameData: {
            parentFrame: PARENTS_ORDER[BONES_ORDER.indexOf(boneId)],
            coordinatesOffset: rwFrames[i].coordinatesOffset,
            rotationMatrix: rwFrames[i].rotationMatrix
          }
        });
      }
      bonesTable.sort((a, b) => a.boneData.boneIndex > b.boneData.boneIndex ? 1 : -1);

      for (const rwBone of bonesTable) {
        const frame = rwBone.frameData;
        const translationVector :vec3 = [frame.coordinatesOffset.x, frame.coordinatesOffset.y, frame.coordinatesOffset.z];
        const rotationQuat :quat = await quatFromRwMatrix(frame.rotationMatrix);
        quat.normalize(rotationQuat, rotationQuat);
  
        if (frame.parentFrame == undefined) { 
          bones.push(undefined);
          continue;
        }
  
        const bone = doc.createNode(rwBone.name)
              .setTranslation(translationVector)
              .setRotation([rotationQuat[0], rotationQuat[1], rotationQuat[2], rotationQuat[3]])
              .setScale([1, 1, 1]);
  
        if (frame.parentFrame == 0) { 
          skin.addJoint(bone);
          scene.addChild(bone);
          bones.push(bone);
          continue;
        }

        skin.addJoint(bone);
        bones.push(bone);
        bones[frame.parentFrame].addChild(bone);
     }

     // IBM
      let inverseBindMatrices :number[]= [];
      const rwInverseBindMatrices = rwDff.geometryList.geometries[0].skin.inverseBoneMatrices;
      for (let ibm of rwInverseBindMatrices) {
        inverseBindMatrices.push(...[
          ibm.right.x, ibm.right.y, ibm.right.z, ibm.right.t, 
          ibm.up.x,    ibm.up.y,    ibm.up.z,    ibm.up.t, 
          ibm.at.x,    ibm.at.y,    ibm.at.z,    ibm.at.t, 
          ibm.transform.x, ibm.transform.y, ibm.transform.z, ibm.transform.t] );
      }

      const correctedInverseBindMatrices :number[] = [];
      for (let i = 0; i < rwInverseBindMatrices.length; i++) {
        const matrix :mat4 = new Float32Array(inverseBindMatrices.slice(i * 16, (i + 1) * 16));
        correctedInverseBindMatrices.push(...normalizeMatrix(matrix));
     }
      const inverseBindMatricesAccessor = doc.createAccessor().setType('MAT4').setArray(new Float32Array(correctedInverseBindMatrices));
      skin.setInverseBindMatrices(inverseBindMatricesAccessor);

    } catch(e) {
      console.error(`${e} Cannot create skin data.`);
      return null;
    }

  } catch(e) {
    console.error(`${e} Cannot create geometry mesh.`)
    return null;
  }

  // POST-PROCESSING
  await doc.transform(dedup({propertyTypes: [ PropertyType.ACCESSOR ] }));
  //await doc.transform(normalize({ overwrite: false }));
  
  return doc;
}

async function createPNGBufferFromRGBA(rgbaBuffer: Buffer, width: number, height: number): Promise<Buffer> {
  return new Promise( (resolve, reject) => {
    const png = new PNG( { width, height, filterType: 4, colorType: 6 } );
    const chunks: Buffer[] = [];
    png.data = rgbaBuffer;
    png.pack()
      .on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      })
      .on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(buffer);
      })
      .on('error', (err: Error) => {
        reject(err);
      });
  });
}

async function quatFromRwMatrix (rwMatrix :RwMatrix3) :Promise<quat> {
  return quat.fromMat3(quat.create(), [rwMatrix.right.x, rwMatrix.right.y, rwMatrix.right.z,
    rwMatrix.up.x, rwMatrix.up.y, rwMatrix.up.z, 
    rwMatrix.at.x, rwMatrix.at.y, rwMatrix.at.z]); 
}

function normalizeJoints(jointsData :number[], weightsData :number[]) :number[] {
  if (jointsData.length != weightsData.length) {
    throw new Error("Length of joints and weights array is not equal.")
  }

  let normalizedJoints :number[] = [];
  for (let i = 0; i < jointsData.length; i += 4) {
    const weightsSubArr :number[] = [weightsData[i], weightsData[i+1], weightsData[i+2], weightsData[i+3]];
    let jointsSubArr :number[] = [jointsData[i], jointsData[i+1], jointsData[i+2], jointsData[i+3]];

    for (let j = 0; j < 4; j++) {
      if (weightsSubArr[j] == 0) {
        jointsSubArr[j] = 0;
      }
    }
    normalizedJoints.push(...jointsSubArr);
  }

  return normalizedJoints;
}

function normalizeWeights(weightsData :number[]) :number[] {
  let w1 = weightsData[0];
  let w2 = weightsData[1];
  let w3 = weightsData[2];
  let w4 = weightsData[3];
  const sum = w1 + w2 + w3 + w4;

  if (sum === 0) {
  w1 = 1.0;
  }

  else if (Math.abs(sum - 1.0) > 0.001) {
    w1 /= sum;
    w2 /= sum;
    w3 /= sum;
    w4 /= sum;
  }

  return [w1, w2, w3, w4];
}

async function computeNormals(positions :Float32Array, indices :Uint32Array) :Promise<Float32Array> {
  const vertexCount = positions.length / 3;
  const normals = new Float32Array(positions.length);
  const vertexToTriangles: Map<number, number[][]> = new Map();
  for (let i = 0; i < indices.length; i += 3) {
    const triangleIndices = [
      indices[i],
      indices[i + 1],
      indices[i + 2],
    ];

    if (triangleIndices[0] === triangleIndices[1] || triangleIndices[1] === triangleIndices[2] || triangleIndices[0] === triangleIndices[2]) {
      continue;
    }

    for (const index of triangleIndices) {
      if (!vertexToTriangles.has(index)) {
        vertexToTriangles.set(index, []);
      }
      vertexToTriangles.get(index)?.push([...triangleIndices]);
    }
  }

  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex++) {
    const triangles = vertexToTriangles.get(vertexIndex) || [];
    const normal = vec3.create();

    for (const triangleIndices of triangles) {
      const v0 = vec3.fromValues(
        positions[triangleIndices[0] * 3],
        positions[triangleIndices[0] * 3 + 1],
        positions[triangleIndices[0] * 3 + 2]
      );
      const v1 = vec3.fromValues(
        positions[triangleIndices[1] * 3],
        positions[triangleIndices[1] * 3 + 1],
        positions[triangleIndices[1] * 3 + 2]
      );
      const v2 = vec3.fromValues(
        positions[triangleIndices[2] * 3],
        positions[triangleIndices[2] * 3 + 1],
        positions[triangleIndices[2] * 3 + 2]
      );

      const edge1 = vec3.create();
      const edge2 = vec3.create();
      const triangleNormal = vec3.create();

      vec3.subtract(edge1, v1, v0);
      vec3.subtract(edge2, v2, v0);
      vec3.cross(triangleNormal, edge1, edge2);

      if (vec3.sqrLen(triangleNormal) === 0) {
        continue;
      }

      vec3.normalize(triangleNormal, triangleNormal);
      vec3.add(normal, normal, triangleNormal);
    }

    if (vec3.sqrLen(normal) === 0) {
      normal[1] = 1;
    }

    vec3.normalize(normal, normal);

    normals[vertexIndex * 3] = normal[0];
    normals[vertexIndex * 3 + 1] = normal[1];
    normals[vertexIndex * 3 + 2] = normal[2];
  }

  return normals;
}

function normalizeMatrix (matrix :mat4) :mat4 {
  const rotation = quat.create();
  const scale = vec3.create();
  const translation = vec3.create();

  mat4.getRotation(rotation, matrix);
  mat4.getScaling(scale, matrix);
  mat4.getTranslation(translation, matrix);

  const normalizedMatrix = mat4.fromRotationTranslationScale(
    mat4.create(),
    rotation,
    translation,
    [1, 1, 1]
  );

  return normalizedMatrix;
}