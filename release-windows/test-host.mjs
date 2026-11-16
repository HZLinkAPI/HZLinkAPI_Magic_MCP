import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

if(process.platform!=='win32')throw new Error('This package smoke test must run on Windows.');
const sourceDirectory=resolve(process.argv[2]||fileURLToPath(new URL('./stage/HZLinkAPI Magic Windows',import.meta.url)));
const node=join(sourceDirectory,'runtime','x64','node.exe');
const helper=join(sourceDirectory,'runtime','x64','magic-native.exe');
const temp=await mkdtemp(join(tmpdir(),'hzlm-windows-package-'));
const model='fixture/gpt-image-2.5-flare';
const gateway=createServer((request,response)=>{
  assert.equal(request.url,'/v1/models?kind=image');
  response.writeHead(200,{'Content-Type':'application/json'});
  response.end(JSON.stringify({data:[{id:model,kind:'image'},{id:'fixture/video',kind:'video'}]}));
});
await new Promise(resolve=>gateway.listen(0,'127.0.0.1',resolve));
let client;
try{
  const magpieDirectory=join(temp,'Magpie'),magpie=join(magpieDirectory,'magpie.exe');
  const configDirectory=join(temp,'Codex'),installDirectory=join(temp,'HZLinkAPI Magic');
  const data=join(magpieDirectory,'data');
  await mkdir(data,{recursive:true});
  await writeFile(magpie,'MZ');
  await writeFile(join(data,'settings.json'),JSON.stringify({port:gateway.address().port}));
  await writeFile(join(data,'providers.json'),JSON.stringify({providers:[{id:'fixture',name:'Windows package fixture'}]}));
  await mkdir(configDirectory);
  const original='# Keep this existing setting\n[features]\nenable_mcp_apps = false\n[mcp_servers.other]\ncommand = "keep"\n';
  await writeFile(join(configDirectory,'config.toml'),original);

  const {install}=await import(pathToFileURL(join(sourceDirectory,'install.mjs')));
  const installed=await install({sourceDirectory,configDirectory,installDirectory,helper,magpie,arch:'x64',allowPick:false});
  assert(installed.changed);
  assert.equal(await readFile(installed.backup,'utf8'),original);
  const config=await readFile(join(configDirectory,'config.toml'),'utf8');
  assert.match(config,/\[mcp_servers\.other\]/);
  assert.match(config,/\[mcp_servers\.hzlinkapi_creator\]/);
  assert(config.includes(JSON.stringify(installed.dataDirectory)));
  await writeFile(join(installed.dataDirectory,'sentinel'),'preserved');
  assert.equal((await install({sourceDirectory,configDirectory,installDirectory,helper,magpie,arch:'x64',allowPick:false})).changed,false);
  assert.equal(await readFile(join(installed.dataDirectory,'sentinel'),'utf8'),'preserved');

  client=new Client({name:'windows-package-check',version:'1.0.0'},{capabilities:{}});
  await client.connect(new StdioClientTransport({
    command:node,args:[join(installed.installed,'server.mjs')],cwd:temp,stderr:'pipe',
    env:{...process.env,HZLINKAPI_MAGIC_DATA_DIR:installed.dataDirectory,HZLINKAPI_MAGIC_MAGPIE_BIN:magpie}
  }));
  const {tools}=await client.listTools();
  const open=tools.find(tool=>tool.name==='open_creator');
  assert(open);
  assert.deepEqual(open._meta['openai/ui'].entrypoints,[{type:'thread'}]);
  const resource=await client.readResource({uri:open._meta.ui.resourceUri});
  assert(resource.contents[0].text.includes('HZLinkAPI Magic'));
  const models=await client.callTool({name:'list_image_models',arguments:{}});
  assert(!models.isError,models.content?.[0]?.text);
  assert.deepEqual(models.structuredContent.models.map(item=>[item.id,item.providerName]),[[model,'Windows package fixture']]);
  console.log('Extracted Windows ZIP: bundled Node starts MCP, widget loads, local Magpie models load, install/config backup/reinstall pass.');
}finally{
  if(client)await client.close();
  gateway.closeAllConnections();gateway.close();
  await rm(temp,{recursive:true,force:true});
}
