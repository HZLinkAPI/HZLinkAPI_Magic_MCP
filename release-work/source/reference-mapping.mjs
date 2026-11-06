// User-visible numbers are stable for the lifetime of an upload. The wire list
// stays in upload order; this manifest maps any gaps to that list explicitly.
export function referencePrompt(prompt,references=[],englishBindings=true) {
  const numbers=references.map(ref=>ref.number);
  if(numbers.some(n=>!Number.isSafeInteger(n)||n<1)||new Set(numbers).size!==numbers.length)throw new Error('参考图编号无效，请重新选择图片');
  const chinese=prompt.matchAll(references.length?/(?:参考图|图)\s*([1-9]\d*)(?![\dA-Za-z]|[:：]\s*\d)/gu:/参考图\s*([1-9]\d*)(?![\dA-Za-z]|[:：]\s*\d)/gu);
  const english=englishBindings?[...prompt.matchAll(/\breference(?:\s+image)?\s*#?\s*([1-9]\d*)(?![\dA-Za-z]|[:：]\s*\d)\b/giu)]:[];
  const mentions=[...chinese,...english];
  for(const match of mentions)if(!numbers.includes(Number(match[1])))throw new Error(`提示词引用的参考图 ${match[1]} 尚未上传或已移除，请补齐图片或修改提示词`);
  const prepared=references.length?[
    '参考图编号与本次输入图片的对应关系：',
    ...numbers.map((number,index)=>`第 ${index+1} 张输入图片对应参考图 ${number}（图 ${number}）。`),
    '用户要求中的“参考图 N”或“图 N”均按以上对应关系理解；未列出的编号没有对应图片。',
    ...(english.length?[`References in input order: ${numbers.map(n=>`Reference ${n}`).join(', ')}. Use these labels when interpreting the prompt.`]:[]),
    '',
    '用户要求：',
    prompt,
  ].join('\n'):prompt;
  if(prepared.length>16000)throw new Error('提示词加上参考图编号说明后超过长度限制，请缩短提示词');
  return prepared;
}

// Recognize only our exact historical wrapper; never guess bindings from names.
export function splitReferencePrompt(prompt='') {
  const start='参考图编号与本次输入图片的对应关系：\n';
  const marker='\n用户要求：\n',at=prompt.indexOf(marker);
  if(!prompt.startsWith(start)||at<0)return {userPrompt:prompt,numbers:[]};
  const lines=prompt.slice(start.length,at).split('\n'),numbers=[];
  for(const line of lines){
    const match=line.match(/^第 (\d+) 张输入图片对应参考图 (\d+)（图 (\d+)）。$/);
    if(!match)break;
    const number=Number(match[2]);
    if(Number(match[1])!==numbers.length+1||number!==Number(match[3])||!Number.isSafeInteger(number)||number<1||numbers.includes(number))return {userPrompt:prompt,numbers:[]};
    numbers.push(number);
  }
  const userPrompt=prompt.slice(at+marker.length);
  for(const mode of [true,false]){
    try{if(referencePrompt(userPrompt,numbers.map(number=>({number})),mode)===prompt)return {userPrompt,numbers};}catch{}
  }
  return {userPrompt:prompt,numbers:[]};
}
