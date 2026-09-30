<p align="center">
  <img src="public/banner.png" alt="waoowaoo" width="600">
</p>

<h1 align="center">waoowaoo AI Video Studio</h1>

<p align="center">
  An AI-powered tool for creating short drama / comic videos — automatically generates storyboards, characters, and scenes from novel text, then assembles them into complete videos.
</p>

<p align="center">
  <a href="README.md">中文文档</a> · <a href="https://www.waoowaoo.com/">Join Waitlist</a> · <a href="https://github.com/saturndec/waoowaoo/issues">Report Bug</a>
</p>

> [!IMPORTANT]
> **Beta Notice**: This project is currently in its early beta stage. As it is currently a solo-developed project, some bugs and imperfections are to be expected. We are iterating rapidly — please stay tuned for frequent updates! We are committed to rolling out a massive roadmap of new features and optimizations, with the ultimate goal of becoming the top-tier solution in the industry. Your feedback and feature requests are highly welcome!

---

## ✨ Features

- 🎬 **AI Script Analysis** — Parse novels, extract characters, scenes & plot automatically
- 🎨 **Character & Scene Generation** — Consistent AI-generated character and scene images
- 🖼️ **Image Studio** — Workbench / Infinite Canvas / Reverse Prompt / GIF Studio (standalone entry `/image-studio`)
- 📽️ **Storyboard Video** — Auto-generate shots and compose into complete videos
- 🎙️ **AI Voiceover** — Multi-character voice synthesis
- 🌐 **Bilingual UI** — Chinese / English, switch in the top-right corner

---

## 🚀 Quick Start

**Prerequisites**: Install [Docker Desktop](https://docs.docker.com/get-docker/)

### Method 1: Pull Pre-built Image (Easiest)

No need to clone the repository. Just download and run:

```bash
# Download docker-compose.yml
curl -O https://raw.githubusercontent.com/saturndec/waoowaoo/main/docker-compose.yml

# Start all services
docker compose up -d
```

> ⚠️ This is a beta version. Database is not compatible between versions. To upgrade, clear old data first:

```bash
docker compose down -v
docker rmi ghcr.io/saturndec/waoowaoo:latest
curl -O https://raw.githubusercontent.com/saturndec/waoowaoo/main/docker-compose.yml
docker compose up -d
```

> After starting, please **clear your browser cache** and log in again to avoid issues caused by stale cache.

### Method 2: Clone & Docker Build (Full Control)

```bash
git clone https://github.com/saturndec/waoowaoo.git
cd waoowaoo
docker compose up -d
```

To update:
```bash
git pull
docker compose down && docker compose up -d --build
```

### Method 3: Local Development (For Developers)

```bash
git clone https://github.com/saturndec/waoowaoo.git
cd waoowaoo

# Copy environment config (must be done before npm install)
cp .env.example .env
# ⚠️ Edit .env to fill in your AI API Keys (NEXTAUTH_URL defaults to http://localhost:3000, no change needed)

npm install

# Start infrastructure only
docker compose up mysql redis minio -d

# Run database migration
npx prisma db push

# Seed membership data (default model provider + plans + initial admin)
# Idempotent and safe to re-run; without it free accounts cannot use the default provider
npm run db:seed

# Start development server
npm run dev
```

> [!WARNING]
> Skipping `npm run db:seed` leaves the platform without a default provider; free accounts then get `MEMBERSHIP_CONFIG_MISSING` when generating. The first run prints a randomly generated **initial admin password exactly once** — save it and change it after logging in.

---

Visit [http://localhost:13000](http://localhost:13000) (Method 1 & 2) or [http://localhost:3000](http://localhost:3000) (Method 3) to get started!

> The database is initialized automatically on first launch — no extra configuration needed.

> [!TIP]
> **If you experience lag**: HTTP mode may limit browser connections. Install [Caddy](https://caddyserver.com/docs/install) for HTTPS:
> ```bash
> caddy run --config Caddyfile
> ```
> Then visit [https://localhost:1443](https://localhost:1443)

---

## 🔧 API Configuration

After launching, go to **Settings** to configure your AI service API keys. A built-in guide is provided.

> 💡 **Note**: Currently only official provider APIs are recommended. Third-party compatible formats (OpenAI Compatible) are not yet fully supported and will be improved in future releases.

---

## 💎 Membership (Subscription)

The platform charges for **platform usage only** — never per model call. **Every provider API key is supplied by the user** (including the default provider); the platform holds and pays for nothing.

| Tier | Model providers available | Price |
|------|--------------------------|-------|
| Free | **Only** the platform default provider (Token61), no limits on calls, projects, or features | ¥0 |
| Monthly / Quarterly / Yearly | Default provider + any other provider, configured with your own keys | See `/membership` |

When a membership expires the account falls back to free automatically. Renewals **extend from the existing expiry date**, so no remaining time is lost.

**Access control is enforced server-side in three places** (greyed-out UI is guidance, not permission):

1. When API configuration is saved
2. Before a task is enqueued
3. When the worker resolves a provider key (final line of defence)

> [!NOTE]
> No real payment gateway is wired up yet, so the default flow is **manual activation**: the user places an order at `/membership`, sends the order number to an operator, and the operator activates it.

```bash
# Activate by order number (recommended; the user already placed the order)
npm run membership:admin -- grant --orderNo WOO... --admin admin --reason "WeChat payment 29 CNY"

# Grant directly to an account (creates and activates the order)
npm run membership:admin -- grant --email user@example.com --plan monthly --admin admin --reason "beta gift"

# Revoke a subscription (call this after a refund)
npm run membership:admin -- revoke --orderNo WOO... --admin admin --reason "refund requested"

# Inspect an account's orders
npm run membership:admin -- list --email user@example.com

# Reconciliation sweep: expired-but-active subscriptions and stale unpaid orders
npm run membership:sweep
```

Every grant/revoke writes an entry to `admin_logs` with the before/after values and the reason.

---

## 🛠 Admin Console

Visit `/<locale>/admin` (e.g. `/en/admin`). It is **fully isolated from the end-user account system**: separate cookie name, separate signing key (`ADMIN_SESSION_SECRET`), separate login — a user account can never gain admin access.

| Role | Scope |
|------|-------|
| `support` | User lookup & details, order lookup, repair |
| `operation` | Support scope + ban users, adjust membership, refund, plans & providers, stats |
| `super` | Everything, plus system config and the audit log |

Features: dashboard stats, user management (ban / manual membership adjustment), order management (refund / repair), plan management (create / edit / deactivate), provider management (create / edit / enable / set default), admin account management (create / change role / enable / reset password), system config, audit log search, and an Account page for changing your own password.

Admin account guarantees: you **cannot disable yourself**, and the **last active super admin can neither be disabled nor demoted**. Changing or resetting a password invalidates that account's admin sessions immediately.

> [!IMPORTANT]
> The initial admin is created by `npm run db:seed` and the password is printed **exactly once**. Change it under **Account** right after the first sign-in — the current session is invalidated immediately, so you will sign in again with the new password.
>
> Without `ADMIN_SESSION_SECRET` the console cannot sign in and returns an explicit `ADMIN_SESSION_CONFIG_MISSING` (it never silently reuses another secret). Generate one with `openssl rand -base64 32`.

> [!NOTE]
> Banning an account blocks new sign-ins and invalidates existing sessions on their next request.
> Every admin write requires a reason and is recorded in `admin_logs` with before/after values.

> [!TIP]
> **Payment channels are configured in the admin console**: open **Payments** (super admin only), fill in the merchant parameters and enable the channel. Secret fields are encrypted at rest and only ever returned masked.
>
> - A built-in **generic signed callback** channel is ready to use: configure the callback URL at your checkout, HMAC-SHA256 the raw request body with the signing secret and send it in the `x-payment-signature` header. It works as soon as it is configured — no code change, no redeploy
> - Alipay / WeChat / Stripe ship with parameter templates: you can store the credentials now and enable them once the integration lands
> - A channel can only be enabled when its integration exists **and** every required parameter is filled, so an unusable channel can never take orders
>
> Adding a channel takes three steps: implement `PaymentAdapter` (including `isReady`) → add a field spec in `src/lib/payment/channels.ts` → register it. No UI or API changes needed.

---

## 📦 Tech Stack

- **Framework**: Next.js 15 + React 19
- **Database**: MySQL + Prisma ORM
- **Queue**: Redis + BullMQ
- **Styling**: Tailwind CSS v4
- **Auth**: NextAuth.js

---

## 📦 Preview

![4f7b913264f7f26438c12560340e958c67fa833a](https://github.com/user-attachments/assets/fa0e9c57-9ea0-4df3-893e-b76c4c9d304b)
![67509361cbe6809d2496a550de5733b9f99a9702](https://github.com/user-attachments/assets/f2fb6a64-5ba8-4896-a064-be0ded213e42)
![466e13c8fd1fc799d8f588c367ebfa24e1e99bf7](https://github.com/user-attachments/assets/09bbff39-e535-4c67-80a9-69421c3b05ee)
![c067c197c20b0f1de456357c49cdf0b0973c9b31](https://github.com/user-attachments/assets/688e3147-6e95-43b0-b9e7-dd9af40db8a0)

### Image Studio (`/image-studio`)
A standalone image creation entry, sharing the unified waoowaoo model configuration with projects:
- **Workbench** — Text-to-image / image-to-image with reference image upload, output size / aspect ratio / temperature / parallel count controls, generation history and prompt optimization
- **Infinite Canvas** — Visual node canvas: text / image / generation-config nodes connected to drive batch generation
- **Reverse Prompt** — Upload a reference image and stream back a stylized prompt (Style Extract / Replicate modes)
- **GIF Studio** — Generate a 3×4 animation grid and encode it into a GIF, with frame delay / repeat / frame padding options

---

## 🤝 Contributing

This project is maintained by the core team. You're welcome to contribute by:

- 🐛 Filing [Issues](https://github.com/saturndec/waoowaoo/issues) — report bugs
- 💡 Filing [Issues](https://github.com/saturndec/waoowaoo/issues) — propose features
- 🔧 Submitting Pull Requests as references — we review every PR carefully for ideas, but the team implements fixes internally rather than merging external PRs directly

---

**Made with ❤️ by waoowaoo team**

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=saturndec/waoowaoo&type=date&legend=top-left)](https://www.star-history.com/#saturndec/waoowaoo&type=date&legend=top-left)
