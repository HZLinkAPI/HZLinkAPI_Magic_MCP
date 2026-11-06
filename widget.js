import { App } from '@modelcontextprotocol/ext-apps';
import {modelPicker} from './model-picker.mjs';
import {parameterMenus} from './parameter-menus.mjs';
import {imageComparison} from './image-comparison.mjs';
import {referencePrompt} from './reference-mapping.mjs';
import {imageDownloader} from './image-download.mjs';
import {historyGallery} from './history-gallery.mjs';
import {t,localize} from './magic-i18n.mjs';
import {panelPreferences} from './panel-preferences.mjs';
import {homeDots} from './home-dots.mjs';
import {geistFontCss} from './geist-font.mjs';
const fontStyle=document.createElement('style');fontStyle.textContent=geistFontCss;document.head.append(fontStyle);
import {ratios,qualities,capabilities,presetSize,validateOptions} from './options.mjs';
const app=new App({name:'HZLinkAPI 创作',version:'0.2.0'},{}),$=id=>document.getElementById(id);
const picker=modelPicker($('model'),$('model-trigger'),$('model-menu'));
const menus=parameterMenus();
const comparison=imageComparison(document);
let models=[],busy=false,readyJob,readyImage,preparingEdit=false,loadingHistory=false,ratio='1:1',resolution='1k',quality='auto',references=[],nextReferenceNumber=1,draftRevision=0,fileQueue=Promise.resolve();
const labels={auto:'自动',low:'低',medium:'中',high:'高',xhigh:'极高',max:'最高','1k':'1K','2k':'2K','4k':'4K'};
function optionLabel(key){return t(labels[key]||key);}
function status(message,error=false,en){$('status').hidden=!message;localize($('status'),message,en);$('status').classList.toggle('error',error);}
function downloadStatus(text='',error=false,path=''){
  const el=$('download-status');
  el.textContent=text;el.classList.toggle('error',error);el.title=path;
}
imageDownloader({app,button:$('download'),getJob:()=>readyJob,status:downloadStatus});
historyGallery({document,app,isBusy:()=>busy||loadingHistory||preparingEdit,onSelect:loadHistory,onAction:action=>$(action==='edit'?'continue-edit':'download').click(),onDelete:clearDeletedResult});
function clearDeletedResult(id){
  if(readyJob?.id!==id)return;
  clearResult();
  if($('status').textContent===t('已载入历史图片。'))status('');
}
function clearResult(){
  readyJob=null;readyImage=null;$('result').hidden=true;
  $('send').disabled=true;$('continue-edit').disabled=true;
  $('file').textContent='';$('result-bindings').replaceChildren();
  localize($('result-prompt'),'');
  downloadStatus();comparison.clear();$('output-area').scrollTop=0;
}
function showResult(job,src,resultReferences,record){
  downloadStatus();
  comparison.setResult({src,dimensions:job.dimensions},resultReferences);
  $('file').textContent=job.path;const modelName=job.model.split('/').pop();
  localize($('served'),`已生成 · ${modelName}`,`Generated · ${modelName}`);
  const dimensions=job.dimensions?`${job.dimensions.width} × ${job.dimensions.height}`:'';
  localize($('actual-size'),dimensions?`实际尺寸 ${dimensions}`:'',dimensions?`Actual size ${dimensions}`:'');
  $('result').hidden=false;$('send').disabled=false;readyJob=job;readyImage={id:job.id,src};
  $('continue-edit').disabled=busy||loadingHistory||preparingEdit;
  $('result-details').hidden=false;$('result-details').open=false;
  const meta=lang=>[modelName,job.startedAt?new Date(job.startedAt).toLocaleString(lang):null].filter(Boolean).join(' · ');
  localize($('result-record-meta'),meta('zh-CN'),meta('en'));
  localize($('result-prompt'),record.userPrompt||'此记录未保存提示词。',record.userPrompt||undefined);
  $('result-bindings').replaceChildren(...(record.references||[]).map((ref,index)=>{const row=document.createElement('p');localize(row,
    `第 ${index+1} 张输入 · 图 ${ref.number} · ${ref.name}${ref.available===false?'（不可用）':''}`,
    `Input ${index+1} · Ref ${ref.number} · ${ref.name}${ref.available===false?' (unavailable)':''}`);return row;}));
  $('result-reference-note').hidden=!record.missingReferenceCount;
  if(record.missingReferenceCount)localize($('result-reference-note'),
    `${record.missingReferenceCount} 张参考图的关联未保留或文件不可用，无法恢复这部分原图对比。`,
    `Missing files or links for ${record.missingReferenceCount} reference images. They are unavailable for comparison.`);
}
async function loadHistory(id){
  if(busy||loadingHistory||preparingEdit)throw new Error('请先等待当前操作完成');
  loadingHistory=true;$('generate').disabled=true;$('refresh').disabled=true;updateSessionButton();
  try{
    const reply=await app.callServerTool({name:'get_image_history',arguments:{id}}),{item}=unwrap(reply),src=reply._meta?.imageDataUrl;
    if(!item||!src)throw new Error('历史图片内容不完整');
    const previews=new Map((reply._meta.referencePreviews||[]).map(ref=>[ref.id,ref.dataUrl]));
    const snapshots=(item.references||[]).filter(ref=>ref.available&&previews.has(ref.id)).map(ref=>({number:ref.number,name:ref.name,preview:previews.get(ref.id)}));
    showResult(item,src,snapshots,item);
    $('output-area').scrollTop=0;status('已载入历史图片。');
  }finally{loadingHistory=false;$('generate').disabled=busy||!models.length;$('refresh').disabled=busy;$('continue-edit').disabled=busy||preparingEdit||!readyImage;updateSessionButton();}
}
function unwrap(r){if(r.isError)throw new Error(r.structuredContent?.job?.error||r.content?.filter(x=>x.type==='text').map(x=>x.text).join('\n')||'工具调用失败');return r.structuredContent||{};}
function cap(){return models.find(m=>m.id===$('model').value)?.capabilities||capabilities($('model').value);}
function selection(container,values,current,onSelect,disabled=[]){$(container).replaceChildren(...values.map(v=>{const b=document.createElement('button');b.type='button';b.textContent=optionLabel(v);b.setAttribute('aria-pressed',String(v===current));b.disabled=disabled.includes(v);b.onclick=()=>{onSelect(v);menus.close();document.querySelector(`[data-parameter-menu="${$(container).parentElement.id}"]`)?.focus();};return b;}));}
function referenceCount(max){localize($('reference-count'),`${references.length} / ${max} 张`,`${references.length} / ${max} images`);}
function paintOptions(updateSize=true){
  const c=cap();if(!c.qualities.includes(quality))quality='auto';if(!c.resolutions.includes(resolution)&&resolution!=='custom')resolution='auto';
  if(c.ratios&&!c.ratios.includes(ratio))ratio='1:1';
  selection('ratios',ratios,ratio,v=>{ratio=v;if(v!=='auto'&&resolution==='auto')resolution='1k';paintOptions();},c.ratios?ratios.filter(v=>!c.ratios.includes(v)):[]);
  selection('qualities',qualities,quality,v=>{quality=v;paintOptions(false);},qualities.filter(v=>!c.qualities.includes(v)));
  selection('resolutions',['1k','2k','4k','auto'],resolution,v=>{resolution=v;if(v!=='auto'&&ratio==='auto')ratio='1:1';paintOptions();},['1k','2k','4k','auto'].filter(v=>!c.resolutions.includes(v)));
  if(updateSize){const size=presetSize(ratio,resolution,$('align').checked);$('width').value=size?.width||'';$('height').value=size?.height||'';}
  for(const id of ['width','height','swap','align'])$(id).disabled=!c.customSize;
  localize($('ratio-value'),labels[ratio]||ratio);
  localize($('quality-value'),labels[quality]||quality);
  localize($('resolution-value'),labels[resolution]||'自定义');
  localize($('size-value'),$('width').value&&$('height').value?`${$('width').value}×${$('height').value}`:'自动');
  $('size-trigger').disabled=busy||!c.customSize;
  referenceCount(c.references);
}
function applyModels(next){models=next;const previous=$('model').value,groups=new Map();for(const m of next){if(!groups.has(m.provider)){const g=document.createElement('optgroup');g.label=m.providerName||m.provider;groups.set(m.provider,g);}const name=m.id.split('/').slice(1).join('/')||m.name;groups.get(m.provider).append(new Option(`${name} · ${m.providerName||m.provider}`,m.id));}$('model').replaceChildren(...groups.values());$('model').value=next.some(m=>m.id===previous)?previous:next.find(m=>m.id==='hzlinkapi-codex/gpt-image-2.5-flare')?.id||next[0]?.id||'';$('generate').disabled=busy||!next.length;picker.render();paintOptions();}
async function refresh(){try{status('正在读取 Magpie 生图模型…');applyModels(unwrap(await app.callServerTool({name:'list_image_models',arguments:{}})).models);status('');}catch(e){status(e.message,true);}}
app.ontoolresult=r=>{if(!busy&&r.structuredContent?.models){applyModels(r.structuredContent.models);if(r.structuredContent.prompt)setPrompt(r.structuredContent.prompt);status('');}};
$('prompt').addEventListener('input',event=>{
  const prompt=event.currentTarget;
  prompt.style.height='0px';
  prompt.style.height=`${Math.min(200,prompt.scrollHeight)}px`;
});
function setPrompt(value){
  $('prompt').value=value;
  $('prompt').dispatchEvent(new Event('input',{bubbles:true}));
}
function setDraft(prompt='',draftReferences=[],next=1){
  references=draftReferences;nextReferenceNumber=next;
  setPrompt(prompt);renderRefs();
}
function updateSessionButton(){$('new-session').disabled=busy||loadingHistory||preparingEdit;}
$('new-session').onclick=()=>{
  if($('new-session').disabled)return;
  ++draftRevision;
  picker.close();menus.close();
  $('dropzone').classList.remove('dragging');
  setDraft();clearResult();status('');$('prompt').focus();
};
$('model').onchange=()=>{picker.render();paintOptions();};$('refresh').onclick=refresh;
$('align').onchange=()=>{if($('align').checked){for(const id of ['width','height'])if($(id).value)$(id).value=Math.round(Number($(id).value)/16)*16;}paintOptions(false);};
function edited(){resolution='custom';if($('align').checked){for(const id of ['width','height'])if($(id).value)$(id).value=Math.round(Number($(id).value)/16)*16;}paintOptions(false);}
$('width').onchange=edited;$('height').onchange=edited;
$('swap').onclick=()=>{const w=$('width').value;$('width').value=$('height').value;$('height').value=w;if(ratio!=='auto')ratio=ratio.split(':').reverse().join(':');resolution='custom';paintOptions(false);};
function renderRefs(){$('reference-strip').hidden=!references.length;$('references').replaceChildren(...references.map((ref,i)=>{const el=document.createElement('div');el.className='thumb';const image=document.createElement('img');image.src=ref.preview;localize(image,`参考图 ${ref.number}：${ref.file.name}`,`Reference ${ref.number}: ${ref.file.name}`,'alt');const number=document.createElement('span');number.className='reference-number';localize(number,`图 ${ref.number}`,`Ref ${ref.number}`);const label=document.createElement('span');label.textContent=ref.file.name;label.title=ref.file.name;const remove=document.createElement('button');remove.type='button';remove.textContent='×';localize(remove,`移除参考图 ${ref.number}：${ref.file.name}`,`Remove reference ${ref.number}: ${ref.file.name}`,'aria-label');remove.onclick=()=>{references.splice(i,1);renderRefs();};el.append(image,number,remove,label);return el;}));referenceCount(cap().references);}
async function addFiles(files,revision=draftRevision){
  if(!files.length||busy||revision!==draftRevision)return;
  try{
    for(const file of files){
      if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('仅支持 PNG、JPG、WebP');
      if(file.size>12*1024*1024)throw new Error('单张参考图不能超过 12 MB');
      if(references.length>=cap().references)throw new Error(`此模型最多 ${cap().references} 张参考图`);
      if(references.reduce((n,r)=>n+r.file.size,0)+file.size>32*1024*1024)throw new Error('参考图总大小不能超过 32 MB');
      const preview=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
      if(revision!==draftRevision)return;
      references.push({file,preview,number:nextReferenceNumber++});
    }
    renderRefs();status('参考图已选择，点击生成时才会上传。');
  }catch(e){if(revision===draftRevision){renderRefs();status(e.message,true);}}
}
function enqueueFiles(files){const revision=draftRevision;fileQueue=fileQueue.then(()=>addFiles(files,revision));return fileQueue;}
$('continue-edit').onclick=async()=>{
  if(busy||loadingHistory||preparingEdit||!readyImage)return;
  const result=readyImage;preparingEdit=true;$('continue-edit').disabled=true;updateSessionButton();
  // Use the same queue as file uploads so an immediate Send waits for this image.
  fileQueue=fileQueue.then(async()=>{
    if(busy||readyImage!==result)return;
    let reference=references.find(ref=>ref.sourceJobId===result.id);
    if(!reference){
      const encoded=result.src.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/)?.[1];
      if(!encoded)throw new Error('未找到可继续编辑的 PNG 图片');
      const bytes=Uint8Array.from(atob(encoded),char=>char.charCodeAt(0));
      const file=new File([bytes],`生成结果-${result.id.slice(0,8)}.png`,{type:'image/png'});
      await addFiles([file]);reference=references.find(ref=>ref.file===file);
      if(!reference)return; // addFiles already displayed its size/count error.
      reference.sourceJobId=result.id;
    }
    const zhPrefix=`基于参考图${reference.number}，`,enPrefix=`Using reference ${reference.number}, `,prefix=t(zhPrefix,enPrefix),draft=$('prompt').value;
    if(!draft.trim())setPrompt(prefix);
    else if(!draft.startsWith(zhPrefix)&&!draft.startsWith(enPrefix))setPrompt(prefix+draft);
    $('prompt').focus();$('prompt').setSelectionRange($('prompt').value.length,$('prompt').value.length);
    status(`已加入参考图 ${reference.number}，请描述要继续修改的内容。`,false,`Added reference ${reference.number}. Describe what you want to change.`);
  }).catch(error=>status(`无法继续编辑：${error.message}`,true,`Could not continue editing: ${t(error.message)}`));
  try{await fileQueue;}finally{preparingEdit=false;$('continue-edit').disabled=busy||!readyImage;updateSessionButton();}
};
$('reference-files').onchange=async e=>{await enqueueFiles([...e.target.files]);e.target.value='';};
$('dropzone').ondragover=e=>{e.preventDefault();if(!busy)$('dropzone').classList.add('dragging');};
$('dropzone').ondragleave=e=>{if(!$('dropzone').contains(e.relatedTarget))$('dropzone').classList.remove('dragging');};
$('dropzone').ondrop=e=>{e.preventDefault();$('dropzone').classList.remove('dragging');if(!busy)void enqueueFiles([...e.dataTransfer.files]);};
$('dropzone').addEventListener('paste',e=>{const files=[...(e.clipboardData?.items||[])].filter(item=>item.kind==='file'&&item.type.startsWith('image/')).map(item=>item.getAsFile()).filter(Boolean);if(files.length){e.preventDefault();if(!busy)void enqueueFiles(files);}});
async function upload(ref){if(ref.id)return ref.id;const raw=new Uint8Array(await ref.file.arrayBuffer()),uploadId=crypto.randomUUID(),chunkSize=192*1024;for(let at=0,index=0;at<raw.length;at+=chunkSize,index++){let binary='';for(const v of raw.subarray(at,at+chunkSize))binary+=String.fromCharCode(v);const result=unwrap(await app.callServerTool({name:'upload_reference_chunk',arguments:{uploadId,chunkIndex:index,data:btoa(binary),final:at+chunkSize>=raw.length,mimeType:ref.file.type,name:ref.file.name.slice(0,120)}}));if(result.reference)ref.id=result.reference.id;}if(!ref.id)throw new Error('参考图上传未完成');return ref.id;}
async function sendToChat(){const job=readyJob;if(!job||$('send').disabled)return;$('send').disabled=true;try{const r=await app.sendMessage({role:'user',content:[{type:'text',text:`HZLinkAPI 创作已通过本机 Magpie 使用 ${job.model} 生成完图片。请直接显示并提供下载链接：${job.path}。不要再次生图。`}]});if(r.isError)throw new Error('桌面端未接收返回消息');if(readyJob===job)status('图片已返回聊天。');}catch(e){if(readyJob!==job)return;$('send').disabled=false;status(`图片已保存，返回聊天失败：${e.message}`,true,`Image saved, but could not return it to chat: ${t(e.message)}`);}}
// Only an explicit button click can send a message or update model context.
$('send').onclick=sendToChat;
function lock(value){busy=value;updateSessionButton();picker.close();menus.close();$('output-area').setAttribute('aria-busy',String(value));$('output-area').classList.toggle('is-generating',value);localize($('output-title'),value?'正在生成…':'图片输出区域');for(const el of $('creator').querySelectorAll('button,input,select,textarea'))el.disabled=value;$('refresh').disabled=value;$('history-trigger').disabled=value;$('continue-edit').disabled=value||preparingEdit||!readyImage;if(!value){paintOptions(false);$('generate').disabled=!models.length;}picker.render();}
$('creator').onsubmit=async event=>{
  event.preventDefault();
  const revision=draftRevision;
  let queued;
  do{queued=fileQueue;await queued;}while(queued!==fileQueue&&revision===draftRevision);
  if(busy||loadingHistory||revision!==draftRevision)return;
  const rawPrompt=$('prompt').value,model=$('model').value,prompt=rawPrompt.trim(),c=cap();
  const submittedReferences=references,submittedNextNumber=nextReferenceNumber;
  let size=$('width').value&&$('height').value?`${$('width').value}x${$('height').value}`:'auto';
  if(c.family==='grok')size='auto';
  const args={model,prompt,userPrompt:prompt,referenceNumbers:submittedReferences.map(ref=>ref.number),size,ratio,resolution:resolution==='custom'?'auto':resolution,quality,referenceIds:[],requestId:crypto.randomUUID()};
  try{if(!prompt)throw new Error('请填写想画的内容');args.prompt=referencePrompt(prompt,submittedReferences);validateOptions({...args,referenceIds:submittedReferences.map(()=> 'pending')});}catch(e){status(e.message,true);return;}
  const resultReferences=submittedReferences.map(ref=>({preview:ref.preview,name:ref.file.name,number:ref.number}));
  lock(true);setDraft();clearResult();status('正在生成…');
  const started=Date.now();
  let timer,completed=false;
  try{
    for(const [i,reference] of submittedReferences.entries()){
      status(`正在上传参考图 ${i+1} / ${submittedReferences.length}…`,false,`Uploading reference ${i+1} / ${submittedReferences.length}…`);
      args.referenceIds.push(await upload(reference));
    }
    const {job}=unwrap(await app.callServerTool({name:'start_image',arguments:args}));
    const showElapsed=()=>{const name=model.split('/').pop(),seconds=Math.floor((Date.now()-started)/1000);status(`正在使用 ${name} 生成 · 已等待 ${seconds} 秒`,false,`Generating with ${name} · ${seconds}s elapsed`);};showElapsed();timer=setInterval(showElapsed,1000);
    for(;;){
      await new Promise(resolve=>setTimeout(resolve,2000));
      const reply=await app.callServerTool({name:'get_image_result',arguments:{id:job.id}}),data=unwrap(reply);
      if(data.job.status==='running')continue;
      if(data.job.status!=='completed')throw new Error(data.job.error||'生成失败');
      completed=true;
      const encoded=reply._meta?.imageDataUrl;
      if(!encoded)throw new Error('已生成，但未收到可预览图片');
      showResult(data.job,encoded,resultReferences,{userPrompt:prompt,references:resultReferences});
      status('图片已保存。可在卡片中预览和下载，未返回聊天。');break;
    }
  }catch(e){
    if(!completed)setDraft(rawPrompt,submittedReferences,submittedNextNumber);
    status(e.message,true);
  }finally{
    clearInterval(timer);lock(false);
    if(!completed)$('prompt').focus();
  }
};
const preferences=panelPreferences(app,homeDots($('home-dots')),()=>{menus.close();paintOptions(false);picker.render();},()=>menus.close(true));
app.onhostcontextchanged=preferences.updateHost;
paintOptions();
app.connect().then(async()=>{await Promise.all([preferences.connect(),models.length?null:refresh()]);})
  .catch(e=>status(`无法连接界面宿主：${e.message}`,true,`Could not connect to ChatGPT: ${e.message}`));
