# UniPet

[English README](README.md)

[![npm](https://img.shields.io/npm/v/uni-pet?color=0ea5e9)](https://www.npmjs.com/package/uni-pet)
[![npm downloads](https://img.shields.io/npm/dm/uni-pet)](https://www.npmjs.com/package/uni-pet)
[![CI](https://github.com/ydyangdan/UniPet/actions/workflows/ci.yml/badge.svg)](https://github.com/ydyangdan/UniPet/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

UniPet 是一款面向 AI 编程助手的通用桌面宠物。

你可以把它理解成“通用版 Codex Pet”：UniPet 是一个本地 Agent 状态可视化层，
把看不见的 Agent 工作过程变成一个会动的桌面伙伴，让你直观看到它正在思考、
执行工具、等待输入、失败，还是已经准备好让你检查。它围绕轻量 localhost 协议
设计，Agent、hook、脚本和 plugin 都可以在不修改核心代码的情况下驱动它。

![UniPet demo](https://raw.githubusercontent.com/ydyangdan/UniPet/main/docs/assets/unipet-promo.gif)

```bash
npm install -g uni-pet
unipet start
unipet demo
unipet agent add codex
```

## 为什么用 UniPet

- 面向所有 Agent 的通用状态层：Codex、Claude Code、Hermes、OpenClaw、DeepSeek-TUI 和自定义 Agent 都能接入。
- 真实工作状态可视化：idle、running、waiting、failed、review 一眼可见。
- 简单本地协议：可以通过 hook、plugin、配置块、CLI、HTTP 或 WebSocket 驱动。
- 零侵入：不修改上游 Agent 源码。
- 本地优先：只监听 localhost，事件留在本机。
- 轻量：Node.js + Electron，UniPet 本身不要求 Python。
- 支持 Codex 兼容宠物：可以用命令安装、切换和删除皮肤。
- 面向标准层设计：连接器只发送事实，行为、气泡和渲染由 UniPet 统一负责。

## UniPet 聚焦什么

- 一套稳定事件协议，服务多个 Agent，而不是为每个工具做一套私有逻辑。
- 把真实 coding agent 工作变成可见桌面伙伴，不做沉重复杂的养成游戏。
- 对开发者友好：hook、plugin、CLI、HTTP、WebSocket 和本地宠物皮肤都能扩展。
- 小型本地运行时，容易检查、修改和卸载。

## 快速开始

大多数用户直接从 npm 安装：

```bash
npm install -g uni-pet
unipet start
unipet demo
```

只连接你实际使用的 Agent：

```bash
unipet agent add codex
unipet agent add claude-code
unipet agent add hermes
unipet agent add openclaw
unipet agent add deepseek-tui
```

检查本地运行时和连接器状态：

```bash
unipet doctor
unipet agent status
```

后续更新：

```bash
npm update -g uni-pet
```

干净卸载：

```bash
unipet agent remove all
unipet stop
npm uninstall -g uni-pet
```

用户配置和已安装宠物存放在 `~/.unipet`。

## 支持的 Agent

| Agent | 安装命令 | 集成方式 |
| --- | --- | --- |
| Codex | `unipet agent add codex` | Codex hooks |
| Claude Code | `unipet agent add claude-code` | Claude Code hooks |
| Hermes | `unipet agent add hermes` | Hermes plugin |
| OpenClaw | `unipet agent add openclaw` | OpenClaw plugin |
| DeepSeek-TUI | `unipet agent add deepseek-tui` | 生命周期 hooks |
| 自定义 Agent | `unipet state ...` 或 HTTP | UniPet 本地协议 |

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
unipet demo
unipet state running "Running tests"
unipet state review "Ready for review"
unipet clear
```

本地桥接地址：

```text
HTTP  http://127.0.0.1:8768
WS    ws://127.0.0.1:8769/ws
```

## 通用协议

任何工具都可以用同一套事件形态更新宠物：

```bash
unipet state running "Running tests" --source my-agent
unipet state waiting "Waiting for approval" --source my-agent --ttl 2m
unipet state review "Ready for review" --source my-agent
```

直接集成时，可以通过本地 HTTP 或 WebSocket 发送 `source`、`state`、`message`、
`action` 和 `ttl`。详见 [协议](docs/PROTOCOL.md)。
自定义脚本和 Agent 可以参考 [自定义 Agent 接入](docs/CUSTOM_AGENT.md)。

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
unipet pet validate ./my-pet
unipet pet import ./my-pet --use
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

## 运行平台

- Node.js 18+
- npm
- Windows、macOS、Linux、Unix 或 WSL

UniPet 可以在 Windows、macOS、Linux、Unix 或 WSL 上运行。Agent 连接器都是
可选的，只需要连接你实际使用的 Agent。

## 已知限制

- UniPet 目前使用 Electron 实现桌面浮层，更轻量的原生外壳属于后续方向。
- WSL 需要可用的 Linux GUI 显示环境。
- Agent 连接器依赖各 Agent 自身提供的 hook 或 plugin 能力。
- Hermes 连接器运行在 Hermes 的 Python plugin 环境中，但 UniPet 自身不要求 Python。

## 开发者

```bash
npm install
npm run check
npm run smoke:install
npm start
```

`npm run check` 会运行 overlay 测试，以及 OpenClaw、DeepSeek-TUI、Codex、
Claude Code 的连接器测试。

常用项目文档：

- [架构](docs/ARCHITECTURE.md)
- [协议](docs/PROTOCOL.md)
- [连接器](docs/CONNECTORS.md)
- [自定义 Agent 接入](docs/CUSTOM_AGENT.md)
- [宠物格式](docs/PET_FORMAT.md)
- [Release Notes](docs/releases/v0.1.4.zh.md)
- [路线图](ROADMAP.md)
- [贡献指南](CONTRIBUTING.md)

<details>
<summary>项目结构</summary>

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
|-- connectors/hermes/               Hermes plugin 连接器
|-- connectors/openclaw/             OpenClaw hook plugin
|-- connectors/deepseek-tui/         DeepSeek-TUI hook 连接器
|-- docs/                            设计文档
|-- install.ps1                      Windows 安装脚本
`-- install.sh                       Unix 安装脚本
```

</details>

## 故障排查

- 先运行 `unipet doctor`。它会检查本地桥、运行时文件、当前宠物和命令配置，并输出推荐的 `next:` 操作。
- 安装连接器后运行 `unipet agent status`。每个连接器都会显示配置路径、managed hook/plugin 状态和 `next:` 操作。
- 如果 `127.0.0.1:8768` 已被占用，先运行 `unipet stop`，再运行 `unipet start`。
- 安装连接器后，需要重启对应的 Agent 会话、gateway 或 TUI。

## 文档

- [架构设计](docs/ARCHITECTURE.md)
- [协议](docs/PROTOCOL.md)
- [连接器](docs/CONNECTORS.md)
- [自定义 Agent 接入](docs/CUSTOM_AGENT.md)
- [宠物格式](docs/PET_FORMAT.md)
- [Release Notes](docs/releases/v0.1.4.zh.md)
- [更新记录](CHANGELOG.md)
- [路线图](ROADMAP.md)

## 许可证

MIT
