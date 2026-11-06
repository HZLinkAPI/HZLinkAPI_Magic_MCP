import {bindStaticUI,localize,setLanguage,t} from './magic-i18n.mjs';

const localKey='hzlinkapi-magic-preferences-v1';
const valid=p=>p&&['zh-CN','en'].includes(p.language)&&['system','light','dark'].includes(p.theme);
export function panelPreferences(app,dots,onLanguageChange,closeTheme){
  const root=document.documentElement;
  const themeValue=document.getElementById('theme-value'),languageToggle=document.getElementById('language-toggle');
  const themeOptions=[...document.querySelectorAll('#theme-menu [data-theme-option]')];
  const themeLabels={system:'跟随系统',light:'浅色',dark:'深色'};
  const status=document.getElementById('preference-status');
  const media=window.matchMedia?.('(prefers-color-scheme: dark)');
  let current={language:'zh-CN',theme:'system'},hostTheme,version=0,connected=false,pending=Promise.resolve();
  try{const cached=JSON.parse(localStorage.getItem(localKey));if(valid(cached))current=cached;}catch{}
  bindStaticUI();
  function paintTheme(){
    const theme=current.theme==='system'?(hostTheme||(media?.matches===false?'light':'dark')):current.theme;
    root.dataset.theme=theme;
    localize(themeValue,themeLabels[current.theme]);
    for(const option of themeOptions)option.setAttribute('aria-pressed',String(option.dataset.themeOption===current.theme));
    dots.refresh();
  }
  function paintLanguage(){
    setLanguage(current.language);
    document.getElementById('language-name').textContent=current.language==='en'?'EN':'中文';
    onLanguageChange();
  }
  function queueSave(){
    const selected={...current},revision=version;
    pending=pending.then(async()=>{
      const reply=await app.callServerTool({name:'set_magic_preferences',arguments:selected});
      if(reply?.isError||!valid(reply?.structuredContent?.preferences))throw new Error('Preference save failed');
      if(revision===version)status.textContent='';
    }).catch(()=>{if(revision===version)status.textContent=t('偏好未能保存。');});
  }
  function change(fields){
    version++;current={...current,...fields};
    try{localStorage.setItem(localKey,JSON.stringify(current));}catch{}
    if(fields.language)paintLanguage();
    if(fields.theme)paintTheme();
    if(connected)queueSave();
  }
  function updateHost(ctx){
    if(ctx?.theme==='dark'||ctx?.theme==='light')hostTheme=ctx.theme;
    paintTheme();
  }
  languageToggle.onclick=()=>change({language:current.language==='en'?'zh-CN':'en'});
  for(const option of themeOptions)option.onclick=()=>{
    const theme=option.dataset.themeOption;
    if(theme!==current.theme)change({theme});
    closeTheme();
  };
  media?.addEventListener('change',paintTheme);
  updateHost(app.getHostContext());
  // The initial language is applied without triggering a server write.
  setLanguage(current.language);
  document.getElementById('language-name').textContent=current.language==='en'?'EN':'中文';
  return {
    updateHost,
    async connect(){
      updateHost(app.getHostContext());
      connected=true;
      if(version){queueSave();return;}
      try{
        const r=await app.callServerTool({name:'get_magic_preferences',arguments:{}});
        const stored=r?.structuredContent?.preferences;
        if(!version&&valid(stored)){
          current=stored;
          try{localStorage.setItem(localKey,JSON.stringify(current));}catch{}
          paintLanguage();paintTheme();
        }
      }catch{} // Older preview hosts still work for this view.
    }
  };
}
