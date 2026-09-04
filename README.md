<div align="center">

# 📡 Cloudflare Worker · 直播源聚合 / 引流注入

跑在 Cloudflare Workers 上的直播源聚合服务：多源抓取 · KV 缓存 · 沿用上游分组并自动排序 · 推流置顶，兼容 M3U / TXT 输出与类苹果 CMS 的 JSON API。

<br/>

<img src="https://img.shields.io/badge/runtime-Cloudflare%20Workers-F38020?style=for-the-badge&logo=cloudflare" alt="runtime" />
<img src="https://img.shields.io/badge/storage-KV%20Cache-FF9900?style=for-the-badge" alt="kv" />
<img src="https://img.shields.io/badge/output-M3U%20%7C%20TXT%20%7C%20JSON-blueviolet?style=for-the-badge" alt="output" />
<img src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" alt="license" />

</div>

---

## 👤 关于作者

<table>
  <tr>
    <td align="center" width="200" valign="middle"
        style="background:linear-gradient(145deg,#1f2937,#374151);padding:30px 20px;border-radius:16px 0 0 16px;">
      <div style="font-size:64px;line-height:1;">👨‍💻</div>
      <div style="margin-top:14px;font-size:15px;font-weight:700;color:#F38020;letter-spacing:.5px;">
        一个不识码的中年男人
      </div>
      <div style="margin-top:4px;font-size:12px;color:#9ca3af;">🧓 Non-Coder</div>
    </td>
    <td align="left" valign="middle" style="background:#f8fafc;padding:26px 30px;border-radius:0 16px 16px 0;">
      <div style="font-size:14px;color:#6b7280;font-style:italic;margin-bottom:12px;">
        「正经西装领带，不正经的只有思路。」
      </div>
      <div style="font-size:13.5px;line-height:1.85;color:#374151;">
        本职跟代码没半点关系，闲着也是闲着，拿 Cloudflare Workers 实现 TV 直播源自由。<br/>
        服务是一边想一边跟 AI 结对编程「磕」出来的 —— <strong>能跑就算成功，跑崩了刷新重试</strong>。<br/>
        直播源不一定全网最优，但好在 <strong>能用、好部署、改配置就能跑</strong>。
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
| 🔀 多源聚合 | 并发抓取多个远程源（`.m3u` / `.txt`，可自动识别），单源失败不阻塞 |
| ⚡ KV 缓存 | 绑定 Cloudflare KV 后缓存 10 分钟，未绑定则每次直接抓取（自动降级） |
| 🗂️ 分组排序 | **沿用上游源自带分组名**，输出时自动按 `推流组 → 央视 → 卫视 → 地方 → 港澳台/国际 → 其他` 排序，同档保持原顺序 |
| 📢 推流置顶 | `PROMO_LIST` 节目固定排在最前（可用环境变量一键关闭） |
| 🧹 垃圾过滤 | `SPAM_KEYWORDS` 黑名单过滤广告 / 加群 / 公告类频道 |
| 📦 多格式输出 | M3U / TXT / JSON（类苹果 CMS：首页 / 分类 / 详情），全开放 CORS |
| 🔧 环境变量覆盖 | `SOURCE_URLS` / `ENABLE_PROMO` / `FALLBACK_LOGO_BASE` 可在 Dashboard 动态覆盖 |

### 路由一览

| 路径 | 说明 |
|------|------|
| `GET /` | 首页 JSON（分类 + 每类前 5 条） |
| `GET /?ac=list&t=分组名&pg=1` | 分类分页列表（`limit` 可改每页条数） |
| `GET /?ac=detail&ids=ch_0,ch_1` | 频道详情 |
| `GET /m3u`（或 `/live.m3u`） | M3U 播放列表，VLC / IPTV 播放器直开 |
| `GET /txt`（或 `/live.txt`） | TXT 频道列表 |

---

## 📁 文件结构

| 文件 | 说明 |
|------|------|
| `worker.js` | **生产代码**（已填好直播源、推流节目，可直接部署） |
| `worker.template.js` | **模板文件**（配置区留空带注释，二改 / 二次部署用） |
| `wrangler.toml` | Cloudflare Worker 部署配置（KV 自动 provisioning） |

---

## 📝 配置

只需修改 `worker.js` 顶部【用户配置区】：

```javascript
// 直播源（format 可省略，按内容自动判断）
const SOURCE_URLS = [
    { url: "https://example.com/live1.m3u", format: "m3u" },
    { url: "https://example.com/live2.txt",  format: "txt" },
];

// 推流节目（置顶；group 相同的组会被钉在最前面）
const PROMO_LIST = [
    { title: "宣传片", url: "https://.../a.mp4", pic: "https://.../a.jpg",
      group: "我的推流", from: "线路A", remarks: "置顶引流" },
];

// 垃圾关键词：标题/分组名命中即丢弃
const SPAM_KEYWORDS = ["广告", "加群", "公众号"];
```

**环境变量**（Dashboard → Settings → Variables，优先级高于硬编码）：

| 变量名 | 说明 |
|--------|------|
| `SOURCE_URLS` | JSON 字符串，覆盖直播源，如 `[{"url":"https://...m3u"}]` |
| `ENABLE_PROMO` | 设为 `"false"` 关闭推流注入（默认开启） |
| `FALLBACK_LOGO_BASE` | 自定义台标兜底域名（缺台标的频道按频道名拼台标） |

---

## 🔧 部署

三种方式任选其一。`wrangler.toml` 已配置 KV 自动创建（binding 名 `KV`），一般无需手动建命名空间。

**方式一 · Git 集成（推荐：push 即自动部署）**

1. Dashboard → Workers & Pages → Create → **Workers** → **Connect to Git**
2. 选择 GitHub 仓库 `lml1971/mgcftvjh`、分支 `main`，构建/部署配置保持默认（入口 `worker.js`）
3. 保存后，每次向 `main` 推送代码都会自动重新部署；KV 由 `wrangler.toml` 自动 provisioning
4. （可选）Settings → Variables and Secrets 添加 `SOURCE_URLS` / `ENABLE_PROMO` / `FALLBACK_LOGO_BASE`

**方式二 · Dashboard 手动粘贴**

1. Workers & Pages → Create Worker → 起名 → Deploy
2. **Edit code** → 粘贴 `worker.js` 全部内容 → Deploy
3. Settings → Bindings → 添加 **KV Namespace**，变量名填 `KV`
   （不绑定 KV 也能正常运行，只是每次请求都回源抓取、不缓存）

**方式三 · Wrangler CLI**

```bash
npm install -g wrangler
wrangler login
wrangler deploy          # 首次部署会自动创建 KV 命名空间
```

**验证部署**：访问 `https://你的worker名.workers.dev/txt`，看到以 `茂哥TV,#genre#` 开头、随后是央视/卫视分组的频道列表即成功；把该 URL 填入 TVBox / IPTV 播放器的直播源配置即可（`/m3u` 路径同理）。

---

## ⚠️ 注意事项

1. **KV 绑定**：变量名必须为 `KV`；不绑定也能跑，只是每次请求都回源抓取。
2. **免费额度**：Workers 每天 10 万次请求；KV 每天 10 万次读 / 1,000 次写（缓存命中只读 KV）。
3. **超时**：单源抓取超时 15 秒，单源失败只打日志、不影响其他源。
4. **推流合规**：`PROMO_LIST` 内容请确保版权合规。

---

<div align="center">

**📄 License · MIT** · 有用就点个 ⭐

</div>
