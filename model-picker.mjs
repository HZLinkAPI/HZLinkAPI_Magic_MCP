import {localize} from './magic-i18n.mjs';

// The native select remains the form value; the visible picker is styled in-page.
export function modelPicker(select, trigger, menu) {
  const label=trigger.querySelector('span');
  const options=()=>[...menu.querySelectorAll('[role=option]')];
  function close(restore=false){menu.hidden=true;trigger.setAttribute('aria-expanded','false');if(restore)trigger.focus();}
  function open(){if(trigger.disabled)return;document.dispatchEvent(new CustomEvent('creator:popover',{detail:trigger.id}));menu.hidden=false;trigger.setAttribute('aria-expanded','true');const target=options().find(b=>b.getAttribute('aria-selected')==='true')||options()[0];target?.focus();target?.scrollIntoView?.({block:'nearest'});}
  function render(){
    const selected=select.value?select.selectedOptions[0]?.textContent:null;
    localize(label,selected||'读取模型中…',selected||undefined);
    trigger.disabled=select.disabled||!select.value;
    menu.replaceChildren();
    for(const group of select.children){
      if(group.tagName!=='OPTGROUP')continue;
      const section=document.createElement('div');section.setAttribute('role','group');section.setAttribute('aria-label',group.label);
      const heading=document.createElement('div');heading.className='model-group';heading.textContent=group.label;section.append(heading);
      for(const option of group.children){
        const button=document.createElement('button');button.type='button';button.className='model-option';button.setAttribute('role','option');button.setAttribute('aria-selected',String(option.value===select.value));button.tabIndex=-1;button.dataset.value=option.value;
        const name=document.createElement('span');name.textContent=option.textContent.replace(` · ${group.label}`,'');
        const check=document.createElement('span');check.className='model-check';check.textContent='✓';check.setAttribute('aria-hidden','true');button.append(name,check);
        button.onclick=()=>{select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));close(true);};section.append(button);
      }
      menu.append(section);
    }
    close();
  }
  trigger.onclick=()=>menu.hidden?open():close();
  trigger.onkeydown=e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();open();}};
  menu.onkeydown=e=>{
    const all=options(),at=all.indexOf(document.activeElement);
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);return;}
    if(e.key==='Tab'){close();return;}
    let next;if(e.key==='ArrowDown')next=(at+1)%all.length;if(e.key==='ArrowUp')next=(at-1+all.length)%all.length;if(e.key==='Home')next=0;if(e.key==='End')next=all.length-1;
    if(next!==undefined){e.preventDefault();all[next]?.focus();all[next]?.scrollIntoView?.({block:'nearest'});}
  };
  document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target)&&!trigger.contains(e.target))close();});
  document.addEventListener('focusin',e=>{if(!menu.contains(e.target)&&!trigger.contains(e.target))close();});
  document.addEventListener('creator:popover',e=>{if(e.detail!==trigger.id)close();});
  return {render,close};
}
