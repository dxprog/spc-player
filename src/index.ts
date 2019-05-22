import * as fs from 'fs';
import * as path from 'path';

import { Spcduino } from './spcduino';
import { SpcWriter } from './spc-writer';

async function main() {
  const spcduino = new Spcduino('COM4', 115200);
  await spcduino.open();
  console.log('Connected to spcduino');

  const writer = new SpcWriter();
  await writer.load(path.resolve('/tmp/blargg.spc'));
  writer.play(spcduino);
}

main();
