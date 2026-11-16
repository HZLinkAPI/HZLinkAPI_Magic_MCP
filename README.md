# HZLinkAPI Magic MCP

在 ChatGPT 桌面端的 Codex 侧面板里，通过本机 Magpie 选择模型、生成和编辑图片。支持 macOS（Apple Silicon、Intel）和 Windows（x64、ARM64）。项目目前处于内测阶段。

## 安装和使用

macOS 和 Windows 预编译安装包由 GitHub Actions 构建并发布在 [GitHub Releases](https://github.com/HZLinkAPI/HZLinkAPI_Magic_MCP/releases/latest)。按系统下载对应 ZIP 并完整解压；GitHub 源码目录不包含运行时和可直接安装的完整包。

1. 安装 ChatGPT 桌面端和 Magpie，在 Magpie 中用自己的凭据配置生图模型。
2. 解压对应平台的内测包，双击 `安装 HZLinkAPI Magic.command`（macOS）或 `Install HZLinkAPI Magic.cmd`（Windows）。
3. 完全退出并重开 ChatGPT。在 Codex 本机聊天的右侧面板点「＋」→「HZLinkAPI Magic」。

面板会读取本机 Magpie 的生图模型。选择模型和参数，填写提示词，按需上传、拖入或粘贴参考图。发送后会清空草稿；参考图上传或生成失败时会恢复原提示词及参考图。「新建会话」清空当前画布和草稿，已生成图片仍在本机历史图库中。「继续编辑」把当前结果加入下一轮参考图；多张参考图按界面显示的编号引用。只有点击「把图片返回聊天」时才会把结果发送给聊天。

PNG 参考图长边超过 2048 像素时，发送给模型前会生成等比例缩小的临时副本，任务结束后清理；本机原图、历史记录和参考图编号不变。2048 是本项目验证过的保守传输尺寸，不代表所有服务商的统一上限。整图生成不能保证未指定区域的像素完全不变。

图片和历史保存在本机。Magpie 直接输出 PNG 时保留原字节；输出 JPEG 或 WebP 时保留原图，再生成供预览、图库、继续编辑和「下载 PNG」使用的 PNG。下载会弹出系统保存窗口。升级保留图库和偏好，也不会改 Magpie 的配置。

## 开发和构建

使用 Node.js 24。在仓库根目录运行：

```sh
npm ci
npm test
```

在 macOS 上执行 `node preview.mjs` 可打开本地浏览器预览 `http://127.0.0.1:43187/`。预览可读本机模型和历史，不执行真实生图。

macOS 和 Windows 均可构建两份内测包。构建 Windows 版本需要 Go（版本见 `release-windows/native/go.mod`）。在仓库根目录依次执行：

```sh
node release-work/build-beta.mjs
node release-windows/build-windows.mjs
```

构建产物分别在 `release-work/stage/` 和 `release-windows/stage/`。安装包可用 Python 3.9 或以上版本打包：

```sh
python release-zip.py macos
python release-zip.py windows
```

macOS 上如果只有 `python3` 命令，将上述 `python` 换成 `python3`。ZIP 默认输出到各自的 `release-work/`、`release-windows/` 目录，也可以用第二个参数指定输出文件。打包脚本只包含安装所需的文件和许可证，并明确保存 macOS 启动脚本及运行时的可执行权限；请使用此脚本或 macOS 的 `ditto` 打包 Mac 版本。

构建脚本会校验所需的 Node.js 运行时，未缓存时从 Node.js 官方下载；Go 会按 `go.mod` 下载所需工具链和模块。源代码仓库不包含运行时归档或安装包。在 Windows 构建 macOS 包时，会校验官方运行时归档的 SHA-256；macOS 的 `codesign` 验证、安装和系统交互测试仍需在 Mac 上进行。

如果构建机无法访问 `nodejs.org`，可以设置 `HZLM_NODE_DIST_BASE` 指向目录结构兼容的 Node.js 镜像；下载内容仍会按内置 SHA-256 校验。例如 PowerShell 可设置为 `$env:HZLM_NODE_DIST_BASE = 'https://cdn.npmmirror.com/binaries/node'`。

手动运行 `Build Installers` 工作流可分别下载 macOS 和 Windows 测试 ZIP；推送 `v*` 版本标签会将两个 ZIP 附加到该标签对应的 GitHub Release。开发者只需提交源码并推送版本标签；使用者从 Releases 下载对应安装包。

Windows 打包安装测试：`node release-windows/test-host.mjs`（在 Windows 上运行，可传入已解压的 Windows ZIP 目录）。Windows 系统保存窗口仍需在 Windows 真机验收。macOS 安装器集成测试：`node release-work/test-beta.mjs`（需要 Mac 上的 ChatGPT 和 Magpie）。
