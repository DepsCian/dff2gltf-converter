import { Document } from '@gltf-transform/core';
import { ModelType } from './types/ModelTypes.js';
export default function dffToGltf(dff: Buffer, txd: Buffer, modelType?: ModelType, exportPath?: string): Promise<Document>;
