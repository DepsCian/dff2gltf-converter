import { mat4, quat, vec4 } from "gl-matrix";
import { RwMatrix3 } from "rw-parser";
export declare const defaultObjectRotationQuat: vec4;
export declare const defaultSkinRotationQuat: vec4;
export declare function normalizeMatrix(matrix: mat4): mat4;
export declare function quatFromRwMatrix(rwMatrix: RwMatrix3): quat;
