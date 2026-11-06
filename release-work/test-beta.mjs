import assert from 'node:assert/strict';
import {access,readFile,writeFile,mkdir,mkdtemp,rm,readdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const {install}=await import(process.argv[2]?pathToFileURL(join(process.argv[2],'install.mjs')):new URL('./stage/HZLinkAPI Magic/install.mjs',import.meta.url));
const temp=await mkdtemp(join(tmpdir(),'hzlm-release-check-'));
const codex='/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex';
const magpie='/Applications/magpie.app/Contents/MacOS/magpie';
const configDirectory=join(temp,'fresh codex'),installDirectory=join(temp,'测试安装 Magic');
const seededConfigDirectory=join(temp,'existing codex'),seededInstallDirectory=join(temp,'已有原型 Magic');
const fixtureConfig='# keep this comment\n[features]\nenable_mcp_apps = false\n\n[mcp_servers.other]\ncommand = "untouched"\n\n[mcp_servers.hzlinkapi_creator]\ncommand = "/old/prototype/node"\nargs = ["/old/prototype/server.mjs"]\n';
const fixtureMagpie=join(temp,'mock-magpie');
await writeFile(fixtureMagpie,`#!/bin/bash
set -eu
[[ "$1" == tool && "$2" == generate_image ]]
shift 2
while (($#)); do
 case "$1" in
 --model) model="$2" ;;
 -o) output="$2" ;;
 --reference_images) source="$2" ;;
 esac
 shift 2
done
/usr/bin/sips -s format jpeg "$source" --out "\${output%.png}.jpg" >/dev/null
printf 'Generated with %s. The image was saved.\\n' "$model"
`,{mode:0o700});
try{
  const installed=await install({configDirectory,installDirectory,codex,magpie});
  assert.equal(installed.backup,undefined);assert.equal(installed.replaced,false);
  const fresh=await readFile(join(configDirectory,'config.toml'),'utf8');
  assert.match(fresh,/\[mcp_servers\.hzlinkapi_creator\]/);
  assert.match(fresh,/enable_mcp_apps = true/);
  assert(fresh.includes(installed.dataDirectory));
  const sentinel=join(installed.dataDirectory,'existing-data.test');
  await writeFile(sentinel,'keep on reinstall');
  const again=await install({configDirectory,installDirectory,codex,magpie});
  assert.equal(again.already,true);assert.equal(again.backup,undefined);
  assert.equal(await readFile(sentinel,'utf8'),'keep on reinstall');

  await mkdir(seededConfigDirectory);
  await writeFile(join(seededConfigDirectory,'config.toml'),fixtureConfig);
  const updated=await install({configDirectory:seededConfigDirectory,installDirectory:seededInstallDirectory,codex,magpie});
  assert(updated.replaced);assert.equal(await readFile(updated.backup,'utf8'),fixtureConfig);
  assert.equal((await stat(updated.backup)).mode&0o777,0o600);
  const changed=await readFile(join(seededConfigDirectory,'config.toml'),'utf8');
  assert.match(changed,/# keep this comment/);assert.match(changed,/\[mcp_servers\.other\]\ncommand = "untouched"/);
  assert(!changed.includes('/old/prototype/'));
  assert.equal((await install({configDirectory:seededConfigDirectory,installDirectory:seededInstallDirectory,codex,magpie})).already,true);

  const client=new Client({name:'hzlm-beta-archive-test',version:'1.0.0'},{capabilities:{}});
  await client.connect(new StdioClientTransport({
    command:join(installed.installed,'runtime','node'),args:[join(installed.installed,'server.mjs')],
    env:{...process.env,HZLINKAPI_MAGIC_DATA_DIR:installed.dataDirectory,HZLINKAPI_MAGIC_MAGPIE_BIN:fixtureMagpie},
    cwd:temp,stderr:'inherit'
  }));
  try{
    const {tools}=await client.listTools();
    const open=tools.find(tool=>tool.name==='open_creator');
    assert.equal(open.title,'HZLinkAPI Magic');
    assert.deepEqual(open._meta['openai/ui'].entrypoints,[{type:'thread'}]);
    const resource=await client.readResource({uri:open._meta.ui.resourceUri});
    assert(resource.contents[0].text.includes('HZLinkAPI Magic'));
    assert(resource.contents[0].text.includes('save_image_as'));
    const history=await client.callTool({name:'list_image_history',arguments:{}});
    assert.equal(history.structuredContent.total,0);
    assert.equal(history.structuredContent.canDelete,true);
    const models=await client.callTool({name:'list_image_models',arguments:{}});
    assert(!models.isError,models.content?.[0]?.text);
    assert(models.structuredContent.models.length>0);
    const ref=await client.callTool({name:'upload_reference_chunk',arguments:{
      uploadId:randomUUID(),chunkIndex:0,final:true,mimeType:'image/png',name:'isolated-fixture.png',
      data:'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAECAYAAACzzX7wAAAAD0lEQVR4nGJiIADooAAwAAMYAAlC0FUlAAAAAElFTkSuQmCC'
    }});
    assert(!ref.isError,ref.content?.[0]?.text);
    await access(join(installed.dataDirectory,'references',ref.structuredContent.reference.id+'.png'));
    const model=models.structuredContent.models.find(model=>model.id.endsWith('gpt-image-2.5-flare'))?.id;
    assert(model);
    const id=randomUUID(),started=await client.callTool({name:'start_image',arguments:{
      requestId:id,model,prompt:'参考图1：只做离线安装测试。',referenceIds:[ref.structuredContent.reference.id]
    }});
    assert(!started.isError,started.content?.[0]?.text);
    let done;
    for(let attempt=0;attempt<30;attempt++){
      done=await client.callTool({name:'get_image_result',arguments:{id}});
      assert(!done.isError,done.structuredContent?.job?.error||done.content?.[0]?.text);
      if(done.structuredContent.job.status==='completed')break;
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert.equal(done.structuredContent.job.status,'completed');
    assert.equal(done.structuredContent.job.path,join(installed.dataDirectory,'outputs',id+'.png'));
    assert.deepEqual(done.structuredContent.job.dimensions,{width:8,height:4});
    assert.equal((await readFile(join(installed.dataDirectory,'outputs',id+'.jpg'))).subarray(0,3).toString('hex'),'ffd8ff');
    const finishedHistory=await client.callTool({name:'list_image_history',arguments:{}});
    assert.equal(finishedHistory.structuredContent.items[0].id,id);
    assert.deepEqual((await readdir(installed.installed)).sort(),['dist','runtime','server.mjs']);
    console.log(`Fresh install, existing-config backup and preservation, reinstall, native panel metadata, ${models.structuredContent.models.length} Magpie models and isolated mock generation/gallery: PASS.`);
  }finally{await client.close();}
}finally{await rm(temp,{recursive:true,force:true});}
