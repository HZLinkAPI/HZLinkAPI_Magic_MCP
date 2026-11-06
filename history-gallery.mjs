import {localize} from './magic-i18n.mjs';

const iconPaths={
  download:'M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4',
  edit:'m14.5 6.5 3 3M5 19l4-.8L19.5 7.7a2.1 2.1 0 0 0-3-3L6 15.2 5 19Z',
  delete:'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v6m4-6v6',
  cancel:'m6 6 12 12M18 6 6 18',
};

export function historyGallery({document,app,onSelect,onAction,onDelete,isBusy}) {
  const $=id=>document.getElementById(id),dialog=$('history-dialog');
  let items=[],offset=0,hasMore=false,canDelete=false,loading=false,selecting=false,deleting=false,confirmation=null;
  function actionButton(label,icon){
    const button=document.createElement('button');button.type='button';
    const ns='http://www.w3.org/2000/svg';
    const svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');
    for(const [name,value] of Object.entries({viewBox:'0 0 24 24',width:'14',height:'14',fill:'none',stroke:'currentColor','stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false'}))svg.setAttribute(name,value);
    const text=document.createElement('span');localize(text,label);
    path.setAttribute('d',iconPaths[icon]);svg.append(path);button.append(svg,text);
    return button;
  }
  function message(text,error=false){localize($('history-status'),text);$('history-status').classList.toggle('error',error);}
  function dismissConfirmation(){if(!confirmation)return;confirmation.trigger.setAttribute('aria-expanded','false');confirmation.form.remove();confirmation=null;}
  function close(){dismissConfirmation();if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');$('history-trigger').setAttribute('aria-expanded','false');}
  async function select(id,action='view'){
    if(selecting||deleting)return;
    if(isBusy()){message('请先等待当前操作完成。',true);return;}
    selecting=true;message('正在读取图片…');
    try{await onSelect(id);close();if(action!=='view')onAction(action);}
    catch(error){message(error.message,true);}
    finally{selecting=false;}
  }
  function confirmDelete(item,card,trigger){
    if(loading||selecting||deleting||isBusy())return;
    const wasOpen=confirmation?.trigger===trigger;dismissConfirmation();if(wasOpen)return;
    const form=document.createElement('div');form.className='history-delete-confirmation';form.setAttribute('role','group');localize(form,'确认删除历史记录',undefined,'aria-label');
    const text=document.createElement('p');localize(text,'从历史图库删除这条记录？图片文件会保留。');
    const actions=document.createElement('div');actions.className='history-actions';
    const cancel=actionButton('取消','cancel');
    const confirm=actionButton('确认删除','delete');confirm.className='history-delete';
    cancel.onclick=()=>{dismissConfirmation();trigger.focus();};
    confirm.onclick=async()=>{
      if(deleting||loading||selecting||isBusy())return;
      deleting=true;confirm.disabled=true;cancel.disabled=true;message('正在删除记录…');
      try{
        const reply=await app.callServerTool({name:'delete_image_history',arguments:{id:item.id}});
        if(reply.isError||reply.structuredContent?.deleted!==true)throw new Error(reply.content?.find(part=>part.type==='text')?.text||'无法删除这条记录');
        const next=(card.nextElementSibling||card.previousElementSibling)?.querySelector('.history-open');
        dismissConfirmation();card.remove();items=items.filter(entry=>entry.id!==item.id);offset=Math.max(0,offset-1);onDelete(item.id);
        message(items.length||hasMore?'已删除历史记录。':'已删除，暂无历史记录。');
        if(dialog.open)(next||$('history-refresh')).focus();
      }catch(error){message(error.message,true);}
      finally{deleting=false;confirm.disabled=false;cancel.disabled=false;}
    };
    actions.append(cancel,confirm);form.append(text,actions);card.append(form);confirmation={trigger,form};trigger.setAttribute('aria-expanded','true');cancel.focus();
  }
  function render(thumbnails){
    const images=new Map(thumbnails.map(item=>[item.id,item.dataUrl]));
    for(const item of items){
      if($('history-list').querySelector(`[data-history-id="${item.id}"]`))continue;
      const card=document.createElement('article');card.className='history-item';card.dataset.historyId=item.id;
      const view=document.createElement('button');view.type='button';view.className='history-open';
      const modelName=item.model.split('/').pop();localize(view,`查看历史图片：${modelName}`,`View history image: ${modelName}`,'aria-label');
      const picture=document.createElement('div');picture.className='history-thumbnail';
      if(images.has(item.id)){const image=document.createElement('img');image.src=images.get(item.id);image.alt='';image.loading='lazy';picture.append(image);}else localize(picture,'图片');
      const body=document.createElement('span');body.className='history-description';
      const model=document.createElement('strong');model.textContent=modelName;
      const time=document.createElement('time');time.dateTime=item.finishedAt||item.startedAt;
      const date=lang=>new Date(time.dateTime).toLocaleString(lang,{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
      localize(time,date('zh-CN'),date('en'));
      const prompt=document.createElement('span');prompt.className='history-prompt';
      if(item.userPrompt)prompt.textContent=item.userPrompt;else localize(prompt,'未保存提示词');
      body.append(model,time,prompt);view.append(picture,body);view.onclick=()=>select(item.id);
      const actions=document.createElement('div');actions.className='history-actions';
      for(const [label,action] of [['下载 PNG','download'],['继续编辑','edit']]){const button=actionButton(label,action);button.onclick=()=>select(item.id,action);actions.append(button);}
      if(canDelete){
        const button=actionButton('删除','delete');button.className='history-delete';button.setAttribute('aria-expanded','false');button.onclick=()=>confirmDelete(item,card,button);actions.append(button);
      }
      card.append(view,actions);$('history-list').append(card);
    }
  }
  async function load(reset=false){
    if(loading||deleting)return;loading=true;dismissConfirmation();
    if(reset){items=[];offset=0;$('history-list').replaceChildren();}
    $('history-more').disabled=true;$('history-refresh').disabled=true;message('正在读取本机历史…');
    try{
      const reply=await app.callServerTool({name:'list_image_history',arguments:{offset,limit:12}});
      if(reply.isError)throw new Error(reply.content?.find(item=>item.type==='text')?.text||'读取历史失败');
      const data=reply.structuredContent||{};
      if(!Array.isArray(data.items))throw new Error('历史记录格式无效');
      canDelete=data.canDelete===true;
      offset+=data.items.length;const known=new Set(items.map(item=>item.id));items.push(...data.items.filter(item=>!known.has(item.id)));hasMore=!!data.hasMore&&data.items.length>0;
      render(reply._meta?.thumbnails||[]);message(items.length?'':'暂无生成记录。');
    }catch(error){hasMore=false;message(error.message,true);}
    finally{loading=false;$('history-more').hidden=!hasMore;$('history-more').disabled=false;$('history-refresh').disabled=false;}
  }
  $('history-trigger').onclick=()=>{if(isBusy())return;if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');$('history-trigger').setAttribute('aria-expanded','true');void load(true);};
  $('history-close').onclick=close;
  $('history-refresh').onclick=()=>load(true);
  $('history-more').onclick=()=>load();
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('close',()=>{$('history-trigger').setAttribute('aria-expanded','false');});
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const bounds=dialog.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)close();});
  return {close};
}
