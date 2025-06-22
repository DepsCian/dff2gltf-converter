import { Document, Primitive, PropertyType, Node } from '@gltf-transform/core';
import { DffParser, RwBinMesh, RwMatrix3, RwTextureCoordinate, RwTxd, RwVector3, TxdParser } from 'rw-parser';
import { PNG } from 'pngjs';
import { dedup } from '@gltf-transform/functions';
import { quat, vec3, mat4, vec4 } from 'gl-matrix';

export default async function convertDffToGlb( dff: Buffer, txd: Buffer): Promise<Document> {

  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene();
  const meshNode = doc.createNode('SkinnedMesh');
  const texturesMap: Map<String, Buffer> = new Map();

   /// TEXTURES
  try {
    const rwTxd: RwTxd = new TxdParser(txd).parse();

    if (rwTxd.textureDictionary.textureCount < 1) {
      throw new Error;
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
        for (const vertexWeights of rwGeometry.skin.vertexWeights) {
          weightsArray.push(...vertexWeights);
        }
        const jointsData :Uint16Array = new Uint16Array(jointsArray);
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
    
    // SKIN
    try {
      const rwFrames = rwDff.frameList.frames;
      const skin = doc.createSkin('Skin');
      meshNode.setSkin(skin); 
      let bones :Node[] = [];
  
      for (let i = 0; i < rwFrames.length; i++) {
        const frame = rwFrames[i];
        const translationVector :vec3 = [frame.coordinatesOffset.x, frame.coordinatesOffset.y, frame.coordinatesOffset.z];
        const rotationQuat :quat = await quatFromRwMatrix(frame.rotationMatrix);
  
        if (frame.parentFrame == -1) { 
          bones.push(undefined);
          continue;
        }
  
        const bone = doc.createNode(rwDff.dummies[i-1])
              .setTranslation(translationVector)
              .setRotation([rotationQuat[0], rotationQuat[1], rotationQuat[2], rotationQuat[3]])
              .setScale([1, 1, 1]);
  
        if (frame.parentFrame == 0) { 
          skin.addJoint(bone);
          scene.addChild(bone);
          bones.push(bone)
          continue;
        }

        skin.addJoint(bone);
        bones.push(bone);
        bones[frame.parentFrame].addChild(bone);
      }

      let inverseBindMatrices :number[]= [];
      for(let ibm of rwDff.geometryList.geometries[0].skin.inverseBoneMatrices) {
        inverseBindMatrices.push(...[
          ibm.right.x, ibm.right.y, ibm.right.z, ibm.right.t, 
          ibm.up.x, ibm.up.y, ibm.up.z, ibm.up.t, 
          ibm.at.x, ibm.at.y, ibm.at.z, ibm.at.t, 
          ibm.transform.x, ibm.transform.y, ibm.transform.z, ibm.transform.t] );
      }
      inverseBindMatrices.forEach( function (this : number[], value, i) { this[i] = Math.abs(value) > 1e-5 ? value : 0; }, inverseBindMatrices);

      const correctedInverseBindMatrices :number[] = [];

      for (let i = 0; i < 32; i++) {
        const matrix = inverseBindMatrices.slice(i * 16, (i + 1) * 16);
        matrix[15] = 1.0;
        for (let j = 0; j < 16; j++) {
          if (Math.abs(matrix[j]) < 1e-4) matrix[j] = 0;
        }
        correctedInverseBindMatrices.push(...matrix);
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
  return new Promise((resolve, reject) => {
    const png = new PNG( { width, height, filterType: 4, colorType: 6 } );
    png.data = rgbaBuffer;

    const chunks: Buffer[] = [];
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