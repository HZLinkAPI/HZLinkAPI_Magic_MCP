import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {prepareReferenceImages} from './reference-input.mjs';
import {generationArgs} from './magpie.mjs';

// Header-only fixtures exercise routing and dimensions; the converter is mocked.
function header(width,height){
  const bytes=Buffer.alloc(24);
  Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
  bytes.write('IHDR',12);bytes.writeUInt32BE(width,16);bytes.writeUInt32BE(height,20);
  return bytes;
}
const directory=await mkdtemp(join(process.env.PI_SCRATCH_DIR||tmpdir(),'reference-input-test-'));
try{
  const large={file:join(directory,'原图.png'),name:'地图.png',mimeType:'image/png',bytes:header(9463,6590)};
  const small={file:join(directory,'参考图.png'),name:'参考图.png',mimeType:'image/png',bytes:header(1512,1297)};
  await writeFile(large.file,large.bytes);await writeFile(small.file,small.bytes);
  const calls=[];
  const prepared=await prepareReferenceImages([large,small],directory,async(source,target,max)=>{
    calls.push({source,target,max});await writeFile(target,header(2048,1426));
  });
  assert.equal(calls.length,1);assert.equal(calls[0].source,large.file);assert.equal(calls[0].max,2048);
  assert.notEqual(prepared[0].file,large.file);assert.equal(prepared[0].name,large.name);assert.equal(prepared[1],small);
  assert.deepEqual(await readFile(large.file),large.bytes);assert.deepEqual(await readFile(small.file),small.bytes);
  assert.equal(prepared[0].bytes.readUInt32BE(16),2048);assert.equal(prepared[0].bytes.readUInt32BE(20),1426);
  const args=generationArgs({model:'fixture/gpt-image-2.5-sunburst',prompt:'test'},join(directory,'output.png'),prepared);
  assert.deepEqual(args.slice(args.indexOf('--reference_images')),['--reference_images',prepared[0].file,'--reference_images',small.file]);
  const noConversion=()=>{throw new Error('Unexpected conversion');};
  const boundary={...small,bytes:header(2048,1024)};
  const jpeg={...small,mimeType:'image/jpeg',bytes:Buffer.from([255,216,255])};
  assert.deepEqual(await prepareReferenceImages([small,boundary,jpeg],directory,noConversion),[small,boundary,jpeg]);
  assert.deepEqual(await prepareReferenceImages([],directory,noConversion),[]);
  for(const [width,height] of [[6590,9463],[3000,3000],[9463,1]]){
    const source={...large,bytes:header(width,height)};
    const scaled=await prepareReferenceImages([source],directory,async(_source,target,max)=>{
      const scale=max/Math.max(width,height);
      await writeFile(target,header(Math.max(1,Math.floor(width*scale)),Math.max(1,Math.floor(height*scale))));
    });
    assert.equal(Math.max(scaled[0].bytes.readUInt32BE(16),scaled[0].bytes.readUInt32BE(20)),2048);
  }
  await assert.rejects(prepareReferenceImages([large],directory,async()=>{throw new Error('decoder failure');}),/参考图 1.*原图未修改.*decoder failure/);
  for(const invalid of [Buffer.from('not a PNG'),header(9463,6590),header(2048,2048),header(0,0)]){
    await assert.rejects(prepareReferenceImages([large],directory,async(_source,target)=>{await writeFile(target,invalid);}),/缩放结果尺寸无效/);
  }
  assert.deepEqual(await readFile(large.file),large.bytes);
  console.log('Reference input: large PNG staging, aspect ratio, passthrough, input order, original preservation and conversion failures: PASS. No image generated.');
}finally{await rm(directory,{recursive:true,force:true});}
