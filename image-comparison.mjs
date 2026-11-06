import {localize} from './magic-i18n.mjs';

// Comparison uses only the local previews captured for the completed request.
// Moving the divider never uploads an image or calls a generation tool.
export function imageComparison(document) {
  const $=id=>document.getElementById(id);
  const frame=$('image-view'),range=$('comparison-range');
  let sources=[],mode='result',pointer=null;
  function position(value) {
    const number=Number(value),percent=Number.isFinite(number)?Math.max(0,Math.min(100,number)):50;
    range.value=String(percent);
    frame.style.setProperty('--comparison-position',`${percent}%`);
    localize(range,`原图 ${percent}%，生成图 ${100-percent}%`,`Original ${percent}%, generated ${100-percent}%`,'aria-valuetext');
  }
  function show(next) {
    mode=sources.length&&next==='compare'?'compare':'result';
    frame.classList.toggle('comparing',mode==='compare');
    $('compare-view').setAttribute('aria-pressed',String(mode==='compare'));
    $('result-view').setAttribute('aria-pressed',String(mode==='result'));
    $('comparison-layer').hidden=mode!=='compare';
    $('comparison-references').hidden=mode!=='compare'||sources.length<2;
  }
  function select(index) {
    const source=sources[index];if(!source)return;
    $('comparison-original').src=source.preview;
    localize($('comparison-original'),`参考图 ${source.number}：${source.name}`,`Reference ${source.number}: ${source.name}`,'alt');
    localize(document.querySelector('.before-label'),`原图 · 图 ${source.number}`,`Original · Ref ${source.number}`);
    for(const [i,button] of [...$('comparison-references').children].entries())button.setAttribute('aria-pressed',String(i===index));
  }
  function seek(event) {
    const bounds=range.getBoundingClientRect();
    if(bounds.width>0)position(Math.round((event.clientX-bounds.left)/bounds.width*100));
  }
  range.addEventListener('input',()=>position(range.value));
  range.addEventListener('pointerdown',event=>{
    if(event.button!==0||pointer!==null)return;
    event.preventDefault();range.focus();pointer=event.pointerId;
    range.setPointerCapture?.(pointer);seek(event);
  });
  range.addEventListener('pointermove',event=>{if(pointer===event.pointerId)seek(event);});
  function release(event){if(pointer!==event.pointerId)return;const id=pointer;pointer=null;if(range.hasPointerCapture?.(id))range.releasePointerCapture(id);}
  range.addEventListener('pointerup',release);
  range.addEventListener('pointercancel',release);
  range.addEventListener('lostpointercapture',()=>{pointer=null;});
  $('compare-view').onclick=()=>show('compare');
  $('result-view').onclick=()=>show('result');
  return {
    clear() {
      if(pointer!==null)release({pointerId:pointer});
      sources=[];
      $('image').removeAttribute('src');
      $('comparison-original').removeAttribute('src');
      $('comparison-references').replaceChildren();
      $('compare-controls').hidden=true;
      show('result');
    },
    setResult(image,references=[]) {
      sources=references.map(({preview,name,number},index)=>({preview,name,number:number??index+1}));
      $('image').src=image.src;
      const {width,height}=image.dimensions||{};
      frame.style.aspectRatio=width>0&&height>0?`${width} / ${height}`:'3 / 2';
      $('compare-controls').hidden=!sources.length;
      $('comparison-references').replaceChildren(...sources.map((source,index)=>{
        const button=document.createElement('button');button.type='button';
        localize(button,`图 ${source.number}：${source.name}`,`Ref ${source.number}: ${source.name}`,'title');
        localize(button,`对比参考图 ${source.number}`,`Compare reference ${source.number}`,'aria-label');
        const thumbnail=document.createElement('img');thumbnail.src=source.preview;thumbnail.alt='';
        const label=document.createElement('span');localize(label,`图 ${source.number}`,`Ref ${source.number}`);
        button.append(thumbnail,label);button.onclick=()=>select(index);return button;
      }));
      if(sources.length)select(0);else $('comparison-original').removeAttribute('src');
      position(50);show(sources.length?'compare':'result');
    }
  };
}
