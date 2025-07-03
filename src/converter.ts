import { Document, Primitive, PropertyType, Node } from '@gltf-transform/core';
import { DffParser, RwBinMesh, RwTextureCoordinate, RwTxd, RwVector3, TxdParser } from 'rw-parser';
import { dedup } from '@gltf-transform/functions';
import { mat4, quat, vec3 } from 'gl-matrix';
import { createPNGBufferFromRGBA } from './utils/imageUtils.js';
import { Bone, normalizeJoints, normalizeWeights } from './utils/skinUtils.js';
import { normalizeMatrix, quatFromRwMatrix } from './utils/matrixUtils.js';
import { computeNormals } from './utils/geometryUtils.js';
import { ModelType } from './types/ModelTypes.js';


export default async function dffToGltf (dff: Buffer, txd: Buffer, modelType?: ModelType, exportPath? :string): Promise<Document> {
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
    console.error(e + ' Cannot read .txd file.');
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