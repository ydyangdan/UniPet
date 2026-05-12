# UniPet

Universal Desktop Pet for AI Coding Agents — one pet, any agent.

UniPet 是一个通用的桌面宠物伴侣，兼容 Codex 生态的 8×9 雪碧图标准，
为 Hermes Agent 和 OpenClaw 提供统一的浮动宠物体验。
零侵入、本地优先、跨平台。

## 设计原则

| 原则 | 含义 |
|------|------|
| **零侵入** | 不修改任何 Agent 核心代码，独立安装，独立卸载 |
| **本地优先** | 仅监听 localhost，不依赖任何云服务或远程 API |
| **兼容 Codex** | 直接使用 Codex Pet 8×9 雪碧图格式 + pet.json，接入 Codex Pet Share 社区市场 |
| **最小依赖** | Python 仅依赖 websockets，Electron 无额外框架 |
| **跨平台** | 先支持 Windows/WSL，后续扩展 macOS/Linux |
| **多 Agent** | 同一套宠物同时服务 Hermes Agent 和 OpenClaw |

## 架构概览

```
┌──────────────────────────────────────────┐
│  Agent 层                                 │
│  ┌───────────┐  ┌───────────┐            │
│  │ Hermes    │  │ OpenClaw  │            │
│  │ /skill    │  │ /claw-pet │            │
│  └─────┬─────┘  └─────┬─────┘            │
│        │              │                   │
│        ▼              ▼                   │
│  ┌─────────────────────────┐              │
│  │    unipet CLI           │              │
│  │    unipet --background  │              │
│  └────────────┬────────────┘              │
│               │                            │
│  ┌────────────▼────────────┐              │
│  │    HTTP Bridge :8768    │              │
│  │    POST /api/pet/events │              │
│  └────────────┬────────────┘              │
│               │                            │
│  ┌────────────▼────────────┐              │
│  │   Electron 浮窗 渲染     │              │
│  │   透明置顶 Canvas 动画   │              │
│  └─────────────────────────┘              │
│                                            │
│  ┌─────────────────────────┐              │
│  │  Codex Pet Share        │ (可选)       │
│  │  unipet --share-search  │              │
│  └─────────────────────────┘              │
└──────────────────────────────────────────┘
```

## 核心模块

```
UniPet/
├── README.md                       ← 你在这里
├── pyproject.toml                  # Python 包配置
├── install.sh                      # 一键安装
│
├── src/unipet/                     # Python 核心
│   ├── __init__.py
│   ├── protocol.py                 # PetEvent 协议定义
│   ├── constants.py                # 路径、环境变量
│   ├── cli.py                      # CLI 入口
│   ├── bridge.py                   # HTTP 桥接服务器
│   ├── pet_share.py               # Codex Pet Share 集成
│   └── assets/                     # 默认精灵
│       └── default/
│           ├── spritesheet.webp    # 8×9 雪碧图
│           └── pet.json
│
├── overlay/                        # Electron 浮窗
│   ├── package.json
│   ├── main.js                     # 主进程：透明置顶窗口
│   ├── renderer.js                 # Canvas 精灵渲染
│   └── index.html
│
├── connectors/                     # Agent 集成层
│   ├── hermes/                     # Hermes Agent 适配
│   │   ├── install.sh
│   │   └── unipet-wrapper
│   └── openclaw/                   # OpenClaw 适配
│       ├── install.sh
│       └── unipet-wrapper
│
└── skills/                         # Agent 技能封装
    ├── hermes-unipet/
    │   └── SKILL.md
    └── openclaw-unipet/
        └── SKILL.md
```

## 参考实现

本项目借鉴了两个开源项目：

| 项目 | 借鉴了什么 |
|------|-----------|
| [ktkarchive/taiei-hermes-pet](https://github.com/ktkarchive/taiei-hermes-pet) | 协议设计 (PetEvent)、Codex Pet Share 集成、Hermes skill 封装模式 |
| [asimons81/hermes-pets](https://github.com/asimons81/hermes-pets) | Electron 浮窗渲染、Windows 平台适配、本地桥接架构 |

## 核心渲染原理：直接使用 Codex 雪碧图

UniPet 不是独立 Agent，不是电子宠物养成游戏，而是 **Agent 的桌面浮层状态反馈组件**。
Codex Pet 用 CSS background-position 在 8×9 雪碧图上滑动来实现动画。
UniPet 采用同款方式 —— **不做帧提取，不产生中间文件，直接读 spritesheet.webp**：

```css
.pet {
  width: 192px;
  height: 208px;
  background-image: url("./spritesheet.webp");
  background-position: -${frameIndex * 192}px -${rowIndex * 208}px;
  image-rendering: pixelated;
}
```

切换动画状态 = 改 `background-position` 行偏移
切换帧        = 改 `background-position` 列偏移
换皮肤        = 换一个 spritesheet.webp

与两个参考项目的关键区别：taiei-hermes-pet 和 hermes-pets 都把 spritesheet 解包转为独立 PNG 文件，UniPet 直接读 spritesheet 本身，兼容性最强。

详细架构见 [docs/RENDER_ARCHITECTURE.md](docs/RENDER_ARCHITECTURE.md)。

## 技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| 渲染引擎 | Electron + CSS background-position | Codex 同款方式，跨平台 |
| 精灵格式 | Codex 8×9 雪碧图（单文件） | 1536×1872px，直接兼容 Codex Pet Share |
| 通信协议 | HTTP POST → WebSocket 转发 | bridge 收事件，overlay 订阅 |
| 皮肤来源 | 内置默认 + Codex Pet Share | 600+ 社区皮肤 |
| Python 依赖 | websockets | 唯一下载依赖 |
| JS 依赖 | electron | 浮窗渲染 |

## 快速开始（预期）

```bash
# 安装
git clone https://github.com/xxx/UniPet.git
cd UniPet
pip install -e .

# 启动
unipet launch                    # 后台启动桥接 + 浮窗
unipet --status                  # 查看状态

# 更换宠物皮肤
unipet --share-search "pixel"   # 从 Codex Pet Share 搜索
unipet --share-apply "<pet-id>" # 应用到浮窗

# 停止
unipet --stop                    # 关闭浮窗和桥接
```

## 状态机

```
      ┌──────────┐
      │   idle   │  ← 初始状态 / 长时间无活动
      └────┬─────┘
           │ 工作开始
      ┌────▼─────┐
      │  running │  ← Agent 正在执行任务
      └────┬─────┘
      ╱    │      ╲
    成功   等待    失败
    ╱      │       ╲
   ▼       ▼        ▼
 review  waiting   failed
  ┌─┐    ┌──┐     ┌──┐
  │ ✓│   │⌛│     │✗│
  └─┘    └──┘     └──┘
```

5 种状态，与 Codex Pet 完全一致。

## 与现有方案对比

| 维度 | taiei-hermes-pet | hermes-pets | **UniPet** |
|------|-----------------|-------------|------------|
| 平台 | 仅 macOS | Windows/WSL | **Windows/WSL → 全平台** |
| 协议 | HTTP PetEvent | WebSocket | **HTTP PetEvent** |
| Codex 兼容 | ✅ 雪碧图 + Share | ❌ 自定义格式 | **✅ 雪碧图 + Share** |
| 支持 Agent | Hermes | Hermes | **Hermes + OpenClaw** |
| 依赖数量 | 极少 | 中 | **极少** |
| 侵入性 | 零 | 零 | **零** |

## 路线图

### Phase 1: MVP (当前)
- [ ] Python 协议层 + CLI 基础命令
- [ ] HTTP 桥接服务器
- [ ] Electron 浮窗（Windows 优先）
- [ ] 内置默认宠物精灵
- [ ] Hermes Agent skill 封装

### Phase 2: 完善
- [ ] Codex Pet Share 集成
- [ ] OpenClaw 适配器
- [ ] 右键菜单（换皮肤/状态检查）
- [ ] 系统托盘

### Phase 3: 扩展
- [ ] macOS 原生 AppKit 支持
- [ ] Linux 支持
- [ ] 多点同步（同一宠物多终端）

## 开发环境

- Python >= 3.10
- Node.js >= 18
- Git Bash / MSYS2 (Windows)
- VS Code / Cursor 推荐

## 许可

MIT License
