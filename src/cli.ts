import { ModelType } from './types/ModelTypes';
import yargs from 'yargs';


export const parseArgs = () => {
    return yargs(process.argv.slice(2))
      .option('model', {
        alias: 'm',
        describe: 'Путь к файлу .dff',
        type: 'string',
        demandOption: true,
      })
      .option('textures', {
        alias: 't',
        describe: 'Путь к файлу .txd',
        type: 'string',
        demandOption: true,
      })
      .option('type', {
        alias: 'T',
        describe: 'Тип модели: simple (по умолчанию), skin, car',
        choices: Object.values(ModelType),
        default: ModelType.OBJECT,
      })
      .help()
      .parse();
  };


const run = async () => {
  const args = parseArgs();
  
//  const modelBuffer = await fs.promises.readFile(args.model);
//  const textureBuffer = await fs.promises.readFile(args.textures);
  
  //const converter = createConverter(args.type, modelBuffer, textureBuffer);
 /// const resultBuffer = await converter.convert();
  
 // await fs.promises.writeFile(`output.${args.type}.glb`, resultBuffer);
  console.log('Конвертация завершена!');
};

run().catch(console.error);
