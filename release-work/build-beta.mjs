import {build} from 'esbuild';
import {cp,mkdir,readdir,copyFile,chmod,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runtimeVersion,verifiedRuntime} from '../release-runtime.mjs';

const base=dirname(fileURLToPath(import.meta.url)),root=dirname(base);
const stage=join(base,'stage','HZLinkAPI Magic');
await mkdir(join(stage,'dist'),{recursive:true});
await mkdir(join(stage,'licenses'),{recursive:true});
execFileSync(process.execPath,[join(root,'build.mjs')],{cwd:root,stdio:'inherit'});
const bundle=await build({
  absWorkingDir:root,entryPoints:[join(base,'source','server.mjs')],outfile:join(stage,'server.mjs'),
  bundle:true,platform:'node',target:'node24',format:'esm',metafile:true,legalComments:'eof',
  banner:{js:"import { createRequire as __hzlmCreateRequire } from 'node:module'; const require = __hzlmCreateRequire(import.meta.url);"}
});
await copyFile(join(root,'dist','widget.html'),join(stage,'dist','widget.html'));
for(const file of ['install.mjs','安装 HZLinkAPI Magic.command','安装说明.txt'])await copyFile(join(base,file),join(stage,file));
await chmod(join(stage,'安装 HZLinkAPI Magic.command'),0o755);
const modules=new Set(['@modelcontextprotocol/ext-apps','simplex-noise']);
for(const input of Object.keys(bundle.metafile.inputs)){
  const match=input.match(/^node_modules\/(@[^/]+\/[^/]+|[^/]+)/);
  if(match)modules.add(match[1]);
}
for(const name of modules){
  const source=join(root,'node_modules',name),destination=join(stage,'licenses',name.replaceAll('/','-'));
  await mkdir(destination,{recursive:true});
  for(const file of await readdir(source))if(/^(licen[cs]e|copying|notice)/i.test(file))await cp(join(source,file),join(destination,file),{recursive:true});
}
await copyFile(join(root,'Geist-LICENSE.txt'),join(stage,'licenses','Geist-LICENSE.txt'));
for(const arch of ['arm64','x64']){
  const folder=join(stage,'runtime',arch),name=`node-v${runtimeVersion}-darwin-${arch}`;
  const tar=join(base,`node-${runtimeVersion}`,name+'.tar.gz');
  await verifiedRuntime(`darwin-${arch}.tar.gz`,tar);
  await mkdir(folder,{recursive:true});
  execFileSync('/usr/bin/tar',['-xzf',tar,'--strip-components','2','-C',folder,name+'/bin/node']);
  await writeFile(join(stage,'licenses',`Node.js-${arch}-LICENSE.txt`),execFileSync('/usr/bin/tar',['-xOf',tar,name+'/LICENSE']));
  execFileSync('/usr/bin/codesign',['--verify',join(folder,'node')],{stdio:'inherit'});
}
console.log('Staged only the installer, runtime, app bundle, and license files.');
