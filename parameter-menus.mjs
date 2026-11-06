export function parameterMenus() {
  const triggers=[...document.querySelectorAll('[data-parameter-menu]')];
  function close(restore=false){for(const trigger of triggers){const panel=document.getElementById(trigger.dataset.parameterMenu);if(!panel.hidden&&restore)trigger.focus();panel.hidden=true;trigger.setAttribute('aria-expanded','false');}}
  for(const trigger of triggers){
    const panel=document.getElementById(trigger.dataset.parameterMenu);
    trigger.onclick=()=>{
      const opening=panel.hidden;close();if(!opening||trigger.disabled)return;
      document.dispatchEvent(new CustomEvent('creator:popover',{detail:trigger.id}));
      panel.hidden=false;trigger.setAttribute('aria-expanded','true');
      (panel.querySelector('button[aria-pressed=true]:not(:disabled)')||panel.querySelector('button:not(:disabled),input:not(:disabled)'))?.focus();
    };
    trigger.onkeydown=e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();if(panel.hidden)trigger.click();}};
    panel.onkeydown=e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);return;}
      if(panel.classList.contains('size-menu'))return;
      const items=[...panel.querySelectorAll('button:not(:disabled)')],at=items.indexOf(document.activeElement);
      let next;if(e.key==='ArrowDown')next=(at+1)%items.length;if(e.key==='ArrowUp')next=(at-1+items.length)%items.length;if(e.key==='Home')next=0;if(e.key==='End')next=items.length-1;
      if(next!==undefined){e.preventDefault();items[next]?.focus();items[next]?.scrollIntoView?.({block:'nearest'});}
    };
  }
  document.addEventListener('pointerdown',e=>{if(!triggers.some(t=>t.parentElement.contains(e.target)))close();});
  document.addEventListener('focusin',e=>{if(!triggers.some(t=>t.parentElement.contains(e.target)))close();});
  document.addEventListener('creator:popover',e=>{if(!triggers.some(t=>t.id===e.detail))close();});
  return {close};
}
