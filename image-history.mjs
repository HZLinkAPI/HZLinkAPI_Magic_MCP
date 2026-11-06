import {readFile,readdir,stat,open,mkdir,rename,rm,writeFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {referencePrompt,splitReferencePrompt} from './reference-mapping.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const defaults={outputDirectory:join(root,'outputs'),referenceDirectory:join(root,'references')};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const png=Buffer.from([137,80,78,71,13,10,26,10]);
const types={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
const run=promisify(execFile),previews=new Map();
function checkId(id){if(typeof id!=='string'||!uuid.test(id))throw new Error('图片任务编号无效');}

export function generationMetadata(args,refs) {
  const previous=splitReferencePrompt(args.prompt);
  const numbers=args.referenceNumbers??(previous.numbers.length===refs.length?previous.numbers:refs.map((_,index)=>index+1));
  if(numbers.length!==refs.length||numbers.some(number=>!Number.isSafeInteger(number)||number<1)||new Set(numbers).size!==numbers.length)throw new Error('参考图编号与上传图片不一致，请重新选择');
  const userPrompt=args.userPrompt??previous.userPrompt;
  if(typeof userPrompt!=='string'||!userPrompt.trim())throw new Error('请填写想画的内容');
  const references=refs.map((ref,index)=>({id:args.referenceIds[index],number:numbers[index],name:ref.name,mimeType:ref.mimeType,size:ref.bytes.length}));
  const prompt=args.userPrompt!==undefined?referencePrompt(userPrompt,references):args.prompt;
  return {metadataVersion:2,prompt,userPrompt,referenceIds:references.map(ref=>ref.id),referenceNumbers:numbers,references};
}

export async function persistImageRecord(job,directory=defaults.outputDirectory){
  checkId(job.id);await mkdir(directory,{recursive:true,mode:0o700});
  const temporary=join(directory,`.${job.id}-${randomUUID()}.tmp`);
  try{await writeFile(temporary,JSON.stringify(job,null,2),{mode:0o600,flag:'wx'});await rename(temporary,join(directory,`${job.id}.json`));}
  finally{await rm(temporary,{force:true});}
}

async function pngInfo(file) {
  const handle=await open(file,'r');
  try{const bytes=Buffer.alloc(24);const {bytesRead}=await handle.read(bytes,0,24,0);if(bytesRead!==24||!bytes.subarray(0,8).equals(png))throw new Error('图片不是有效 PNG');return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};}
  finally{await handle.close();}
}
async function stored(id,options) {
  checkId(id);const file=join(options.outputDirectory,`${id}.png`);
  const record=JSON.parse(await readFile(join(options.outputDirectory,`${id}.json`),'utf8'));
  if(record.status!=='completed')throw new Error('此图片尚未生成完成');
  const info=await stat(file),dimensions=await pngInfo(file);
  const parsed=splitReferencePrompt(record.prompt||'');
  return {...record,id,file,dimensions,userPrompt:record.userPrompt??parsed.userPrompt,startedAt:record.startedAt||info.mtime.toISOString(),referenceCount:record.referenceCount??record.references?.length??0};
}
function summary(record){return {id:record.id,model:record.model||'未知模型',userPrompt:record.userPrompt,startedAt:record.startedAt,finishedAt:record.finishedAt,dimensions:record.dimensions,referenceCount:record.referenceCount};}
async function preview(file,id,size,directory) {
  const key=`${file}:${size}`;
  if(previews.has(key))return previews.get(key);
  const pending=(async()=>{
    const cache=join(directory,'.history-previews');await mkdir(cache,{recursive:true,mode:0o700});
    const target=join(cache,`${id}-${size}.png`),sourceInfo=await stat(file);
    let fresh=false;try{fresh=(await stat(target)).mtimeMs>=sourceInfo.mtimeMs;}catch{}
    if(!fresh){
      const temporary=join(cache,`${id}-${randomUUID()}.png`);
      try{await run('/usr/bin/sips',['-Z',String(size),'-s','format','png',file,'--out',temporary],{timeout:20000,maxBuffer:4096});await rename(temporary,target);}
      finally{await rm(temporary,{force:true});}
    }
    return `data:image/png;base64,${(await readFile(target)).toString('base64')}`;
  })();
  previews.set(key,pending);
  try{return await pending;}finally{previews.delete(key);}
}

// Test-only directory overrides are never accepted through MCP arguments.
export async function listImageHistory({offset=0,limit=12}={},settings={}) {
  const options={...defaults,...settings};
  if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>24)throw new Error('历史分页参数无效');
  let files;try{files=await readdir(options.outputDirectory);}catch(error){if(error.code==='ENOENT')return {items:[],total:0,hasMore:false,thumbnails:[]};throw error;}
  const records=[];
  for(const name of files){if(!name.endsWith('.json')||!uuid.test(name.slice(0,-5)))continue;try{records.push(await stored(name.slice(0,-5),options));}catch{}}
  records.sort((a,b)=>{const at=Date.parse(a.finishedAt||a.startedAt)||0,bt=Date.parse(b.finishedAt||b.startedAt)||0;return bt-at||b.id.localeCompare(a.id);});
  const page=records.slice(offset,offset+limit),thumbnails=[];
  // Bound concurrent thumbnail conversions on a user's laptop.
  for(let index=0;index<page.length;index+=3)await Promise.all(page.slice(index,index+3).map(async record=>{try{thumbnails.push({id:record.id,dataUrl:await preview(record.file,record.id,224,options.outputDirectory)});}catch{}}));
  return {items:page.map(record=>({...summary(record),userPrompt:record.userPrompt.slice(0,180)})),total:records.length,hasMore:offset+page.length<records.length,thumbnails};
}

export async function imageHistoryItem(id,settings={}) {
  const options={...defaults,...settings},record=await stored(id,options),references=[],referencePreviews=[];
  for(const saved of (record.references||[]).slice(0,16)){
    if(!uuid.test(saved.id)||!Number.isSafeInteger(saved.number)||saved.number<1)continue;
    const reference={id:saved.id,number:saved.number,name:String(saved.name||`参考图 ${saved.number}`),mimeType:saved.mimeType,size:saved.size,available:false};
    try{
      const meta=JSON.parse(await readFile(join(options.referenceDirectory,`${saved.id}.json`),'utf8'));
      if(!types[meta.mimeType])throw new Error('参考图类型无效');
      const file=join(options.referenceDirectory,`${saved.id}.${types[meta.mimeType]}`),info=await stat(file);
      reference.size=info.size;reference.mimeType=meta.mimeType;reference.available=true;
      referencePreviews.push({id:saved.id,dataUrl:await preview(file,saved.id,640,options.referenceDirectory)});
    }catch{reference.available=false;}
    references.push(reference);
  }
  const missingReferenceCount=Math.max(0,record.referenceCount-references.filter(ref=>ref.available).length);
  return {item:{...summary(record),path:record.file,wirePrompt:record.prompt||'',references,missingReferenceCount,options:{size:record.size||'auto',ratio:record.ratio||'auto',resolution:record.resolution||'auto',quality:record.quality||'auto'}},imageDataUrl:`data:image/png;base64,${(await readFile(record.file)).toString('base64')}`,referencePreviews};
}

// Remove the history record without breaking paths to images already shared in chat.
export async function deleteImageHistory(id,settings={}) {
  checkId(id);
  const {outputDirectory}={...defaults,...settings};
  const file=join(outputDirectory,`${id}.json`);
  const deletedDirectory=join(outputDirectory,'.deleted-history');
  const archived=join(deletedDirectory,`${id}.json`);
  try {
    const record=JSON.parse(await readFile(file,'utf8'));
    if(record.status!=='completed')throw new Error('此图片尚未生成完成');
    await mkdir(deletedDirectory,{recursive:true,mode:0o700});
    await rename(file,archived);
  } catch(error) {
    if(error.code!=='ENOENT')throw error;
    try{await stat(archived);}catch(checkError){if(checkError.code!=='ENOENT')throw checkError;throw new Error('找不到这条历史记录');}
  }
  return {id,deleted:true};
}
