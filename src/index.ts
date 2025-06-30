import fs from 'fs';
import convertDffToGlb from "./converter.js";
import { NodeIO } from "@gltf-transform/core";


// Usage example
const modelsAll :String[] = ['lvpd1', 'sfpd1', 'tenpen', 'wuzimu', 'women', 'wuziTexTest', 'minecraft', 'Kopatel', 'andre', 'omyri'];  // test models
const models :String[] = ['andre'];

for (const modelName of models) {

    console.log(`Reading ${modelName}...`);
    const dffBuffer = fs.readFileSync(`./assets/${modelName}.dff`);
    const txdBuffer = fs.readFileSync(`./assets/${modelName}.txd`);

    const glbBuffer = await convertDffToGlb(dffBuffer, txdBuffer);
    const exportPathGlb = `./output/${modelName}.glb`;
    const exportPathGltf = `./output/${modelName}/${modelName}.gltf`;

    if (glbBuffer == null) {
        console.error(`glbBuffer of ${modelName} is empty.`);
    } else {
      new NodeIO().write(exportPathGlb, glbBuffer);
  //  new NodeIO().write(exportPathGltf, glbBuffer);
    }

    console.log(`${modelName}: Success!`);
}