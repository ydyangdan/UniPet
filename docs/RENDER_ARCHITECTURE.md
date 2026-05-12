## 核心渲染原理：直接使用 Codex 雪碧图

Codex Pet 的实际渲染方式就是 CSS background-position 在 8×9 雪碧图上滑动。
UniPet 遵循同款方式 —— **不做帧提取，不产生中间文件**：

```css
.pet {
  width: 192px;
  height: 208px;
  background-image: url("./spritesheet.webp");
  background-position: -${frameIndex * 192}px -${rowIndex * 208}px;
  image-rendering: pixelated;
}
```

切换动画状态 = 改变 CSS `background-position` 的行偏移值。
切换帧          = 改变 CSS `background-position` 的列偏移值。

**与两个参考项目的区别：**

| | taiei-hermes-pet | hermes-pets | **UniPet** |
|---|---|---|---|
| 资源格式 | 独立 PNG 帧文件 | 独立 PNG 帧文件 | **单文件 8×9 雪碧图** |
| 渲染方式 | Swift AppKit 读 PNG | `backgroundImage = url(...)` | **`background-position` 滑动** |
| 兼容 Codex | 需 pet_share.py 解包转换 | 不兼容 | **开箱即用，直接读** |
| 加新皮肤 | 需要解包 spritesheet | 需要录帧 | **换一个 spritesheet.webp 即可** |

## 通信架构

```
Hermes Agent / OpenClaw
        │
        │ HTTP POST /api/pet/events
        ▼
┌──────────────────────┐
│   unipet bridge.py   │  Python HTTP Server (:8768)
│   状态存储 + 事件队列 │
└──────────┬───────────┘
           │  Electron 主进程
           │  WebSocket (main.js → connect to bridge)
           ▼
┌──────────────────────┐
│   渲染进程 renderer   │
│   CSS background-     │
│   position 滑动       │
└──────────────────────┘
```

- Agent 通过 HTTP POST 发事件给 bridge
- bridge 维护宠物状态，Electron 通过 WebSocket 轮询/订阅
- overlay 收到状态变化后切换 spritesheet 显示的动画行