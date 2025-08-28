"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DffConversionResult = void 0;
const core_1 = require("@gltf-transform/core");
class DffConversionResult {
    constructor(gltfBuffer) {
        this.gltfBuffer = gltfBuffer;
    }
    exportAs(exportPath) {
        if (this.gltfBuffer == null || this.gltfBuffer == undefined) {
            throw new Error('Cannot create output file. Buffer is empty.');
        }
        new core_1.NodeIO().write(exportPath, this.gltfBuffer);
    }
    async getBuffer() {
        const byteBuffer = await new core_1.NodeIO().writeBinary(this.gltfBuffer);
        return Buffer.from(byteBuffer);
    }
}
exports.DffConversionResult = DffConversionResult;
