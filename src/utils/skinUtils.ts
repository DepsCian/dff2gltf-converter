import { RwBone, RwFrame } from "rw-parser";

export interface Bone {
  name: string,
  boneData: RwBone,
  frameData: RwFrame
}

export function normalizeJoints(jointsData :number[], weightsData :number[]) :number[] {
    if (jointsData.length != weightsData.length) {
      throw new Error("Length of joints and weights arrays is not equal.")
    }
  
    let normalizedJoints :number[] = [];
    for (let i = 0; i < jointsData.length; i += 4) {
      const weightsSubArr :number[] = [weightsData[i], weightsData[i+1], weightsData[i+2], weightsData[i+3]];
      let jointsSubArr :number[] = [jointsData[i], jointsData[i+1], jointsData[i+2], jointsData[i+3]];
  
      for (let j = 0; j < 4; j++) {
        if (weightsSubArr[j] == 0) {
          jointsSubArr[j] = 0;
        }
      }
      normalizedJoints.push(...jointsSubArr);
    }
  
    return normalizedJoints;
  }


export function normalizeWeights(weightsData :number[]) :number[] {
    let w1 = weightsData[0];
    let w2 = weightsData[1];
    let w3 = weightsData[2];
    let w4 = weightsData[3];
    const sum = w1 + w2 + w3 + w4;
  
    if (sum === 0) {
    w1 = 1.0;
    }
  
    else if (Math.abs(sum - 1.0) > 0.001) {
      w1 /= sum;
      w2 /= sum;
      w3 /= sum;
      w4 /= sum;
    }
  
    return [w1, w2, w3, w4];
  }