# UniPet

[English README](README.md)

UniPet 是一款面向 AI 编程助手的通用桌面宠物。

你可以把它理解成“通用版 Codex Pet”：让 Codex、Claude Code、Hermes、
OpenClaw、DeepSeek-TUI、shell 脚本，甚至你自己的 Agent，都拥有一个能实时
反应状态的桌面宠物。UniPet 使用轻量的 Node.js + Electron 本地悬浮窗，通过
localhost 和零侵入 hooks 接入，不修改 Agent 源码，也尽量不增加额外依赖。

![UniPet demo](docs/assets/unipet-hermes-demo.png)

```bash
npm install -g uni-pet
unipet start
unipet agent add codex
```

## 为什么用 UniPet

- 像 Codex Pet 一样展示桌面宠物，但不只服务于 Codex。
- 支持 Codex、Claude Code、Hermes、OpenClaw、DeepSeek-TUI 和自定义 Agent。
- 本地优先：只监听 localhost，事件留在本机。
- 零侵入：通过 hook、plugin 或配置块接入，不修改上游 Agent 源码。
- 轻量：Node.js + Electron，UniPet 本身不要求 Python。
- 支持 Codex 兼容宠物市场，可以用命令安装、切换和删除宠物。

Hermes 连接器里有一个很小的 Python 插件，仅仅是因为 Hermes 会在自己的
Python 环境中加载插件；该插件只使用 Python 标准库。

## 快速开始

大多数用户直接从 npm 安装：

```bash
npm install -g uni-pet
unipet start
```

只连接你实际使用的 Agent：

```bash
unipet agent add codex
unipet agent add claude-code
unipet agent add hermes
unipet agent add openclaw
unipet agent add deepseek-tui
```

后续更新：

```bash
npm update -g uni-pet
```

## 支持的 Agent

| Agent | 安装命令 | 集成方式 |
| --- | --- | --- |
| Codex | `unipet agent add codex` | Codex hooks |
| Claude Code | `unipet agent add claude-code` | Claude Code hooks |
| Hermes | `unipet agent add hermes` | Hermes plugin + 通用 UniPet skill |
| OpenClaw | `unipet agent add openclaw` | OpenClaw plugin |
| DeepSeek-TUI | `unipet agent add deepseek-tui` | 生命周期 hooks |
| 自定义 Agent | `unipet state ...` 或 HTTP | localhost bridge |

## 日常使用

启动、查看和停止 UniPet：

```bash
unipet start
unipet status
unipet doctor
unipet stop
```

手动发送测试事件：

```bash
unipet state running "Running tests"
unipet state review "Ready for review"
unipet clear
```

本地桥接地址：

```text
HTTP  http://127.0.0.1:8768
WS    ws://127.0.0.1:8769/ws
```

## 宠物

浏览和安装在线宠物：

```bash
unipet pet search
unipet pet search cat
unipet pet info anby
unipet pet install anby --use
```

管理本地宠物：

```bash
unipet pet list
unipet pet current
unipet pet use anby
unipet pet remove anby
```

已安装的宠物和用户配置存放在 `~/.unipet`。

## Agent 管理

使用 `agent` 添加、查看、禁用或移除 UniPet 集成：

```bash
unipet agent list
unipet agent status
unipet agent add codex
unipet agent disable codex
unipet agent remove codex
```

`codex` 可以替换成 `claude-code`、`hermes`、`openclaw`、`deepseek-tui`
或 `all`。

## 工作原理

```text
Agent hook/plugin
      -> UniPet localhost bridge
      -> state/event engine
      -> desktop pet renderer
```

连接器会把 Agent 生命周期事件转换成一个很小的本地事件载荷：
`source`、`state`、`message`、`action` 和 `ttl`。渲染器再把这些事件映射成
Codex Pet 风格的状态、气泡和桌面宠物动作。

## 环境要求

- Node.js 18+
- npm
- 能运行 Electron 的桌面环境

Windows 是主要测试平台。macOS 和 Linux 使用同一套 Node.js + Electron 运行时。
WSL 需要 WSLg 或其他可用的 Linux GUI 显示环境。

Hermes、OpenClaw、DeepSeek-TUI、Codex 和 Claude Code 都是可选的，只需要连接
你实际使用的 Agent。

## 从源码安装

源码安装主要用于开发或尝试尚未发布的改动。

Windows PowerShell：

```powershell
git clone https://github.com/ydyangdan/UniPet.git
cd UniPet
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

macOS、Linux、Unix 或 WSL：

```bash
git clone https://github.com/ydyangdan/UniPet.git
cd UniPet
./install.sh
```

源码安装脚本会执行 `npm install`、链接全局 `unipet` 命令、启动 UniPet，并输出
`unipet doctor` 结果。它默认安装 Hermes 连接器，除非你传入 `-NoHermesSkill`
或 `--no-hermes-skill`。

如果 Unix checkout 后丢失了可执行权限，运行：

```bash
chmod +x ./install.sh ./connectors/*/install.sh
```

## 项目结构

```text
UniPet/
|-- overlay/                         Node.js/Electron 桌面运行时
|   |-- main.js                      Electron 应用 + 本地 HTTP/WS 桥
|   |-- core.js                      事件规范化 + 状态存储
|   |-- cli.js                       全局 unipet 命令
|   |-- market.js                    Codex 宠物市场客户端
|   |-- pets.js                      本地宠物库
|   |-- renderer.js                  雪碧图动画渲染器
|   |-- life/                        宠物行为层
|   |-- renderers/                   渲染器适配层
|   |-- tests/                       Node 测试套件
|   `-- assets/default/              内置默认宠物
|-- connectors/codex/                Codex hook 连接器
|-- connectors/claude-code/          Claude Code hook 连接器
|-- connectors/hermes/               Hermes plugin 和通用 UniPet skill
|-- connectors/openclaw/             OpenClaw hook plugin
|-- connectors/deepseek-tui/         DeepSeek-TUI hook 连接器
|-- docs/                            设计文档
|-- install.ps1                      Windows 安装脚本
`-- install.sh                       Unix 安装脚本
```

## 开发

```bash
npm install
npm run check
npm start
```

`npm run check` 会运行 overlay 测试，以及 OpenClaw、DeepSeek-TUI、Codex、
Claude Code 的连接器测试。

## 故障排查

- 先运行 `unipet doctor`。它会检查本地桥、运行时文件、当前宠物和命令配置。
- 如果 `127.0.0.1:8768` 已被占用，先运行 `unipet stop`，再运行 `unipet start`。
- 安装连接器后，需要重启对应的 Agent 会话、gateway 或 TUI。
- 如果在 Linux 或 WSL 上看不到宠物，确认 Electron 能在当前桌面环境中打开 GUI 窗口。

## 文档

- [架构设计](docs/ARCHITECTURE.md)
- [协议](docs/PROTOCOL.md)
- [连接器](docs/CONNECTORS.md)

## 许可证

MIT
