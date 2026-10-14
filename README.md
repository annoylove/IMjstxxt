# IM 即时通讯系统

全栈即时通讯（IM）项目：Express + Socket.io 后端，Uni-app (Vue 3 + Pinia) 跨端前端。

## 项目结构

```
.
├── server/                 # 后端服务（Node.js ESM）
│   ├── src/
│   │   ├── index.js        # 入口：Express + Socket.io（path=/im）
│   │   ├── config/         # 统一配置（环境变量驱动）
│   │   ├── routes/         # REST API：auth / users / friends / groups / messages / upload
│   │   ├── socket/         # Socket.io 事件：MSG_CHAT / MSG_READ / MSG_RECALL / 心跳 / 互踢
│   │   ├── services/       # seq 发号器、离线消息、会话、限频
│   │   ├── models/         # 数据模型（mysql/ 为关系数据；mongo/ 为消息文档）
│   │   ├── db/             # mysql / mongo / redis 三套存储，双模式适配
│   │   ├── middleware/     # JWT 认证、统一错误处理
│   │   └── utils/          # 协议包构造（zod 验签）、日志、统一响应
│   ├── test/
│   │   ├── unit/           # 单元测试（协议、FakeRedis、seq）
│   │   └── integration/    # 集成测试（注册→好友→实时收发→会话/历史 全链路）
│   ├── scripts/            # 工程脚本（bench.mjs 消息链路压测等）
│   ├── data/               # fallback 模式运行时数据（SQLite / JSON 消息文件）
│   ├── Dockerfile          # 后端容器镜像（node:22-alpine）
│   └── .env.example        # 环境配置模板
├── docker-compose.yml      # real 模式全栈编排（app + MySQL + MongoDB + Redis）
├── .github/workflows/ci.yml # CI：push/PR 自动 lint + 单元/集成测试
└── client/                 # 前端（Uni-app，HBuilderX 工程）
    ├── pages/              # login / home(会话) / chat / friends / groups / me
    ├── components/         # Avatar / MsgBubble / MsgInput
    ├── stores/             # Pinia：user / socket / session / chat / friendRequest
    ├── api/                # HTTP 封装（JWT 自动续期）+ 业务 API
    ├── utils/              # 手写 Socket.io v4 客户端、storage、事件总线、日志
    └── static/tabbar/      # 底部导航图标
```

## 快速开始

### 后端

零依赖即可运行（fallback 模式）：

```bash
cd server
cp .env.example .env      # Windows: copy .env.example .env
npm install
npm run dev               # 默认 http://127.0.0.1:3100
```

存储双模式（`STORAGE_MODE` 环境变量切换）：

| 模式 | SQL | 消息 | 缓存/发号 | 依赖 |
|---|---|---|---|---|
| `fallback`（默认） | Node 内置 SQLite | JSON 文件（按月分文件） | 内存 Map | 无，开箱即跑 |
| `real` | MySQL 8 | MongoDB | Redis | 需自备中间件 |

> 注意：fallback 模式需 Node.js ≥ 22（使用内置 `node:sqlite`），推荐 24+。

#### Docker 一键部署（real 模式全栈）

```bash
docker compose up -d --build   # app(3100) + MySQL + MongoDB + Redis
```

compose 已注入 `STORAGE_MODE=real` 与中间件连接参数，各依赖带 healthcheck，就绪后自动启动应用。数据持久化在 `mysql-data` / `mongo-data` / `redis-data` / `uploads` 卷中。

### 前端

1. 用 HBuilderX 打开 `client/` 目录
2. 运行 → 运行到浏览器（H5）
3. 确认 `client/config.js` 中 `BASE_URL` 指向后端（默认 `http://127.0.0.1:3100/api/v1`）

### 测试与检查

```bash
cd server
npm test                  # 单元 + 集成（24 个用例）
npm run test:unit         # 仅单元
npm run test:integration  # 仅集成（自动拉起独立端口测试实例）
npm run lint              # 全量语法检查（node --check）

# 消息链路压测（自动 spawn 独立实例，跑完即停）
node scripts/bench.mjs --pairs=20 --msgs=20
# 也可压测外部目标：node scripts/bench.mjs --url=http://127.0.0.1:3100
```

CI：仓库已配置 GitHub Actions（`.github/workflows/ci.yml`），push / PR 自动执行 `npm ci → lint → test`。

## 功能特性

- **账号体系**：注册 / 登录 / JWT（accessToken 1h + refreshToken 7d 自动续期）
- **好友关系**：搜索用户、发送/接受/拒绝好友请求、实时通知推送（角标 + Toast）
- **单聊/群聊**：文本 / 图片 / 语音消息，消息状态机（发送中→已送达→已读/失败重发）
- **消息可靠性**：全局 seqId 发号（重启自动播种防丢）、离线增量拉取、消息去重
- **会话列表**：服务端聚合（最后一条消息 + 未读数 + 对方资料），本地缓存兜底
- **实时推送**：Socket.io（握手 token 鉴权、多端互踢、心跳、撤回通知）
- **防护**：HTTP 限频、消息风暴滑动窗口、单聊好友关系校验、zod 入参验签、敏感词服务端打码、上传魔数校验、JWT 登出吊销

## 消息可靠性与投递语义

**语义定义：at-least-once（至少一次）+ 服务端幂等去重 + 客户端按 seqId 去重。**

- **发送侧**：客户端为每条消息生成唯一 `requestId`；ack 超时后重发同一 `requestId`
- **服务端幂等**：每连接维护 5 分钟 `requestId` 去重窗口（上限 1000 条），重复请求直接复用首次的 `seqId` 返回，不重复入库/路由
- **消息定序**：全局单调 `seqId` 发号（重启自动播种），历史/离线拉取均基于游标（`seqId` 之后），天然避免 offset 分页漂移
- **接收侧**：客户端按 `seqId` 去重，离线增量拉取与实时推送重叠时只保留一份
- **状态机**：sent（服务端已收）→ delivered（接收端确认）→ read（已读回执），撤回仅改状态不删原文
- **取舍**：幂等窗口是连接级的（断线重连后旧 requestId 不再命中），跨连接强幂等需将窗口迁移 Redis——与多实例扩展同属 real 模式演进项

## API 概览

统一响应格式 `{ code, data, message }`，`code=0` 成功。除 `/api/v1/auth/*` 外均需 `Authorization: Bearer <token>`。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/v1/auth/register · login · refresh | 注册 / 登录 / 刷新 token |
| POST | /api/v1/auth/logout | 登出（吊销当前 accessToken / refreshToken） |
| GET | /api/v1/users/search?keyword= | 搜索用户 |
| POST/GET | /api/v1/friends/requests | 发起 / 拉取好友请求 |
| POST/DELETE | /api/v1/friends/requests/:id/accept · :id | 接受 / 拒绝 |
| GET | /api/v1/friends/me | 好友列表 |
| POST | /api/v1/groups · GET /api/v1/groups/me | 创建群 / 我的群 |
| GET | /api/v1/messages/sessions | 会话列表（摘要+未读） |
| GET | /api/v1/messages/history/:targetId?toType= | 历史消息（游标分页） |
| POST | /api/v1/messages/offline | 离线增量拉取 |
| POST | /api/v1/upload?type=image\|voice | 文件上传 |
| GET | /health | 健康检查 |
| GET | /metrics | 运行指标（uptime、RSS、HTTP 请求量/状态分布/延迟、在线 Socket 数） |

Socket 事件（path `/im`）：`MSG_CHAT`（发送，ack 携带 seqId）、`MSG_ROUTE`（推送）、`MSG_ACK`、`MSG_DELIVERED_ACK` / `MSG_ROUTE_DELIVERED_NOTIFY`（送达）、`MSG_READ` / `MSG_READ_NOTIFY`（已读）、`MSG_RECALL`（撤回）、`SYS_PING/PONG`（心跳）、`FRIEND_REQUEST_NOTIFY` / `FRIEND_ACCEPTED_NOTIFY`（好友通知）。

## 开发规范

- **语言/模块**：后端 Node ESM（`type: module`）；前端 Vue 3 `<script setup>` + Pinia
- **代码风格**：2 空格缩进、单引号、分号结尾；文件头注释说明职责
- **错误处理**：路由内 `try/catch → next(err)`，由 `middleware/error.js` 统一转换；业务错误用 `AppError(message, code, status)`
- **入参校验**：所有写接口必须过 zod schema（`utils/protocol.js` 或路由内定义）
- **ID 比较**：用户/消息 ID 在不同存储层存在 string/number 混用，比较前一律 `String()` 归一
- **日志**：后端统一 `utils/logger.js`；前端统一 `utils/logger.js`，不直接 `console.*`
- **提交前**：`npm run lint && npm test` 必须通过

## 已知限制

- fallback 模式为单进程设计：内存态（seq 计数器、在线状态、限频窗口、MSG_CHAT 幂等窗口、JWT 吊销黑名单）不跨进程共享；多实例部署需切 `real` 模式并启用 `SOCKET_IO_REDIS_ADAPTER=true`，并将幂等窗口与黑名单迁移 Redis
- 前端工程为 HBuilderX 形态，无 CLI 构建链；如需用 vue-cli/vite 方式构建，参考 uni-app CLI 文档迁移
- 语音消息的录音/播放依赖 uni-app API，H5 端能力有限，建议真机验证
