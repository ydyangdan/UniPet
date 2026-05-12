# UniPet 实现方案

版本: 0.1.0 MVP
最后更新: 2026-05-12

## 一、分层架构

UniPet 分为 5 层，从上到下依次：

```
┌─────────────────────────────────────────────────┐
│ Layer 5: Connectors (Agent 适配层)              │
│ skills/unipet/SKILL.md, install.sh              │
│ 职责: 让 Hermes/OpenClaw 能调用 unipet 命令     │
├─────────────────────────────────────────────────┤
│ Layer 4: Overlay (Electron 浮窗渲染层)           │
│ main.js, renderer.js, preload.js, index.html    │
│ 职责: 透明置顶窗口 + CSS spritesheet 动画        │
├─────────────────────────────────────────────────┤
│ Layer 3: CLI (命令行入口层)                      │
│ cli.py (~200行)                                 │
│ 职责: argparse 参数解析，dispatch 到 bridge      │
├─────────────────────────────────────────────────┤
│ Layer 2: Bridge (桥接服务层)                     │
│ bridge.py (~400行)                              │
│ 职责: HTTP 事件接收 + WebSocket 转发 + 状态存储  │
├─────────────────────────────────────────────────┤
│ Layer 1: Protocol (协议定义层)                   │
│ protocol.py (~150行)                            │
│ 职责: PetEvent 数据类、状态枚举、API contract    │
└─────────────────────────────────────────────────┘
```

**依赖方向**: 上层依赖下层，下层不感知上层。

---

## 二、Layer 1: Protocol (protocol.py)

### 职责
定义宠物事件的数据结构、状态枚举、Codex 雪碧图常量。纯 Python 数据类，零依赖。

### 输入/输出
- 输入: 原始 JSON dict（来自 HTTP POST body）
- 输出: 校验后的 PetEvent 对象

### 数据结构

```python
# 状态枚举（与 Codex Pet 完全一致）
PET_STATES = frozenset({"idle", "running", "waiting", "failed", "review"})
PET_ACTIONS = frozenset({"update", "remove", "clear", "ack"})

# Codex 雪碧图规格常量
CODEX_ATLAS = {
    "columns": 8, "rows": 9,
    "frame_width": 192, "frame_height": 208,
    "atlas_width": 1536, "atlas_height": 1872
}

# 动画行映射（行号从 0 开始，对应 spritesheet 的行）
ANIMATION_ROWS = {
    "idle":     {"row": 0, "frames": 6, "fps": 6},
    "running":  {"row": 1, "frames": 8, "fps": 10},
    "running_right": {"row": 1, "frames": 8, "fps": 10},  # alias
    "running_left":  {"row": 2, "frames": 8, "fps": 10},  # alias
    "waving":   {"row": 3, "frames": 4, "fps": 8},
    "jumping":  {"row": 4, "frames": 5, "fps": 8},
    "failed":   {"row": 5, "frames": 8, "fps": 6},
    "waiting":  {"row": 6, "frames": 6, "fps": 6},
    "review":   {"row": 8, "frames": 6, "fps": 6},
}

@dataclass
class PetEvent:
    source_id: str          # "local-hermes" | "local-openclaw" | "remote-xxx"
    label: str              # 来源标签，如 "Hermes Session"
    state: str              # idle|running|waiting|failed|review
    message: str            # 浮窗显示文本（最多 180 字符）
    action: str = "update"  # update|remove|clear|ack
    asset_id: Optional[str] = None          # 宠物皮肤 ID
    notification_count: int = 0             # 通知计数
    animation: Optional[str] = None         # 强制指定动画名
    direction: Optional[str] = None         # left|right
    ttl_ms: Optional[int] = None            # 自动过期时间（毫秒）
```

### API Contract

```
POST /api/pet/events
Content-Type: application/json

{
  "protocol": "unipet.v1",
  "source_id": "local-hermes",
  "state": "running",
  "message": "正在分析代码...",
  "action": "update"
}

Response 200:
{
  "status": "ok",
  "pets": [...],          # 当前所有活跃 pet 状态
  "active_state": "running"
}

GET /api/pet/view
Response 200:
{
  "protocol": "unipet.v1",
  "pets": [{...}],
  "active_state": "running",
  "sessions": [...]
}

GET /health
Response 200:
{"status": "ok", "uptime": 12345}
```

### 状态机逻辑

```
事件到达 → normalize_event(JSON)
         ↓
    如果 action="clear": 清空所有宠物，保留 local 源
    如果 action="remove": 移除指定 source_id 的宠物
    如果 action="update": 更新/创建该 source_id 的状态
         ↓
    返回更新后的 pet 列表
```

### 参考来源
- taiei-hermes-pet 的 `hermes_pet/protocol.py`：PetEvent 数据类、normalize_event 函数
- taiei-hermes-pet 的 `hermes_pet/constants.py`：路径解析逻辑

---

## 三、Layer 2: Bridge (bridge.py)

### 职责
启动 HTTP 服务器（:8768），接收来自 Agent 的 PetEvent，维护状态，通过 WebSocket 推送给 Electron overlay。

### 输入/输出
- 输入: HTTP POST 事件（来自 Agent）、WebSocket 连接（来自 overlay）
- 输出: 更新后的状态（HTTP 响应 + WebSocket 广播）

### 核心类

```python
class PetBridge:
    def __init__(self, host="127.0.0.1", port=8768):
        self.pets: dict[str, PetEvent] = {}   # source_id → PetEvent
        self.overlay_clients: list[WebSocket] = []
        self.runtime_file = RUNTIME_FILE_PATH

    def apply_event(self, event: PetEvent) -> dict:
        """应用事件到状态字典，返回更新后的状态"""
        ...

    async def broadcast(self):
        """向所有 overlay 客户端广播当前状态"""
        ...

    def start(self):
        """启动 HTTP server + WebSocket server"""
        ...

    def stop(self):
        """停止服务，清理 runtime 文件"""
        ...
```

### HTTP 端点

```
POST /api/pet/events    ← Agent 发事件
GET  /api/pet/view      ← Overlay 轮询 / 调试用
GET  /health            ← 健康检查
```

### WebSocket 协议

Overlay 连接到 `ws://127.0.0.1:8768/ws`，bridge 在每次状态更新后广播 JSON：

```json
{
  "type": "state_update",
  "pets": [
    {
      "source_id": "local-hermes",
      "state": "running",
      "message": "正在分析代码...",
      "animation": "running",
      "notification_count": 0
    }
  ],
  "active_state": "running",
  "asset_id": null
}
```

### Runtime 文件

bridge 启动时写入 `~/.unipet/runtime/pet_runtime.json`：

```json
{
  "pid": 12345,
  "url": "http://127.0.0.1:8768/api/pet/view",
  "ws_url": "ws://127.0.0.1:8768/ws",
  "port": 8768,
  "updated_at": 1715500000.0
}
```

CLI 的 `--status` 和 `--stop` 通过这个文件发现运行中的 bridge。

### 参考来源
- hermes-pets 的 `bridge.py`：WebSocket 广播模式、后台线程启动
- taiei-hermes-pet 的 `pet_overlay.py`：runtime 文件管理、状态应用逻辑

---

## 四、Layer 3: CLI (cli.py)

### 职责
argparse 参数解析，dispatch 到 bridge。薄层，不包含业务逻辑。

### 命令列表

```bash
unipet                          # 无参数 → 显示状态，无则孵化
unipet --background --port 8768 # 后台启动 bridge + overlay
unipet --status                 # 检查运行状态
unipet --stop                   # 关闭 overlay + bridge
unipet --restart                # 重启
unipet launch                   # 启动（同 --background）
unipet emit <state> <message>   # 手动发送事件（调试用）
```

### 工作目录

状态目录: `$UNIPET_HOME` 或 `~/.unipet/`
皮肤目录: `~/.unipet/pets/<pet-name>/`
运行时文件: `~/.unipet/runtime/`

### 参考来源
- hermes-pets 的 `cli.py`：命令结构、状态存储
- taiei-hermes-pet 的 `hermes_pet/cli.py`：简洁的 dispatch 模式

---

## 五、Layer 4: Overlay (Electron)

### 职责
透明置顶浮窗，从 bridge 接收状态，用 CSS background-position 渲染 spritesheet 动画。

### 文件结构

```
overlay/
├── package.json       # { "name": "unipet-overlay", "main": "main.js", ... }
├── main.js            # Electron 主进程 (~150行)
├── preload.js         # 安全的 IPC 桥接 (~50行)
├── renderer.js        # 动画状态机 + 渲染 (~200行)
└── index.html         # 最小 HTML shell (~30行)
```

### main.js 职责

```javascript
// 1. 创建透明置顶无边框窗口（280x340）
// 2. 连接到 bridge WebSocket (ws://127.0.0.1:8768/ws)
// 3. 收到消息转发给 renderer (win.webContents.send('pet-event', msg))
// 4. 处理拖拽移动 (IPC: pet-drag-start/move/end)
// 5. 持久化窗口位置
// 6. 自动重连
```

窗口配置：
```javascript
{
  width: 280, height: 340,
  transparent: true,
  frame: false,
  alwaysOnTop: true,
  skipTaskbar: true,
  resizable: false,
  hasShadow: false,
}
```

### renderer.js 职责

```javascript
// 动画控制器
const animController = {
  currentState: 'idle',       // 当前动画状态
  currentFrameIndex: 0,       // spritesheet 列索引
  frameTimer: null,
  spritesheetUrl: '',         // 当前使用的 spritesheet 路径

  // 核心方法
  loadSpritesheet(url),       // 更换皮肤
  transition(state, msg),     // 切换动画状态
  renderFrame(),              // 更新 CSS background-position
  startLoop(fps),             // 按 FPS 定时循环帧
  stopLoop(),
}
```

### 渲染核心

```css
#pet-sprite {
  width: 192px;
  height: 208px;
  background-image: url("./assets/default/spritesheet.webp");
  background-position: 0px 0px;
  image-rendering: pixelated;
}
```

帧切换：
```javascript
const row = ANIMATION_ROWS[currentState].row;
const frames = ANIMATION_ROWS[currentState].frames;
const x = currentFrameIndex * 192;
const y = row * 208;
spriteEl.style.backgroundPosition = `-${x}px -${y}px`;
```

### 气泡消息

```html
<div id="pet-bubble" class="hidden">
  <span id="bubble-text"></span>
</div>
```

消息到达时显示气泡，N 秒后淡出。

### 参考来源
- hermes-pets 的 `overlay/src/main.js`：窗口配置、WebSocket 连接、拖拽
- hermes-pets 的 `overlay/src/renderer.js`：动画状态机结构
- taiei-hermes-pet 的 pet_share.py：spritesheet 行映射

---

## 六、Layer 5: Connectors

### Hermes Agent Skill

文件: `connectors/hermes/skills/unipet/SKILL.md`

定义 Hermes Agent 如何控制 UniPet 的 skill 文档，类似 taiei-hermes-pet 的 SKILL.md 格式。

### OpenClaw 适配器

文件: `connectors/openclaw/unipet-wrapper`

薄包装脚本，将 OpenClaw 的状态 API 转化为 HTTP POST 到 bridge。

---

## 七、技术栈总览

| 层 | 语言 | 运行环境 | 核心依赖 | 参考来源 |
|---|---|---|---|---|
| Protocol | Python | Python ≥ 3.10 | 无 | taiei protocol.py |
| Bridge | Python | Python ≥ 3.10 | `websockets` | hermes-pets bridge.py + taiei HTTP server |
| CLI | Python | Python ≥ 3.10 | `argparse` (内置) | 两者 |
| Overlay | JavaScript | Electron (Node ≥ 18) | `electron`, `ws` | hermes-pets overlay |
| Connectors | Markdown/Bash | 文件系统 | 无 | taiei SKILL.md |

**Python 依赖** (pyproject.toml):
```toml
dependencies = [
    "websockets>=13.0",
]
```

**JS 依赖** (overlay/package.json):
```json
{
  "dependencies": {
    "electron": "^33.0.0",
    "ws": "^8.0.0"
  }
}
```

---

## 八、数据流完整示例

```
场景: Hermes Agent 开始执行任务

1. Hermes Agent (通过 skill) 执行:
   $ unipet emit running "正在分析项目结构..."

2. CLI (cli.py) 构造 HTTP POST:
   POST http://127.0.0.1:8768/api/pet/events
   Body: {"protocol":"unipet.v1","source_id":"local-hermes","state":"running","message":"正在分析项目结构..."}

3. Bridge (bridge.py) 收到请求:
   - normalize_event() 校验
   - apply_event() 更新 pets 字典
   - broadcast() 通过 WebSocket 推送状态给 overlay

4. Electron main.js 收到 WebSocket 消息:
   - win.webContents.send('pet-event', msg)

5. renderer.js 收到 'pet-event':
   - animController.transition('running', '正在分析项目结构...')
   - 停止当前 'idle' 循环
   - 切换到 row=7 (running), 开始按 10fps 循环 frame 0-7
   - 显示气泡 "正在分析项目结构..."
   - 3 秒后气泡淡出

6. pet 浮窗显示 running 动画 + 消息气泡
```

---

## 九、实现顺序

### Phase 1: 最小可用原型 (MVP)

| 步骤 | 产出 | 预计行数 |
|------|------|---------|
| 1. protocol.py | PetEvent 数据类 + 常量 + normalize_event | ~150 |
| 2. bridge.py | HTTP server + 状态存储 + WebSocket | ~400 |
| 3. cli.py | argparse + launch/stop/status/emit | ~200 |
| 4. pyproject.toml | 包配置 | ~50 |
| 5. overlay/ | main.js + renderer.js + index.html | ~400 |
| 6. 默认 spritesheet | 从 Codex Pet Share 获取一个默认皮肤 | 资源文件 |
| 7. connectors | hermes SKILL.md | ~80 |
| 8. 测试 | 安装 → unipet launch → emit → 验证浮窗 | — |

Phase 1 总代码量约 1300 行。

### Phase 2: 完善

| 步骤 | 产出 |
|------|------|
| 9. pet_share.py | Codex Pet Share 搜索/下载/应用 |
| 10. 气泡系统 | 消息气泡显示/隐藏/淡出 |
| 11. 右键菜单 | 状态检查/换皮肤/退出 |
| 12. 位置持久化 | 记住窗口位置 |
| 13. OpenClaw 适配 | openclaw-wrapper |

### Phase 3: 扩展

- macOS 原生支持
- 多 pet 源并发显示
- 系统托盘
- 皮肤预览

---

## 十、关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 通信协议 | HTTP POST + WebSocket | HTTP 让 Agent 发事件最简；WebSocket 让 overlay 订阅推送 |
| 精灵渲染 | CSS background-position | Codex 同款，无需解包 spritesheet |
| 默认端口 | 8768 | 与 taiei-hermes-pet 一致，减少冲突可能 |
| 状态存储 | 内存 dict + runtime JSON | MVP 不需要持久化，重启就清空 |
| 窗口框架 | Electron | 跨平台，hermes-pets 已验证可行 |
| Python 包名 | `unipet` | 简洁，与 hermes-pet 不冲突 |
| 可执行命令 | `unipet` | 与 `hermes-pet` 区分 |
