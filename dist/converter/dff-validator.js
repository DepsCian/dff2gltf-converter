"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DffValidator = void 0;
const model_types_1 = require("../constants/model-types");
const rw_versions_1 = require("../constants/rw-versions");
class DffValidator {
    static validate(modelType, modelVersion) {
        if (modelType == model_types_1.ModelType.CAR) {
            throw new Error("Car models are not supported yet.");
        }
        if (modelType == model_types_1.ModelType.SKIN && modelVersion != rw_versions_1.RwVersion.SA) {
            throw new Error("VC/III skins are not supported yet");
        }
    }
}
exports.DffValidator = DffValidator;
