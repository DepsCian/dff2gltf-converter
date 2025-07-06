import { Document, Primitive, PropertyType, Node, Scene } from '@gltf-transform/core';
import { DffParser, RwBinMesh, RwDff, RwGeometry, RwTextureCoordinate, RwTxd, RwVector3, TxdParser } from 'rw-parser';
import { dedup } from '@gltf-transform/functions';
import { mat4, quat, vec3 } from 'gl-matrix';
import { Bone, normalizeJoints, normalizeWeights } from '../utils/skin-utils.js';
import { normalizeMatrix, quatFromRwMatrix } from '../utils/matrix-utils.js';
import { computeNormals } from '../utils/geometry-utils.js';
import { createPNGBufferFromRGBA } from '../utils/image-utils.js';
import { ModelType } from '../constants/model-types.js';
import { DffConversionResult } from './dff-conversion-result.js';
import { BONES_ORDER, PARENTS_ORDER } from '../constants/rw-const.js';


export class DffConverter {
  dff: Buffer;
  txd: Buffer;
  modelType: ModelType;

  private _doc: Document;
  private _scene: Scene;
  private _meshNode: Node;
  private _texturesMap: Map<String, Buffer>;


  constructor (dff: Buffer, txd: Buffer, modelType: ModelType) {
    this.dff = dff;
    this.txd = txd;
    this.modelType = modelType;
  }
 

  async convertDffToGltf(): Promise<DffConversionResult> {
    this._doc = new Document();
    this._doc.createBuffer();
    this._scene = this._doc.createScene();
    this._meshNode = this._doc.createNode('Mesh');
    this._texturesMap = await this.convertTextures();

    try {
      if(this.modelType == ModelType.CAR) throw new Error("Car converter is not implemented right now.");
      const rwDff = new DffParser(this.dff).parse();
      for (const rwGeometry of rwDff.geometryList.geometries) {
        await this.convertGeometry(rwGeometry);
      }
     if (this.modelType == ModelType.SKIN) await this.convertSkinData(rwDff);

    } catch(e) {
      console.error(`${e} Cannot create geometry mesh.`)
      return null;
    }
    await this._doc.transform(dedup({propertyTypes: [ PropertyType.ACCESSOR ] }));
    
    return new DffConversionResult(this._doc);
  }



async convertTextures() :Promise<Map<String, Buffer>> {
  return new Promise(async (resolve, reject) => {
    const texturesMap = new Map();
    try { 
      const rwTxd: RwTxd = new TxdParser(this.txd).parse();
  
      if (rwTxd.textureDictionary.textureCount < 1) {
        throw new Error("Textures not found.");
      }
      for (const textureNative of rwTxd.textureDictionary.textureNatives) {
        const pngBuffer = await createPNGBufferFromRGBA(Buffer.from(textureNative.mipmaps[0]), textureNative.width, textureNative.height);
        if(pngBuffer == null || pngBuffer == undefined) throw new Error("PNG buffer from RGBA is empty. ");
        texturesMap.set(textureNative.textureName, pngBuffer);
      }
    } catch(e) {
      reject(e);
    }

    resolve(texturesMap);
  });
}


async convertSkinData(rwDff :RwDff) {
  try {
    const rwFrames = rwDff.frameList.frames;
    const skin = this._doc.createSkin('Skin');
    this._meshNode.setSkin(skin); 
    let bones :Node[] = [];
    let bonesTable :Bone[] = [];
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

      const bone = this._doc.createNode(rwBone.name)
            .setTranslation(translationVector)
            .setRotation([rotationQuat[0], rotationQuat[1], rotationQuat[2], rotationQuat[3]])
            .setScale([1, 1, 1]);

      if (frame.parentFrame == 0) { 
        skin.addJoint(bone);
        this._scene.addChild(bone);
        bones.push(bone);
        continue;
      }

      skin.addJoint(bone);
      bones.push(bone);
      bones[frame.parentFrame].addChild(bone);
   }

   // IBM
    let inverseBindMatrices: number[] = [];
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
    const inverseBindMatricesAccessor = this._doc.createAccessor().setType('MAT4').setArray(new Float32Array(correctedInverseBindMatrices));
    skin.setInverseBindMatrices(inverseBindMatricesAccessor);

  } catch(e) {
    console.error(`${e} Cannot create skin data.`);
  }
}


  async convertGeometry(rwGeometry :RwGeometry) {
    const mesh = this._doc.createMesh();
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
      
          const positionsAccessor = this._doc.createAccessor().setType("VEC3").setArray(vertices);
          const uvsAccessor = this._doc.createAccessor().setType("VEC2").setArray(uvs);
          const sharedIndicesArray :number[] = [];
          rwGeometry.binMesh.meshes.forEach((mesh) => { sharedIndicesArray.push(...mesh.indices) });
          const indices :Uint32Array = new Uint32Array(sharedIndicesArray);
    
          if (normals == undefined || rwBinMesh.meshCount > 1) {
            normals = await computeNormals(vertices, indices);
          }
    
          const normalsAccessor = this._doc.createAccessor().setType("VEC3").setArray(normals);
          let primitiveMode = this.modelType == ModelType.CAR ?  Primitive.Mode.TRIANGLE_STRIP : Primitive.Mode.TRIANGLES;
    
          for (const rwPrimitive of rwBinMesh.meshes) {
            const indices = new Uint32Array(rwPrimitive.indices);
            const materialIndex = rwPrimitive.materialIndex;
            const rwMaterial = rwGeometry.materialList.materialData[materialIndex];
    
            const material = this._doc.createMaterial(`${materialIndex}_Mtl`)
            .setBaseColorFactor([1, 1, 1, 1])
            .setMetallicFactor(0)
            .setRoughnessFactor(1);
    
            if (rwMaterial.isTextured) {
              const textureName = rwMaterial.texture.textureName;
              const pngBuffer :Buffer = this._texturesMap.get(textureName);
              if (pngBuffer != undefined) {
                const texture = this._doc.createTexture()
                .setImage(pngBuffer)
                .setMimeType("image/png")
                .setName(textureName);
    
              material.setBaseColorTexture(texture);
              } else {
                console.error(`Texture ${textureName} not found in .txd`);
              }
    
            }

            let primitive = this._doc.createPrimitive() 
            .setMode(primitiveMode)
            .setAttribute("POSITION", positionsAccessor)
            .setMaterial(material)
            .setAttribute("TEXCOORD_0", uvsAccessor)
            .setIndices(this._doc.createAccessor()
              .setType("SCALAR")
              .setArray(indices))
            .setAttribute("NORMAL", normalsAccessor);
    
            if(this.modelType == ModelType.SKIN) {
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
              primitive.setAttribute('JOINTS_0', this._doc.createAccessor()
                .setType('VEC4')
                .setArray(jointsData))
              .setAttribute('WEIGHTS_0', this._doc.createAccessor()
                .setType('VEC4')
                .setArray(weightsData));
            }

            mesh.addPrimitive(primitive);
          }

          this._meshNode.setMesh(mesh);
          this._scene.addChild(this._meshNode);
  }
}