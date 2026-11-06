import { randomUUID } from 'node:crypto';
import { mkdir,readFile,writeFile,rename,stat,rm } from 'node:fs/promises';
import { join,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const directory=join(dirname(fileURLToPath(import.meta.url)),'references');
const types={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
const sessions=new Map();
const maximum=12*1024*1024;
function validHeader(b,type) {
  return type==='image/png' ? b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) :
    type==='image/jpeg' ? b[0]===255&&b[1]===216&&b[2]===255 :
    b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP';
}
export async function referenceChunk({ uploadId,chunkIndex,data,final,mimeType,name }) {
  if(!types[mimeType]) throw new Error('参考图仅支持 PNG、JPEG 和 WebP');
  if(!/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw new Error('参考图分片编码无效');
  const bytes=Buffer.from(data,'base64');
  if(bytes.length>256*1024) throw new Error('单个上传分片过大');
  await mkdir(directory,{recursive:true,mode:0o700});
  let s=sessions.get(uploadId);
  if(!s) { if(chunkIndex!==0) throw new Error('请从第一个分片重新上传'); s={id:randomUUID(),index:0,bytes:0,mimeType,name:String(name||'参考图').slice(0,120)}; sessions.set(uploadId,s); }
  if(s.mimeType!==mimeType||s.index!==chunkIndex) throw new Error('参考图分片顺序不正确，请重新选择图片');
  if(s.bytes+bytes.length>maximum) { sessions.delete(uploadId); await rm(join(directory,s.id+'.part'),{force:true}); throw new Error('单张参考图不能超过 12 MB'); }
  await writeFile(join(directory,s.id+'.part'),bytes,{flag:chunkIndex?'a':'w',mode:0o600}); s.bytes+=bytes.length; s.index++;
  if(!final) return {received:s.bytes};
  const file=join(directory,s.id+'.'+types[mimeType]);
  const all=await readFile(join(directory,s.id+'.part'));
  if(!validHeader(all,mimeType)) { sessions.delete(uploadId); await rm(join(directory,s.id+'.part'),{force:true}); throw new Error('图片内容与文件类型不匹配'); }
  await rename(join(directory,s.id+'.part'),file);
  await writeFile(join(directory,s.id+'.json'),JSON.stringify({mimeType,name:s.name,size:s.bytes}),{mode:0o600}); sessions.delete(uploadId);
  return {reference:{id:s.id,name:s.name,mimeType,size:s.bytes}};
}
export async function loadReferences(ids) {
  const images=[];let total=0;
  for(const id of ids) {
    if(!/^[a-f0-9-]{36}$/.test(id)) throw new Error('参考图编号无效');
    const meta=JSON.parse(await readFile(join(directory,id+'.json'),'utf8'));
    if(!types[meta.mimeType]) throw new Error('参考图类型无效');
    const file=join(directory,id+'.'+types[meta.mimeType]);
    if((await stat(file)).size>maximum) throw new Error('参考图文件过大');
    const bytes=await readFile(file);total+=bytes.length;if(total>32*1024*1024)throw new Error('参考图总大小不能超过 32 MB');
    images.push({file,mimeType:meta.mimeType,name:meta.name,bytes});
  }
  return images;
}
