<div align="center">

# 📡 Cloudflare Worker · 直播源聚合 / 引流注入

一个跑在 Cloudflare Workers 上的直播源聚合服务。
多源抓取 · KV 缓存 · 自动分组 · 引流注入，兼容 IPTV 播放器常用的 M3U / TXT 输出与类苹果 CMS 的 JSON API。

<br/>

<img src="https://img.shields.io/badge/runtime-Cloudflare%20Workers-F38020?style=for-the-badge&logo=cloudflare" alt="runtime" />
<img src="https://img.shields.io/badge/edge-serverless-000000?style=for-the-badge" alt="edge" />
<img src="https://img.shields.io/badge/storage-KV%20Cache-FF9900?style=for-the-badge" alt="kv" />
<img src="https://img.shields.io/badge/output-M3U%20%7C%20TXT%20%7C%20JSON-blueviolet?style=for-the-badge" alt="output" />
<img src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" alt="license" />

<br/>

</div>

---

## 👤 关于作者

<table>
  <tr>
    <td align="center" width="220" valign="middle"
        style="background:linear-gradient(145deg,#1f2937,#374151);padding:30px 20px;border-radius:16px 0 0 16px;">
      <img src="https://one-agent-prod-1343551737.cos.ap-guangzhou.myqcloud.com/artifacts/1002/a34ab65f0c3d4a449f1b8b6dd9e33843/0Q4tKchlHNt/task-78df533ceaa085cf251ccbc8986d3bab/.rendered/_assets/AVk2WuOtiDr.jpg?q-sign-algorithm=sha1&q-ak=AKIDDMTk0KZdUSL21fBYigcl3C8rMeiT5TdZ&q-sign-time=1788267313%3B1796043313&q-key-time=1788267313%3B1796043313&q-header-list=host&q-url-param-list=&q-signature=856daddebc11ca48ca495a693d03044b2f49c5d2" alt="作者照片" width="150" height="150"
           style="border-radius:50%;border:3px solid #F38020;box-shadow:0 4px 16px rgba(0,0,0,.35);object-fit:cover;object-position:center 18%;background:#fff;" />
      <div style="margin-top:14px;font-size:15px;font-weight:700;color:#F38020;letter-spacing:.5px;">
        一个不识码的中年男人
      </div>
      <div style="margin-top:4px;font-size:12px;color:#9ca3af;">🧓👨‍💻 Non-Coder</div>
    </td>
    <td align="left" valign="middle" style="background:#f8fafc;padding:26px 30px;border-radius:0 16px 16px 0;">
      <div style="font-size:14px;color:#6b7280;font-style:italic;margin-bottom:12px;">
        「正经西装领带，不正经的只有思路。」
      </div>
      <div style="font-size:13.5px;line-height:1.85;color:#374151;">
        本职工作跟代码没半点关系，纯属闲着也是闲着，拿 Cloudflare Workers 实现 TV 直播源自由。<br/>
        这个聚合服务是一边想一边跟 AI 结对编程「磕」出来的 —— <strong>能跑就算成功，跑崩了刷新重试</strong>。<br/>
        直播源不一定是全网最优，但好在 <strong>能用、好部署、改配置就能跑</strong>，适合同样想折腾、又不想深陷 Node 生态的同学。
      </div>
      <div style="margin-top:14px;padding-top:12px;border-top:1px dashed #d1d5db;font-size:13px;color:#4b5563;">
        觉得有用欢迎 ⭐ <strong>Star</strong> / <strong>Fork</strong>，也欢迎提 Issue（承诺尽量看，不一定改 😂）。
      </div>
    </td>
  </tr>
</table>

---

## 🚀 功能特性

| 特性 | 说明 |
|------|------|
| 🔀 **多源聚合** | 从多个远程地址抓取直播源（支持 `.m3u` / `.txt`，也可自动判断格式） |
| ⚡ **KV 缓存** | 接入 Cloudflare KV，缓存 10 分钟，避免冷启动重复抓取 |
| 🗂️ **自动分组** | 基于标题关键词自动归入「央视 / 卫视 / 体育 / 影视」等分类 |
| 📢 **引流注入** | 在频道列表顶部固定插入自定义推广节目（`PROMO_LIST`） |
| 🧹 **垃圾过滤** | 关键词黑名单过滤广告 / 无效频道 |
| 📦 **多格式输出** | M3U / TXT / JSON，兼容各类 IPTV 播放器 |
| 🌐 **CORS 支持** | 全开放跨域头，可直接被前端 / 播放器调用 |
| 🔧 **环境变量覆盖** | Dashboard 设置 `SOURCE_URLS`、`ENABLE_PROMO` 等动态覆盖硬编码 |

### 路由一览

| 路径 | 说明 |
|------|------|
| `GET /` | 首页 JSON（分类 + 频道列表） |
| `GET /?ac=list&t=分组名&pg=1` | 分类分页列表 |
| `GET /?ac=detail&ids=ch_0,ch_1` | 频道详情 |
| `GET /m3u` 或 `/live.m3u` | M3U 播放列表 |
| `GET /txt` 或 `/live.txt` | TXT 频道列表 |

---

## 📁 文件结构

| 文件 | 说明 |
|------|------|
| `worker.js` | **生产代码**（已填入实际配置：直播源、引流节目等） |
| `worker.template.js` | **模板文件**（配置区留空 / 注释，供参考或二次部署） |
| `wrangler.toml` | Cloudflare Worker 部署配置 |

---

## ✨ 输出效果

**M3U 播放列表** — VLC / IPTV 播放器直接打开

```m3u
#EXTM3U
#EXTINF:-1 tvg-name="CCTV-1 综合" tvg-logo="https://.../CCTV1.png" group-title="📺 央视",CCTV-1 综合
https://example.com/cctv1.m3u8
#EXTINF:-1 tvg-name="宣传片1" tvg-logo="https://.../promo1.jpg" group-title="推流信息",宣传片1
https://example.com/promo1.mp4
```

**TXT 频道列表**

```text
央视,#genre#
CCTV-1 综合,https://example.com/cctv1.m3u8
CCTV-5 体育,https://example.com/cctv5.m3u8
推流信息,#genre#
宣传片1,https://example.com/promo1.mp4
```

**首页 JSON API**

```json
{
  "code": 1,
  "msg": "success",
  "class": [{ "type_id": 1, "type_name": "📺 央视" }],
  "list": [
    {
      "vod_id": "ch_0",
      "vod_name": "CCTV-1 综合",
      "vod_pic": "https://.../CCTV1.png",
      "vod_play_from": "1",
      "vod_play_url": "CCTV-1 综合$https://example.com/cctv1.m3u8"
    }
  ]
}
```

---

## 📝 配置说明

### 用户配置区（仅需修改此部分）

```javascript
// 直播源列表
const SOURCE_URLS = [
    { url: "https://example.com/live1.m3u", format: "m3u" },
    { url: "https://example.com/live2.txt", format: "txt" },
    { url: "https://example.com/auto-detect" }, // 不指定 format 自动判断
];

// 引流节目（置顶）
const PROMO_LIST = [
    {
        title: "宣传片1",
        url:   "https://example.com/promo1.mp4",
        pic:   "https://example.com/promo1.jpg",
        group: "推流信息",
        from:  "1",
        remarks: "置顶引流",
    },
];

// 垃圾关键词过滤
const SPAM_KEYWORDS = ["广告", "注意事项", "加群", /* ... */];

// 自动分组规则（按优先级从上到下匹配）
const REGROUP_RULES = [
    { group: "📺 高清", keywords: ["4K", "8K", "高清"] },
    { group: "📺 央视", keywords: ["CCTV", "央视", "中央"] },
    // ... 更多规则
];
```

### 环境变量（可选，Dashboard 设置）

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `SOURCE_URLS` | JSON 字符串，覆盖硬编码的直播源 | `[{"url":"https://...m3u"}]` |
| `ENABLE_PROMO` | 是否注入引流节目 | `"true"` / `"false"` |
| `FALLBACK_LOGO_BASE` | 自定义台标兜底域名 | `https://your-logo-cdn.com` |

---

## 🔧 部署指南

### 前置条件

1. 注册 [Cloudflare](https://cloudflare.com) 账号并登录
2. 安装 Wrangler CLI：`npm install -g wrangler`
3. 登录：`wrangler login`

### 方式一 · Wrangler CLI

```bash
# 1. 进入项目目录
cd your-project-dir

# 2. 创建 KV 命名空间（首次部署）
wrangler kv:namespace create "KV"

# 3. 将返回的 ID 填入 wrangler.toml（自动 provisioning 模式下可跳过）
# [[kv_namespaces]]
# binding = "KV"
# id = "你的-namespace-id"

# 4. 部署
wrangler deploy
```

部署成功后，Wrangler 会输出一个 Worker URL（如 `https://live-aggregator.xxx.workers.dev`），直接访问即可。

### 方式二 · Dashboard 手动部署

1. 进入 Cloudflare Dashboard → **Workers & Pages → Create Worker**
2. 粘贴 `worker.js` 代码
3. 在 **Settings → Bindings** 中添加一个 KV Namespace，变量名填 `KV`
4. **Save & Deploy**

---

## 📡 API 使用示例

```bash
# 首页（分类 + 频道列表）
curl https://your-worker.workers.dev/

# 获取 M3U 播放列表（可直接在 VLC / IPTV 播放器中打开）
curl https://your-worker.workers.dev/m3u

# 获取 TXT 格式
curl https://your-worker.workers.dev/txt

# 分页获取某分类频道
curl "https://your-worker.workers.dev/?ac=list&t=📺%20央视&pg=1&limit=20"

# 获取频道详情
curl "https://your-worker.workers.dev/?ac=detail&ids=ch_0,ch_5"
```

---

## 🏗️ 架构说明

```
   请求进入
      │
      ▼
 loadAllChannels()
      │
      ├── ① 读取 KV 缓存（10 分钟有效期）
      │      ├── HIT  ──────────────► 直接返回缓存频道列表
      │      └── MISS / EXPIRED ──►  继续下一步
      │
      ├── ② 并发抓取所有 SOURCE_URLS
      │      ├── fetchWithTimeout（15 秒超时）
      │      ├── parseM3U() / parseTXT() 解析
      │      └── isSpam() 过滤垃圾频道
      │
      ├── ③ regroupChannels() 自动分组
      │
      └── ④ waitUntil() 异步写回 KV（不阻塞响应）
             │
             ▼
      ┌──────────────────────────────────────┐
      │  路由分发                              │
      │  /  ·  /m3u  ·  /txt                  │
      │  ?ac=list  ·  ?ac=detail              │
      └──────────────┬───────────────────────┘
                     ▼
                 Response
```

---

## ⚙️ 关键常量

| 常量 | 默认值 | 说明 |
|------|--------|------|
| `CACHE_TTL_MS` | 10 分钟 | 内存级缓存有效期 |
| `KV_TTL_SECONDS` | 600 秒 | KV 存储 TTL |
| `FETCH_TIMEOUT_MS` | 15 秒 | 单源抓取超时 |
| `DEFAULT_PAGE_SIZE` | 20 | 默认分页大小 |
| `MAX_RETURN_LIMIT` | 500 | 单分类最大返回条数 |
| `FALLBACK_LOGO_BASE` | `https://epg.112114.xyz/logo` | 台标兜底域名 |

---

## ⚠️ 注意事项

1. **KV 绑定**：确保 Worker 已绑定名为 `KV` 的 KV Namespace，否则会自动降级为每次直接抓取
2. **免费额度**：Workers 免费版每天 10 万次请求，KV 免费版每天 10 万次读 / 1,000 次写，注意用量
3. **超时限制**：单次 Worker 执行上限 30 秒（CPU），抓取超时设为 15 秒，避免雪崩
4. **直播源稳定性**：上游源失效时会在日志中输出错误，不影响其他源的返回
5. **引流合规**：`PROMO_LIST` 中的内容请确保版权合规

---

<div align="center">

**📄 License · MIT**

如果这个项目帮你实现了直播源自由，别忘了回来点个 ⭐

</div>
