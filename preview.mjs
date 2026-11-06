import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {imageModels} from './magpie.mjs';
import {listImageHistory,imageHistoryItem} from './image-history.mjs';

const root=dirname(fileURLToPath(import.meta.url));
// Use the actual widget and a small browser host adapter for UI review.
// Only read-only catalogue/history routes exist; no generation endpoint exists.
const adapter=`export class App {
  async connect() {}
  getHostContext(){return {theme:'dark'}}
  images=new Map();
  async callServerTool({name,arguments:args={}}) {
    if(name==='save_image_as'){
      const image=this.images.get(args.id);
      if(!image)throw new Error('请先打开要下载的历史图片。');
      const bytes=Uint8Array.from(atob(image.split(',')[1]),char=>char.charCodeAt(0));
      const url=URL.createObjectURL(new Blob([bytes],{type:'image/png'})),link=document.createElement('a');
      link.href=url;link.download='hzlinkapi-'+args.id+'.png';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);return {structuredContent:{previewDownload:true}};
    }
    const path=name==='list_image_models'?'/api/models':name==='list_image_history'?'/api/history?'+new URLSearchParams(args):name==='get_image_history'?'/api/history-item?'+new URLSearchParams(args):null;
    if(!path)throw new Error('请在聊天中的 MCP 卡片里生成或下载图片。');
    const r=await fetch(path);const data=await r.json();
    if(!r.ok)throw new Error(data.error||'读取模型失败');
    if(name==='get_image_history')this.images.set(args.id,data._meta.imageDataUrl);
    return name==='list_image_models'?{structuredContent:data}:data;
  }
  async sendMessage(){throw new Error('预览页面无法发送聊天消息。')}
}`;
async function html(){
  const result=await build({entryPoints:[join(root,'widget.js')],bundle:true,write:false,format:'iife',platform:'browser',target:['chrome120'],plugins:[{name:'preview-host',setup(b){
    b.onResolve({filter:/^@modelcontextprotocol\/ext-apps$/},()=>({path:'host',namespace:'preview'}));
    b.onLoad({filter:/.*/,namespace:'preview'},()=>({contents:adapter,loader:'js'}));
  }}]});
  return (await readFile(join(root,'widget.html'),'utf8')).replace('<!-- APP_SCRIPT -->',()=>`<script>${result.outputFiles[0].text.replaceAll('</script','<\\/script')}</script>`);
}
createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(!['127.0.0.1:43187','localhost:43187'].includes(req.headers.host)){res.writeHead(403);res.end();return;}
  try{
    if(req.method==='GET'&&req.url==='/') {res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await html());}
    else if(req.method==='GET'&&req.url==='/api/models'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({models:await imageModels()}));}
    else if(req.method==='GET'&&req.url.startsWith('/api/history?')){const query=new URL(req.url,'http://127.0.0.1:43187').searchParams;const {thumbnails,...history}=await listImageHistory({offset:Number(query.get('offset')||0),limit:Number(query.get('limit')||12)});res.setHeader('Content-Type','application/json');res.end(JSON.stringify({structuredContent:history,_meta:{thumbnails}}));}
    else if(req.method==='GET'&&req.url.startsWith('/api/history-item?')){const query=new URL(req.url,'http://127.0.0.1:43187').searchParams;const {item,imageDataUrl,referencePreviews}=await imageHistoryItem(query.get('id'));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({structuredContent:{item},_meta:{imageDataUrl,referencePreviews}}));}
    else {res.writeHead(404);res.end();}
  }catch(e){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}
}).listen(43187,'127.0.0.1',()=>console.log('UI preview: http://127.0.0.1:43187'));
