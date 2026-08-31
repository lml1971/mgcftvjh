# Cloudflare Worker - 直播源聚合 / 引流注入 / 测速去重

运行在 Cloudflare Workers 上的直播源聚合服务：多源抓取 → **并发测速** → **按标题去重选优** → KV 缓存 → 自动分组 → 输出 M3U / TXT / JSON。

---

## ✨ 功能特性

| 特性 | 说明 |
|------|------|
| 🔀 **多源聚合** | 并发抓取多个远程直播源（支持 `.m3u` / `.txt`，可自动判断格式） |
| ⚡ **并发测速** | 对同一频道的多个源地址做 HEAD 探测，按延迟升序排列 |
| 🎯 **智能去重** | 相同标题频道合并 URL 列表，主 URL 选延迟最低的那个 |
| 🗂️ **自动分组** | 基于标题关键词归入「央视 / 卫视 / 体育 / 影视」等分类 |
| 📢 **引流注入** | 在频道列表顶部固定插入自定义推广节目 |
| 🧹 **垃圾过滤** | 关键词黑名单过滤广告 / 无效频道 |
| 📦 **多格式输出** | M3U / TXT / JSON，兼容各类 IPTV 播放器 |
| 💾 **KV 缓存** | 缓存 10 分钟，避免冷启动重复抓取 |
| 🌐 **CORS 支持** | 全开放跨域，可直接被前端 / 播放器调用 |
| 🔧 **环境变量覆盖** | Dashboard 设置 `SOURCE_URLS`、`ENABLE_PROMO` 动态覆盖 |

---

## 📁 文件结构

| 文件 | 说明 |
|------|------|
| `worker.js` | **生产代码**（已填入实际配置，直接部署） |
| `worker.template.js` | **模板文件**（配置留空，供参考或二次部署） |
| `wrangler.toml` | Cloudflare Worker 部署配置 |

---

## 🚀 路由一览

| 路径 | 说明 |
|------|------|
| `GET /` | 首页 JSON（分类 + 频道列表） |
| `GET /?ac=list&t=分组名&pg=1` | 分类分页列表 |
| `GET /?ac=detail&ids=ch_0,ch_1` | 频道详情 |
| `GET /m3u` 或 `/live.m3u` | M3U 播放列表 |
| `GET /txt` 或 `/live.txt` | TXT 频道列表 |

---

## 🔧 配置说明

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
    { title: "宣传片1", url: "https://example.com/promo1.mp4", pic: "", group: "推流信息", from: "1", remarks: "置顶引流" },
];

// 垃圾关键词过滤
const SPAM_KEYWORDS = ["广告", "注意事项", "加群"];

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

## ⚙️ 关键常量

| 常量 | 默认值 | 说明 |
|------|--------|------|
| `CACHE_TTL_MS` | 10 分钟 | 内存级缓存有效期 |
| `KV_TTL_SECONDS` | 600 秒 | KV 存储 TTL |
| `FETCH_TIMEOUT_MS` | 15 秒 | 单源抓取超时 |
| `SPEED_TEST_TIMEOUT_MS` | 5 秒 | 单 URL 测速超时 |
| `SPEED_TEST_SAMPLE` | 2 | 每个频道最多测速的 URL 数量 |
| `DEFAULT_PAGE_SIZE` | 20 | 默认分页大小 |
| `MAX_RETURN_LIMIT` | 500 | 单分类最大返回条数 |

---

## 🏗️ 测速去重流程

```
抓取所有源
   │
   ▼
合并所有频道（保留全部原始条目）
   │
   ▼
regroupChannels() 自动分组
   │
   ▼
mergeAndDedup() 去重测速
   │  ├── 按标题（小写）为 key 合并
   │  ├── 同一频道的多 URL 合并为 urls[] 数组
   │  ├── 对每个频道取前 SPEED_TEST_SAMPLE 个 URL 并发 HEAD 探测
   │  └── 按延迟升序排列 → 最快 URL 作为主 url
   │
   ▼
KV 缓存 + 响应输出
```

---

## 🔧 部署指南

### 前置条件

1. 注册 [Cloudflare](https://cloudflare.com) 账号并登录
2. 安装 Wrangler CLI：`npm install -g wrangler`
3. 登录：`wrangler login`

### 步骤

```bash
cd your-project-dir

# 创建 KV 命名空间（首次部署）
wrangler kv:namespace create "KV"

# 部署
wrangler deploy
```

部署成功后，Wrangler 输出 Worker URL（如 `https://live-aggregator.xxx.workers.dev`）。

### Dashboard 部署

1. **Workers & Pages → Create Worker**
2. 粘贴 `worker.js` 代码
3. **Settings → Bindings** 添加 KV Namespace，变量名填 `KV`
4. **Save & Deploy**

---

## 📡 API 使用示例

```bash
# 首页（分类 + 频道列表，含测速延迟信息）
curl https://your-worker.workers.dev/

# M3U 播放列表（VLC / IPTV 播放器直接打开）
curl https://your-worker.workers.dev/m3u

# TXT 格式
curl https://your-worker.workers.dev/txt

# 分页获取某分类频道
curl "https://your-worker.workers.dev/?ac=list&t=📺%20央视&pg=1&limit=20"

# 频道详情
curl "https://your-worker.workers.dev/?ac=detail&ids=ch_0,ch_5"
```

---

## ⚠️ 注意事项

1. **KV 绑定**：确保 Worker 已绑定名为 `KV` 的 KV Namespace，否则自动降级为每次直接抓取
2. **免费额度**：Workers 免费版每天 10 万次请求，KV 免费版每天 10 万次读 / 1,000 次写
3. **测速开销**：测速在 KV 过期后重建缓存时执行，会略微增加首次响应时间（不阻塞后续请求）
4. **超时限制**：单次 Worker 执行上限 30 秒（CPU），抓取超时 15 秒 + 测速超时 5 秒
5. **直播源稳定性**：上游源失效时输出错误日志，不影响其他源的返回
6. **引流合规**：PROMO_LIST 中的内容请确保版权合规

---

## 📄 License

MIT
