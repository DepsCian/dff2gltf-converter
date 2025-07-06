import fs from 'fs';
import { DffConverter } from "./converter/dff-converter.js";
import { ModelType } from './types/model-types.js';

// Usage example
const modelsAll :String[] = ['lvpd1', 'sfpd1', 'tenpen', 'wuzimu', 'women', 'wuziTexTest', 'minecraft', 'Kopatel', 'andre', 'omyri'];  // test models
const models :String[] = ['women'];

for (const modelName of models) {
    console.log(`Reading ${modelName}...`);
    const dffBuffer = fs.readFileSync(`./assets/${modelName}.dff`);
    const txdBuffer = fs.readFileSync(`./assets/${modelName}.txd`);

    let dffConverter = new DffConverter(dffBuffer, txdBuffer, ModelType.SKIN);
    await dffConverter.convertDffToGltf().then((gltf) => gltf.exportAs(`./output/${modelName}.glb`)).catch((e) => console.error(`Error when exporting ${modelName}`));
    dffConverter = null; 
    console.log(`${modelName}: Success!`);

}