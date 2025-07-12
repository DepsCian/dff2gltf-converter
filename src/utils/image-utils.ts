import { PNG } from "pngjs";

export async function createPNGBufferFromRGBA(rgbaBuffer: Buffer, width: number, height: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const png = new PNG({ width, height, filterType: 4, colorType: 6 });
    png.data = rgbaBuffer;
  
    const chunks: Buffer[] = [];
  
    png.pack()
      .on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      })
      .on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(buffer);
      })
      .on('error', (err: Error) => {
        reject(err);
      });
});
}