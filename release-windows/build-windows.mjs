import {build} from 'esbuild';
import {cp,mkdir,readdir,copyFile,readFile,writeFile,chmod} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runtimeVersion,verifiedRuntime} from '../release-runtime.mjs';

const base=dirname(fileURLToPath(import.meta.url)),root=dirname(base),native=join(base,'native');
const stage=join(base,'stage','HZLinkAPI Magic Windows');
await mkdir(join(stage,'dist'),{recursive:true});
await mkdir(join(stage,'licenses'),{recursive:true});
execFileSync(process.execPath,[join(root,'build.mjs')],{cwd:root,stdio:'inherit'});
const bundle=await build({
  absWorkingDir:root,entryPoints:[join(base,'source','server.mjs')],outfile:join(stage,'server.mjs'),
  bundle:true,platform:'node',target:'node24',format:'esm',metafile:true,legalComments:'eof',
  banner:{js:"import {createRequire as __hzlmRequire} from 'node:module'; const require = __hzlmRequire(import.meta.url);"}
});
await copyFile(join(root,'dist','widget.html'),join(stage,'dist','widget.html'));
await copyFile(join(base,'install.mjs'),join(stage,'install.mjs'));
for(const file of ['Install HZLinkAPI Magic.cmd','安装说明.txt']){
  const text=await readFile(join(base,file),'utf8');
  await writeFile(join(stage,file),(file.endsWith('.txt')?'\ufeff':'')+text.replace(/\r?\n/g,'\r\n'));
}
const modules=new Set(['@modelcontextprotocol/ext-apps','simplex-noise']);
for(const input of Object.keys(bundle.metafile.inputs)){
  const match=input.match(/^node_modules\/(@[^/]+\/[^/]+|[^/]+)/);if(match)modules.add(match[1]);
}
async function licenses(source,destination){
  await mkdir(destination,{recursive:true});
  for(const file of await readdir(source))if(/^(licen[cs]e|copying|notice|patents)/i.test(file))await cp(join(source,file),join(destination,file),{recursive:true});
}
for(const name of modules)await licenses(join(root,'node_modules',name),join(stage,'licenses',name.replaceAll('/','-')));
await copyFile(join(root,'Geist-LICENSE.txt'),join(stage,'licenses','Geist-LICENSE.txt'));
const go=(args,env={})=>execFileSync('go',args,{cwd:native,encoding:'utf8',env:{...process.env,...env}});
go(['mod','download']);
await licenses(go(['env','GOROOT']).trim(),join(stage,'licenses','Go'));
for(const module of ['github.com/pelletier/go-toml/v2','golang.org/x/image','golang.org/x/sys']){
  await licenses(go(['list','-m','-f','{{.Dir}}',module]).trim(),join(stage,'licenses',module.replaceAll('/','-')));
}
for(const [arch,goarch] of [['x64','amd64'],['arm64','arm64']]){
  const folder=join(stage,'runtime',arch),label=`node-v${runtimeVersion}-win-${arch}`;
  const archive=join(base,'work',`node-${runtimeVersion}`,label+'.zip');
  await verifiedRuntime(`win-${arch}.zip`,archive);
  await mkdir(folder,{recursive:true});
  for(const [entry,destination] of [['node.exe',join(folder,'node.exe')],['LICENSE',join(stage,'licenses',`Node.js-${arch}-LICENSE.txt`)]])
    await writeFile(destination,execFileSync('/usr/bin/unzip',['-p',archive,label+'/'+entry],{maxBuffer:200*1024*1024}));
  go(['build','-trimpath','-ldflags=-s -w','-o',join(folder,'magic-native.exe'),'.'],{GOOS:'windows',GOARCH:goarch,CGO_ENABLED:'0'});
}
const fixture=join(base,'work','magic-native-host-test');
go(['build','-trimpath','-o',fixture,'.']);
await chmod(fixture,0o700);
console.log('Windows stage: x64 and ARM64, no private user data.');
