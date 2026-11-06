import {t,localize} from './magic-i18n.mjs';

// Downloads are an explicit user action and never send an image to the chat.
export function imageDownloader({app,button,getJob,status}) {
  const label=button.querySelector('[data-download-label]')??button;
  let saving=false;
  button.onclick=async()=>{
    const job=getJob();if(!job||saving)return;
    saving=true;button.disabled=true;localize(label,'等待保存…');
    const report=(...args)=>{if(getJob()===job)status(...args);};
    report(t('请在系统保存窗口选择位置。'));
    try{
      const result=await app.callServerTool({name:'save_image_as',arguments:{id:job.id}},{timeout:300000});
      if(result.isError)throw new Error(result.content?.filter(item=>item.type==='text').map(item=>item.text).join('\n')||'保存失败');
      const {path,cancelled,previewDownload}=result.structuredContent??{};
      if(cancelled){report(t('已取消保存。'));return;}
      if(previewDownload){report(t('已交给浏览器下载。'));return;}
      if(!path)throw new Error('未收到图片保存位置');
      report(t(`PNG 已保存到：${path}`,`PNG saved to: ${path}`),false,path);
    }catch(error){
      const message=error.message;
      report(/(?:unknown|no such|unrecognized|unsupported) (?:app )?tool|tool[^\n]*(?:not found|does not exist|not available)/i.test(message)
        ?t('下载服务还是旧版。请按 ⌘Q 完全退出 ChatGPT，重新打开后再试。','The download service is outdated. Quit ChatGPT completely, reopen it, and try again.')
        :t(`下载失败：${message}`,`Download failed: ${t(message)}`),true);
    }
    finally{saving=false;button.disabled=false;localize(label,'下载 PNG');}
  };
}
