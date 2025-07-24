import { ModelType } from "../constants/model-types";
import { RwVersion } from "../constants/rw-versions";

export class DffValidator {
    static validate(modelType: ModelType, modelVersion: number): void {

      if (modelType == ModelType.CAR) {
        throw new Error("Car models are not supported yet.");
      }
      if (modelType == ModelType.SKIN && modelVersion != RwVersion.SA) {
        throw new Error("VC/III skins are not supported yet");
      }

    }
  }