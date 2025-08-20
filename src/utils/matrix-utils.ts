import { mat4, quat, vec3, vec4 } from "gl-matrix";
import { RwMatrix3 } from "rw-parser";

export const defaultObjectRotationQuat :vec4 = vec4.fromValues(-0.7071068, 0,  0, 0.7071068);   // -90deg(x)
export const defaultSkinRotationQuat :vec4 = vec4.fromValues(0.5, 0.5, 0.5, -0.5);   // -90deg(x) + -90deg(z)

export function normalizeMatrix (matrix :mat4) :mat4 {
  const rotation = quat.create();
  const scale = vec3.create();
  const translation = vec3.create();

  mat4.getRotation(rotation, matrix);
  mat4.getScaling(scale, matrix);
  mat4.getTranslation(translation, matrix);

  let normalizedMatrix = mat4.fromRotationTranslationScale(mat4.create(), rotation, translation, [1, 1, 1]);

    // Remove infinite values
    normalizedMatrix = mat4.fromValues(...Array.from(normalizedMatrix).map((v: number) => isFinite(v) ? v : -1) as [
      number, number, number, number, 
      number, number, number, number, 
      number, number, number, number, 
      number, number, number, number
    ]);

  return normalizedMatrix;
}

export function quatFromRwMatrix (rwMatrix :RwMatrix3) :quat {
  return quat.fromMat3(quat.create(), [rwMatrix.right.x, rwMatrix.right.y, rwMatrix.right.z,
    rwMatrix.up.x, rwMatrix.up.y, rwMatrix.up.z, 
    rwMatrix.at.x, rwMatrix.at.y, rwMatrix.at.z]); 
}