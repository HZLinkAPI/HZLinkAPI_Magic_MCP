import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { imageModels, startImage, imageJob, root } from './magpie.mjs';
import { referenceChunk } from './references.mjs';
import { downloadCompletedImage } from './save-image.mjs';
import { listImageHistory,imageHistoryItem,deleteImageHistory } from './image-history.mjs';

import {registerPreferences} from './magic-preferences.mjs';

export const uri = 'ui://hzlinkapi-creator/creation-v15.html';
const legacyUris = ['ui://hzlinkapi-creator/creation-v14.html', 'ui://hzlinkapi-creator/creation-v13.html', 'ui://hzlinkapi-creator/creation-v12.html', 'ui://hzlinkapi-creator/creation-v11.html', 'ui://hzlinkapi-creator/creation-v10.html', 'ui://hzlinkapi-creator/creation-v9.html', 'ui://hzlinkapi-creator/creation-v8.html', 'ui://hzlinkapi-creator/creation-v7.html', 'ui://hzlinkapi-creator/creation-v6.html', 'ui://hzlinkapi-creator/creation-v5.html', 'ui://hzlinkapi-creator/creation-v4.html', 'ui://hzlinkapi-creator/creation-v3.html', 'ui://hzlinkapi-creator/creation-v2.html'];
const title = 'HZLinkAPI Magic';
const appOnly = { ui: { visibility: ['app'] }, 'openai/widgetAccessible': true, 'openai/visibility': 'private' };
const uiMeta = {
  ui: { resourceUri: uri, visibility: ['model', 'app'] },
  'openai/ui': { entrypoints: [{ type: 'thread' }] },
  'openai/outputTemplate': uri,
  'openai/widgetAccessible': true,
};
const error = e => ({ isError: true, content: [{ type: 'text', text: e.message }] });
export function createServer() {
  const server = new McpServer({ name: 'hzlinkapi-creator', version: '0.2.0' });
  // Keep old chat cards readable and give newly opened panels a fresh cache key.
  for (const resourceUri of [uri, ...legacyUris]) registerAppResource(server, title, resourceUri, { description: '从本机 Magpie 选模型生成图片', _meta: { ui: { prefersBorder: true } } }, async () => ({
    contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: await readFile(join(root, 'dist/widget.html'), 'utf8'), _meta: {
      ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: ['data:'] } },
      'openai/widgetPrefersBorder': true, 'openai/widgetDescription': 'HZLinkAPI 生图面板，自动读取本机 Magpie 生图模型。',
      'openai/widgetCSP': { connect_domains: [], resource_domains: ['data:'] },
    } }],
  }));
  registerAppTool(server, 'open_creator', {
    title, description: '打开 HZLinkAPI Magic，读取本机 Magpie 当前可用生图模型。只打开面板，不生成图片。用户可在卡片点选 Flare、Sunburst 或其他可用模型后生成。',
    inputSchema: { prompt: z.string().max(16000).optional() },
    annotations: { readOnlyHint: true, openWorldHint: false }, _meta: uiMeta,
  }, async ({ prompt = '' }) => {
    try { const models = await imageModels(); return { content: [{ type: 'text', text: `已打开 ${title}，读取到 ${models.length} 个生图模型，请在卡片内选择模型并生成。` }],
      structuredContent: { models, prompt }, _meta: { 'openai/outputTemplate': uri } }; } catch (e) { return error(e); }
  });
  server.registerTool('list_image_models', { description: '刷新本机 Magpie 可用生图模型。', inputSchema: {}, annotations: { readOnlyHint: true, openWorldHint: false }, _meta: appOnly }, async () => {
    try { const models = await imageModels(); return { content: [{ type: 'text', text: JSON.stringify(models) }], structuredContent: { models } }; } catch (e) { return error(e); }
  });
  server.registerTool('start_image', {
    description: '按用户明确选中的模型通过本机 Magpie 生成一张图片。不会换模型。返回任务编号，用 get_image_result 等待结果。',
    inputSchema: { model: z.string().min(1), prompt: z.string().trim().min(1).max(16000), userPrompt:z.string().min(1).max(16000).optional(),referenceNumbers:z.array(z.number().int().min(1).max(1000000)).max(16).optional(),size: z.string().regex(/^(auto|\d{2,4}x\d{2,4})$/).default('auto'), ratio: z.enum(['1:1','2:3','3:2','4:3','3:4','16:9','9:16','21:9','9:21','auto']).default('auto'), resolution:z.enum(['1k','2k','4k','auto']).default('auto'), quality:z.enum(['auto','low','medium','high','xhigh','max']).default('auto'), referenceIds:z.array(z.string().uuid()).max(16).default([]), requestId: z.string().uuid() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    _meta: appOnly,
  }, async args => { try { const job = await startImage(args); return { content: [{ type: 'text', text: JSON.stringify(job) }], structuredContent: { job } }; } catch (e) { return error(e); } });
  server.registerTool('get_image_result', {
    description: '查询图片生成任务；完成时返回 PNG 图片及本地文件路径，不会生成新图片。',
    inputSchema: { id: z.string().uuid() }, annotations: { readOnlyHint: true, openWorldHint: false }, _meta: appOnly,
  }, async ({ id }) => { try { return await imageJob(id); } catch (e) { return error(e); } });
  server.registerTool('upload_reference_chunk', {
    description:'仅在用户点击生成后，把选中的参考图分片保存到本机 MCP。不会生图或触发聊天回复。',
    inputSchema:{uploadId:z.string().uuid(),chunkIndex:z.number().int().min(0).max(64),data:z.string().max(350000),final:z.boolean(),mimeType:z.enum(['image/png','image/jpeg','image/webp']),name:z.string().max(120)},
    annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false},_meta:appOnly,
  },async args=>{try{return{content:[],structuredContent:await referenceChunk(args)};}catch(e){return error(e);}});
  // Cached panels may still send the old name. Both names use the native Save As dialog.
  for (const name of ['save_image_as', 'save_image']) server.registerTool(name,{
    description:'仅在用户点击下载后，打开 macOS 保存窗口，将已完成的 PNG 写入用户确认的位置。取消不会写入。不会重新生图。',
    inputSchema:{id:z.string().uuid()},
    annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false},_meta:appOnly,
  },async({id},{signal})=>{try{return{content:[],structuredContent:await downloadCompletedImage(id,{signal})};}catch(e){return error(e);}});
  server.registerTool('list_image_history',{
    description:'读取本机已完成图片的历史记录和缩略图，按时间倒序分页；不会生图或返回聊天。',
    inputSchema:{offset:z.number().int().min(0).max(1000000).default(0),limit:z.number().int().min(1).max(24).default(12)},
    annotations:{readOnlyHint:true,openWorldHint:false},_meta:appOnly,
  },async args=>{try{const {thumbnails,...history}=await listImageHistory(args);return{content:[],structuredContent:{...history,canDelete:true},_meta:{thumbnails}};}catch(e){return error(e);}});
  server.registerTool('get_image_history',{
    description:'读取一张本机历史图片、原始提示词与参考图编号对应关系；图片和参考图预览只交给卡片，不会重新生成。',
    inputSchema:{id:z.string().uuid()},annotations:{readOnlyHint:true,openWorldHint:false},_meta:appOnly,
  },async({id})=>{try{const {item,imageDataUrl,referencePreviews}=await imageHistoryItem(id);return{content:[],structuredContent:{item},_meta:{imageDataUrl,referencePreviews}};}catch(e){return error(e);}});
  server.registerTool('delete_image_history',{
    description:'仅在用户确认删除后，从本机图库移除一条已完成记录。保留原图文件、参考图和已导出的图片。',
    inputSchema:{id:z.string().uuid()},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:true,openWorldHint:false},_meta:appOnly,
  },async({id})=>{try{return{content:[],structuredContent:await deleteImageHistory(id)};}catch(e){return error(e);}});
  registerPreferences(server,appOnly);
  return server;
}
if (process.argv[1]?.endsWith('/server.mjs')) await createServer().connect(new StdioServerTransport());
