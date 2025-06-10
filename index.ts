import fs from 'fs';
import { convertDffToGlb } from "./converter.js";
import { NodeIO } from "@gltf-transform/core";


// Usage example
const modelName = "wuzimu"; 
const dffBuffer = fs.readFileSync(`./assets/${modelName}.dff`);
const glbBuffer = convertDffToGlb(dffBuffer);
const exportPath = `./output/${modelName}.glb`;
const io = new NodeIO();

io.write(exportPath, glbBuffer);
