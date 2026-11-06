import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const models=[{id:'hzlinkapi-codex/gpt-image-2.5-flare',provider:'hzlinkapi-codex',providerName:'HZLinkAPI Codex 月卡',name:'Flare'}, {id:'grok-hzlinkapi/grok-imagine-image-2.0',provider:'grok-hzlinkapi',providerName:'HZLinkAPI Grok',name:'Grok Imagine Image 2.0'}];
const dom=new JSDOM((await readFile('widget.html','utf8')).replace('<!-- APP_SCRIPT -->',''),{runScripts:'outside-only',url:'https://local-test.invalid'});
const {window:w}=dom;
w.__models=models;w.__calls=[];w.__messages=[];w.__jobCounter=0;
const generatedPNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
w.__resultImage=`data:image/png;base64,${generatedPNG}`;
const fakeApp=`export class App {
 connect(){return Promise.resolve()}getHostContext(){return {theme:'dark'}}
 async sendMessage(p){window.__messages.push(p);return {}}
 async callServerTool(p){
  window.__calls.push(p);
  if(p.name==='list_image_models')return {structuredContent:{models:window.__models}};
  if(p.name==='get_magic_preferences')return {structuredContent:{preferences:window.__preferences??null}};
  if(p.name==='set_magic_preferences'){window.__preferences=p.arguments;return {structuredContent:{preferences:p.arguments}};}
  if(p.name==='upload_reference_chunk'){
   if(window.__uploadGate)await window.__uploadGate;
   if(window.__uploadFails)return {isError:true,content:[{type:'text',text:'参考图上传未完成'}]};
   return {structuredContent:{reference:{id:p.arguments.uploadId}}};
  }
  if(p.name==='start_image')return {structuredContent:{job:{id:String(++window.__jobCounter)}}};
  if(p.name==='get_image_result'){
   if(window.__generationFails)return {structuredContent:{job:{id:p.arguments.id,status:'failed',error:'离线生成失败'}}};
   return {structuredContent:{job:{id:p.arguments.id,status:'completed',path:'/local/result.png',model:'hzlinkapi-codex/gpt-image-2.5-flare',dimensions:{width:3840,height:2160}}},_meta:{imageDataUrl:window.__omitPreview?undefined:window.__resultImage}};
  }
  if(p.name==='list_image_history'){
   if(window.__historyFail)return {isError:true,content:[{type:'text',text:'历史读取失败'}]};
   const items=[window.__historyItem,window.__legacyItem].filter(item=>item.id!==window.__deletedHistory);
   return {structuredContent:{items:items.slice(p.arguments.offset,p.arguments.offset+1),hasMore:p.arguments.offset+1<items.length,total:items.length,canDelete:true},_meta:{thumbnails:items.map(item=>({id:item.id,dataUrl:window.__resultImage}))}};
  }
  if(p.name==='delete_image_history'){if(window.__deleteFail)return {isError:true,content:[{type:'text',text:'删除失败，请重试'}]};window.__deletedHistory=p.arguments.id;return {structuredContent:{id:p.arguments.id,deleted:true}};}
  if(p.name==='get_image_history')return {structuredContent:{item:p.arguments.id===window.__historyItem.id?window.__historyItem:window.__legacyItem},_meta:{imageDataUrl:window.__resultImage,referencePreviews:[{id:'saved-ref',dataUrl:window.__resultImage}]}};
  if(p.name==='save_image_as')return {structuredContent:{path:'/Downloads/HZLinkAPI/history.png'}};
  throw Error('unexpected tool');
 }
}`;
const bundled=await build({entryPoints:['widget.js'],bundle:true,write:false,format:'iife',platform:'browser',plugins:[{name:'fake-host',setup(b){b.onResolve({filter:/^@modelcontextprotocol\/ext-apps$/},()=>({path:'fake-host',namespace:'fake-host'}));b.onLoad({filter:/.*/,namespace:'fake-host'},()=>({contents:fakeApp,loader:'js'}));}}]});
const realTimeout=w.setTimeout.bind(w);w.setTimeout=(fn,ms,...args)=>realTimeout(fn,Math.min(ms,2),...args);
w.eval(bundled.outputFiles[0].text);
const wait=()=>new Promise(r=>setTimeout(r,25));await wait();
const $=id=>w.document.getElementById(id);
assert.deepEqual(Array.from(w.__calls,c=>c.name),['get_magic_preferences','list_image_models'],'Opening the side panel only reads preferences and models');
assert.equal(w.__messages.length,0,'Opening the panel must not send a chat message');
assert.equal($('model').value,models[0].id);
$('prompt').value='原始草稿';
$('language-toggle').click();
assert.equal(w.document.documentElement.lang,'en');
assert.equal($('history-trigger').getAttribute('aria-label'),'History');
assert.equal($('new-session').textContent,'New session');
assert.equal($('send').textContent,'Return image to chat');
assert.equal($('quality-value').textContent,'Auto');
assert.equal($('prompt').value,'原始草稿');
const themeOption=mode=>$('theme-menu').querySelector(`[data-theme-option="${mode}"]`);
$('theme-trigger').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
assert.equal($('theme-menu').hidden,false);
assert.equal(w.document.activeElement,themeOption('system'));
$('theme-menu').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
assert.equal(w.document.activeElement,themeOption('light'));
themeOption('light').click();
await wait();
assert.equal($('theme-menu').hidden,true);
assert.equal(w.document.activeElement,$('theme-trigger'));
assert.equal($('theme-value').textContent,'Light');
assert.equal(themeOption('light').getAttribute('aria-pressed'),'true');
assert.equal(w.document.documentElement.dataset.theme,'light');
assert.equal(w.__preferences.language,'en');assert.equal(w.__preferences.theme,'light');
$('language-toggle').click();
$('theme-trigger').click();themeOption('system').click();
await wait();
assert.equal(w.document.documentElement.dataset.theme,'dark');
assert.equal(w.document.documentElement.lang,'zh-CN');
assert.equal($('quality-value').textContent,'自动');
$('prompt').value='';
assert.equal($('ratios').children.length,10);assert.equal($('qualities').children.length,6);assert.equal($('resolutions').children.length,4);
$('ratio-trigger').click();assert.equal($('ratio-menu').hidden,false);
$('quality-trigger').click();assert.equal($('ratio-menu').hidden,true);assert.equal($('quality-menu').hidden,false);
$('quality-menu').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal($('quality-menu').hidden,true);assert.equal(w.document.activeElement,$('quality-trigger'));
$('model-trigger').click();assert.equal($('model-menu').hidden,false);
$('ratio-trigger').click();assert.equal($('model-menu').hidden,true);assert.equal($('ratio-menu').hidden,false);
const clickText=(id,text)=>[...$(id).querySelectorAll('button')].find(b=>b.textContent===text).click();
clickText('ratios','16:9');clickText('resolutions','4K');clickText('qualities','最高');
assert.equal($('ratio-menu').hidden,true);assert.equal($('ratio-value').textContent,'16:9');assert.equal($('quality-value').textContent,'最高');
assert.equal($('width').value,'3840');assert.equal($('height').value,'2160');
$('prompt').value='测试小猪';$('creator').dispatchEvent(new w.Event('submit',{cancelable:true}));await wait();await wait();
const request=w.__calls.find(c=>c.name==='start_image').arguments;
assert.equal(request.userPrompt,'测试小猪');assert.deepEqual(Array.from(request.referenceNumbers),[]);assert.equal(request.quality,'max');assert.equal(request.size,'3840x2160');assert.equal(request.ratio,'16:9');
assert.equal($('result').hidden,false);assert.equal(w.__messages.length,0,'Completion must not send chat messages');
assert.equal($('compare-controls').hidden,true,'Text-only generation has no original to compare');
assert.equal($('comparison-layer').hidden,true);
assert.equal(w.__calls.some(c=>c.name==='updateModelContext'),false);
$('send').click();await wait();assert.equal(w.__messages.length,1);$('send').click();assert.equal(w.__messages.length,1);
$('model').value=models[1].id;$('model').dispatchEvent(new w.Event('change'));
assert([...$('resolutions').querySelectorAll('button')].find(b=>b.textContent==='4K').disabled);
assert([...$('qualities').querySelectorAll('button')].find(b=>b.textContent==='最高').disabled);
assert.equal($('width').disabled,true);
assert.equal($('reference-files').multiple,true);
assert.equal($('size-trigger').disabled,true);
// Clipboard and drop add local previews, without uploading or starting another job.
const image=new w.File([new Uint8Array([137,80,78,71])],'clipboard.png',{type:'image/png'});
const paste=new w.Event('paste',{bubbles:true,cancelable:true});
Object.defineProperty(paste,'clipboardData',{value:{items:[{kind:'file',type:'image/png',getAsFile:()=>image}]}});
$('prompt').dispatchEvent(paste);await wait();await wait();
assert.equal(paste.defaultPrevented,true);assert.equal($('references').children.length,1);assert.equal($('reference-strip').hidden,false);
assert.equal($('references').querySelector('.reference-number').textContent,'图 1');
const drag=new w.Event('dragover',{bubbles:true,cancelable:true});$('prompt').dispatchEvent(drag);assert($('dropzone').classList.contains('dragging'));
const drop=new w.Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(drop,'dataTransfer',{value:{files:[image]}});$('prompt').dispatchEvent(drop);await wait();await wait();
assert.equal($('references').children.length,2);assert(!$('dropzone').classList.contains('dragging'));
assert.equal(w.__calls.filter(c=>c.name==='start_image').length,1);
assert(!w.__calls.some(c=>c.name==='upload_reference_chunk'));
const textPaste=new w.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(textPaste,'clipboardData',{value:{items:[{kind:'string',type:'text/plain'}]}});$('prompt').dispatchEvent(textPaste);assert.equal(textPaste.defaultPrevented,false);
$('references').querySelector('button').click();assert.equal($('references').children.length,1);
assert.equal($('references').querySelector('.reference-number').textContent,'图 2','Removing an upload must not renumber the remaining image');
// A real widget submission snapshots its references for the completed result.
w.File.prototype.arrayBuffer=function(){return new Promise((resolve,reject)=>{const reader=new w.FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsArrayBuffer(this);});};
const second=new w.File([new Uint8Array([137,80,78,71,2])],'second.png',{type:'image/png'});
const anotherDrop=new w.Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(anotherDrop,'dataTransfer',{value:{files:[second]}});$('prompt').dispatchEvent(anotherDrop);await wait();await wait();
const referencePreviews=[...$('references').querySelectorAll('img')].map(image=>image.src);
assert.deepEqual([...$('references').querySelectorAll('.reference-number')].map(el=>el.textContent),['图 2','图 3']);
const editPrompt='保留参考图2的人物，采用图3的背景。';
$('prompt').value=editPrompt;
let releaseUpload;
w.__uploadGate=new Promise(resolve=>{releaseUpload=resolve;});
$('creator').dispatchEvent(new w.Event('submit',{cancelable:true}));await wait();
assert.equal($('prompt').value,'','The prompt clears before the first reference upload finishes');
assert.equal($('reference-strip').hidden,true);
assert.equal($('references').children.length,0);
assert.equal($('new-session').disabled,true);
assert.equal(w.__calls.filter(c=>c.name==='start_image').length,1,'Generation is still waiting for the upload');
w.__uploadGate=null;releaseUpload();await wait();await wait();
assert.equal($('result').hidden,false);assert.equal($('compare-controls').hidden,false);
assert.equal($('comparison-layer').hidden,false);assert.equal($('comparison-range').value,'50');
assert.equal($('comparison-original').src,referencePreviews[0]);
assert.equal($('comparison-references').hidden,false);
assert.equal($('comparison-references').children.length,2);
assert.equal(w.__calls.filter(c=>c.name==='start_image').at(-1).arguments.referenceIds.length,2);
const editRequest=w.__calls.filter(c=>c.name==='start_image').at(-1).arguments;
assert(editRequest.prompt.includes('第 1 张输入图片对应参考图 2（图 2）。'));
assert(editRequest.prompt.includes('第 2 张输入图片对应参考图 3（图 3）。'));
assert(editRequest.prompt.endsWith(editPrompt));assert.equal(editRequest.userPrompt,editPrompt);assert.deepEqual(Array.from(editRequest.referenceNumbers),[2,3]);
assert.equal($('prompt').value,'','Successful generation does not restore the draft');
assert.equal($('references').children.length,0);
assert.equal($('result-prompt').textContent,editPrompt);
assert.deepEqual([...$('comparison-references').querySelectorAll('button')].map(el=>el.getAttribute('aria-label')),['对比参考图 2','对比参考图 3']);
assert.equal(w.__messages.length,1,'Reference-guided completion must not send another message');
const callsBeforeComparison=w.__calls.length;
const range=$('comparison-range');
range.value='78';range.dispatchEvent(new w.Event('input'));
assert.equal($('image-view').style.getPropertyValue('--comparison-position'),'78%');
assert.equal(range.getAttribute('aria-valuetext'),'原图 78%，生成图 22%');
// Drag remains active outside the image and clamps cleanly at either end.
range.getBoundingClientRect=()=>({left:10,width:200});
let capture=null;range.setPointerCapture=id=>{capture=id;};range.hasPointerCapture=id=>capture===id;range.releasePointerCapture=()=>{capture=null;};
function pointer(type,x,id=7){const event=new w.MouseEvent(type,{clientX:x,button:0,cancelable:true});Object.defineProperty(event,'pointerId',{value:id});range.dispatchEvent(event);}
pointer('pointerdown',60);assert.equal(range.value,'25');assert.equal(capture,7);
pointer('pointermove',400);assert.equal(range.value,'100');
pointer('pointermove',-20);assert.equal(range.value,'0');
pointer('pointerup',-20);assert.equal(capture,null);
pointer('pointermove',110);assert.equal(range.value,'0','Released pointer must not keep moving the curtain');
$('comparison-references').children[1].click();assert.equal($('comparison-original').src,referencePreviews[1]);
assert.equal(w.document.querySelector('.before-label').textContent,'原图 · 图 3');
$('prompt').dispatchEvent(paste);await wait();
assert.equal($('comparison-original').src,referencePreviews[1],'Adding a new reference does not change the completed comparison');
assert.equal($('references').querySelector('.reference-number').textContent,'图 1');
$('result-view').click();assert.equal($('comparison-layer').hidden,true);assert.equal($('comparison-references').hidden,true);
$('compare-view').click();assert.equal($('comparison-layer').hidden,false);
assert.equal($('download').tagName,'BUTTON','Downloads must use the host bridge or local save tool, not a sandboxed anchor');
assert.equal($('image').src,w.__resultImage,'Download source remains the generated result');
assert(!w.__calls.some(c=>c.name==='save_image_as'),'Completion and comparison must not automatically export');
assert.equal(w.__calls.length,callsBeforeComparison,'Comparing must stay local');
assert.equal(w.__messages.length,1);
// A deleted image number is rejected before either upload or generation.
$('prompt').value=editPrompt;
$('creator').dispatchEvent(new w.Event('submit',{cancelable:true}));await wait();
assert.equal(w.__calls.length,callsBeforeComparison);
assert.match($('status').textContent,/参考图 2.*已移除/);
assert.equal($('prompt').value,editPrompt,'Preflight validation must leave the draft alone');
// A later text-only request clears all previous comparison sources.
while($('references').children.length)$('references').querySelector('button').click();
$('prompt').value='一头不使用参考图的小猪';
$('creator').dispatchEvent(new w.Event('submit',{cancelable:true}));await wait();await wait();
assert.equal($('compare-controls').hidden,true);assert.equal($('comparison-layer').hidden,true);
assert.equal($('comparison-original').hasAttribute('src'),false);
// Continue editing is entirely local until the user explicitly submits again.
assert.equal($('continue-edit').disabled,false);
const beforeContinue=w.__calls.length,messagesBeforeContinue=w.__messages.length;
$('continue-edit').click();$('continue-edit').click();await wait();await wait();
assert.equal($('references').children.length,1,'Fast repeated clicks must add one reference only');
assert.equal($('references').querySelector('.reference-number').textContent,'图 1');
assert.equal($('references').querySelector('img').src,w.__resultImage,'The new reference must use exact result bytes');
assert.equal($('prompt').value,'基于参考图1，');
assert.equal(w.document.activeElement,$('prompt'));
assert.equal($('result').hidden,false,'The completed image stays available');
assert.equal(w.__calls.length,beforeContinue,'Continue must not upload, generate, download, or send chat');
assert.equal(w.__messages.length,messagesBeforeContinue);
$('prompt').value='只把背景改为海边';$('continue-edit').click();await wait();
assert.equal($('references').children.length,1);
assert.equal($('prompt').value,'基于参考图1，只把背景改为海边','A drafted next instruction must be preserved');
$('continue-edit').click();await wait();assert.equal($('prompt').value,'基于参考图1，只把背景改为海边');
// Submitting next sends exactly that reference and makes it the comparison original.
$('creator').dispatchEvent(new w.Event('submit',{cancelable:true}));await wait();await wait();await wait();
const continuedRequest=w.__calls.filter(c=>c.name==='start_image').at(-1).arguments;
assert.equal(continuedRequest.referenceIds.length,1);
assert(continuedRequest.prompt.includes('第 1 张输入图片对应参考图 1（图 1）。'));
assert(continuedRequest.prompt.endsWith('基于参考图1，只把背景改为海边'));
assert.equal($('comparison-original').src,w.__resultImage);
assert.equal(w.document.querySelector('.before-label').textContent,'原图 · 图 1');
const uploadedContinuation=w.__calls.filter(c=>c.name==='upload_reference_chunk').at(-1).arguments;
assert.equal(uploadedContinuation.data,generatedPNG,'Reference upload must preserve generated PNG bytes');
// A new completed result starts the next draft with an empty set of references.
const beforeSecondContinue=w.__calls.length;
$('continue-edit').click();await wait();await wait();
assert.deepEqual([...$('references').querySelectorAll('.reference-number')].map(el=>el.textContent),['图 1']);
assert.equal($('prompt').value,'基于参考图1，');
assert.equal(w.__calls.length,beforeSecondContinue);
assert.equal(w.__messages.length,messagesBeforeContinue);
// Respect the selected model's reference limit without discarding existing images.
for(let i=0;i<4;i++){
  const extra=new w.Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(extra,'dataTransfer',{value:{files:[image]}});$('prompt').dispatchEvent(extra);await wait();await wait();
}
assert.equal($('references').children.length,5);
const removeContinuation=$('references').querySelector('button[aria-label^="移除参考图 1："]');removeContinuation.click();
const refill=new w.Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(refill,'dataTransfer',{value:{files:[image]}});$('prompt').dispatchEvent(refill);await wait();await wait();
$('continue-edit').click();await wait();await wait();
assert.equal($('references').children.length,5);
assert.match($('status').textContent,/最多 5 张/);
assert.equal(w.__calls.length,beforeSecondContinue);
// Even a Send immediately after Continue waits for the local reference queue.
while($('references').children.length)$('references').querySelector('button').click();
$('prompt').value='只将背景改为森林';
const beforeImmediateSubmit=w.__calls.filter(c=>c.name==='start_image').length;
$('continue-edit').click();$('creator').dispatchEvent(new w.Event('submit',{cancelable:true}));await wait();await wait();await wait();
assert.equal(w.__calls.filter(c=>c.name==='start_image').length,beforeImmediateSubmit+1);
assert.equal(w.__calls.filter(c=>c.name==='start_image').at(-1).arguments.referenceIds.length,1);
assert(w.__calls.filter(c=>c.name==='start_image').at(-1).arguments.prompt.endsWith('只将背景改为森林'));
assert.equal(w.__messages.length,messagesBeforeContinue);
// History is read-only until an explicit download/edit action; viewing keeps drafts.
w.__historyItem={id:'e5782f83-7030-4275-9aee-d5b8d7828d60',model:models[0].id,path:'/local/history.png',userPrompt:'历史原提示词',startedAt:'2026-11-06T01:00:00Z',dimensions:{width:1024,height:1024},referenceCount:1,missingReferenceCount:0,references:[{id:'saved-ref',number:7,name:'历史参考.png',available:true}]};
w.__legacyItem={...w.__historyItem,id:'254d1063-ec93-4d65-86c8-3a35125c6f6d',userPrompt:'旧记录提示词',references:[],missingReferenceCount:1};
$('prompt').value='尚未提交的新草稿';
const historyDraftRefs=$('references').innerHTML,historyStartCount=w.__calls.filter(call=>call.name==='start_image').length,historyUploadCount=w.__calls.filter(call=>call.name==='upload_reference_chunk').length;
$('history-trigger').click();await wait();
assert.equal($('history-dialog').hasAttribute('open'),true);assert.equal($('history-list').children.length,1);
$('history-more').click();await wait();assert.equal($('history-list').children.length,2);assert.equal($('history-more').hidden,true);
$('history-list').querySelector('.history-open').click();await wait();
assert.equal($('history-dialog').hasAttribute('open'),false);
assert.equal($('result-prompt').textContent,'历史原提示词');
assert.match($('result-bindings').textContent,/图 7.*历史参考.png/);
assert.equal(w.document.querySelector('.before-label').textContent,'原图 · 图 7');
assert.equal($('prompt').value,'尚未提交的新草稿');assert.equal($('references').innerHTML,historyDraftRefs);
assert.equal(w.__calls.filter(call=>call.name==='start_image').length,historyStartCount);
assert.equal(w.__calls.filter(call=>call.name==='upload_reference_chunk').length,historyUploadCount);
// A history download selects the existing job and invokes export, not generation.
$('history-trigger').click();await wait();$('history-list').querySelector('.history-actions button').click();await wait();await wait();
assert.equal(w.__calls.filter(call=>call.name==='save_image_as').at(-1).arguments.id,w.__historyItem.id);
assert.equal($('download-status').textContent,'PNG 已保存到：/Downloads/HZLinkAPI/history.png');
assert.equal($('download-status').title,'/Downloads/HZLinkAPI/history.png');
// Continuing a historical image adds its output locally and preserves the draft.
const oldReferenceCount=$('references').children.length;
$('history-trigger').click();await wait();$('history-list').querySelectorAll('.history-actions button')[1].click();await wait();await wait();
assert.equal($('download-status').textContent,'','Changing the displayed result clears the previous download status');
assert.equal($('references').children.length,oldReferenceCount+1);
assert.equal($('references').querySelectorAll('img')[$('references').children.length-1].src,w.__resultImage);
assert($('prompt').value.endsWith('尚未提交的新草稿'));
assert.equal(w.__calls.filter(call=>call.name==='start_image').length,historyStartCount);
assert.equal(w.__calls.filter(call=>call.name==='upload_reference_chunk').length,historyUploadCount);
assert.equal(w.__messages.length,messagesBeforeContinue);
// Legacy entries stay usable without inventing unavailable original images.
$('history-trigger').click();await wait();$('history-more').click();await wait();$('history-list').querySelectorAll('.history-open')[1].click();await wait();
assert.equal($('compare-controls').hidden,true);assert.equal($('result-reference-note').hidden,false);
assert.match($('result-reference-note').textContent,/1 张参考图/);
const draftBeforeDelete=$('prompt').value,refsBeforeDelete=$('references').innerHTML;
$('history-trigger').click();await wait();$('history-more').click();await wait();
const legacyCard=$('history-list').children[1],deleteButton=legacyCard.querySelector('button.history-delete');
deleteButton.click();
assert.equal(w.__calls.some(call=>call.name==='delete_image_history'),false,'Opening the confirmation must not delete');
legacyCard.querySelector('.history-delete-confirmation button').click();
assert.equal(legacyCard.querySelector('.history-delete-confirmation'),null);
assert.equal(w.__calls.some(call=>call.name==='delete_image_history'),false,'Cancelling must not delete');
deleteButton.click();const confirmDelete=legacyCard.querySelector('.history-delete-confirmation .history-delete');
w.__deleteFail=true;confirmDelete.click();await wait();
assert.equal(legacyCard.isConnected,true);assert.match($('history-status').textContent,/删除失败/);
w.__deleteFail=false;confirmDelete.click();await wait();
assert.equal(w.__deletedHistory,w.__legacyItem.id);
assert.equal(legacyCard.isConnected,false);assert.equal($('history-list').children.length,1);
assert.equal($('result').hidden,true,'A deleted history result should no longer be shown');
assert.equal($('prompt').value,draftBeforeDelete);
assert.equal($('references').innerHTML,refsBeforeDelete);
$('history-refresh').click();await wait();assert.equal($('history-list').children.length,1);
$('history-close').click();
w.__historyFail=true;$('history-trigger').click();await wait();assert.match($('history-status').textContent,/历史读取失败/);
$('history-dialog').dispatchEvent(new w.Event('cancel',{cancelable:true}));assert.equal($('history-dialog').hasAttribute('open'),false);

// New session is a local reset and leaves the gallery, selected model, and parameters alone.
w.__historyFail=false;
$('history-trigger').click();await wait();$('history-list').querySelector('.history-open').click();await wait();
assert.equal($('result').hidden,false);
const modelBeforeReset=$('model').value,ratioBeforeReset=$('ratio-value').textContent,callsBeforeReset=w.__calls.length;
// A file read queued for the old draft may not repopulate the new session.
$('prompt').dispatchEvent(paste);
$('new-session').click();await wait();
assert.equal(w.__calls.length,callsBeforeReset);
assert.equal($('result').hidden,true);assert.equal($('image').hasAttribute('src'),false);
assert.equal($('comparison-references').children.length,0);
assert.equal($('prompt').value,'');assert.equal($('reference-strip').hidden,true);
assert.equal(w.document.activeElement,$('prompt'));
assert.equal($('model').value,modelBeforeReset);assert.equal($('ratio-value').textContent,ratioBeforeReset);
$('history-trigger').click();await wait();
assert.equal($('history-list').children.length,1);
$('history-close').click();

// Failed upload or generation restores the exact input, reference numbers and previews.
$('prompt').dispatchEvent(paste);await wait();$('prompt').dispatchEvent(anotherDrop);await wait();
assert.deepEqual([...$('references').querySelectorAll('.reference-number')].map(el=>el.textContent),['图 1','图 2']);
$('references').querySelector('button').click();
const retryPrompt='  采用参考图2。\n请保留构图。  ';
$('prompt').value=retryPrompt;
const retryReferences=$('references').innerHTML;
const submit=()=>$('creator').dispatchEvent(new w.Event('submit',{cancelable:true}));
const startCount=()=>w.__calls.filter(c=>c.name==='start_image').length;
const beforeFailedUpload=startCount();
w.__uploadFails=true;submit();await wait();w.__uploadFails=false;
assert.equal(startCount(),beforeFailedUpload);
assert.equal($('prompt').value,retryPrompt);assert.equal($('references').innerHTML,retryReferences);
assert.match($('status').textContent,/参考图上传未完成/);
w.__generationFails=true;submit();await wait();await wait();w.__generationFails=false;
assert.equal($('prompt').value,retryPrompt);assert.equal($('references').innerHTML,retryReferences);
assert.match($('status').textContent,/离线生成失败/);
assert.equal(w.document.activeElement,$('prompt'));
const failedRequest=w.__calls.filter(c=>c.name==='start_image').at(-1).arguments;
assert.deepEqual(Array.from(failedRequest.referenceNumbers),[2]);
const uploadsAfterFailure=w.__calls.filter(c=>c.name==='upload_reference_chunk').length;
// A successful retry keeps the composer empty, even if the host misses the preview.
w.__omitPreview=true;submit();await wait();await wait();w.__omitPreview=false;
assert.match($('status').textContent,/已生成，但未收到可预览图片/);
assert.equal($('prompt').value,'');assert.equal($('reference-strip').hidden,true);
assert.equal(w.__calls.filter(c=>c.name==='upload_reference_chunk').length,uploadsAfterFailure);
assert.deepEqual(Array.from(w.__calls.filter(c=>c.name==='start_image').at(-1).arguments.referenceIds),Array.from(failedRequest.referenceIds));
assert.equal(w.__messages.length,messagesBeforeContinue);
dom.window.close();
console.log('UI: new session, immediate draft clearing, exact failure recovery, stable references, comparison, continue editing, history, and manual-only chat return: PASS. No real generation performed.');
