import {readFile,writeFile,mkdtemp,rename,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {basename,dirname,isAbsolute,join} from 'node:path';
import {promisify} from 'node:util';
import {jobs,outputDir} from './magpie.mjs';

const run = promisify(execFile);
const savePanelScript = `
ObjC.import('AppKit');

function run(argv) {
  const app = $.NSApplication.sharedApplication;
  app.setActivationPolicy($.NSApplicationActivationPolicyAccessory);
  const panel = $.NSSavePanel.savePanel;
  panel.title = '保存 PNG';
  panel.prompt = '保存';
  panel.nameFieldStringValue = argv[0];
  panel.allowedFileTypes = $.NSArray.arrayWithObject('png');
  panel.allowsOtherFileTypes = false;
  panel.canCreateDirectories = true;
  app.activateIgnoringOtherApps(true);
  return panel.runModal === $.NSModalResponseOK ? ObjC.unwrap(panel.URL.path) : '';
}
`;

async function chooseSavePath(name,{signal}){
  try{
    const {stdout}=await run('/usr/bin/osascript',['-l','JavaScript','-e',savePanelScript,name],{timeout:270000,signal});
    return stdout.replace(/\n$/,'') || null;
  }catch(error){
    if(signal?.aborted)throw error;
    throw new Error(error.killed?'保存窗口已超时，请重新下载。':'无法打开系统保存窗口，请重试。',{cause:error});
  }
}

let dialogOpen=false;
// The MCP caller provides a job ID; the destination comes only from the native save panel.
export async function downloadCompletedImage(id,{sourceDirectory=outputDir,choosePath=chooseSavePath,signal}={}){
  if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('图片任务编号无效');
  if(dialogOpen)throw new Error('请先完成当前的保存操作。');
  dialogOpen=true;
  try{
    const job=(sourceDirectory===outputDir&&jobs.get(id))||JSON.parse(await readFile(join(sourceDirectory,`${id}.json`),'utf8'));
    if(job.status!=='completed')throw new Error('图片尚未生成完成，无法下载');
    const bytes=await readFile(join(sourceDirectory,`${id}.png`));
    if(bytes.length<24||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('原图不是有效 PNG，未导出');
    const path=await choosePath(`hzlinkapi-${id.slice(0,8)}.png`,{signal});
    signal?.throwIfAborted();
    if(!path)return {cancelled:true};
    if(!isAbsolute(path)||!/\.png$/i.test(path))throw new Error('请选择一个以 .png 结尾的文件名。');
    // The system panel asks before replacing an existing file. Stage beside it for an atomic write.
    const temp=await mkdtemp(join(dirname(path),'.hzlinkapi-save-'));
    try{
      const staged=join(temp,'image.png');
      await writeFile(staged,bytes,{mode:0o600,signal});
      signal?.throwIfAborted();
      await rename(staged,path);
    }finally{await rm(temp,{recursive:true,force:true});}
    return {path,name:basename(path)};
  }finally{dialogOpen=false;}
}
