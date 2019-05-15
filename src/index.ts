import * as fs from 'fs';
import * as path from 'path';

import { SpcWriter } from './spc-writer';

async function main() {
  const writer = new SpcWriter();
  await writer.load(path.resolve('/tmp/aquatic-ambiance.spc'));
}

main();
