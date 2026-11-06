import assert from 'node:assert/strict';
import {access,copyFile,mkdir,mkdtemp,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const stage=process.argv[2]||fileURLToPath(new URL('./stage/HZLinkAPI Magic Windows',import.meta.url));
const helper=fileURLToPath(new URL('./work/magic-native-host-test',import.meta.url));
const {install}=await import(pathToFileURL(join(stage,'install.mjs')));
const temp=await mkdtemp(join(tmpdir(),'hzlm-windows-check-'));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAECAYAAACzzX7wAAAAD0lEQVR4nGJiIADooAAwAAMYAAlC0FUlAAAAAElFTkSuQmCC','base64');
const model='fixture/gpt-image-2.5-flare';
const gateway=createServer((req,res)=>{
  assert.equal(req.url,'/v1/models?kind=image');
  res.writeHead(200,{'Content-Type':'application/json'});
  res.end(JSON.stringify({data:[{id:model,kind:'image'},{id:'fixture/video',kind:'video'}]}));
});
await new Promise(resolve=>gateway.listen(0,'127.0.0.1',resolve));
try{
  const configDirectory=join(temp,'原有配置'),installDirectory=join(temp,'安装 Magic'),programs=join(temp,'Magpie App');
  const magpie=join(programs,'magpie.exe'),portable=join(programs,'data');
  await mkdir(configDirectory);await mkdir(portable,{recursive:true});
  await writeFile(join(portable,'settings.json'),JSON.stringify({port:gateway.address().port}));
  await writeFile(join(portable,'providers.json'),JSON.stringify({providers:[{id:'fixture',name:'测试供应商'}]}));
  const original='# Keep comment\r\n[features]\r\nenable_mcp_apps = false\r\n[mcp_servers.other]\r\ncommand = "keep"\r\n';
  await writeFile(join(configDirectory,'config.toml'),original);
  const sourcePNG=join(temp,'源图.png'),jpeg=join(temp,'供应商结果.jpg');
  await writeFile(sourcePNG,png);
  execFileSync('/usr/bin/sips',['-s','format','jpeg',sourcePNG,'--out',jpeg],{stdio:'ignore'});
  await writeFile(magpie,`#!/bin/bash
set -eu
[[ "$1" == tool && "$2" == generate_image ]]
shift 2
while (($#)); do
 case "$1" in
 --model) model="$2" ;;
 -o) output="$2" ;;
 --reference_images) test -f "$2"; reference=1 ;;
 esac
 shift 2
done
[[ "$model" == fixture/gpt-image-2.5-flare && "$reference" == 1 ]]
/bin/cp "$HZLM_FIXTURE_JPEG" "\${output%.png}.jpg"
printf 'Generated with %s, saved to:\\n' "$model"
`,{mode:0o700});
  const installed=await install({installDirectory,configDirectory,helper,magpie,arch:'x64',allowPick:false});
  assert(installed.changed);
  assert.equal(await readFile(installed.backup,'utf8'),original);
  const config=await readFile(join(configDirectory,'config.toml'),'utf8');
  assert.match(config,/# Keep comment\r\n/);
  assert.match(config,/\[mcp_servers\.other\]\r\ncommand = "keep"/);
  assert.match(config,/\[mcp_servers\.hzlinkapi_creator\]/);
  assert(config.includes(installed.dataDirectory));
  await writeFile(join(installed.dataDirectory,'sentinel'),'unchanged');
  assert.equal((await install({installDirectory,configDirectory,helper,magpie,arch:'x64',allowPick:false})).changed,false);
  assert.equal(await readFile(join(installed.dataDirectory,'sentinel'),'utf8'),'unchanged');
  const freshConfig=join(temp,'fresh config'),freshInstall=join(temp,'fresh ARM install');
  const fresh=await install({installDirectory:freshInstall,configDirectory:freshConfig,helper,magpie,arch:'arm64',allowPick:false});
  assert(fresh.changed);assert(!fresh.backup);
  for(const [root,expected] of [[installed.installed,0x8664],[fresh.installed,0xaa64]]){
    for(const path of [join(root,'runtime','node.exe'),join(root,'magic-native.exe')]){
      const binary=await readFile(path);
      assert.equal(binary.subarray(0,2).toString(),'MZ');
      const pe=binary.readUInt32LE(0x3c);assert.equal(binary.readUInt16LE(pe+4),expected);
    }
  }
  const saveFixture=join(temp,'save-dialog-choice.json'),bridge=join(temp,'native bridge');
  await writeFile(saveFixture,JSON.stringify(''));
  await writeFile(bridge,`#!/bin/bash
if [[ "$1" == save-as ]]; then exec /bin/cat "$HZLM_FIXTURE_SAVE"; fi
exec "$HZLM_FIXTURE_NATIVE" "$@"
`,{mode:0o700});
  const client=new Client({name:'windows-beta-offline',version:'1.0.0'},{capabilities:{}});
  await client.connect(new StdioClientTransport({
    command:process.execPath,args:[join(installed.installed,'server.mjs')],cwd:temp,stderr:'inherit',
    env:{...process.env,HZLINKAPI_MAGIC_DATA_DIR:installed.dataDirectory,HZLINKAPI_MAGIC_MAGPIE_BIN:magpie,
      HZLINKAPI_MAGIC_NATIVE_BIN:bridge,HZLM_FIXTURE_NATIVE:helper,HZLM_FIXTURE_SAVE:saveFixture,HZLM_FIXTURE_JPEG:jpeg}
  }));
  async function call(name,args={}){
    const r=await client.callTool({name,arguments:args});assert(!r.isError,r.structuredContent?.job?.error||r.content?.[0]?.text);return r;
  }
  try{
    const {tools}=await client.listTools();
    const open=tools.find(tool=>tool.name==='open_creator');
    assert.deepEqual(open._meta['openai/ui'].entrypoints,[{type:'thread'}]);
    const html=await client.readResource({uri:open._meta.ui.resourceUri});
    assert(html.contents[0].text.includes('HZLinkAPI Magic'));
    const models=(await call('list_image_models')).structuredContent.models;
    assert.equal(models.length,1);assert.equal(models[0].providerName,'测试供应商');
    const ref=(await call('upload_reference_chunk',{uploadId:randomUUID(),chunkIndex:0,final:true,mimeType:'image/png',name:'参考图.png',data:png.toString('base64')})).structuredContent.reference;
    const id=randomUUID();
    await call('start_image',{requestId:id,model,prompt:'参考图1：离线测试。',referenceIds:[ref.id]});
    let result;
    for(let i=0;i<200;i++){
      result=(await call('get_image_result',{id})).structuredContent.job;
      if(result.status==='completed')break;
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert.equal(result.status,'completed');
    assert.equal(result.path,join(installed.dataDirectory,'outputs',id+'.png'));
    assert.deepEqual(await readFile(join(installed.dataDirectory,'outputs',id+'.jpg')),await readFile(jpeg));
    const generated=await readFile(result.path);assert.deepEqual(generated.subarray(0,8),png.subarray(0,8));
    const history=await call('list_image_history');
    assert.equal(history.structuredContent.items[0].id,id);assert(history._meta.thumbnails[0].dataUrl.startsWith('data:image/png;base64,'));
    assert.equal((await call('get_image_history',{id}))._meta.referencePreviews[0].id,ref.id);
    assert.equal((await call('save_image_as',{id})).structuredContent.cancelled,true);
    const destination=join(temp,'用户选的 另存为.png');
    await writeFile(saveFixture,JSON.stringify(destination));
    assert.equal((await call('save_image_as',{id})).structuredContent.path,destination);
    assert.deepEqual(await readFile(destination),generated);
    assert.equal((await call('delete_image_history',{id})).structuredContent.deleted,true);
    assert.equal((await call('list_image_history')).structuredContent.total,0);
    await access(result.path);await access(destination);
  }finally{await client.close();}
  console.log('Windows beta offline integration: x64/ARM64 payload, clean install, config backup/reinstall, portable Magpie discovery, selected model and reference, JPEG→PNG, gallery thumbnails, save/cancel and history delete: PASS.');
}finally{gateway.close();await rm(temp,{recursive:true,force:true});}
