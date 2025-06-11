import { Document, Scene, Node, Mesh, Primitive, Material, Texture, ImageUtils, NodeIO } from '@gltf-transform/core';
import { DffParser, RwTxd, TxdParser } from 'rw-parser';
import { PNG } from 'pngjs';

export default async function convertDffToGlb(dff: Buffer, txd: Buffer): Promise<Document> {

  const rwDff = new DffParser(dff).parse();
  const geometry = rwDff.geometryList.geometries[0];
  const { vertexInformation: verticesArray, binMesh, textureMappingInformation: textureInfo, normalInformation: normalsArray } = geometry;
  const uvsArray = textureInfo && textureInfo.length > 0 ? textureInfo[0] : null;
  const indices = new Uint32Array(binMesh?.meshes[0]?.indices);
  const vertices = new Float32Array(verticesArray.length * 3);

  verticesArray.forEach((vertex, i) => {
    vertices[i * 3] = vertex.x;
    vertices[i * 3 + 1] = vertex.y;
    vertices[i * 3 + 2] = vertex.z;
  });

  const uvs = new Float32Array(uvsArray.length * 2);
  uvsArray.forEach((uv, i) => {
    uvs[i * 2] = uv.u;
    uvs[i * 2 + 1] = uv.v;
  });

  const normals = new Float32Array(normalsArray.length * 3);
  normalsArray.forEach((normal, i) => {
    normals[i * 3] = normal.x;
    normals[i * 3 + 1] = normal.y;
    normals[i * 3 + 2] = normal.z;
  });


  const rwTxd :RwTxd = new TxdParser(txd).parse();
  const rwTexture = rwTxd.textureDictionary.textureNatives[0];

  const imageBuffer :Buffer = Buffer.from(rwTexture.mipmaps[0]);
  const width = rwTexture.width;
  const height = rwTexture.height;
  const pngBuffer = await createPNGBufferFromRGBA(imageBuffer, width, height);

  const document = new Document();
  const buffer = document.createBuffer();
  const texture = document.createTexture().setImage(pngBuffer);
  texture.setMimeType("image/png");
  texture.setName(rwTexture.textureName);

  const material = document
    .createMaterial("cube-material")
    .setBaseColorTexture(texture)
    .setBaseColorFactor([1, 1, 1, 1])
    .setMetallicFactor(0)
    .setRoughnessFactor(1);

  const primitive = document
    .createPrimitive()
    .setMode(Primitive.Mode.TRIANGLES)
    .setAttribute(
      "POSITION",
      document.createAccessor().setType("VEC3").setArray(vertices)
    )
    .setAttribute(
      "TEXCOORD_0",
      document.createAccessor().setType("VEC2").setArray(uvs)
    )
    .setIndices(document.createAccessor().setType("SCALAR").setArray(indices))
    .setMaterial(material)
    .setAttribute(
      "NORMAL",
      document.createAccessor().setType("VEC3").setArray(normals)
    );
    
  const mesh = document.createMesh().addPrimitive(primitive);
  const node = document.createNode().setMesh(mesh);
  const scene = document.createScene().addChild(node);

  return document;
}

async function createPNGBufferFromRGBA(rgbaBuffer: Buffer, width: number, height: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const png = new PNG( { width, height, filterType: 4, colorType: 6 } );
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