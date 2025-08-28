"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DffConverter = void 0;
const core_1 = require("@gltf-transform/core");
const functions_1 = require("@gltf-transform/functions");
const rw_parser_1 = require("rw-parser");
const gl_matrix_1 = require("gl-matrix");
const model_types_1 = require("../constants/model-types");
const rw_versions_1 = require("../constants/rw-versions");
const geometry_utils_1 = require("../utils/geometry-utils");
const image_utils_1 = require("../utils/image-utils");
const matrix_utils_1 = require("../utils/matrix-utils");
const skin_utils_1 = require("../utils/skin-utils");
const dff_conversion_result_1 = require("./dff-conversion-result");
const dff_validator_1 = require("./dff-validator");
const model_type_utils_1 = require("../utils/model-type-utils");
class DffConverter {
    constructor(dff, txd) {
        this.dff = dff;
        this.txd = txd;
    }
    async convertDffToGltf() {
        try {
            this._doc = new core_1.Document();
            this._doc.createBuffer();
            this._scene = this._doc.createScene();
            this._meshNode = this._doc.createNode('Mesh');
            this._texturesMap = await this.convertTextures();
            const dffParser = new rw_parser_1.DffParser(this.dff);
            const rwDff = await dffParser.parse();
            this.modelType = (0, model_type_utils_1.mapRwModelType)(rwDff.modelType);
            dff_validator_1.DffValidator.validate(this.modelType, rwDff.versionNumber);
            for (const rwGeometry of rwDff.geometryList.geometries) {
                this.convertGeometryData(rwGeometry);
            }
            if (this.modelType === model_types_1.ModelType.SKIN) {
                this.convertSkinData(rwDff);
            }
            else if (this.modelType === model_types_1.ModelType.OBJECT) {
                this.correctModelRotation();
            }
            await this._doc.transform((0, functions_1.dedup)({ propertyTypes: [core_1.PropertyType.ACCESSOR, core_1.PropertyType.MESH, core_1.PropertyType.TEXTURE, core_1.PropertyType.MATERIAL] }));
            await this._doc.transform((0, functions_1.weld)());
            await this._doc.transform((0, functions_1.textureCompress)({ targetFormat: 'png', resize: [1024, 1024] }));
            return new dff_conversion_result_1.DffConversionResult(this._doc);
        }
        catch (e) {
            console.error(`${e}. DFF conversion aborted.`);
            throw e;
        }
    }
    extractGeometryData(rwGeometry) {
        const rwTextureInfo = rwGeometry.textureMappingInformation;
        const rwUvsArray = rwTextureInfo && rwTextureInfo.length > 0 ? rwTextureInfo[0] : undefined;
        const rwVerticesArray = rwGeometry.hasVertices && rwGeometry.vertexInformation.length > 0 ? rwGeometry.vertexInformation : undefined;
        const rwNormalsArray = rwGeometry.hasNormals && rwGeometry.normalInformation.length > 0 ? rwGeometry.normalInformation : undefined;
        const rwBinMesh = rwGeometry.binMesh && rwGeometry.binMesh.meshes.length > 0 ? rwGeometry.binMesh : undefined;
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
        const sharedIndicesArray = [];
        rwGeometry.binMesh.meshes.forEach((mesh) => { sharedIndicesArray.push(...mesh.indices); });
        const indices = new Uint32Array(sharedIndicesArray);
        let normals = undefined;
        if (rwNormalsArray != undefined && rwBinMesh.meshCount == 1) {
            normals = new Float32Array(rwNormalsArray.length * 3);
            rwNormalsArray.forEach((normal, i) => {
                normals[i * 3] = normal.x;
                normals[i * 3 + 1] = normal.y;
                normals[i * 3 + 2] = normal.z;
            });
        }
        if (normals == undefined || rwBinMesh.meshCount > 1) {
            normals = (0, geometry_utils_1.computeNormals)(vertices, indices);
        }
        return { vertices, uvs, normals };
    }
    createGeometryAccessors(vertices, uvs, normals) {
        const posAccessor = this._doc.createAccessor().setType('VEC3').setArray(vertices);
        const uvsAccessor = this._doc.createAccessor().setType('VEC2').setArray(uvs);
        const normAccessor = this._doc.createAccessor().setType('VEC3').setArray(normals);
        return { posAccessor, uvsAccessor, normAccessor };
    }
    async convertTextures() {
        try {
            const texturesMap = new Map();
            const rwTxd = new rw_parser_1.TxdParser(this.txd).parse();
            if (rwTxd.textureDictionary.textureCount < 1) {
                throw new Error('Textures not found.');
            }
            for (const texNative of rwTxd.textureDictionary.textureNatives) {
                const pngBuffer = await (0, image_utils_1.createPNGBufferFromRGBA)(Buffer.from(texNative.mipmaps[0]), texNative.width, texNative.height);
                if (pngBuffer == null || pngBuffer == undefined) {
                    throw new Error('PNG buffer is empty.');
                }
                texturesMap.set(texNative.textureName.toLowerCase(), pngBuffer);
            }
            return texturesMap;
        }
        catch (e) {
            console.error(`Error converting textures: ${e}`);
            throw e;
        }
    }
    convertGeometryData(rwGeometry) {
        const mesh = this._doc.createMesh();
        const { vertices, uvs, normals } = this.extractGeometryData(rwGeometry);
        const { posAccessor, uvsAccessor, normAccessor } = this.createGeometryAccessors(vertices, uvs, normals);
        const primitiveMode = core_1.Primitive.Mode.TRIANGLES;
        for (const rwPrimitive of rwGeometry.binMesh.meshes) {
            const indices = new Uint32Array(rwPrimitive.indices);
            const material = this.createMaterial(rwGeometry, rwPrimitive);
            let primitive = this._doc
                .createPrimitive()
                .setMode(primitiveMode)
                .setMaterial(material)
                .setIndices(this._doc.createAccessor().setType('SCALAR').setArray(indices))
                .setAttribute('POSITION', posAccessor)
                .setAttribute('TEXCOORD_0', uvsAccessor)
                .setAttribute('NORMAL', normAccessor);
            if (this.modelType === model_types_1.ModelType.SKIN) {
                this.addSkinAttributes(rwGeometry, primitive);
            }
            mesh.addPrimitive(primitive);
        }
        this._meshNode.setMesh(mesh);
        this._scene.addChild(this._meshNode);
    }
    createMaterial(rwGeometry, rwPrimitive) {
        const materialIndex = rwPrimitive.materialIndex;
        const rwMaterial = rwGeometry.materialList.materialData[materialIndex];
        const material = this._doc
            .createMaterial(`${materialIndex}_Mtl`)
            .setBaseColorFactor([1, 1, 1, 1])
            .setMetallicFactor(0)
            .setRoughnessFactor(1);
        if (rwMaterial.isTextured) {
            const textureName = rwMaterial.texture.textureName;
            const pngBuffer = this._texturesMap.get(textureName.toLowerCase());
            if (pngBuffer != undefined) {
                const texture = this._doc
                    .createTexture()
                    .setImage(pngBuffer)
                    .setMimeType('image/png').setName(textureName);
                material.setBaseColorTexture(texture);
            }
            else {
                console.error(`Texture ${textureName} not found in .txd`);
            }
        }
        return material;
    }
    addSkinAttributes(rwGeometry, primitive) {
        const jointsArray = [];
        for (const bonesMap of rwGeometry.skin.boneVertexIndices) {
            jointsArray.push(...bonesMap);
        }
        const weightsArray = [];
        for (const weights of rwGeometry.skin.vertexWeights) {
            weightsArray.push(...(0, skin_utils_1.normalizeWeights)(weights));
        }
        const normalizedJoints = (0, skin_utils_1.normalizeJoints)(jointsArray, weightsArray);
        const jointsData = new Uint16Array(normalizedJoints);
        const weightsData = new Float32Array(weightsArray);
        primitive
            .setAttribute('JOINTS_0', this._doc.createAccessor().setType('VEC4').setArray(jointsData))
            .setAttribute('WEIGHTS_0', this._doc.createAccessor().setType('VEC4').setArray(weightsData));
    }
    convertSkinData(rwDff) {
        try {
            const skin = this._doc.createSkin('Skin');
            this._meshNode.setSkin(skin);
            const rwFrames = rwDff.frameList.frames;
            const bones = [];
            let bonesTable = [];
            const order = [];
            for (const animNode of rwDff.animNodes) {
                if (animNode.bonesCount > 0) {
                    for (let i = 0; i < animNode.bones.length; i++) {
                        const bone = animNode.bones[i];
                        bonesTable.push({
                            name: rwDff.dummies[rwDff.versionNumber == rw_versions_1.RwVersion.SA ? i : i + 1],
                            boneData: {
                                boneId: rwDff.animNodes[rwDff.versionNumber == rw_versions_1.RwVersion.SA ? i : i + 1].boneId,
                                boneIndex: bone.boneIndex + 1,
                                flags: bone.flags,
                            },
                            frameData: {
                                parentFrame: rwFrames[i + 1].parentFrame,
                                coordinatesOffset: rwFrames[i + 1].coordinatesOffset,
                                rotationMatrix: rwFrames[i + 1].rotationMatrix,
                            },
                        });
                        order.push(bone.boneId);
                    }
                    break;
                }
            }
            const priority = {};
            order.forEach((id, index) => {
                priority[id] = index;
            });
            bonesTable.sort((a, b) => (priority[a.boneData.boneId] > priority[b.boneData.boneId] ? 1 : -1));
            const map = new Map();
            bonesTable.forEach((bone, i) => {
                map.set(bone.boneData.boneIndex, i + 1);
                bone.boneData.boneIndex = i + 1;
            });
            bonesTable.forEach((bone) => {
                bone.frameData.parentFrame = map.get(bone.frameData.parentFrame) ?? 0;
            });
            bonesTable.unshift({
                name: undefined,
                boneData: { boneId: -1, boneIndex: 0, flags: 0 },
                frameData: {
                    parentFrame: undefined,
                    coordinatesOffset: undefined,
                    rotationMatrix: undefined,
                },
            });
            for (const rwBone of bonesTable) {
                const frame = rwBone.frameData;
                if (frame.parentFrame === undefined) {
                    bones.push(undefined);
                    continue;
                }
                const translationVector = [
                    frame.coordinatesOffset.x,
                    frame.coordinatesOffset.y,
                    frame.coordinatesOffset.z,
                ];
                const rotationQuat = (0, matrix_utils_1.quatFromRwMatrix)(frame.rotationMatrix);
                gl_matrix_1.quat.normalize(rotationQuat, rotationQuat);
                const bone = this._doc
                    .createNode(rwBone.name)
                    .setTranslation(translationVector)
                    .setRotation([
                    rotationQuat[0],
                    rotationQuat[1],
                    rotationQuat[2],
                    rotationQuat[3]
                ])
                    .setScale([1, 1, 1]);
                skin.addJoint(bone);
                bones.push(bone);
                if (frame.parentFrame == 0) {
                    bone.setRotation([
                        matrix_utils_1.defaultSkinRotationQuat[0],
                        matrix_utils_1.defaultSkinRotationQuat[1],
                        matrix_utils_1.defaultSkinRotationQuat[2],
                        matrix_utils_1.defaultSkinRotationQuat[3]
                    ]);
                    this._scene.addChild(bone);
                    continue;
                }
                else {
                    bones[frame.parentFrame].addChild(bone);
                }
            }
            let inverseBindMatrices = [];
            const rwInverseBindMatrices = rwDff.geometryList.geometries[0].skin.inverseBoneMatrices;
            for (let ibm of rwInverseBindMatrices) {
                inverseBindMatrices.push(ibm.right.x, ibm.right.y, ibm.right.z, ibm.right.t, ibm.up.x, ibm.up.y, ibm.up.z, ibm.up.t, ibm.at.x, ibm.at.y, ibm.at.z, ibm.at.t, ibm.transform.x, ibm.transform.y, ibm.transform.z, ibm.transform.t);
            }
            const correctedInverseBindMatrices = [];
            for (let i = 0; i < rwInverseBindMatrices.length; i++) {
                const matrix = new Float32Array(inverseBindMatrices.slice(i * 16, (i + 1) * 16));
                correctedInverseBindMatrices.push(...(0, matrix_utils_1.normalizeMatrix)(matrix));
            }
            const inverseBindMatricesAccessor = this._doc
                .createAccessor()
                .setType('MAT4')
                .setName('InverseBindMatrices')
                .setArray(new Float32Array(correctedInverseBindMatrices));
            skin.setInverseBindMatrices(inverseBindMatricesAccessor);
        }
        catch (e) {
            console.error(`${e} Cannot create skin data.`);
            throw e;
        }
    }
    correctModelRotation() {
        this._meshNode.setRotation([
            matrix_utils_1.defaultObjectRotationQuat[0],
            matrix_utils_1.defaultObjectRotationQuat[1],
            matrix_utils_1.defaultObjectRotationQuat[2],
            matrix_utils_1.defaultObjectRotationQuat[3]
        ]);
    }
}
exports.DffConverter = DffConverter;
