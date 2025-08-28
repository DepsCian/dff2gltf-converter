"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapRwModelType = mapRwModelType;
const rw_parser_1 = require("rw-parser");
const model_types_1 = require("../constants/model-types");
function mapRwModelType(rwModelType) {
    switch (rwModelType) {
        case rw_parser_1.DffModelType.SKIN:
            return model_types_1.ModelType.SKIN;
        default:
            return model_types_1.ModelType.OBJECT;
    }
}
