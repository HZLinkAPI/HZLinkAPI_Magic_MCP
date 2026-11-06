const english={
  '语言':'Language','主题':'Theme','跟随系统':'System','浅色':'Light','深色':'Dark',
  '新建会话':'New session','历史图库':'History','刷新模型':'Refresh models','图片输出区域':'Image output',
  '对比':'Compare','结果':'Result','图片查看方式':'Image view','下载 PNG':'Download PNG',
  '生成的图片':'Generated image','原图':'Original','生成图':'Generated',
  '原图与生成图对比':'Compare the original and generated images','选择对比参考图':'Choose a reference to compare',
  '继续编辑':'Continue editing','把图片返回聊天':'Return image to chat','提示词与参考图':'Prompt and references',
  '上传参考图':'Upload references','提示词输入':'Prompt','描述你想生成的画面…':'Describe the image you want to create…',
  '模型':'Model','生图模型':'Image model','读取模型中…':'Loading models…','选择模型':'Select a model','发送':'Generate',
  '生成参数':'Image settings','宽高比':'Aspect ratio','选择宽高比':'Choose aspect ratio',
  '质量':'Quality','选择质量':'Choose quality','尺寸':'Size','设置尺寸':'Set dimensions',
  '宽 W':'Width','高 H':'Height','图片宽度':'Image width','图片高度':'Image height','交换宽高':'Swap width and height',
  '16 倍数对齐':'Snap to multiples of 16','分辨率':'Resolution','选择分辨率':'Choose resolution',
  '自动':'Auto','低':'Low','中':'Medium','高':'High','极高':'Very high','最高':'Maximum','自定义':'Custom',
  '本机历史':'Local history','刷新历史':'Refresh history','关闭历史':'Close history','历史图片':'History images',
  '加载更多':'Load more','删除':'Delete','取消':'Cancel','确认删除':'Delete record','确认删除历史记录':'Confirm history deletion',
  '从历史图库删除这条记录？图片文件会保留。':'Delete this history record? The image file will be kept.',
  '请先等待当前操作完成':'Wait for the current operation to finish.',
  '请先等待当前操作完成。':'Wait for the current operation to finish.',
  '正在读取图片…':'Loading image…','正在删除记录…':'Deleting record…','无法删除这条记录':'Could not delete this record.',
  '已删除历史记录。':'History record deleted.','已删除，暂无历史记录。':'Deleted. No history yet.',
  '未保存提示词':'No prompt saved','图片':'Image','正在读取本机历史…':'Loading local history…',
  '读取历史失败':'Could not load history.','历史记录格式无效':'The history data is invalid.','暂无生成记录。':'No generated images yet.',
  '此记录未保存提示词。':'No prompt was saved for this record.','历史图片内容不完整':'The history image data is incomplete.',
  '已载入历史图片。':'History image loaded.','工具调用失败':'The action failed.','正在读取 Magpie 生图模型…':'Loading Magpie image models…',
  '仅支持 PNG、JPG、WebP':'Use a PNG, JPG, or WebP image.','单张参考图不能超过 12 MB':'Each reference must be 12 MB or smaller.',
  '参考图总大小不能超过 32 MB':'References must total 32 MB or less.','参考图已选择，点击生成时才会上传。':'References selected. They will upload when you generate.',
  '未找到可继续编辑的 PNG 图片':'No PNG is available for editing.','参考图上传未完成':'The reference upload did not finish.',
  '桌面端未接收返回消息':'ChatGPT did not receive the message.','图片已返回聊天。':'Image returned to chat.',
  '正在生成…':'Generating…','请填写想画的内容':'Describe the image you want to create.','生成失败':'Image generation failed.',
  '已生成，但未收到可预览图片':'The image was generated, but no preview was received.',
  '图片已保存。可在卡片中预览和下载，未返回聊天。':'Image saved. Preview or download it here.',
  '等待保存…':'Waiting to save…','请在系统保存窗口选择位置。':'Choose where to save the file in the system dialog.',
  '保存失败':'Could not save the image.','已取消保存。':'Save cancelled.','已交给浏览器下载。':'Download sent to the browser.',
  '未收到图片保存位置':'No save location was returned.',
  '无法连接本机 Magpie。请打开 Magpie，确认已配置生图模型后，再点刷新。':'Open Magpie, configure an image model, then refresh.',
  '无法打开系统保存窗口，请重试。':'Could not open the save dialog. Try again.',
  '保存窗口已超时，请重新下载。':'The save dialog timed out. Try downloading again.',
  '图片尚未生成完成，无法下载':'The image is not ready to download.',
  '偏好未能保存。':'Could not save preferences.'
};
Object.assign(english,{
  '所选模型不支持这个质量档位':'The selected model does not support this quality setting.',
  '所选模型不支持这个分辨率档位':'The selected model does not support this resolution.',
  '不支持的画面比例':'This aspect ratio is unsupported.',
  '当前 Magpie / 中转链路不能准确传递此 Grok 比例，请选择其他比例':'Choose a different aspect ratio for this Grok model.',
  '尺寸应为 宽x高，例如 3840x2160':'Use width × height, for example 3840 × 2160.',
  '此模型要求宽、高都为 16 的倍数':'This model requires width and height to be multiples of 16.',
  '尺寸需满足：单边 ≤3840、长宽比 ≤3:1、总像素 655,360–8,294,400':'Use sides up to 3840 px, a ratio up to 3:1, and 655,360–8,294,400 total pixels.',
  '参考图编号无效，请重新选择图片':'Reference numbers are invalid. Select the images again.',
  '提示词加上参考图编号说明后超过长度限制，请缩短提示词':'Shorten your prompt to leave room for the reference mapping.'
});

let language='zh-CN';
const bindings=new WeakMap();
export const locale=()=>language;
function englishError(zh){
  zh=String(zh??'');
  const missing=zh.match(/^提示词引用的参考图 (\d+) 尚未上传或已移除，请补齐图片或修改提示词$/);
  if(missing)return `Reference ${missing[1]} is missing. Upload it or change the prompt.`;
  const limit=zh.match(/^(?:此模型最多|所选模型最多接受) (\d+) 张参考图$/);
  if(limit)return `This model accepts up to ${limit[1]} references.`;
  return zh;
}
export const t=(zh,en)=>language==='en'?(en??(Object.hasOwn(english,zh)?english[zh]:englishError(zh))):zh;
function apply(node,entries){
  for(const [attr,[zh,en]] of entries){
    if(attr==='text')node.textContent=t(zh,en);
    else node.setAttribute(attr,t(zh,en));
  }
}
export function localize(node,zh,en,attr='text'){
  let entries=bindings.get(node);
  if(!entries){entries=new Map();bindings.set(node,entries);node.setAttribute('data-localized','');}
  entries.set(attr,[zh,en]);apply(node,entries);
}
export function setLanguage(next){
  language=next==='en'?'en':'zh-CN';
  document.documentElement.lang=language;
  for(const node of document.querySelectorAll('[data-localized]'))if(bindings.has(node))apply(node,bindings.get(node));
}
export function bindStaticUI(){
  for(const node of document.querySelectorAll('[aria-label],[title],[placeholder],[alt]')){
    for(const attr of ['aria-label','title','placeholder','alt']){
      const zh=node.getAttribute(attr);
      if(Object.hasOwn(english,zh))localize(node,zh,undefined,attr);
    }
  }
  const walker=document.createTreeWalker(document.querySelector('main'),NodeFilter.SHOW_TEXT),nodes=[];
  while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){
    const zh=node.textContent.trim(),parent=node.parentElement;
    if(!Object.hasOwn(english,zh))continue;
    if(parent.childNodes.length===1)localize(parent,zh);
    else{
      const span=document.createElement('span');localize(span,zh);node.replaceWith(span);
    }
  }
}
