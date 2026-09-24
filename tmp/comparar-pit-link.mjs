import fs from 'node:fs/promises';
import env from '@next/env';
env.loadEnvConfig(process.cwd());
const code=(await fs.readFile('lib/sharepoint.js','utf8')).replace('import "server-only";','');
const {downloadSharedFile}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const url='https://torgmetal637.sharepoint.com/:x:/s/TorgMetal/IQB8Vmm1deg5R5wYBc71VC5qAccNiLPegXF6f9__GcZfb7I?e=vJeroE';
const d=await downloadSharedFile(url);
await fs.writeFile('/tmp/pit-excel-122/novo-pit.xlsx',d.buffer);
console.log(JSON.stringify({nome:d.name,tamanho:d.size}));
