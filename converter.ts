import { Document, Primitive, PropertyType } from '@gltf-transform/core';
import { DffParser, RwTextureCoordinate, RwTxd, TxdParser } from 'rw-parser';
import { PNG } from 'pngjs';
import { normals as normalize, dedup } from '@gltf-transform/functions';


export default async function convertDffToGlb( dff: Buffer, txd: Buffer): Promise<Document> {

  const doc = new Document();
  const buffer = doc.createBuffer();

   /// TEXTURES
  const rwTxd: RwTxd = new TxdParser(txd).parse();
  const texturesMap: Map<String, Buffer> = new Map();

  for (const textureNative of rwTxd.textureDictionary.textureNatives) {
    const pngBuffer = await createPNGBufferFromRGBA(Buffer.from(textureNative.mipmaps[0]), textureNative.width, textureNative.height);
    texturesMap.set(textureNative.textureName, pngBuffer);
  }


  // GEOMETRIES
  const rwDff = new DffParser(dff).parse();

  for (const rwGeometry of rwDff.geometryList.geometries) {
    const mesh = doc.createMesh();
    const {
      vertexInformation: rwVerticesArray,
      textureMappingInformation: rwTextureInfo,
      normalInformation: rwNormalsArray,
      binMesh: rwBinMesh,
    } = rwGeometry;
    const rwUvsArray: RwTextureCoordinate[] = rwTextureInfo && rwTextureInfo.length > 0 ? rwTextureInfo[0] : undefined;
  
    const vertices = new Float32Array(rwVerticesArray.length * 3);
    rwVerticesArray.forEach((vertex, i) => {
      vertices[i * 3] = vertex.x;
      vertices[i * 3 + 1] = vertex.y;
      vertices[i * 3 + 2] = vertex.z;
    });
  
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

    const positionsAccessor = doc.createAccessor().setType("VEC3").setArray(vertices);
    const normalsAccessor = doc.createAccessor().setType("VEC3").setArray(normals);

    for (const rwPrimitive of rwBinMesh!.meshes) {
      const indices = new Uint32Array(rwPrimitive.indices);
      const materialIndex = rwPrimitive.materialIndex;
      const textureName =   rwDff.geometryList.geometries[0].materialList.materialData[materialIndex].texture!.textureName;
      const pngBuffer :Buffer = texturesMap.get(textureName);

      const texture = doc.createTexture()
        .setImage(pngBuffer)
        .setMimeType("image/png")
        .setName(textureName);

      const primitive = doc.createPrimitive() 
        .setMode(Primitive.Mode.TRIANGLES)
        .setAttribute("POSITION", positionsAccessor)
            .setMaterial(doc.createMaterial(`${textureName}Mtl`)
              .setBaseColorTexture(texture)
              .setBaseColorFactor([1, 1, 1, 1])
              .setMetallicFactor(0)
              .setRoughnessFactor(1))
        .setAttribute("TEXCOORD_0", doc.createAccessor()
            .setType("VEC2")
            .setArray(uvs))
        .setIndices(doc.createAccessor()
            .setType("SCALAR")
            .setArray(indices))
        .setAttribute("NORMAL", normalsAccessor);
        
    mesh.addPrimitive(primitive);

    }
    const node = doc.createNode().setMesh(mesh);
    const scene = doc.createScene().addChild(node);
  }

  await doc.transform(normalize());
  await doc.transform(dedup({propertyTypes: [PropertyType.MESH, PropertyType.ACCESSOR]}));

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