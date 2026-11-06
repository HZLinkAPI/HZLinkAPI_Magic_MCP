import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const run=promisify(execFile);
const helper=process.env.HZLINKAPI_MAGIC_NATIVE_BIN||fileURLToPath(new URL('./magic-native.exe',import.meta.url));
export async function nativeTool(args,options={}){
  return await run(helper,args,{windowsHide:true,timeout:30000,maxBuffer:65536,...options});
}
export async function imageToPNG(source,target,max=0){
  await nativeTool(['image',source,target,String(max)]);
}
