import {mkdir,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {homedir} from 'node:os';
import {dirname,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';

const home=homedir();
const base=process.platform==='win32'
  ?process.env.LOCALAPPDATA||join(home,'AppData','Local')
  :join(home,'Library','Application Support');
const directory=process.env.HZLINKAPI_MAGIC_DATA_DIR||join(base,'HZLinkAPI Magic','data');
const path=join(directory,'preferences.json');
const schema=z.object({language:z.enum(['zh-CN','en']),theme:z.enum(['system','light','dark'])});
let pending=Promise.resolve();

export async function readPreferences(file=path){
  try{
    const raw=JSON.parse(await readFile(file,'utf8'));
    const parsed=schema.safeParse(raw);
    return parsed.success?parsed.data:null;
  }catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError)return null;throw error;}
}
export function writePreferences(preferences,file=path){
  const saved=schema.parse(preferences);
  const next=pending.then(async()=>{
    await mkdir(dirname(file),{recursive:true,mode:0o700});
    const temp=file+'.'+randomUUID()+'.tmp';
    try{await writeFile(temp,JSON.stringify(saved),{mode:0o600,flag:'wx'});await rename(temp,file);}
    finally{await rm(temp,{force:true});}
    return saved;
  });
  pending=next.catch(()=>{});
  return next;
}
export function registerPreferences(server,meta){
  server.registerTool('get_magic_preferences',{
    description:'读取本机 HZLinkAPI Magic 的语言和主题。',inputSchema:{},
    annotations:{readOnlyHint:true,openWorldHint:false},_meta:meta
  },async()=>({content:[],structuredContent:{preferences:await readPreferences()}}));
  server.registerTool('set_magic_preferences',{
    description:'仅在用户切换语言或主题时，保存本机面板偏好。',inputSchema:schema.shape,
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},_meta:meta
  },async preferences=>({content:[],structuredContent:{preferences:await writePreferences(preferences)}}));
}
