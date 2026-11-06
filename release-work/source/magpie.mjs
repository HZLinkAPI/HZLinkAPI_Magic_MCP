import { readFile,mkdir,mkdtemp,writeFile,rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { capabilities,validateOptions,grokSize } from './options.mjs';
import { loadReferences } from './references.mjs';
import { generationMetadata,persistImageRecord } from './image-history.mjs';
import { normalizeImageOutput,macImageToPNG } from '../../image-output.mjs';
import { outputDirectory } from './storage.mjs';
export const root=dirname(fileURLToPath(import.meta.url));
export const outputDir=outputDirectory;
export const jobs=new Map();
const cli=process.env.HZLINKAPI_MAGIC_MAGPIE_BIN||'/Applications/magpie.app/Contents/MacOS/magpie';
export const redact=s=>String(s).replace(/https?:\/\/\S+/g,'[链接已省略]').replace(/(?:sk|mp)-[\w-]+/g,'[密钥已省略]');
async function providers(){try{const {providers}=JSON.parse(await readFile(join(homedir(),'.config/magpie/providers.json'),'utf8'));return Array.isArray(providers)?providers:[];}catch{return [];}}
async function base(){let port=3425;try{const c=JSON.parse(await readFile(join(homedir(),'.config/magpie/settings.json'),'utf8'));if(Number.isInteger(c.port)&&c.port>0&&c.port<=65535)port=c.port;}catch{}return `http://127.0.0.1:${port}`;}
export async function imageModels(){
  let response;
  try{response=await fetch(`${await base()}/v1/models?kind=image`,{signal:AbortSignal.timeout(6000),redirect:'error'});}
  catch(error){throw new Error('无法连接本机 Magpie。请打开 Magpie，确认已配置生图模型后，再点刷新。',{cause:error});}
  if(!response.ok)throw new Error(`Magpie 模型目录读取失败：HTTP ${response.status}`);
  const {data}=await response.json();if(!Array.isArray(data))throw new Error('Magpie 模型目录格式无效');
  const ps=await providers();
  return data.filter(m=>m.kind==='image'&&typeof m.id==='string'&&!/video/i.test(m.id)).map(m=>{const provider=m.id.split('/')[0],p=ps.find(p=>p.id===provider);return{id:m.id,name:m.display_name||m.id,provider,providerName:p?.name||provider,capabilities:capabilities(m.id)};});
}
function run(command,args){return new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:['ignore','pipe','pipe'],shell:false});let output='';const collect=b=>{output=(output+b.toString()).slice(-32000);};child.stdout.on('data',collect);child.stderr.on('data',collect);const timeout=setTimeout(()=>child.kill('SIGTERM'),6*60*1000);child.on('error',e=>{clearTimeout(timeout);reject(e);});child.on('close',code=>{clearTimeout(timeout);if(code!==0)reject(new Error(output.trim()||`进程退出：${code}`));else resolve(output);});});}
export function generationArgs(a,file,refs=[]) {
  const size=capabilities(a.model).family==='grok'?grokSize(a.ratio,a.resolution):a.size||'auto';
  const args=['tool','generate_image','--model',a.model,'--size',size,'--prompt',a.prompt,'-o',file];
  if(a.quality&&a.quality!=='auto')args.push('--quality',a.quality);
  for(const ref of refs)args.push('--reference_images',ref.file);
  return args;
}
export async function startImage(a){
  if(jobs.has(a.requestId))return publicJob(jobs.get(a.requestId));validateOptions(a);
  await mkdir(outputDir,{recursive:true,mode:0o700});
  const ms=await imageModels();if(!ms.some(m=>m.id===a.model))throw new Error('模型不在当前可用列表中，请刷新重选');
  const refs=await loadReferences(a.referenceIds||[]);
  const metadata=generationMetadata(a,refs);
  if(jobs.has(a.requestId))return publicJob(jobs.get(a.requestId));
  if([...jobs.values()].some(j=>j.status==='running'))throw new Error('已有图片生成中，请先等待完成');
  const id=a.requestId||randomUUID(),file=join(outputDir,`${id}.png`);
  const job={id,model:a.model,...metadata,size:a.size||'auto',ratio:a.ratio||'auto',resolution:a.resolution||'auto',quality:a.quality||'auto',referenceCount:refs.length,file,status:'running',startedAt:new Date().toISOString(),transport:'magpie-tool'};
  jobs.set(id,job);try{await persistImageRecord(job);}catch(error){jobs.delete(id);throw error;}void execute(job,{...a,prompt:metadata.prompt},refs);return publicJob(job);
}
async function execute(job,a,refs){
  let staging;
  try{
    staging=await mkdtemp(join(outputDir,`.${job.id}-`));
    const requested=join(staging,`${job.id}.png`);
    const text=await run(cli,generationArgs(a,requested,refs));
    const served=text.match(/^Generated with (\S+?)(?:\. The images?\b|, saved to:)/m)?.[1];
    if(served!==a.model)throw new Error('Magpie 未确认使用指定模型；没有换模型重试');
    Object.assign(job,await normalizeImageOutput(requested,job.file,macImageToPNG));
    job.status='completed';
  }catch(e){job.status='failed';job.error=redact(e.message);await writeFile(join(outputDir,`${job.id}.diagnostic.json`),JSON.stringify({error:String(e.message),downloadUrl:job.downloadUrl||null},null,2),{mode:0o600});}
  finally{if(staging)await rm(staging,{recursive:true,force:true}).catch(()=>{});}
  job.finishedAt=new Date().toISOString();await persistImageRecord(job);
}
export function publicJob(j){return{id:j.id,model:j.model,status:j.status,startedAt:j.startedAt,...(j.status==='completed'?{path:j.file,dimensions:j.dimensions}:{}),...(j.error?{error:j.error}:{})};}
export async function imageJob(id){
  let job=jobs.get(id);
  if(!job){if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('任务编号无效');try{job=JSON.parse(await readFile(join(outputDir,`${id}.json`),'utf8'));}catch{throw new Error('找不到该生成任务');}job.file=join(outputDir,`${id}.png`);if(job.status==='running')throw new Error('MCP 在任务期间重启，无法确认结果；不要重复生成，请先核查原任务');}
  const meta={};if(job.status==='completed')meta.imageDataUrl=`data:image/png;base64,${(await readFile(job.file)).toString('base64')}`;
  return{content:[{type:'text',text:job.status}],structuredContent:{job:publicJob(job)},_meta:meta,...(job.status==='failed'?{isError:true}:{})};
}
