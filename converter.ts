import { Document, Primitive, PropertyType } from '@gltf-transform/core';
import { DffParser, RwBinMesh, RwMesh, RwTextureCoordinate, RwTxd, RwVector3, TxdParser } from 'rw-parser';
import { PNG } from 'pngjs';
import { normals as normalize, dedup } from '@gltf-transform/functions';
import { vec3 } from 'gl-matrix';


export default async function convertDffToGlb( dff: Buffer, txd: Buffer): Promise<Document> {

  const doc = new Document();
  const buffer = doc.createBuffer();
  const texturesMap: Map<String, Buffer> = new Map();

   /// TEXTURES
  try {
    const rwTxd: RwTxd = new TxdParser(txd).parse();

    if (rwTxd.textureDictionary.textureCount < 1) {
      throw new Error;
    }
    for (const textureNative of rwTxd.textureDictionary.textureNatives) {
      const pngBuffer = await createPNGBufferFromRGBA(Buffer.from(textureNative.mipmaps[0]), textureNative.width, textureNative.height);
      texturesMap.set(textureNative.textureName, pngBuffer);
    }
  } catch(e) {
    console.error('Invalid .txd file.');
    return null;
  }


  // GEOMETRIES
  try {
    const rwDff = new DffParser(dff).parse();
  
    for (const rwGeometry of rwDff.geometryList.geometries) {
      const mesh = doc.createMesh();
  
      const rwTextureInfo = rwGeometry.textureMappingInformation;
      const rwUvsArray :RwTextureCoordinate[] = rwTextureInfo && rwTextureInfo.length > 0 ? rwTextureInfo[0] : undefined;
      const rwVerticesArray :RwVector3[] = rwGeometry.hasVertices && rwGeometry.vertexInformation.length > 0 ? rwGeometry.vertexInformation : undefined;
      const rwNormalsArray :RwVector3[] = rwGeometry.hasNormals && rwGeometry.normalInformation.length > 0 ? rwGeometry.normalInformation : undefined;
      const rwBinMesh :RwBinMesh = rwGeometry.binMesh && rwGeometry.binMesh.meshes.length > 0 ? rwGeometry.binMesh : undefined;

      if (rwTextureInfo == undefined || rwUvsArray == undefined || rwVerticesArray == undefined || rwBinMesh == undefined) {
        throw new Error(`Invalid .dff file.`);
      }
    
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

      let normals = undefined;
    
      if (rwNormalsArray != undefined && rwBinMesh.meshCount == 1) {
        normals = new Float32Array(rwNormalsArray.length * 3);
        rwNormalsArray.forEach((normal, i) => {
          normals[i * 3] = normal.x;
          normals[i * 3 + 1] = normal.y;
          normals[i * 3 + 2] = normal.z;
        }); 
      }
  
      const positionsAccessor = doc.createAccessor().setType("VEC3").setArray(vertices);
  
      for (const rwPrimitive of rwBinMesh.meshes) {
        const indices = new Uint32Array(rwPrimitive.indices);

        if (normals == undefined || rwBinMesh.meshCount > 1) {
          normals = await computeNormals(vertices, indices);
        }

        const normalsAccessor = doc.createAccessor().setType("VEC3").setArray(normals);

        const materialIndex = rwPrimitive.materialIndex;
        const rwMaterial = rwGeometry.materialList.materialData[materialIndex];

        const material = doc.createMaterial(`${materialIndex}_Mtl`)
        .setBaseColorFactor([1, 1, 1, 1])
        .setMetallicFactor(0)
        .setRoughnessFactor(1);

        if (rwMaterial.isTextured) {
          const textureName = rwMaterial.texture.textureName;
          const pngBuffer :Buffer = texturesMap.get(textureName);
          if (pngBuffer != undefined) {
            const texture = doc.createTexture()
            .setImage(pngBuffer)
            .setMimeType("image/png")
            .setName(textureName);

          material.setBaseColorTexture(texture);
          } else {
            console.error(`Texture ${textureName} not found in .txd`);
          }

        }
  
        const primitive = doc.createPrimitive() 
          .setMode(Primitive.Mode.TRIANGLES)
          .setAttribute("POSITION", positionsAccessor)
              .setMaterial(material)
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
  } catch(e) {
    console.error(`${e} Cannot create geometry mesh.`)
    return null;
  }


  // POST-PROCESSING
  await doc.transform(normalize());
  await doc.transform(dedup({propertyTypes: [PropertyType.MESH, PropertyType.ACCESSOR, PropertyType.TEXTURE, PropertyType.MATERIAL] }));

  
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

async function computeNormals(positions :Float32Array, indices :Uint32Array) :Promise<Float32Array> {
  const vertexCount = positions.length / 3;
  const normals = new Float32Array(positions.length);
  const vertexToTriangles: Map<number, number[][]> = new Map();

  for (let i = 0; i < indices.length; i += 3) {
    const triangleIndices = [
      indices[i],
      indices[i + 1],
      indices[i + 2],
    ];

    for (const index of triangleIndices) {
      if (index >= vertexCount) {
        throw new Error(`Index out of bounds: ${index} >= ${vertexCount}`);
      }
    }

    for (const idx of triangleIndices) {
      if (!vertexToTriangles.has(idx)) {
        vertexToTriangles.set(idx, []);
      }
      vertexToTriangles.get(idx)?.push([...triangleIndices]);
    }
  }

  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex++) {
    const triangles = vertexToTriangles.get(vertexIndex) || [];
    const normal = vec3.create();

    for (const triIndices of triangles) {
      const v0 = vec3.fromValues(
        positions[triIndices[0] * 3],
        positions[triIndices[0] * 3 + 1],
        positions[triIndices[0] * 3 + 2]
      );
      const v1 = vec3.fromValues(
        positions[triIndices[1] * 3],
        positions[triIndices[1] * 3 + 1],
        positions[triIndices[1] * 3 + 2]
      );
      const v2 = vec3.fromValues(
        positions[triIndices[2] * 3],
        positions[triIndices[2] * 3 + 1],
        positions[triIndices[2] * 3 + 2]
      );

      const edge1 = vec3.create();
      const edge2 = vec3.create();
      const triangleNormal = vec3.create();

      vec3.subtract(edge1, v1, v0);
      vec3.subtract(edge2, v2, v0);
      vec3.cross(triangleNormal, edge1, edge2);
      vec3.normalize(triangleNormal, triangleNormal);
      vec3.add(normal, normal, triangleNormal);
    }

    vec3.normalize(normal, normal);

    normals[vertexIndex * 3] = normal[0];
    normals[vertexIndex * 3 + 1] = normal[1];
    normals[vertexIndex * 3 + 2] = normal[2];
  }

  return normals;
}