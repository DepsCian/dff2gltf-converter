import fs from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import { DffConversionResult, DffConverter, ModelType } from '../src';


describe('gltf skin converting: sa-omyri', () => {

  let conversionResultBuffer :Buffer;

  beforeAll(async () => {
      const consoleDebug = console.debug;
      console.debug = jest.fn();
      const dffBuffer = fs.readFileSync(`./tests/assets/sa-omyri.dff`);
      const txdBuffer = fs.readFileSync(`./tests/assets/sa-omyri.txd`);
      const dffConverter = new DffConverter(dffBuffer, txdBuffer, ModelType.SKIN);
      const dffConversionResult = await dffConverter.convertDffToGltf();
      conversionResultBuffer = await dffConversionResult.getBuffer();
      console.debug = consoleDebug;
  });

  test('GLB hash matches reference', () => {
    const getHash = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const expectedHash = getHash(join(__dirname, './expect/sa-omyri.glb'));
    const actualHash = createHash('sha256').update(conversionResultBuffer).digest('hex');
    expect(actualHash).toBe(expectedHash);
  }); 

});