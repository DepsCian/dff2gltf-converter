import { Document, NodeIO } from "@gltf-transform/core";


export class DffConversionResult {
  private gltfBuffer :Document;

  constructor(gltfBuffer :Document) {
    this.gltfBuffer = gltfBuffer;
  }


  exportAs (exportPath :string): void {
    if (this.gltfBuffer == null || this.gltfBuffer == undefined) {
      throw new Error("Cannot create output file. Buffer is empty.");
    }
  
    new NodeIO().write(exportPath, this.gltfBuffer);
  }
}