import {spawn} from 'node:child_process';
import {homedir} from 'node:os';
import {join,dirname,isAbsolute,basename,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {access,copyFile,mkdir,mkdtemp,realpath,rename,rm,stat} from 'node:fs/promises';

const version='0.3.3-win-beta.1';
const packageDir=dirname(fileURLToPath(import.meta.url));
const home=homedir();
const required=['server.mjs','dist/widget.html','runtime/node.exe','magic-native.exe'];
function callHelper(binary,args,input){
  return new Promise((resolve,reject)=>{
    const child=spawn(binary,args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
    const deadline=setTimeout(()=>child.kill(),args[0]==='pick-magpie'?180000:15000);
    let stdout='',stderr='';
    child.stdout.setEncoding('utf8').on('data',data=>{stdout=(stdout+data).slice(-65536);});
    child.stderr.setEncoding('utf8').on('data',data=>{stderr=(stderr+data).slice(-65536);});
    child.stdin.on('error',()=>{});
    child.stdin.end(input);
    child.once('error',error=>{clearTimeout(deadline);reject(error);});
    child.once('close',code=>{
      clearTimeout(deadline);
      if(code!==0){reject(new Error(stderr.trim()||'本机安装工具未能完成操作。'));return;}
      try{resolve(JSON.parse(stdout));}catch{reject(new Error('本机安装工具未返回有效结果。'));}
    });
  });
}
async function validMagpie(file){
  if(!file||!isAbsolute(file)||!/^magpie(?:[-_][a-z0-9._-]+)?\.exe$/i.test(basename(file)))return false;
  try{return (await stat(file)).isFile();}catch{return false;}
}

export async function install({
  installDirectory=join(process.env.LOCALAPPDATA||join(home,'AppData','Local'),'HZLinkAPI Magic'),
  configDirectory=process.env.CODEX_HOME||join(home,'.codex'),
  arch=process.arch,sourceDirectory=packageDir,
  helper,magpie,allowPick=true
}={}){
  if(!['x64','arm64'].includes(arch))throw new Error('此内测包只支持 64 位 Windows（x64 / ARM64）。');
  const archDirectory=join(sourceDirectory,'runtime',arch);
  helper??=join(archDirectory,'magic-native.exe');
  magpie??=await callHelper(helper,['find-magpie']);
  if(!await validMagpie(magpie)&&allowPick){
    console.log('没有自动找到 Magpie，请在弹出的窗口选中你的 Magpie 程序。');
    magpie=await callHelper(helper,['pick-magpie']);
  }
  if(!await validMagpie(magpie))throw new Error('请先安装并打开 Magpie，再运行此安装器。');
  const appDirectory=join(installDirectory,'app'),dataDirectory=join(installDirectory,'data');
  const installed=join(appDirectory,version+'-'+arch);
  await mkdir(appDirectory,{recursive:true,mode:0o700});
  await mkdir(dataDirectory,{recursive:true,mode:0o700});
  await mkdir(configDirectory,{recursive:true,mode:0o700});
  let present=false;try{present=(await stat(installed)).isDirectory();}catch(error){if(error.code!=='ENOENT')throw error;}
  if(!present){
    const stage=await mkdtemp(join(appDirectory,'.install-'));
    try{
      const copies={
        'server.mjs':join(sourceDirectory,'server.mjs'),
        'dist/widget.html':join(sourceDirectory,'dist','widget.html'),
        'runtime/node.exe':join(archDirectory,'node.exe'),
        'magic-native.exe':join(archDirectory,'magic-native.exe')
      };
      for(const [file,source] of Object.entries(copies)){
        const target=join(stage,file);await mkdir(dirname(target),{recursive:true,mode:0o700});
        await copyFile(source,target);
      }
      await rename(stage,installed);
    }finally{await rm(stage,{recursive:true,force:true});}
  }
  for(const file of required)await access(join(installed,file));
  const config={file:join(await realpath(configDirectory),'config.toml'),backupDirectory:join(installDirectory,'config-backups'),
    command:join(installed,'runtime','node.exe'),server:join(installed,'server.mjs'),data:dataDirectory,magpie};
  const result=await callHelper(helper,['config'],JSON.stringify(config));
  return {...result,installed,dataDirectory};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  console.log('正在安装 HZLinkAPI Magic · Windows 内测版…');
  try{
    if(process.platform!=='win32')throw new Error('请在 Windows 中运行此安装器。');
    const result=await install();
    console.log(result.changed?'安装完成。':'已安装，当前版本可以直接使用。');
    if(result.backup)console.log('安装前的配置已在本机备份到：'+result.backup);
    console.log('请完全退出并重开 ChatGPT。在 Codex 的本机聊天中，点右侧面板「＋」→「HZLinkAPI Magic」。');
  }catch(error){console.error('安装未完成：'+error.message);process.exitCode=1;}
}
