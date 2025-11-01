import { Document } from '@gltf-transform/core';
export declare class DffConversionResult {
    private gltfBuffer;
    constructor(gltfBuffer: Document);
    exportAs(exportPath: string): void;
    getBuffer(): Promise<Buffer>;
    dispose(): void;
}
