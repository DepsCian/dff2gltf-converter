import { ModelType } from "../constants/model-types.js";
import { RwVerion } from "../constants/rw-versions.js";

export class DffValidator {
    static validate(modelType: ModelType, modelVersion: number): void {

      if (modelType == ModelType.CAR) {
       // throw new Error("Car models are not supported yet.");
      }
      if (modelType == ModelType.SKIN && modelVersion != RwVerion.SA) {
        throw new Error("VC/III skins are not supported yet");
      }

    }
  }