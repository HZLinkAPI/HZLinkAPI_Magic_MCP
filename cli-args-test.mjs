// Exercise the installed Magpie parser against a loopback-only MCP fixture.
// This fixture never forwards anything and has no image-generation backend.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {access} from 'node:fs/promises';
import {generationArgs} from './magpie.mjs';
import {referencePrompt} from './reference-mapping.mjs';
const cli='/Applications/magpie.app/Contents/MacOS/magpie';
try{await access(cli);}catch{console.log('Installed Magpie parser check: SKIPPED (Mac binary unavailable)');process.exit(0);}
const calls=[];
const tool={name:'generate_image',inputSchema:{type:'object',required:['prompt'],properties:{
  prompt:{type:'string'},model:{type:'string'},size:{type:'string'},quality:{type:'string'},
  reference_images:{type:'array',items:{type:'string'},description:'An absolute file path or a data URL'},
}}};
const server=createServer(async(req,res)=>{
  try{
    assert.equal(req.method,'POST');
    let text='';for await(const chunk of req)text+=chunk;
    const message=JSON.parse(text);
    let result;
    if(message.method==='tools/list')result={tools:req.url==='/mcp/magpie/image'?[tool]:[]};
    else if(message.method==='tools/call'){
      assert.equal(req.url,'/mcp/magpie/image');calls.push(message.params);
      result={content:[{type:'text',text:'OFFLINE_ARGUMENT_CAPTURE_ONLY'}]};
    }else throw new Error('Unexpected fixture RPC');
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:message.id,result}));
  }catch(error){res.writeHead(500);res.end(error.message);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const run=promisify(execFile),env={...process.env,MAGPIE_GATEWAY:`http://127.0.0.1:${server.address().port}`};
const refs=[{file:'/offline/参考图 一.png',number:1},{file:'/offline/same-name.png',number:3},{file:'/offline/folder/same-name.png',number:4}];
const prompt=referencePrompt('让图1的人物采用参考图3的服装，使用图4的背景。',refs);
const request={model:'hzlinkapi-codex/gpt-image-2.5-flare',size:'1024x1024',quality:'high',prompt};
try{
  // Reproduce the old defect without a real model call.
  const broken=[...generationArgs(request,'/offline/result.png'),'--json'];
  const first=broken.indexOf('--reference_images');
  assert.equal(first,-1);
  broken.splice(broken.length-1,0,'--reference_images',...refs.map(ref=>ref.file));
  await assert.rejects(run(cli,broken,{env,timeout:20000}),/--prompt is given, and the words/);
  assert.equal(calls.length,0,'Broken arguments must fail before the tool is called');
  const result=await run(cli,[...generationArgs(request,'/offline/result.png',refs),'--json'],{env,timeout:20000});
  assert.match(result.stdout,/OFFLINE_ARGUMENT_CAPTURE_ONLY/);
  assert.equal(calls.length,1);
  assert.equal(calls[0].name,'generate_image');
  assert.deepEqual(calls[0].arguments.reference_images,refs.map(ref=>ref.file));
  assert.equal(calls[0].arguments.prompt,prompt);
  assert.equal(calls[0].arguments.model,request.model);
  assert.equal(calls[0].arguments.size,request.size);
  console.log('Installed Magpie CLI: old multi-reference defect reproduced; fixed three-image order, names with spaces, model and numbered prompt preserved: PASS. Loopback fixture only; no image generated.');
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
