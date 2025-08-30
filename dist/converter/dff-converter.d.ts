import { ModelType } from '../constants/model-types';
import { DffConversionResult } from './dff-conversion-result';
export declare class DffConverter {
    dff: Buffer;
    txd: Buffer;
    modelType: ModelType;
    private _doc;
    private _scene;
    private _texturesMap;
    private _nodes;
    constructor(dff: Buffer, txd: Buffer);
    convertDffToGltf(): Promise<DffConversionResult>;
    private extractGeometryData;
    private createGeometryAccessors;
    private convertTextures;
    private convertGeometryData;
    private createMaterial;
    private addSkinAttributes;
    private convertSkinData;
    private correctModelRotation;
    private _buildSceneGraph;
}
