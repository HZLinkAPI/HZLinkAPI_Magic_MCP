import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { root } from './magpie.mjs';
import { join } from 'node:path';
import { mkdtemp,rm,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import vm from 'node:vm';
import {createServer} from 'node:http';
const client = new Client({ name: 'hzlinkapi-protocol-check', version: '0.1.0' }, { capabilities: {} });
const preferencesDirectory=await mkdtemp(join(tmpdir(),'hzlm-preferences-test-'));
const gateway=createServer((request,response)=>{
  if(request.url!=='/v1/models?kind=image'){response.writeHead(404).end();return;}
  response.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({data:[
    {id:'hzlinkapi-codex/gpt-image-2.5-flare',kind:'image'},
    {id:'fixture/video',kind:'video'}
  ]}));
});
await new Promise(resolve=>gateway.listen(0,'127.0.0.1',resolve));
try {
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(root, 'server.mjs')], stderr: 'pipe',env:{...process.env,HZLINKAPI_MAGIC_DATA_DIR:preferencesDirectory,HZLINKAPI_MAGIC_MAGPIE_PORT:String(gateway.address().port)} }));
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(t => t.name), ['open_creator', 'list_image_models', 'start_image', 'get_image_result','upload_reference_chunk','save_image_as','save_image','list_image_history','get_image_history','delete_image_history','get_magic_preferences','set_magic_preferences']);
  assert.equal(tools[0].title, 'HZLinkAPI Magic');
  assert.equal(tools[0]._meta.ui.resourceUri, 'ui://hzlinkapi-creator/creation-v15.html');
  assert.deepEqual(tools[0]._meta['openai/ui'].entrypoints, [{type:'thread'}]);
  for(const t of tools.slice(1)) assert.deepEqual(t._meta.ui.visibility,['app']);
  assert.equal((await client.callTool({name:'get_magic_preferences',arguments:{}})).structuredContent.preferences,null);
  const preferences={language:'en',theme:'light'};
  assert.deepEqual((await client.callTool({name:'set_magic_preferences',arguments:preferences})).structuredContent.preferences,preferences);
  assert.deepEqual(JSON.parse(await readFile(join(preferencesDirectory,'preferences.json'),'utf8')),preferences);
  assert.deepEqual((await client.callTool({name:'get_magic_preferences',arguments:{}})).structuredContent.preferences,preferences);
  const catalogue = await client.callTool({ name: 'list_image_models', arguments: {} });
  assert(!catalogue.isError);
  assert(catalogue.structuredContent.models.some(m => m.id === 'hzlinkapi-codex/gpt-image-2.5-flare'));
  const opened = await client.callTool({ name: 'open_creator', arguments: { prompt: '一头穿黄色雨衣的小猪，站在霓虹街头。' } });
  assert(!opened.isError);
  assert(opened.structuredContent.models.some(m => m.id === 'hzlinkapi-codex/gpt-image-2.5-flare'));
  assert(!opened.structuredContent.models.some(m => /video/i.test(m.id)));
  const { resources } = await client.listResources();
  assert.equal(resources[0].mimeType, 'text/html;profile=mcp-app');
  const resource = await client.readResource({ uri: tools[0]._meta.ui.resourceUri });
  const legacy = await client.readResource({ uri: 'ui://hzlinkapi-creator/creation-v2.html' });
  assert.equal(legacy.contents[0].text, resource.contents[0].text);
  for (const name of ['save_image_as','save_image']) {
    const rejected = await client.callTool({name,arguments:{id:'6ca3285e-7e62-4c20-943e-0f021256fc69'}});
    assert.equal(rejected.isError,true);
    assert.match(rejected.content[0].text,/ENOENT/);
  }
  assert(resource.contents[0].text.includes('HZLinkAPI Magic'));
  assert(resource.contents[0].text.includes('ui/initialize'));
  const script = resource.contents[0].text.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert(script, 'Built widget must contain its bundled script');
  new vm.Script(script, { filename: 'widget-inline.js' });
  assert(!script.includes('<!-- APP_SCRIPT -->'), 'Build placeholder must not be injected into the bundle');
  assert(tools.find(tool=>tool.name==='start_image').inputSchema.properties.userPrompt);
  assert(tools.find(tool=>tool.name==='start_image').inputSchema.properties.referenceNumbers);
  const history=await client.callTool({name:'list_image_history',arguments:{offset:0,limit:2}});
  assert(!history.isError);assert.deepEqual(history.content,[]);
  assert(Array.isArray(history.structuredContent.items));
  assert.equal(history.structuredContent.canDelete,true);
  assert(!JSON.stringify(history.structuredContent).includes('data:image/'),'Thumbnails must stay in card-only metadata');
  if(history.structuredContent.items.length){
    const detail=await client.callTool({name:'get_image_history',arguments:{id:history.structuredContent.items[0].id}});
    assert(!detail.isError);assert.deepEqual(detail.content,[]);
    assert(detail._meta.imageDataUrl.startsWith('data:image/png;base64,'));
    assert(!JSON.stringify(detail.structuredContent).includes('data:image/'));
  }
  const refused = await client.callTool({ name: 'start_image', arguments: { model: 'nonexistent/model', prompt: 'test', requestId: '1ba372aa-6999-4e48-9b30-c322699d7e01' } });
  assert(refused.isError);
  const { presetSize,validateOptions }=await import('./options.mjs');
  for(const ratio of ['1:1','2:3','3:2','4:3','3:4','16:9','9:16','21:9','9:21'])for(const resolution of ['1k','2k','4k']){
    const s=presetSize(ratio,resolution);
    validateOptions({model:'hzlinkapi-codex/gpt-image-2.5-flare',size:`${s.width}x${s.height}`,ratio,resolution,quality:'max'});
  }
  assert.deepEqual(presetSize('16:9','4k'),{width:3840,height:2160});
  assert.throws(()=>validateOptions({model:'grok-hzlinkapi/grok-imagine-image-2.0',resolution:'4k'}),/分辨率/);
  assert.throws(()=>validateOptions({model:'grok-hzlinkapi/grok-imagine-image-2.0',quality:'max'}),/质量/);
  const {generationArgs,imageJob,jobs}=await import('./magpie.mjs');
  const args={model:'grok-hzlinkapi/grok-imagine-image-2.0',prompt:'test',ratio:'16:9',resolution:'2k',quality:'medium'};
  const req=generationArgs(args,'/local/out.png');
  assert.equal(req[req.indexOf('--size')+1],'2048x1152');
  assert.equal(req[req.indexOf('--quality')+1],'medium');
  assert.throws(()=>validateOptions({...args,ratio:'21:9'}),/准确传递/);
  const edit=generationArgs({model:'hzlinkapi-codex/gpt-image-2.5-flare',prompt:'edit',quality:'xhigh',size:'3840x2160'},'/local/out.png',[{file:'/local/ref1.png'},{file:'/local/ref2.png'}]);
  assert.equal(edit[edit.indexOf('--quality')+1],'xhigh');
  assert.deepEqual(edit.slice(edit.indexOf('--reference_images')),['--reference_images','/local/ref1.png','--reference_images','/local/ref2.png']);
  const {referencePrompt}=await import('./reference-mapping.mjs');
  const userPrompt='把参考图 1 的人物放进图3的场景。';
  const mapped=referencePrompt(userPrompt,[{number:1},{number:3}]);
  assert(mapped.includes('第 1 张输入图片对应参考图 1（图 1）。'));
  assert(mapped.includes('第 2 张输入图片对应参考图 3（图 3）。'));
  assert(mapped.endsWith(userPrompt),'User request must remain verbatim');
  assert.equal(referencePrompt('画一头猪'), '画一头猪');
  assert.throws(()=>referencePrompt('使用参考图2',[{number:1},{number:3}]),/参考图 2/);
  assert.throws(()=>referencePrompt('使用图2的人物',[{number:1},{number:3}]),/参考图 2/);
  assert.throws(()=>referencePrompt('参考图2：人物',[{number:1},{number:3}]),/参考图 2/);
  assert.throws(()=>referencePrompt('使用参考图1'),/参考图 1/);
  assert.doesNotThrow(()=>referencePrompt('画一张图16:9的插画',[{number:1}]));
  assert.throws(()=>referencePrompt('test',[{number:1},{number:1}]),/编号无效/);
  assert.throws(()=>referencePrompt('x'.repeat(16000),[{number:1}]),/长度限制/);
  const {referenceChunk,loadReferences}=await import('./references.mjs');
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=','base64');
  const uploadId='c757247c-7e90-499c-b5f6-831503ccdb3d';
  const part=await referenceChunk({uploadId,chunkIndex:0,data:png.subarray(0,20).toString('base64'),final:false,mimeType:'image/png',name:'小猪.png'});assert.equal(part.received,20);
  const uploaded=await referenceChunk({uploadId,chunkIndex:1,data:png.subarray(20).toString('base64'),final:true,mimeType:'image/png',name:'小猪.png'});
  const refs=await loadReferences([uploaded.reference.id]);assert(refs[0].bytes.equals(png));
  const {rm,writeFile}=await import('node:fs/promises');
  const jobId='779e9846-739b-45cf-977b-98b5ce37d0f1',file=join(root,'references',uploaded.reference.id+'.png');
  jobs.set(jobId,{id:jobId,status:'completed',model:'test/image',file});
  const preview=await imageJob(jobId);assert(!preview.content.some(c=>c.type==='image'));assert(preview._meta.imageDataUrl.startsWith('data:image/png;base64,'));
  for(const ext of ['png','json'])await rm(join(root,'references',uploaded.reference.id+'.'+ext));jobs.delete(jobId);
  console.log('MCP handshake, widget resource, local model fixture and invalid model rejection: PASS. No image generated.');
} finally { await client.close();gateway.closeAllConnections();gateway.close();await rm(preferencesDirectory,{recursive:true,force:true}); }
