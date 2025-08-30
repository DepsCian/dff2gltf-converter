import { RwBone, RwFrame } from 'rw-parser-ng';
export interface Bone {
    name: string;
    boneData: RwBone;
    frameData: RwFrame;
}
export declare function normalizeJoints(jointsData: number[], weightsData: number[]): number[];
export declare function normalizeWeights(weightsData: number[]): number[];
