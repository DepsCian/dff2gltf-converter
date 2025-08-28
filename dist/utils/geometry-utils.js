"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeNormals = computeNormals;
const gl_matrix_1 = require("gl-matrix");
function computeNormals(positions, indices) {
    const vertexCount = positions.length / 3;
    const normals = new Float32Array(positions.length);
    const vertexToTriangles = new Map();
    for (let i = 0; i < indices.length; i += 3) {
        const triangleIndices = [indices[i], indices[i + 1], indices[i + 2]];
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
        const normal = gl_matrix_1.vec3.create();
        for (const triangleIndices of triangles) {
            const v0 = gl_matrix_1.vec3.fromValues(positions[triangleIndices[0] * 3], positions[triangleIndices[0] * 3 + 1], positions[triangleIndices[0] * 3 + 2]);
            const v1 = gl_matrix_1.vec3.fromValues(positions[triangleIndices[1] * 3], positions[triangleIndices[1] * 3 + 1], positions[triangleIndices[1] * 3 + 2]);
            const v2 = gl_matrix_1.vec3.fromValues(positions[triangleIndices[2] * 3], positions[triangleIndices[2] * 3 + 1], positions[triangleIndices[2] * 3 + 2]);
            const edge1 = gl_matrix_1.vec3.create();
            const edge2 = gl_matrix_1.vec3.create();
            const triangleNormal = gl_matrix_1.vec3.create();
            gl_matrix_1.vec3.subtract(edge1, v1, v0);
            gl_matrix_1.vec3.subtract(edge2, v2, v0);
            gl_matrix_1.vec3.cross(triangleNormal, edge1, edge2);
            if (gl_matrix_1.vec3.sqrLen(triangleNormal) === 0) {
                continue;
            }
            gl_matrix_1.vec3.normalize(triangleNormal, triangleNormal);
            gl_matrix_1.vec3.add(normal, normal, triangleNormal);
        }
        if (gl_matrix_1.vec3.sqrLen(normal) === 0) {
            normal[1] = 1;
        }
        gl_matrix_1.vec3.normalize(normal, normal);
        normals[vertexIndex * 3] = normal[0];
        normals[vertexIndex * 3 + 1] = normal[1];
        normals[vertexIndex * 3 + 2] = normal[2];
    }
    return normals;
}
