---
name: unipet
description: "UniPet desktop companion — bridges Hermes Agent state to a floating pet overlay. Shows agent status via Codex-compatible spritesheet animations."
version: 0.1.0
author: UniPet
license: MIT
platforms: [windows, wsl]
prerequisites:
  commands: [unipet, curl]
metadata:
  hermes:
    tags: [productivity, desktop-companion, pet, windows, wsl]
    requires_toolsets: [terminal]
---

# UniPet

UniPet 是 Hermes Agent 的桌面宠物伴侣。
它将 Agent 的运行状态映射为桌面浮层动画，让长时间编码更有生命力。

## 快速开始

```bash
# 1. 启动 UniPet（桥接 + 浮窗）
unipet launch

# 2. 检查状态
unipet status
curl -fsS http://127.0.0.1:8768/health
```

如果已经运行，`unipet launch` 会替换重启。

## 状态映射

| Hermes 状态 | unipet emit | 动画行 | 说明 |
|---|---|---|---|
| 空闲等待输入 | `emit idle "就绪"` | row 0 idle | 宠物站立呼吸 |
| 正在执行任务 | `emit running "执行中..."` | row 7 running | 宠物跑动 |
| 等待用户审批 | `emit waiting "等待中..."` | row 6 waiting | 宠物等待 |
| 输出检查结果 | `emit review "请复查"` | row 8 review | 宠物检查动作 |
| 任务失败 | `emit failed "出错了"` | row 5 failed | 宠物失败反应 |
| 任务完成/待复查 | `emit review "完成，请复查"` | row 8 review | 宠物进入复查状态 |

## 所有命令

```bash
# 管理
unipet launch                    启动桥接 + 浮窗（同 `unipet-bridge &` + Electron）
unipet stop                      停止所有（桥接 + 浮窗）
unipet status                    查看状态和当前活跃事件

# 发送状态
unipet emit idle "就绪"
unipet emit running "正在分析项目结构..."
unipet emit waiting "等待输入..."
unipet emit review "请复查这段代码"
unipet emit failed "编译失败！"
unipet emit review "任务完成，请复查"

# 调试
curl -fsS http://127.0.0.1:8768/health          健康检查
curl -fsS http://127.0.0.1:8768/api/pet/view     查看当前所有宠物状态
```

## 工作流程

1. **启动**: 先确保 UniPet 桥接在运行
   ```bash
   unipet launch
   ```

2. **Hermes 执行过程中**：在关键节点发送状态事件
   ```bash
   # Agent 开始工作时
   curl -X POST http://127.0.0.1:8768/api/pet/events \
     -H "Content-Type: application/json" \
     -d '{"protocol":"unipet.v1","source_id":"hermes","state":"running","message":"正在执行..."}'

   # 完成时
   curl -X POST http://127.0.0.1:8768/api/pet/events \
     -H "Content-Type: application/json" \
     -d '{"protocol":"unipet.v1","source_id":"hermes","state":"review","message":"执行完成，请复查"}'
   ```

3. **停止**: 不用时关掉浮窗
   ```bash
   unipet stop
   ```

## 集成说明

UniPet 通过 HTTP POST 接收事件，Hermes Agent 有两种集成方式：

### 方式 A：手动控制（推荐首次使用）
加载本 skill 后手动发送 `unipet emit` 命令。

### 方式 B：适配器自动监听
运行 `hermes-adapter` 守护进程，自动检测 Hermes Agent 日志中的状态变化并发给宠物。

```bash
# 在另一个终端运行适配器
python connectors/hermes/scripts/hermes-adapter.py
```

适配器会自动监测 Hermes Agent 日志，提取状态变化并发送到 UniPet 桥接。

## 诊断

```bash
unipet status
curl -fsS http://127.0.0.1:8768/health
```

## 安全规则

- 只绑定 localhost，不对外暴露端口
- 不修改 Hermes Agent 的任何核心文件
- 桥接不存储敏感数据
