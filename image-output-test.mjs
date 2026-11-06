import assert from 'node:assert/strict';
import {access,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {normalizeImageOutput,macImageToPNG} from './image-output.mjs';

const directory=await mkdtemp(join(tmpdir(),'magic-output-check-'));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAECAYAAACzzX7wAAAAD0lEQVR4nGJiIADooAAwAAMYAAlC0FUlAAAAAElFTkSuQmCC','base64');
const webp=Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvB8AAEAcQERGIiP4HAA==','base64');
const dimensions={width:8,height:4};
try{
  const staged=join(directory,'stage');
  await mkdir(staged);
  const expected=join(staged,'result.png'),target=join(directory,'result.png');
  const neverConvert=()=>{throw new Error('PNG must not be re-encoded');};
  await writeFile(expected,png);
  assert.deepEqual(await normalizeImageOutput(expected,target,neverConvert),{dimensions,originalFormat:'png'});
  assert.deepEqual(await readFile(target),png);
  await assert.rejects(normalizeImageOutput(join(staged,'missing.png'),target,neverConvert),/没有写出/);
  if(process.platform==='darwin'){
    const jpeg=join(staged,'result.jpg');
    execFileSync('/usr/bin/sips',['-s','format','jpeg',expected,'--out',jpeg]);
    await rm(expected);
    assert.deepEqual(await normalizeImageOutput(expected,target,macImageToPNG),{dimensions,originalFormat:'jpeg'});
    assert.deepEqual(await readFile(join(directory,'result.jpg')),await readFile(jpeg));
    const recovered=join(directory,'recovered.png'),legacy=join(directory,'recovered.jpg');
    await writeFile(legacy,await readFile(jpeg));
    assert.deepEqual(await normalizeImageOutput(recovered,recovered,macImageToPNG),{dimensions,originalFormat:'jpeg'});
    assert.deepEqual(await readFile(legacy),await readFile(jpeg));
    const mislabeled=join(staged,'mislabeled.png'),webpTarget=join(directory,'web.png');
    await writeFile(mislabeled,webp);
    assert.deepEqual(await normalizeImageOutput(mislabeled,webpTarget,macImageToPNG),{dimensions,originalFormat:'webp'});
    assert.deepEqual(await readFile(join(directory,'web.webp')),webp);
    const alternate=join(staged,'failed.webp'),failedTarget=join(directory,'failed.png');
    await writeFile(alternate,webp);
    await assert.rejects(normalizeImageOutput(join(staged,'failed.png'),failedTarget,()=>{throw new Error('test conversion failure');}),/test conversion failure/);
    await assert.rejects(access(failedTarget),{code:'ENOENT'});
    assert.deepEqual(await readFile(join(directory,'failed.webp')),webp);
  }
  console.log('Image output: exact PNG passthrough, missing output, alternate JPEG, mislabeled WebP, legacy recovery and original preservation: PASS.');
}finally{await rm(directory,{recursive:true,force:true});}
