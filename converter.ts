import fs from 'fs';
import { Document, Scene, Node, Mesh, Primitive, Material, Texture, ImageUtils, NodeIO } from '@gltf-transform/core';
import { DffParser, TxdParser } from 'rw-parser';

export function convertDffToGlb(dff: Buffer): Document {
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

  const imagebuffer = fs.readFileSync("./assets/texture.PNG");

  const document = new Document();
  const buffer = document.createBuffer();
  const texture = document.createTexture().setImage(imagebuffer);
  texture.setMimeType("image/png");

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