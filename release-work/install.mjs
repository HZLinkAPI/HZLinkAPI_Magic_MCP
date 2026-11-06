import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {homedir} from 'node:os';
import {join,dirname,isAbsolute,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {access,chmod,copyFile,mkdir,mkdtemp,readFile,realpath,rename,rm,writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';

const betaVersion='0.3.3-beta.1';
const packageDir=dirname(fileURLToPath(import.meta.url));
const serverName='hzlinkapi_creator';
const keys=['server.mjs','dist/widget.html','runtime/node'];
async function executable(path){try{await access(path,constants.X_OK);return true;}catch{return false;}}
async function firstExecutable(paths){for(const path of paths)if(await executable(path))return path;}
async function findAppBinary(appName,suffix,bundleId){
  const standard=await firstExecutable(['/Applications',join(homedir(),'Applications')].map(dir=>join(dir,appName,suffix)));
  if(standard)return standard;
  try{
    const locations=execFileSync('/usr/bin/mdfind',['-0',`kMDItemCFBundleIdentifier == '${bundleId}'`],{encoding:'utf8',timeout:3000}).split('\0').filter(isAbsolute);
    return await firstExecutable(locations.map(dir=>join(dir,suffix)));
  }catch{}
}
function configSession(codex,configDirectory){
  const child=spawn(codex,['app-server','--stdio'],{cwd:configDirectory,env:{...process.env,CODEX_HOME:configDirectory},stdio:['pipe','pipe','ignore']});
  const lines=createInterface({input:child.stdout});
  const pending=new Map();let next=0;
  const rejectAll=error=>{for(const call of pending.values()){clearTimeout(call.timer);call.reject(error);}pending.clear();};
  child.once('error',rejectAll);child.stdin.on('error',rejectAll);
  child.once('exit',()=>rejectAll(new Error('无法连接桌面端的本地配置工具。')));
  lines.on('line',line=>{
    let message;try{message=JSON.parse(line);}catch{return;}
    const call=pending.get(message.id);if(!call)return;
    clearTimeout(call.timer);pending.delete(message.id);
    if(message.error)call.reject(new Error(message.error.message||'桌面端拒绝更新配置。'));
    else call.resolve(message.result);
  });
  return {
    request(method,params){return new Promise((resolve,reject)=>{
      const id=++next;
      const timer=setTimeout(()=>{pending.delete(id);reject(new Error('桌面端配置工具没有及时响应。'));},12000);
      pending.set(id,{resolve,reject,timer});
      child.stdin.write(JSON.stringify({id,method,params})+'\n');
    });},
    initialized(){child.stdin.write(JSON.stringify({method:'initialized'})+'\n');},
    close(){lines.close();child.stdin.end();if(child.exitCode===null)child.kill();}
  };
}

export async function install({
  installDirectory=join(homedir(),'Library','Application Support','HZLinkAPI Magic'),
  configDirectory=process.env.CODEX_HOME||join(homedir(),'.codex'),
  codex,magpie
}={}){
  if(process.platform!=='darwin'||!['arm64','x64'].includes(process.arch))throw new Error('此安装包仅用于 macOS。');
  codex??=await findAppBinary('ChatGPT.app','Contents/Resources/codex-cli/bin/codex','com.openai.codex');
  if(!codex)throw new Error('找不到新版 ChatGPT 桌面端。请先把 ChatGPT.app 放到「应用程序」。');
  magpie??=await findAppBinary('magpie.app','Contents/MacOS/magpie','com.yetone.magpie');
  if(!magpie)throw new Error('找不到 Magpie。请先把 magpie.app 放到「应用程序」。');

  const dataDirectory=join(installDirectory,'data'),appDirectory=join(installDirectory,'app');
  const installed=join(appDirectory,betaVersion),runtimeSource=join(packageDir,'runtime',process.arch,'node');
  await mkdir(dataDirectory,{recursive:true,mode:0o700});
  await mkdir(appDirectory,{recursive:true,mode:0o700});
  await mkdir(configDirectory,{recursive:true,mode:0o700});
  const targetConfig=await realpath(configDirectory);
  const configFile=join(targetConfig,'config.toml');
  if(!await executable(join(installed,'runtime','node'))){
    const stage=await mkdtemp(join(appDirectory,'.install-'));
    try{
      for(const file of keys){
        const target=join(stage,file);await mkdir(dirname(target),{recursive:true,mode:0o700});
        await copyFile(file==='runtime/node'?runtimeSource:join(packageDir,file),target);
        if(file==='runtime/node')await chmod(target,0o755);
      }
      await rename(stage,installed);
    }finally{await rm(stage,{recursive:true,force:true});}
  }
  for(const file of keys)await access(join(installed,file),constants.R_OK);

  const server={command:join(installed,'runtime','node'),args:[join(installed,'server.mjs')],tool_timeout_sec:300,
    env:{HZLINKAPI_MAGIC_DATA_DIR:dataDirectory,HZLINKAPI_MAGIC_MAGPIE_BIN:magpie}};
  const session=configSession(codex,targetConfig);
  let backup;
  try{
    await session.request('initialize',{clientInfo:{name:'hzlinkapi-magic-installer',version:betaVersion},capabilities:{experimentalApi:true}});
    session.initialized();
    const response=await session.request('config/read',{includeLayers:true});
    const layer=response.layers?.find(item=>item.name?.type==='user'&&!item.name.profile);
    if(layer?.disabledReason)throw new Error('当前桌面端策略不允许修改本地配置。');
    const previous=layer?.config?.mcp_servers?.[serverName];
    const already=previous?.command===server.command&&previous.args?.[0]===server.args[0]
      &&previous.tool_timeout_sec===server.tool_timeout_sec&&previous.enabled!==false
      &&Object.entries(server.env).every(([key,value])=>previous.env?.[key]===value)
      &&layer?.config?.features?.enable_mcp_apps===true;
    if(!already){
      let bytes;try{bytes=await readFile(configFile);}catch(error){if(error.code!=='ENOENT')throw error;}
      if(bytes){
        const backups=join(installDirectory,'config-backups');
        await mkdir(backups,{recursive:true,mode:0o700});
        const folder=await mkdtemp(join(backups,'before-install-'));
        backup=join(folder,'config.toml');await writeFile(backup,bytes,{flag:'wx',mode:0o600});
      }
      const write=await session.request('config/batchWrite',{
        filePath:configFile,expectedVersion:layer?.version,
        edits:[
          {keyPath:'mcp_servers.'+serverName,value:server,mergeStrategy:'replace'},
          {keyPath:'features.enable_mcp_apps',value:true,mergeStrategy:'replace'}
        ]
      });
      if(write.status==='okOverridden')throw new Error('配置已写入，但被桌面端策略覆盖。请检查当前组织的 MCP 设置。');
    }
    return {installed,dataDirectory,backup,replaced:!!previous&&previous.command!==server.command,already};
  }finally{session.close();}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  console.log('正在安装 HZLinkAPI Magic…');
  try{
    const result=await install();
    console.log(result.already?'已安装，当前版本可以直接使用。':'安装完成。');
    if(result.backup)console.log('安装前配置已备份到：'+result.backup);
    if(result.replaced)console.log('已更新同名入口。已有内测版图库和偏好会保留，旧原型文件仍留在原目录。');
    console.log('请完全退出并重开 ChatGPT，在 Codex 聊天右侧面板点「＋」→「HZLinkAPI Magic」。');
  }catch(error){console.error('安装未完成：'+error.message);process.exitCode=1;}
}
