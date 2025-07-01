import { mat4, quat } from "gl-matrix";
import { RwMatrix3 } from "rw-parser";
export declare function normalizeMatrix(matrix: mat4): mat4;
export declare function quatFromRwMatrix(rwMatrix: RwMatrix3): quat;
