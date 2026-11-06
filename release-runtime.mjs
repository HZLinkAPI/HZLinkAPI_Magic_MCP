import {createHash,randomUUID} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,rename,rm} from 'node:fs/promises';
import {dirname} from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';

export const runtimeVersion='24.22.0';
const checksums={
  'darwin-arm64.tar.gz':'6a9724d9b50a5f22b4816cded441b5a8d9ddae546191a5e5b7efa5a5e2ee26d5',
  'darwin-x64.tar.gz':'495e3f273c645f3c4677d438304cdfc701729ea5dec5728f5c8e76a2dece4b91',
  'win-arm64.zip':'3a5c209a5bc59e65b3bc0fa13ed5e166a26bd3d55332847f498b76b037408d61',
  'win-x64.zip':'f9683a19877e12a9b167305c8db71040d812876359de21f0d2e97c3f321f80c3',
};
async function sha256(file){
  const hash=createHash('sha256');
  for await(const chunk of createReadStream(file))hash.update(chunk);
  return hash.digest('hex');
}
export async function verifiedRuntime(variant,file){
  const checksum=checksums[variant];
  if(!checksum)throw new Error('Unsupported release runtime');
  try{
    if(await sha256(file)!==checksum)throw new Error('Unexpected Node.js archive checksum: '+file);
    return;
  }catch(error){if(error.code!=='ENOENT')throw error;}
  await mkdir(dirname(file),{recursive:true});
  const temporary=file+'.'+randomUUID()+'.tmp';
  const url=`https://nodejs.org/dist/v${runtimeVersion}/node-v${runtimeVersion}-${variant}`;
  try{
    const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(180000)});
    if(!response.ok||!response.body)throw new Error(`Unable to download Node.js: HTTP ${response.status}`);
    await pipeline(Readable.fromWeb(response.body),createWriteStream(temporary,{flags:'wx'}));
    if(await sha256(temporary)!==checksum)throw new Error('Unexpected Node.js archive checksum: '+url);
    await rename(temporary,file);
  }finally{await rm(temporary,{force:true});}
}
