import fs, { access } from 'fs';
import { Document, Scene, Node, Mesh, Primitive, Material, Texture, ImageUtils, NodeIO } from '@gltf-transform/core';
import { DffParser, RwDff, TxdParser } from 'rw-parser';
//import { normals } from '@gltf-transform/functions';

const modelName = "wuzimu";
parseDff(fs.readFileSync(`./assets/${modelName}.dff`));


function parseDff(dff : Buffer) {
const parsedModelData = new DffParser(dff).parse();
const geometry = parsedModelData.geometryList.geometries[0];
const { vertexInformation: verticesArray, binMesh, textureMappingInformation: textureInfo, normalInformation : normalsArray } = geometry;
const uvsArray = textureInfo && textureInfo.length > 0 ? textureInfo[0] : null;

const indices = new Uint32Array(binMesh?.meshes[0]?.indices);

const vertices = new Float32Array(verticesArray.length * 3);
verticesArray.forEach((vertex, i) => {
  vertices[i * 3]     = vertex.x;
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

console.log('DFF Parsed INFO: ');
console.log('indices: ' + indices.length);
console.log('uvs: ' + uvsArray.length + ' : : ' + uvs.length);
console.log('verts: ' + verticesArray.length + ' : : ' + vertices.length);
console.log('normals: ' + normalsArray.length + ' : : ' + normals.length);
/*
console.log('DETAIL DFF Parsed INFO: ');
console.log('indices: ' + indices);
console.log('uvs: ' + uvs);
console.log('verts: ' + vertices);
console.log('normals: ' + normals);

verticesArray.forEach((vertex, i) => console.log(`vertex at pos. ${i} has values x: ${vertex.x}, y: ${vertex.y}, z: ${vertex.z}.`));
*/

//////////////////////////////////////////

const imagebuffer = fs.readFileSync('./assets/texture.PNG');
const parsedTxdData = new TxdParser(fs.readFileSync(`./assets/${modelName}.txd`)).parse();
console.log(parsedTxdData.textureDictionary.textureNatives[0].mipmaps[0]);

const doc = new Document();
const buffer = doc.createBuffer();
const texture = doc.createTexture()
    .setImage(imagebuffer); 
    texture.setMimeType('image/png');

const material = doc.createMaterial('cube-material')
    .setBaseColorTexture(texture)
    .setBaseColorFactor([1, 1, 1, 1])
    .setMetallicFactor(0)
    .setRoughnessFactor(1);

const primitive = doc.createPrimitive()
    .setMode(Primitive.Mode.TRIANGLES)
    .setAttribute('POSITION', doc.createAccessor()
        .setType('VEC3')
        .setArray(vertices))
    .setAttribute('TEXCOORD_0', doc.createAccessor()
        .setType('VEC2')
        .setArray(uvs))
 .setIndices(doc.createAccessor()
      .setType('SCALAR')
      .setArray(indices))   
    .setMaterial(material)
    .setAttribute('NORMAL', doc.createAccessor() 
   .setType('VEC3')
    .setArray(normals));
;


// Создаем меш и ноду
const mesh = doc.createMesh().addPrimitive(primitive);
const node = doc.createNode().setMesh(mesh);

// Добавляем в сцену
const scene = doc.createScene().addChild(node);

// Экспортируем в GLB
const exportPath = `./export/${modelName}.glb`;

const io = new NodeIO();
io.write(exportPath, doc);

/* doc.getRoot()
  .listMeshes()
  .forEach((mesh) => {
    console.log('Mesh: ' + mesh);
  });
  doc.getRoot().listAccessors().forEach((accessor)=> { console.log('Accessor: ' + accessor.getType() + ' ids:' + accessor.getArray()) });
*/
console.log('DONE! Exported model name is : ' + exportPath);

}













function utility () {

const imagebuffer = fs.readFileSync('./assets/tixture.PNG');

// Создаем документ и сцену
const doc = new Document();
const buffer = doc.createBuffer();

// Создаем текстуру
const texture = doc.createTexture()
    .setImage(imagebuffer); 
    texture.setMimeType('image/png');

// Создаем материал с текстурой
const material = doc.createMaterial('cube-material')
    .setBaseColorTexture(texture)
    .setBaseColorFactor([1, 1, 1, 1])
    .setMetallicFactor(0)
    .setRoughnessFactor(1);

// Определяем геометрию куба
const positions = [
  // Передняя грань (Z+)
  -0.5, -0.5, 0.5,
   0.5, -0.5, 0.5,
   0.5,  0.5, 0.5,
  -0.5,  0.5, 0.5,

  // Задняя грань (Z-)
  -0.5, -0.5, -0.5,
   0.5, -0.5, -0.5,
   0.5,  0.5, -0.5,
  -0.5,  0.5, -0.5,

  // Левая грань (X-)
  -0.5, -0.5, 0.5,
  -0.5, -0.5, -0.5,
  -0.5,  0.5, -0.5,
  -0.5,  0.5, 0.5,

  // Правая грань (X+)
   0.5, -0.5, 0.5,
   0.5, -0.5, -0.5,
   0.5,  0.5, -0.5,
   0.5,  0.5, 0.5,

  // Верхняя грань (Y+)
  -0.5, 0.5, 0.5,
   0.5, 0.5, 0.5,
   0.5, 0.5, -0.5,
  -0.5, 0.5, -0.5,

  // Нижняя грань (Y-)
  -0.5, -0.5, 0.5,
   0.5, -0.5, 0.5,
   0.5, -0.5, -0.5,
  -0.5, -0.5, -0.5
];


const indices = [
  0, 1, 2, 0, 2, 3,       // Передняя
  4, 5, 6, 4, 6, 7,       // Задняя
  8, 9, 10, 8, 10, 11,    // Левая
  12, 13, 14, 12, 14, 15, // Правая
  16, 17, 18, 16, 18, 19, // Верхняя
  20, 21, 22, 20, 22, 23  // Нижняя
];

const texcoords = [
  // Передняя
  0, 0, 1, 0, 1, 1, 0, 1,
  // Задняя
  0, 0, 1, 0, 1, 1, 0, 1,
  // Левая
  0, 0, 1, 0, 1, 1, 0, 1,
  // Правая
  0, 0, 1, 0, 1, 1, 0, 1,
  // Верхняя
  0, 0, 1, 0, 1, 1, 0, 1,
  // нижняя
  0, 0, 1, 0, 1, 1, 0, 1
];

// добавляем нормали
const norms = new Array(0);
console.log( norms.length);
for (let i = 0; i < positions.length; i += 3) {
    const normal = [0, 0, 1]; // передняя грань
    norms.push(...normal);
   
}
console.log( norms.length);

// Создаем примитив
const primitive = doc.createPrimitive()
    .setMode(Primitive.Mode.TRIANGLES)
    .setAttribute('POSITION', doc.createAccessor()
        .setType('VEC3')
        .setArray(new Float32Array(positions)))
    .setAttribute('TEXCOORD_0', doc.createAccessor()
        .setType('VEC2')
        .setArray(new Float32Array(texcoords)))
    .setIndices(doc.createAccessor()
        .setType('SCALAR')
        .setArray(new Uint8Array(indices)))   
    .setMaterial(material)
    .setAttribute('NORMAL', doc.createAccessor() // ТУТ  ошибка ACCESSOR_INVALID_FLOAT	Accessor element at index 0 - 71 is NaN.	/accessors/2
    .setType('VEC3')
    .setArray(new Float32Array(norms)));


// Создаем меш и ноду
const mesh = doc.createMesh().addPrimitive(primitive);
const node = doc.createNode().setMesh(mesh);

// Добавляем в сцену
const scene = doc.createScene().addChild(node);

 //doc.transform(normals({overwrite: true}));


// Экспортируем в GLB
const io = new NodeIO();
 io.write('./export/cube.glb', doc);

doc.getRoot()
  .listMeshes()
  .forEach((mesh) => {
    console.log('Mesh: ' + mesh);
  });
  doc.getRoot().listAccessors().forEach((accessor)=> { console.log('Accessor: ' + accessor.getType() + ' ids:' + accessor.getArray()) });

console.log('DONE');


const parsedModelData = new DffParser(fs.readFileSync('./assets/object.dff')).parse();

const geometry = parsedModelData.geometryList.geometries[0];

const { vertexInformation: verticesArray, binMesh, textureMappingInformation: textureInfo } = geometry;

const indicesArray = binMesh?.meshes[0]?.indices;
const uvsArray = textureInfo && textureInfo.length > 0 ? textureInfo[0] : null;

console.log('INFO: ');
console.log('indices: ' + indicesArray.length);
console.log('uvs: ' + uvsArray.length);
//uvsArray.forEach(uv => { console.log(uv.u) });
console.log('verts: ' + verticesArray.length);
//verticesArray.forEach(vert => { console.log(vert.x)})

}
