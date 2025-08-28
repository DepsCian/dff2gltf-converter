"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPNGBufferFromRGBA = createPNGBufferFromRGBA;
const pngjs_1 = require("pngjs");
async function createPNGBufferFromRGBA(rgbaBuffer, width, height) {
    return new Promise((resolve, reject) => {
        const png = new pngjs_1.PNG({ width, height, filterType: 4, colorType: 6 });
        png.data = rgbaBuffer;
        const chunks = [];
        png.pack()
            .on('data', (chunk) => {
            chunks.push(chunk);
        })
            .on('end', () => {
            const buffer = Buffer.concat(chunks);
            resolve(buffer);
        })
            .on('error', (err) => {
            reject(err);
        });
    });
}
