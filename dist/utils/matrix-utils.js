"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultSkinRotationQuat = exports.defaultObjectRotationQuat = void 0;
exports.normalizeMatrix = normalizeMatrix;
exports.quatFromRwMatrix = quatFromRwMatrix;
const gl_matrix_1 = require("gl-matrix");
exports.defaultObjectRotationQuat = gl_matrix_1.vec4.fromValues(-0.7071068, 0, 0, 0.7071068);
exports.defaultSkinRotationQuat = gl_matrix_1.vec4.fromValues(0.5, 0.5, 0.5, -0.5);
function normalizeMatrix(matrix) {
    const rotation = gl_matrix_1.quat.create();
    const scale = gl_matrix_1.vec3.create();
    const translation = gl_matrix_1.vec3.create();
    gl_matrix_1.mat4.getRotation(rotation, matrix);
    gl_matrix_1.mat4.getScaling(scale, matrix);
    gl_matrix_1.mat4.getTranslation(translation, matrix);
    let normalizedMatrix = gl_matrix_1.mat4.fromRotationTranslationScale(gl_matrix_1.mat4.create(), rotation, translation, [1, 1, 1]);
    normalizedMatrix = gl_matrix_1.mat4.fromValues(...Array.from(normalizedMatrix).map((v) => isFinite(v) ? v : -1));
    return normalizedMatrix;
}
function quatFromRwMatrix(rwMatrix) {
    return gl_matrix_1.quat.fromMat3(gl_matrix_1.quat.create(), [rwMatrix.right.x, rwMatrix.right.y, rwMatrix.right.z,
        rwMatrix.up.x, rwMatrix.up.y, rwMatrix.up.z,
        rwMatrix.at.x, rwMatrix.at.y, rwMatrix.at.z]);
}
