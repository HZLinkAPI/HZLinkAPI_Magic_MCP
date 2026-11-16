import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const run=promisify(execFile);
const signature=Buffer.from([137,80,78,71,13,10,26,10]);
// Conservative transport size verified against the image-edit endpoint, not a
// claimed provider limit. Stored originals and history always retain full size.
const maximumEdge=2048;
function pngDimensions(bytes){
  if(bytes.length<24||!bytes.subarray(0,8).equals(signature)||bytes.toString('ascii',12,16)!=='IHDR')return null;
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
  return width&&height?{width,height}:null;
}
export async function macReferenceToPNG(source,target,max){
  await run('/usr/bin/sips',['-Z',String(max),'-s','format','png',source,'--out',target],{timeout:60000,maxBuffer:65536});
}
export async function prepareReferenceImages(references,directory,convert){
  const prepared=[];
  for(const [index,reference] of references.entries()){
    const dimensions=reference.mimeType==='image/png'?pngDimensions(reference.bytes):null;
    if(!dimensions||Math.max(dimensions.width,dimensions.height)<=maximumEdge){prepared.push(reference);continue;}
    const file=join(directory,`reference-${index+1}.png`);
    try{
      await convert(reference.file,file,maximumEdge);
      const bytes=await readFile(file),scaled=pngDimensions(bytes);
      const scale=maximumEdge/Math.max(dimensions.width,dimensions.height);
      if(!scaled||Math.max(scaled.width,scaled.height)!==maximumEdge||Math.abs(scaled.width-dimensions.width*scale)>1||Math.abs(scaled.height-dimensions.height*scale)>1)throw new Error('缩放结果尺寸无效');
      prepared.push({...reference,file,bytes});
    }catch(error){throw new Error(`参考图 ${index+1}（${reference.name||'未命名'}）无法生成接口副本；原图未修改：${error.message}`,{cause:error});}
  }
  return prepared;
}
