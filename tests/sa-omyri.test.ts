import fs from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import { DffConverter, ModelType } from '../src';

interface ValidationReport {
  mimeType: string,
  validatorVersion: string,
  validatedAt: string,
  issues: {
    numErrors: number,
    numWarnings: number,
    numInfos: number,
    numHints: number,
    messages: string[],
    truncated: number
  },
  info: {
    version: string,
    generator: string,
    resources: object[],
    animationCount: number,
    materialCount: number,
    hasMorphTargets: boolean,
    hasSkins: boolean,
    hasTextures: boolean,
    hasDefaultScene: boolean,
    drawCallCount: number,
    totalVertexCount: number,
    totalTriangleCount: number,
    maxUVs: number,
    maxInfluences: number,
    maxAttributes: number
  }
}

describe('gltf skin converting: sa-omyri', () => {

  let conversionResultBuffer :Buffer;
  let report :ValidationReport;

  beforeAll(async () => {
      const consoleDebug = console.debug;
      console.debug = jest.fn();
      const dffBuffer = fs.readFileSync(`./tests/assets/sa-omyri.dff`);
      const txdBuffer = fs.readFileSync(`./tests/assets/sa-omyri.txd`);
      const dffConverter = new DffConverter(dffBuffer, txdBuffer);
      const dffConversionResult = await dffConverter.convertDffToGltf();
      conversionResultBuffer = await dffConversionResult.getBuffer();

      const validator = require('gltf-validator');
      report = await validator.validateBytes(new Uint8Array(conversionResultBuffer));
      console.debug = consoleDebug;
  });

  test('GLB hash matches reference', () => {
    const getHash = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const expectedHash = getHash(join(__dirname, './expect/sa-omyri.glb'));
    const actualHash = createHash('sha256').update(conversionResultBuffer).digest('hex');
    expect(actualHash).toBe(expectedHash);
  }); 

  test('GLB is valid', () => {
    expect(report.issues.numErrors).toBe(0);
    expect(report.issues.numWarnings).toBe(0);
    expect(report.info.animationCount).toBe(0);

    expect(report.info.hasSkins).toBeTruthy();
    expect(report.info.hasTextures).toBeTruthy();
    expect(report.info.hasDefaultScene).toBeFalsy();
    expect(report.info.drawCallCount).toBe(1);
    expect(report.info.totalVertexCount).toBe(1147);
    expect(report.info.totalTriangleCount).toBe(1241);
    expect(report.info.maxAttributes).toBe(5);
  }); 

});