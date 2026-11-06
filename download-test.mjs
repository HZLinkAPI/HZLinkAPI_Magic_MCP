import {JSDOM} from 'jsdom';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {downloadCompletedImage} from './save-image.mjs';
import {imageDownloader} from './image-download.mjs';

const id='bb662535-22a9-40ed-aad8-9971d162e3e0';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=','base64');
const root=await mkdtemp(join(tmpdir(),'hzlinkapi-download-test-'));
try{
  const sourceDirectory=join(root,'outputs'),folder=join(root,'另选 保存目录'),name='我的图片.png',path=join(folder,name);
  await mkdir(sourceDirectory);await mkdir(folder);
  await writeFile(join(sourceDirectory,`${id}.json`),JSON.stringify({status:'completed',file:'/ignored/unsafe/path.png'}));
  await writeFile(join(sourceDirectory,`${id}.png`),png);
  const cancelled=await downloadCompletedImage(id,{sourceDirectory,choosePath:async()=>null});
  assert.deepEqual(cancelled,{cancelled:true});assert.deepEqual(await readdir(folder),[]);
  const saved=await downloadCompletedImage(id,{sourceDirectory,choosePath:async suggested=>{
    assert.equal(suggested,'hzlinkapi-bb662535.png');
    assert.deepEqual(await readdir(folder),[],'Do not write before the user chooses a destination');
    return path;
  }});
  assert.deepEqual(saved,{path,name});assert.deepEqual(await readFile(path),png);
  await writeFile(path,'existing file');
  await downloadCompletedImage(id,{sourceDirectory,choosePath:async()=>path});
  assert.deepEqual(await readFile(path),png,'Replace only after the native panel returns a confirmed path');
  await assert.rejects(downloadCompletedImage(id,{sourceDirectory,choosePath:async()=>join(folder,'not-png.jpg')}),/\.png/);
  assert.deepEqual(await readdir(folder),[name]);
  await writeFile(join(sourceDirectory,`${id}.json`),JSON.stringify({status:'running'}));
  await assert.rejects(downloadCompletedImage(id,{sourceDirectory,choosePath:async()=>assert.fail('Invalid job must not open a window')}),/尚未生成完成/);
  await assert.rejects(downloadCompletedImage('../private',{sourceDirectory}),/编号无效/);
}finally{await rm(root,{recursive:true,force:true});}

const dom=new JSDOM('<button>下载 PNG</button>');
const button=dom.window.document.querySelector('button');
let calls=0,message='',isError=false,job={id},cancelled=false,fail=false,oldServer=false,release;
const app={callServerTool:async args=>{
  calls++;assert.deepEqual(args,{name:'save_image_as',arguments:{id}});
  if(oldServer)return {isError:true,content:[{type:'text',text:'Tool save_image_as not found'}]};
  if(fail)return {isError:true,content:[{type:'text',text:'磁盘不可写'}]};
  if(release)await new Promise(resolve=>{release=resolve;});
  return {structuredContent:cancelled?{cancelled:true}:{path:'/chosen/path/我的图片.png'}};
}};
imageDownloader({app,button,getJob:()=>job,status:(text,error=false)=>{message=text;isError=error;}});
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
assert.equal(calls,0);
button.click();await tick();assert.equal(calls,1);assert.match(message,/PNG 已保存到：\/chosen\/path/);assert.equal(button.disabled,false);
cancelled=true;button.click();await tick();assert.match(message,/已取消/);assert.equal(isError,false);cancelled=false;
fail=true;button.click();await tick();assert.match(message,/下载失败.*磁盘不可写/);assert.equal(button.disabled,false);fail=false;
oldServer=true;button.click();await tick();assert.match(message,/旧版.*⌘Q/);oldServer=false;
release=true;const count=calls;button.click();button.click();await tick();assert.equal(calls,count+1);assert.equal(button.disabled,true);assert.match(message,/选择位置/);release();await tick();release=null;assert.equal(button.disabled,false);
job=null;const total=calls;button.click();await tick();assert.equal(calls,total);
dom.window.close();
console.log('PNG export: chosen path, confirmation, cancel, exact bytes, button feedback and duplicate clicks: PASS.');
