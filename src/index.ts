import * as path from 'path';
import * as program from 'commander';

import { Spcduino } from './spcduino';
import { SpcWriter } from './spc-writer';

async function main(file: string, serialPort: string, baudRate: number) {
  const spcduino = new Spcduino(serialPort, baudRate);
  await spcduino.open();
  console.log('Connected to spcduino');

  const writer = new SpcWriter();
  await writer.load(path.resolve(file));
  await writer.play(spcduino);
  process.exit();
}

program
  .version('0.9')
  .description('Plays an SPC file to an spcduino')
  .usage('[options] <file>')
  .option('-p, --port <value>', 'The serial port the spcduino is attached to', 'COM4')
  .option('-b, --baud <value>', 'The baud rate of the spcduino serial port', 1000000)
  .parse(process.argv);

main(program.args.shift(), program.port, program.baud);
