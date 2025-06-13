import { Document, Mesh, Primitive, Material, Accessor } from '@gltf-transform/core';
import { DffParser, RwTextureCoordinate, RwTextureNative, RwTxd, TxdParser } from 'rw-parser';
import { PNG } from 'pngjs';

export default async function convertDffToGlb( dff: Buffer, txd: Buffer): Promise<Document> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const rwDff = new DffParser(dff).parse();

  const rwGeometry = rwDff.geometryList.geometries[0]; // 1 geometry
  const {
    vertexInformation: rwVerticesArray,
    binMesh: rwBinMesh,
    textureMappingInformation: rwTextureInfo,
    normalInformation: rwNormalsArray,
  } = rwGeometry;
  const rwUvsArray: RwTextureCoordinate[] = rwTextureInfo && rwTextureInfo.length > 0 ? rwTextureInfo[0] : undefined; // 1 geometry

  const vertices = new Float32Array(rwVerticesArray.length * 3);
  rwVerticesArray.forEach((vertex, i) => {
    vertices[i * 3] = vertex.x;
    vertices[i * 3 + 1] = vertex.y;
    vertices[i * 3 + 2] = vertex.z;
  });

  console.log(`RW VERTICES ARRAY LENGTH: ${rwVerticesArray.length}. Total Vertices array length: ${vertices.length}`);

  const uvs = new Float32Array(rwUvsArray.length * 2);
  rwUvsArray.forEach((uv, i) => {
    uvs[i * 2] = uv.u;
    uvs[i * 2 + 1] = uv.v;
  });

  const normals = new Float32Array(rwNormalsArray.length * 3);
  rwNormalsArray.forEach((normal, i) => {
    normals[i * 3] = normal.x;
    normals[i * 3 + 1] = normal.y;
    normals[i * 3 + 2] = normal.z;
  });

  const rwTxd: RwTxd = new TxdParser(txd).parse();
  const rwTextures: RwTextureNative[] = rwTxd.textureDictionary.textureNatives;
  let material: Material = undefined;
  const mesh: Mesh = doc.createMesh();
  const verticesAccessor: Accessor = doc
    .createAccessor()
    .setType("VEC3")
    .setArray(vertices);

  for (let i = 0; i < rwTextures.length; i++) {
    const rwTexture = rwTextures[i];
    const imageBuffer: Buffer = Buffer.from(rwTexture.mipmaps[0]);
    const width = rwTexture.width;
    const height = rwTexture.height;
    const pngBuffer = await createPNGBufferFromRGBA(imageBuffer, width, height);

    const texture = doc.createTexture().setImage(pngBuffer);
    texture.setMimeType("image/png");
    texture.setName(rwTexture.textureName);
    console.log(`Texture name: ${rwTexture.textureName}`);

    material = doc
      .createMaterial(`${rwTextures[i].textureName}Mtl`)
      .setBaseColorTexture(texture)
      .setBaseColorFactor([1, 1, 1, 1])
      .setMetallicFactor(0)
      .setRoughnessFactor(1);

    const indices = new Uint32Array(rwBinMesh?.meshes[i]?.indices);

    const primitive = doc
      .createPrimitive()
      .setMode(Primitive.Mode.TRIANGLES)
      .setAttribute("POSITION", verticesAccessor)
      .setMaterial(material)
      .setAttribute(
        "TEXCOORD_0",
        doc.createAccessor().setType("VEC2").setArray(uvs)
      )
      .setIndices(doc.createAccessor().setType("SCALAR").setArray(indices))
      .setAttribute(
        "NORMAL",
        doc.createAccessor().setType("VEC3").setArray(normals)
      );
    mesh.addPrimitive(primitive);
  }

  const node = doc.createNode().setMesh(mesh);
  const scene = doc.createScene().addChild(node);

  return doc;
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