import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {normalizeImageOutput,macImageToPNG} from '../image-output.mjs';
import {persistImageRecord} from './source/image-history.mjs';
import {outputDirectory} from './source/storage.mjs';

const [id,...extra]=process.argv.slice(2);
if(process.platform!=='darwin'||extra.length||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(id??'')){
  throw new Error('用法（macOS）：node release-work/recover-image.mjs <任务编号>');
}
const record=JSON.parse(await readFile(join(outputDirectory,id+'.json'),'utf8'));
const target=join(outputDirectory,id+'.png');
if(record.id!==id||record.status!=='failed'||!record.error?.startsWith('ENOENT:')||!record.error.includes(target)){
  throw new Error('此记录不是旧版因输出扩展名不一致而失败的任务。');
}
const output=await normalizeImageOutput(target,target,macImageToPNG);
const {error,...original}=record;
await persistImageRecord({...original,...output,file:target,status:'completed'});
console.log('图片已恢复到本机历史图库。没有重新生图。');
