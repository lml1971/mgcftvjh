# 📺 茂哥TV —— 直播源聚合与分发全家桶

> 一个集 **直播（推流 + 电视台）**、**点播接口**、**多源聚合** 于一体的电视直播源项目。
> 既有 **本仓库工作流（Python 离线聚合）** 产出的直播接口，也有可一键部署到 **Cloudflare Workers（CF）** 的在线接口与配套模板。

---

## ✨ 项目特性

- 🎬 **直播 + 推流**：置顶引流节目（宣传片 / 短视频）与电视台直播源合二为一
- 📡 **多源聚合**：自动抓取多个远程直播源（M3U / TXT 格式），合并去杂后统一输出
- 🎞️ **点播接口**：TVBox 兼容的 JSON API（`class` / `list` / `detail`），可直接对接播放器
- 🧠 **智能分组**：按关键词自动归类央视 / 卫视 / 4K8K / 影视轮播 / 体育 / 动漫 / 港澳台等
- 💾 **KV 缓存**：Cloudflare KV 缓存 10 分钟，避免每次冷启动重新抓取
- 🧹 **广告过滤**：内置垃圾关键词黑名单，自动剔除加群、推广、防失联等无效频道
- 📦 **三格式输出**：JSON（TVBox）、M3U（VLC/PotPlayer）、TXT（传统直播源）
- ⚡ **有效性探测**：Python 工作流对源地址做 HEAD/GET 探测，剔除失效源
- 🔀 **地址去重**：同一 URL 按代表性频道名去重，分组结果稳定
- 🚀 **CF 模板**：提供干净模板 `worker.template.js`，配置项占位，从零部署零门槛

---

## 📁 文件结构

```
.
├── worker.js            # CF Worker 主代码（已填入示例直播源）
├── worker.template.js   # CF Worker 干净模板（配置项占位，供快速新建）
├── wrangler.toml        # Wrangler CLI 部署配置
├── merge_tv.py          # 本仓库工作流：Python 离线聚合脚本（探测/去重/分组）
├── test_merge.py        # 分组逻辑单元测试（push 前跑一遍）
├── check.sh             # 本地快速检查：语法 + 测试（push 前钩子）
├── requirements.txt     # Python 依赖（aiohttp）
├── maoge.json           # 茂哥仓库源配置（TVBox 多仓格式）
├── maoge.txt            # 茂哥直播源 URL 列表
├── tv.txt               # 聚合输出：直播源（TXT 格式，含 茂哥TV/央视/卫视/地方台）
├── tv1.txt              # 聚合输出：精简直播源（同上，精简版）
├── .github/
│   └── workflows/
│       ├── merge-tv.yml     # GitHub Actions：定时/推送触发聚合，自动提交 tv.txt
│       └── dependabot.yml   # 依赖自动更新（pip + github-actions，每周一）
├── validate_workflows.py# 本地校验 workflow YAML 语法 + 必填字段
└── README.md            # 本文档
```

---

## 🏗️ 整体架构

```
                        ┌──────────────────────────────────────┐
                        │          茂哥TV 聚合体系              │
                        └──────────────┬───────────────────────┘
                                       │
           ┌───────────────────────────┼───────────────────────────┐
           │                           │                           │
    ┌──────┴──────┐            ┌──────┴──────┐            ┌──────┴──────┐
    │ 直播（推流） │            │ 直播（电视台）│            │  点播接口   │
    │ PROMO_LIST  │            │ 多源聚合抓取  │            │ TVBox JSON  │
    │ 置顶引流MP4 │            │ M3U / TXT    │            │ class/list/ │
    │             │            │ + 探测去重    │            │ detail      │
    └─────────────┘            └──────┬──────┘            └──────┬──────┘
                                      │                           │
                       ┌──────────────┼──────────────┐            │
                       │              │              │            │
                ┌──────┴──────┐ ┌────┴────┐   ┌─────┴─────┐      │
                │ 工作流聚合  │ │ CF Worker│   │ 茂哥仓库源 │      │
                │ merge_tv.py │ │ worker.js│   │ maoge.json│      │
                │ Python 离线 │ │ + KV缓存 │   │ maoge.txt │      │
                └─────────────┘ └──────────┘   └───────────┘      │
                       │              │                           │
                       ▼              ▼                           ▼
                    tv.txt        在线 API                  播放器可直接用
                    (TXT/M3U)    (/m3u /txt /?)             TVBox/影音猫
```

---

## 🔌 接口用法

部署后将地址记为 `BASE`（本地开发为 `http://localhost:8787`，CF 部署后为 `https://your-worker.xxx.workers.dev`）。

### 📺 直播接口

#### 1. 首页 —— 全部分组 + 引流内容（JSON）

```
GET /
```

返回 TVBox 兼容结构：`class`（分组列表）+ `list`（引流节目 + 每组前 5 个频道）。

#### 2. M3U 播放列表

```
GET /m3u
GET /live.m3u
```

标准 M3U 格式，可直接粘贴到 **VLC / PotPlayer / TVBox** 使用。

#### 3. TXT 直播源

```
GET /txt
GET /live.txt
```

`频道名,URL` 格式的传统直播源文本，对应 `tv.txt` 的结构。

### 🎞️ 点播接口（TVBox 兼容）

#### 分组列表 —— 按分组分页

```
GET /?ac=list&t=央视频道&pg=1&limit=20
```

| 参数 | 说明 | 默认值 |
|---|---|---|
| `t` | 分组名称（如 `央视频道`、`卫视频道`） | 必填 |
| `pg` | 页码 | `1` |
| `limit` | 每页条数（最大 500） | `20` |

#### 频道详情

```
GET /?ac=detail&ids=ch_0,ch_1,ch_2
```

### 📡 茂哥仓库源（TVBox 多仓）

`maoge.json` 采用 TVBox 多仓格式，`storeHouse` 下挂载多个仓库源；`maoge.txt` 则是直播源 URL 列表。可直接作为 TVBox 的「多仓地址」或「直播源地址」使用。

---

## 🚀 部署指南

### 方式一：Cloudflare Worker（推荐 · 在线接口）

#### 1. 安装 Wrangler

```bash
npm install -g wrangler
wrangler login
```

#### 2. 基于模板创建 `worker.js`

仓库同时提供：
- **`worker.template.js`**（干净模板）：所有配置项均为空占位，仅修改【用户配置区】即可
- **`worker.js`**（示例配置）：已填入实际直播源

```bash
# 从零配置：复制模板
cp worker.template.js worker.js
# 然后编辑 worker.js，填入 SOURCE_URLS / PROMO_LIST 等
```

> 💡 模板与 `worker.js` 的核心引擎完全一致，区别仅在于模板把配置留空、以注释标注。

#### 3. 部署（KV 自动创建）

`wrangler.toml` 已配置为 **自动 provisioning 模式**（`[[kv_namespaces]]` 只写 `binding = "KV"`，无硬编码 `id`），部署时自动以 Worker 名作为前缀创建 KV 命名空间：

```bash
wrangler deploy
```

成功后输出：
```
✅  Deployment complete!
🔗  https://live-aggregator.your-subdomain.workers.dev
```

#### 4. 本地开发

```bash
wrangler dev
```

本地自动创建 KV 并持久化到磁盘，方便调试。

---

### 方式二：本仓库工作流（Python 离线聚合）

适合 **CI/CD 定时产出 `tv.txt`**，或本地批量整理直播源。

#### 1. 安装依赖

```bash
pip install -r requirements.txt
```

#### 2. 直接运行

```bash
python merge_tv.py
```

流程：抓取 `SOURCES` → 解析 M3U/TXT → 异步探测有效性 → 按地址去重 → 智能分组 → 打乱 → 写出 `tv.txt`。

#### 3. Push 前检查

```bash
bash check.sh
```

依次执行：Python 语法检查 → 运行 `test_merge.py` 分类逻辑测试。

#### 常用环境变量

| 变量 | 示例 | 说明 |
|---|---|---|
| `TV_SOURCES` | 换行分隔的源 URL | 覆盖直播源列表 |
| `TV_OUT` | `tv.txt` | 输出文件路径 |
| `TV_PROBE_TIMEOUT` | `6` | 单地址探测超时（秒） |
| `TV_CONCURRENCY` | `50` | 探测并发上限 |
| `TV_SHUFFLE` | `1` | 是否打乱顺序（`0` 保持去重后稳定顺序） |

---

### 方式三：Dashboard + Git 集成

1. **Workers & Pages** → **Create application** → **Connect to Git**，选择本仓库
2. ⚠️ Dashboard 中 Worker 名字必须与 `wrangler.toml` 的 `name` 完全一致（即 `live-aggregator`）
3. 构建系统自动 provision KV 命名空间，资源创建后 ID 仅在 Dashboard 显示

如需手动绑定 KV：Worker → **Settings** → **Variables** → **KV Namespace Bindings** → 变量名填 `KV`。

### 方式四：GitHub Actions CI（自动化 · 推荐与工作流搭配）

仓库已内置 `.github/workflows/`，**方式二「Python 工作流」** 通过 CI 实现全自动：定时聚合 + 产物回写，无需本地手动跑。

```
.github/workflows/
├── merge-tv.yml     # 主工作流：校验 → 聚合 → 提交 tv.txt
└── dependabot.yml   # 依赖自动更新（每周一）
```

**`merge-tv.yml` 触发时机与流程：**

| 阶段 | 内容 |
|---|---|
| **触发** | ① `push`/`merge` 到 `main` ② 定时（北京时间每天 06:00，`cron: "0 22 * * *"` UTC）③ `workflow_dispatch` 手动触发 |
| **① 校验** | `bash check.sh`（语法 + 33 项断言分类测试） |
| **② 聚合** | `python merge_tv.py`，环境变量 `TV_PROBE_TIMEOUT` / `TV_CONCURRENCY` / `TV_SHUFFLE` 与脚本 `os.environ.get(...)` 一一对应 |
| **③ 回写** | 若 `tv.txt` / `tv1.txt` / `maoge.json` 有变化，自动 `git commit -m "chore: auto-update tv sources [skip ci]"` 并 push（`[skip ci]` 避免无限循环） |

**本地校验 workflow 文件本身**（YAML 语法 + Actions 必填字段）：

```bash
python validate_workflows.py
# ==> 校验 2 个 workflow 文件
#   [yaml-ok] .github/workflows/merge-tv.yml
#   [fields-ok] .github/workflows/merge-tv.yml
#   [dependabot-ok] .github/workflows/dependabot.yml
# ==> 全部通过 ✅
```

> 💡 **权限说明**：工作流需要 `permissions: contents: write` 才能回写提交；Fork 的 PR 默认无此权限，仅 `push` 到默认分支时才会触发产物回写。`dependabot.yml` 用 `version: 2` 格式，负责 `pip` 与 `github-actions` 两类依赖每周自动升级。

---

## ⚙️ 配置说明

> 配置均位于 `worker.js`（或 `worker.template.js`）的【用户配置区】。

### 数据源 `SOURCE_URLS`

```js
const SOURCE_URLS = [
    { url: "https://example.com/live1.m3u", format: "m3u" },
    { url: "https://example.com/live2.txt", format: "txt" },
    { url: "https://example.com/auto-detect" }, // 不指定 format 自动判断
];
```

- `format` 可选 `m3u` / `txt`，不填按内容自动判断
- 支持无限扩展，直接往数组里加

### 引流节目 `PROMO_LIST`

每个引流项：

| 字段 | 说明 |
|---|---|
| `title` | 显示标题 |
| `url` | 视频直链（MP4 等） |
| `pic` | 封面图 URL |
| `group` | 所属分组名（置顶位置） |
| `from` | 播放来源标识 |
| `remarks` | 备注文字 |

### 垃圾过滤 `SPAM_KEYWORDS`

频道标题或分组名包含这些关键词时自动剔除（注意事项、加群、防失联、广告位等）。

### Python 工作流智能分组规则

`merge_tv.py` 分组优先级（靠前者优先）：

```
茂哥TV（原样保留）→ 中央频道 → 4K8K频道 → 卫视频道 → 赛事回放
→ 数字频道 → 动漫卡通 → 电影轮播 → 电视剧轮播 → 综艺轮播
→ 港澳台频道 → 地方频道（兜底）
```

关键优先级设计：
- **中央频道 > 4K8K**：CCTV-4K/CCTV-8K 归「中央频道」
- **4K8K > 卫视频道**：湖南卫视4K、东方卫视4K 归「4K8K频道」
- **赛事回放 > 数字频道**：避免「网球」被数字频道抢走
- **动漫卡通 > 中央频道**：CCTV-少儿动画、央视少儿 归「动漫卡通」
- 电影/电视剧/综艺 轮播按主题拆分，兜底「轮播」归电视剧轮播

#### 中央频道排序规则（排序键只认「主台号」）

「中央频道」组在输出时按台号 **1 → 17 单调递增**，排序键 `cctv_sort_key` **只提取 CCTV 字母前缀后紧跟的主台号数字**，刻意忽略清晰度后缀与频道名里的杂数字，避免误排序：

| 频道名 | 提取到的主台号 | 说明 |
|---|---|---|
| `CCTV1综合` / `CCTV-13新闻` / `CCTV5⁺体育赛事` | `1` / `13` / `5` | 标准前缀后紧跟的数字 |
| `CCTV-4K` / `CCTV-8K` | 无 → 排末尾 | `4K/8K` 是清晰度，**不**当作台号 |
| `CCTV-高尔夫网球` | 无 → 排末尾 | 频道名里的杂数字被忽略 |
| `CGTN-新闻` / `CETV-中国教育` | 无 → 排末尾 | 无标准 CCTV 主台号，字典序稳定排列 |

排序结果形如：`CCTV1综合 → CCTV2财经 → … → CCTV8电视剧 → CCTV9纪录 → … → CCTV13新闻 → … → CCTV17纪录`，其后才是 `CCTV-4K`、`CGTN-新闻`、`CCTV-高尔夫网球` 等无主台号频道（末尾按字典序稳定排列）。

> 💡 其余分组（`SHUFFLE=1` 时）默认随机打乱以保证每次输出多样性；如需稳定顺序可设 `TV_SHUFFLE=0`。`test_merge.py` 默认 `SHUFFLE_MODE=False`，专注验证分组正确性，不受打乱干扰。

### KV 缓存参数

| 常量 | 值 | 说明 |
|---|---|---|
| `KV_CACHE_KEY` | `all_channels_v1` | KV 存储 key |
| `KV_TTL_SECONDS` | `600`（10 分钟） | KV 过期时间 |
| `CACHE_TTL_MS` | `10 * 60 * 1000` | 内存层过期判断 |
| `FETCH_TIMEOUT_MS` | `15 * 1000` | 单源抓取超时 |

### 环境变量（可选覆盖 · 推荐生产环境使用）

在 Cloudflare Dashboard → Worker → **Settings → Environment Variables** 设置，优先级高于硬编码：

| 变量名 | 示例值 | 说明 |
|---|---|---|
| `SOURCE_URLS` | `[{"url":"https://...m3u"}]` | JSON 字符串，覆盖直播源列表 |
| `ENABLE_PROMO` | `true` / `false` | 是否注入推流节目，默认 `true` |
| `FALLBACK_LOGO_BASE` | `https://your-logo-domain` | 自定义台标兜底域名 |

```bash
wrangler secret put SOURCE_URLS   # 输入 JSON 字符串
```

---

## 🔧 常见问题排查

| 问题 | 原因 & 解决方案 |
|---|---|
| `The name in your Wrangler configuration file must match...` | Dashboard 中 Worker 名与 `wrangler.toml` 的 `name` 不一致，统一改为 `live-aggregator` |
| `kv_namespaces[0].id: should be a 32-character hex string` | 旧配置写了占位 `id = "..."`，删除该行即可（自动 provisioning） |
| `env.KV is undefined` | `wrangler.toml` 中 `binding` 不是 `KV`，需与代码中 `env.KV` 一致 |
| 频道列表为空 | 检查 `SOURCE_URLS` 地址是否可访问，查看 Worker 日志确认抓取结果 |
| 缓存不刷新 | Dashboard → KV → 删除 `all_channels_v1`，下次请求自动重建 |
| 没有 KV 绑定能跑吗？ | 能，代码已兼容，每次直接抓取源站，仅冷启动慢一些（最多 15 秒超时） |
| Python 测试失败 | 运行 `bash check.sh`，确认 `test_merge.py` 全部断言通过 |

---

## 📝 更新日志

| 版本 | 变更 |
|---|---|
| v1.0 | 初始版本：M3U/TXT 双格式解析、KV 缓存、引流注入、广告过滤、TVBox JSON 接口 |
| v1.1 | 新增 `worker.template.js` 干净模板（配置项占位 + 注释示例），与 `worker.js` 并行维护 |
| v1.2 | 新增 Python 工作流 `merge_tv.py`：异步探测、去重、智能分组、单元测试 `test_merge.py` |
| v1.3 | 修复 `maoge.json` 多余花括号（JSON 非法）；修正中央频道排序键 `cctv_sort_key` 误把 `4K/8K`、频道名杂数字当台号的 bug；`test_merge.py` 对齐主流程排序逻辑；补充本排序规则说明 |
| v1.4 | 补齐 `.github/workflows/` 自动化结构：`merge-tv.yml`（校验→聚合→自动提交 tv.txt，`[skip ci]` 防循环）、`dependabot.yml`（pip + github-actions 每周一升级）；新增 `validate_workflows.py` 本地校验 workflow 语法与必填字段；文件结构树同步更新 |

---

## ⚠️ 免责声明

- 本项目仅供 **学习交流与技术研究**，请勿用于商业用途
- 直播源版权归各电视台及内容提供方所有
- 引流节目（`PROMO_LIST`）请替换为自己拥有版权的视频地址
- 直播源随时可能失效，属正常现象，可替换为可用源

---

## 📄 License

仅供学习交流使用。
