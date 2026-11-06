export const ratios = ['1:1','2:3','3:2','4:3','3:4','16:9','9:16','21:9','9:21','auto'];
export const qualities = ['auto','low','medium','high','xhigh','max'];
export function capabilities(id) {
  if (id.includes('gpt-image-2.5')) return { family:'gpt', qualities, resolutions:['1k','2k','4k','auto'], references:16, customSize:true };
  if (id.includes('gpt-image-2')) return { family:'gpt', qualities:qualities.slice(0,4), resolutions:['1k','2k','4k','auto'], references:16, customSize:true };
  if (id.includes('grok-imagine')) return { family:'grok', qualities:id.includes('image-2.0') ? ['auto','low','medium'] : ['auto'], resolutions:['1k','2k','auto'], ratios:ratios.filter(r=>!['21:9','9:21'].includes(r)), references:5, customSize:false };
  return { family:'other', qualities:qualities.slice(0,4), resolutions:['1k','2k','auto'], references:4, customSize:true };
}
// Presets describe requested pixel dimensions; the true output is shown separately.
export function presetSize(ratio, resolution, align = true) {
  if (ratio === 'auto' || resolution === 'auto') return null;
  const [a,b] = ratio.split(':').map(Number);
  let scale = ({'1k':1024,'2k':2048,'4k':3840})[resolution] / Math.max(a,b);
  let w = a*scale, h = b*scale;
  if (w*h < 655360) { scale = Math.sqrt(655360/(w*h)); w*=scale; h*=scale; }
  if (w*h > 8294400) { scale = Math.sqrt(8294400/(w*h)); w*=scale; h*=scale; }
  const step=align?16:1;
  w=Math.max(step,Math.round(w/step)*step); h=Math.max(step,Math.round(h/step)*step);
  while(w*h>8294400) { if(w>=h) w-=step; else h-=step; }
  while(w*h<655360) { if(w>=h) w+=step; else h+=step; }
  return { width:w,height:h };
}
export function validateOptions(a) {
  const cap=capabilities(a.model);
  if(!cap.qualities.includes(a.quality||'auto')) throw new Error('所选模型不支持这个质量档位');
  if(!cap.resolutions.includes(a.resolution||'auto')) throw new Error('所选模型不支持这个分辨率档位');
  if(!ratios.includes(a.ratio||'auto')) throw new Error('不支持的画面比例');
  if(cap.ratios&&!cap.ratios.includes(a.ratio||'auto')) throw new Error('当前 Magpie / 中转链路不能准确传递此 Grok 比例，请选择其他比例');
  if((a.referenceIds||[]).length>cap.references) throw new Error(`所选模型最多接受 ${cap.references} 张参考图`);
  if(cap.family==='gpt' && a.size && a.size!=='auto') {
    const match=/^(\d+)x(\d+)$/.exec(a.size);
    if(!match) throw new Error('尺寸应为 宽x高，例如 3840x2160');
    const [w,h]=match.slice(1).map(Number);
    if(!w||!h||w%16||h%16) throw new Error('此模型要求宽、高都为 16 的倍数');
    if(Math.max(w,h)>3840||Math.max(w/h,h/w)>3||w*h<655360||w*h>8294400) throw new Error('尺寸需满足：单边 ≤3840、长宽比 ≤3:1、总像素 655,360–8,294,400');
  }
  return cap;
}
export function grokSize(ratio='auto',resolution='auto') {
  if(ratio==='auto')return resolution==='auto'?'auto':resolution;
  const [a,b]=ratio.split(':').map(Number),factor=Math.floor((resolution==='2k'?2048:1024)/Math.max(a,b));
  return `${a*factor}x${b*factor}`;
}
