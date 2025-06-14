import fs from 'fs';
import convertDffToGlb from "./converter.js";
import { NodeIO } from "@gltf-transform/core";


// Usage example
const modelName = "wuzimu"; 
const dffBuffer = fs.readFileSync(`./assets/${modelName}.dff`);
const txdBuffer = fs.readFileSync(`./assets/${modelName}.txd`);

const glbBuffer = await convertDffToGlb(dffBuffer, txdBuffer);
const exportPath = `./output/${modelName}.glb`;
new NodeIO().write(exportPath, glbBuffer);;
