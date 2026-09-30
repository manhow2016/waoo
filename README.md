<p align="center">
  <a href="https://www.waoowaoo.com/">
    <img src="images/cta-banner.png" alt="🚀 探索 AI 影视的下一代创作流 | 立即加入 waoowaoo 在线网页版内测候补" width="800">
  </a>
</p>

<p align="center">
  <img src="public/banner.png" alt="waoowaoo" width="600">
</p>

<h1 align="center">waoowaoo AI 影视 Studio</h1>

<p align="center">
  一款基于 AI 技术的短剧/漫画视频制作工具，支持从小说文本自动生成分镜、角色、场景，并制作成完整视频。
</p>

<p align="center">
  <a href="README_en.md">English</a> · <a href="https://www.waoowaoo.com/">加入内测候补</a> · <a href="https://github.com/saturndec/waoowaoo/issues">反馈问题</a>
</p>

> [!IMPORTANT]
> ⚠️ **测试版声明**：本项目目前处于测试初期阶段，由于暂时只有我一个人开发，存在部分 bug 和不完善之处。我们正在快速迭代更新中，**欢迎进群反馈问题和需求，及时关注项目更新！目前更新会非常频繁，后续会增加大量新功能以及优化效果，我们的目标是成为行业最强AI工具！**

<img src="https://github.com/user-attachments/assets/d190bf41-488d-47df-a5df-06346ef0f2f5" width="30%">

---
## ✨ 功能特性

- 🎬 **AI 剧本分析** — 自动解析小说，提取角色、场景、剧情
- 🎨 **角色 & 场景生成** — AI 生成一致性人物和场景图片
- 🖼️ **图像工作台** — 生图工作台 / 无限画布 / 反推提示词 / 动图生成（独立入口 `/image-studio`）
- 📽️ **分镜视频制作** — 自动生成分镜头并合成视频
- 🎙️ **AI 配音** — 多角色语音合成
- 🌐 **多语言支持** — 中文 / 英文界面，右上角一键切换
- 💰 **计费系统** — 余额管理、扣费记录、项目费用统计
- 🔐 **安全认证** — 邮箱注册登录，图片验证码防机器人

---

## 🚀 快速开始

**前提条件**：安装 [Docker Desktop](https://docs.docker.com/get-docker/)

### 方式一：拉取预构建镜像（最简单）

无需克隆仓库，下载即用：

```bash
# 下载 docker-compose.yml
curl -O https://raw.githubusercontent.com/saturndec/waoowaoo/main/docker-compose.yml

# 启动所有服务
docker compose up -d
```

> ⚠️ 当前为测试版，版本间数据库不兼容。升级请先清除旧数据：

```bash
docker compose down -v
docker rmi ghcr.io/saturndec/waoowaoo:latest
curl -O https://raw.githubusercontent.com/saturndec/waoowaoo/main/docker-compose.yml
docker compose up -d
```

> 启动后请**清空浏览器缓存**并重新登录，避免旧版本缓存导致异常。

### 方式二：克隆仓库 + Docker 构建（完全控制）

```bash
git clone https://github.com/saturndec/waoowaoo.git
cd waoowaoo
docker compose up -d
```

更新版本：
```bash
git pull
docker compose down && docker compose up -d --build
```

### 方式三：本地开发模式（开发者）

```bash
git clone https://github.com/saturndec/waoowaoo.git
cd waoowaoo

# 复制环境变量配置文件（必须在 npm install 之前完成）
cp .env.example .env
# ⚠️ 编辑 .env，填入你的 AI API Key（NEXTAUTH_URL 默认已是 http://localhost:3000，无需修改）

npm install

# 只启动基础设施
# 注意：docker-compose.yml 将服务映射到非标准端口，.env.example 已按此预设
mysql:13306  redis:16379  minio:19000
docker compose up mysql redis minio -d

# 初始化数据库表结构（首次必须执行，跳过会导致启动后报错）
npx prisma db push

# 初始化会员系统基础数据（默认模型供应商 + 四档套餐 + 初始管理员）
# 幂等，可重复执行；不执行会导致免费账号无法使用默认供应商
npm run db:seed

# 启动开发服务器
npm run dev
```

> [!WARNING]
> 跳过 `npx prisma db push` 会导致所有数据库表不存在，启动后报错 `The table 'tasks' does not exist`。请务必先运行此命令再启动开发服务器。
>
> 跳过 `npm run db:seed` 会导致平台没有默认供应商，免费账号发起生成时会收到 `MEMBERSHIP_CONFIG_MISSING`。首次执行会打印随机生成的**管理员初始密码，仅显示一次**，请立即保存并登录后修改。

---

访问 [http://localhost:13000](http://localhost:13000)（方式一、二）或 [http://localhost:3000](http://localhost:3000)（方式三）开始使用！

> 首次启动会自动完成数据库初始化，无需任何额外配置。

> [!TIP]
> **如果遇到网页卡顿**：HTTP 模式下浏览器可能限制并发连接。可安装 [Caddy](https://caddyserver.com/docs/install) 启用 HTTPS：
> ```bash
> caddy run --config Caddyfile
> ```
> 然后访问 [https://localhost:1443](https://localhost:1443)

---

## 🔧 API 配置

启动后进入**设置中心**配置 AI 服务的 API Key。

**默认配置**：系统已预配置 Token六一（NEW-API 中转站）作为唯一 API 提供商，支持 LLM、图像、视频、音频、口型同步全类型模型。

> 💡 **注意**：用户只需在 Token六一平台获取 API Key 即可使用所有模型。

---

## 💎 会员系统（订阅制）

平台**不对模型调用计费**，只收取订阅费；**所有供应商的 API Key 均由用户自己填写**（含默认供应商），平台不持有、不代付任何 Key。

| 等级 | 可用模型供应商 | 价格 |
|------|--------------|------|
| 免费 | **仅**平台默认供应商（Token六一），不限调用次数/项目数/功能 | ¥0 |
| 月付 / 季付 / 年付 | 默认供应商 + 其他供应商自由配置 | 见 `/membership` |

会员到期后自动回落免费等级；续费从原到期时间**顺延**，不浪费剩余时长。

**准入校验在服务端三处执行**（前端置灰只是引导，不是权限）：

1. 保存 API 配置时
2. 任务入队前
3. worker 运行时解析供应商密钥时（最终防线）

> [!NOTE]
> 当前版本未接入任何真实支付渠道，默认走**手动开通**：用户在 `/membership` 下单拿到订单号 → 交给运营确认收款 → 运营用下面的命令开通。

```bash
# 按订单号开通（推荐，用户已下单）
npm run membership:admin -- grant --orderNo WOO... --admin admin --reason "微信收款 29 元"

# 直接给账号开通（自动建单并立即激活）
npm run membership:admin -- grant --email user@example.com --plan monthly --admin admin --reason "内测赠送"

# 撤销订阅（退款后同步取消）
npm run membership:admin -- revoke --orderNo WOO... --admin admin --reason "用户申请退款"

# 查询某账号订单
npm run membership:admin -- list --email user@example.com

# 兜底扫描：到期未降级的订阅 + 超时未支付的订单
npm run membership:sweep
```

所有开通/撤销操作都会写入 `admin_logs`，包含操作前后值与原因。

---

## 🛠 管理后台

访问 `/<语言前缀>/admin`（如 `/zh/admin`）。**与用户端账号体系完全隔离**：独立 Cookie 名、独立签名密钥（`ADMIN_SESSION_SECRET`）、独立登录入口，用户账号无法获得后台权限。

| 角色 | 权限范围 |
|------|---------|
| `support` 客服 | 用户查询与详情、订单查询、补单 |
| `operation` 运营 | 客服权限 + 封禁用户、调整会员、退款、套餐与供应商管理、数据统计 |
| `super` 超级管理员 | 全部权限，另含系统配置与操作日志 |

后台能力：仪表盘统计、用户管理（封禁/手动调整会员）、订单管理（退款/补单）、套餐管理（新增/编辑/下架）、供应商管理（新增/编辑/启停/设默认）、管理员账号管理（新增/改角色/启停/重置密码）、系统配置、操作日志查询、账号设置（自助改密）。

管理员账号相关约束：**不能停用自己**，也**不能让最后一个启用中的超级管理员被停用或降级**；重置或修改密码都会让被改账号的后台会话立即失效。

> [!IMPORTANT]
> 初始管理员在 `npm run db:seed` 时创建，密码**仅打印一次**。登录后请立即前往「账号设置」修改密码——修改后当前会话会立刻失效，需用新密码重新登录。
>
> 未配置 `ADMIN_SESSION_SECRET` 时后台无法登录，会明确返回 `ADMIN_SESSION_CONFIG_MISSING`（不会静默复用其他密钥）。生成方式：`openssl rand -base64 32`。

> [!NOTE]
> 封禁账号后：新登录被拒绝，已签发的会话在下次请求校验时立即失效。
> 所有后台写操作都必须填写原因，并写入 `admin_logs`（含操作前后值）。

> [!TIP]
> **支付渠道可在后台可视化配置**：进入「支付渠道」页（仅超级管理员）填写商户参数并启用即可，敏感参数加密存储、接口只回显掩码。
>
> - 内置「通用签名回调」渠道：把回调地址配置到你的收银台，用签名密钥对原始请求体做 HMAC-SHA256 并通过 `x-payment-signature` 头提交，**配置完即刻可用，无需改代码或重新部署**
> - 支付宝 / 微信 / Stripe 已预置参数模板，可以先把凭证存好；对接代码实现后直接启用
> - 只允许启用「对接代码已实现 + 必填参数齐全」的渠道，未就绪的渠道不会被用于下单，避免产生无法支付的订单
>
> 新增渠道需要三步：实现 `PaymentAdapter`（含 `isReady`）→ 在 `src/lib/payment/channels.ts` 补字段规格 → 注册。页面与接口无需改动。

---

## 📦 技术栈

- **框架**: Next.js 15 + React 19
- **数据库**: MySQL + Prisma ORM
- **队列**: Redis + BullMQ
- **样式**: Tailwind CSS v4
- **认证**: NextAuth.js

---

## 📦 页面功能预览

### 首页（支持中英文）
**未登录状态：**
- **Hero 视频背景** — 全屏视频展示，渐变遮罩保障文字可读性
- **平台展示区** — AI 漫剧创作与发行一站式平台介绍
- **画布创作流程** — 文本→人物/场景→视频的可视化创作流程
- **响应式设计** — 移动端自动切换为竖向排列
- **深色主题** — 整屏 scroll-snap 吸附滚动体验

**登录后首页：**
- **分页控制** — 快速创作 / 项目管理两个分页卡
- **快速创作区** — 输入故事文本，选择比例和风格，一键创建项目
- **AI 帮我写** — AI 辅助生成故事内容
- **项目管理** — 搜索、分页、新建/编辑/删除项目（独立分页卡）

### 设置中心
- **模型配置** — 配置 Token六一 API Key 和默认模型

### 项目配置
每个项目支持独立配置，修改仅对当前项目生效：
- **画面风格** — 漫画风、写实风等多种风格
- **画面比例** — 9:16、16:9、1:1 等多种比例
- **视频分辨率** — 480p / 720p / 1080p
- **视频时长** — 3秒 / 5秒 / 10秒
- **模型参数** — 分析、角色、场景、分镜、修图、视频、语音模型独立配置

### 工作台
![4f7b913264f7f26438c12560340e958c67fa833a](https://github.com/user-attachments/assets/fa0e9c57-9ea0-4df3-893e-b76c4c9d304b)
![67509361cbe6809d2496a550de5733b9f99a9702](https://github.com/user-attachments/assets/f2fb6a64-5ba8-4896-a064-be0ded213e42)
![466e13c8fd1fc799d8f588c367ebfa24e1e99bf7](https://github.com/user-attachments/assets/09bbff39-e535-4c67-80a9-69421c3b05ee)
![c067c197c20b0f1de456357c49cdf0b0973c9b31](https://github.com/user-attachments/assets/688e3147-6e95-43b0-b9e7-dd9af40db8a0)

### 图像工作台（`/image-studio`）
独立图像创作入口，模型配置与项目共用 waoowaoo 统一模型体系：
- **生图工作台** — 文生图 / 图生图，支持参考图上传、输出尺寸 / 宽高比 / 温度 / 并行数量调节、生成历史与提示词优化
- **无限画布** — 可视化节点画布，文本 / 图片 / 生成配置节点连线编排，批量驱动生成
- **反推提示词** — 上传参考图，流式反推风格化提示词（图生图通用仿照 / 文生图高保真复刻两种模式）
- **动图生成** — 生成 3×4 动画网格并编码为 GIF，支持帧延迟 / 循环次数 / 帧内缩等参数

---

## 🤝 参与方式

本项目由核心团队独立维护。欢迎你通过以下方式参与：

- 🐛 提交 [Issue](https://github.com/saturndec/waoowaoo/issues) 反馈 Bug
- 💡 提交 [Issue](https://github.com/saturndec/waoowaoo/issues) 提出功能建议
- 🔧 提交 Pull Request 供参考 — 我们会认真审阅每一个 PR 的思路，但最终由团队自行实现修复，不会直接合并外部 PR

---

**Made with ❤️ by waoowaoo team**

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=saturndec/waoowaoo&type=date&legend=top-left)](https://www.star-history.com/#saturndec/waoowaoo&type=date&legend=top-left)
