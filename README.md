# HZLinkAPI Magic MCP

在 ChatGPT 桌面端的 Codex 侧面板里，通过本机 Magpie 选择模型、生成和编辑图片。支持 macOS（Apple Silicon、Intel）和 Windows（x64、ARM64）。项目目前处于内测阶段。

## 安装和使用

1. 安装 ChatGPT 桌面端和 Magpie，在 Magpie 中用自己的凭据配置生图模型。
2. 解压对应平台的内测包，双击 `安装 HZLinkAPI Magic.command`（macOS）或 `Install HZLinkAPI Magic.cmd`（Windows）。
3. 完全退出并重开 ChatGPT。在 Codex 本机聊天的右侧面板点「＋」→「HZLinkAPI Magic」。

面板会读取本机 Magpie 的生图模型。选择模型和参数，填写提示词，按需上传、拖入或粘贴参考图。发送后会清空草稿；参考图上传或生成失败时会恢复原提示词及参考图。「新建会话」清空当前画布和草稿，已生成图片仍在本机历史图库中。「继续编辑」把当前结果加入下一轮参考图；多张参考图按界面显示的编号引用。只有点击「把图片返回聊天」时才会把结果发送给聊天。

图片和历史保存在本机。Magpie 直接输出 PNG 时保留原字节；输出 JPEG 或 WebP 时保留原图，再生成供预览、图库、继续编辑和「下载 PNG」使用的 PNG。下载会弹出系统保存窗口。升级保留图库和偏好，也不会改 Magpie 的配置。

## 开发和构建

使用 Node.js 24。在仓库根目录运行：

```sh
npm ci
npm test
```

在 macOS 上执行 `node preview.mjs` 可打开本地浏览器预览 `http://127.0.0.1:43187/`。预览可读本机模型和历史，不执行真实生图。

在 macOS 上构建两份内测包的内容。构建 Windows 版本需要 Go（版本见 `release-windows/native/go.mod`）。两条命令请依次执行：

```sh
node release-work/build-beta.mjs
node release-windows/build-windows.mjs
```

构建脚本会校验所需的 Node.js 运行时，未缓存时从 Node.js 官方下载。构建产物分别在 `release-work/stage/` 和 `release-windows/stage/`；打包时将各自唯一的产品目录整个压成 ZIP。源代码仓库不包含运行时归档或安装包。

macOS 安装器集成测试：`node release-work/test-beta.mjs`（需要本机 ChatGPT 和 Magpie）。Windows 离线集成测试：`node release-windows/test-windows.mjs`（在 macOS 上运行，使用构建出的测试工具）。Windows 系统保存窗口和桌面侧面板仍需在 Windows 真机验收。
