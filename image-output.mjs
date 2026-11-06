import {constants} from 'node:fs';
import {copyFile,lstat,mkdtemp,open,rename,rm} from 'node:fs/promises';
import {dirname,extname,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const png=Buffer.from([137,80,78,71,13,10,26,10]);
const run=promisify(execFile);
const suffixes=['.png','.jpg','.jpeg','.webp'];

async function inspect(file) {
  let info;
  try{info=await lstat(file);}catch(error){if(error.code==='ENOENT')return null;throw error;}
  if(!info.isFile())throw new Error('Magpie 的输出不是普通图片文件');
  const handle=await open(file,'r');
  try{
    const header=Buffer.alloc(24);
    const {bytesRead}=await handle.read(header,0,header.length,0);
    if(bytesRead===24&&header.subarray(0,8).equals(png)&&header.toString('ascii',12,16)==='IHDR'){
      const width=header.readUInt32BE(16),height=header.readUInt32BE(20);
      if(width&&height)return {format:'png',dimensions:{width,height}};
    }
    if(bytesRead>=3&&header[0]===255&&header[1]===216&&header[2]===255)return {format:'jpeg'};
    if(bytesRead>=12&&header.toString('ascii',0,4)==='RIFF'&&header.toString('ascii',8,12)==='WEBP')return {format:'webp'};
    throw new Error('Magpie 的输出不是有效的 PNG、JPEG 或 WebP 图片');
  }finally{await handle.close();}
}

export async function macImageToPNG(source,target) {
  await run('/usr/bin/sips',['-s','format','png',source,'--out',target],{timeout:30000,maxBuffer:65536});
}

// Only accept this task's filenames. Magpie may replace the -o extension.
export async function normalizeImageOutput(requested, target, convert) {
  const stem=requested.slice(0,-extname(requested).length),targetStem=target.slice(0,-extname(target).length);
  let source,format,dimensions;
  for(const ext of suffixes){
    const candidate=stem+ext,found=await inspect(candidate);
    if(found){source=candidate;({format,dimensions}=found);break;}
  }
  if(!source)throw new Error('Magpie 没有写出可用的图片文件');
  const originalFormat=format;
  if(format==='png'&&source===target)return {dimensions,originalFormat};
  if(format!=='png'){
    const original=targetStem+(format==='jpeg'?'.jpg':'.webp');
    // Keep a legacy .jpeg sidecar in place when it already is the original.
    if(source!==original&&!(format==='jpeg'&&source===targetStem+'.jpeg')){
      await copyFile(source,original,constants.COPYFILE_EXCL);
      source=original;
    }
  }
  const directory=await mkdtemp(join(dirname(target),'.png-'));
  try{
    const temporary=join(directory,'result.png');
    if(format==='png')await copyFile(source,temporary,constants.COPYFILE_EXCL);
    else await convert(source,temporary);
    const converted=await inspect(temporary);
    if(converted?.format!=='png')throw new Error('生成文件未能转换为有效 PNG');
    await rename(temporary,target);
    return {dimensions:converted.dimensions,originalFormat};
  }finally{await rm(directory,{recursive:true,force:true});}
}
