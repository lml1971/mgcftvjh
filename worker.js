// Cloudflare Worker - 直播源聚合 / 引流注入 / 测速去重

const SOURCE_URLS = [
    { url: "https://0701.tv1288.xyz/m3u", format: "m3u" },
    { url: "https://gh-proxy.com/https://raw.githubusercontent.com/taoBox2620/taoBox2620/refs/heads/main/logo1.png" },
    { url: "https://gh-proxy.com/https://raw.githubusercontent.com/kakaxi-1/IPTV/refs/heads/main/iptv.txt", format: "txt" },
];

const PROMO_LIST = [
    { title: "幸福家", url: "https://lmlcyp.ccwu.cc/raw/mp4/1.mp4", pic: "", group: "茂哥TV", from: "线路A", remarks: "置顶引流" },
    { title: "老李卡通", url: "https://lmlcyp.ccwu.cc/raw/mp4/2.mp4", pic: "", group: "茂哥TV", from: "线路A", remarks: "置顶引流" },
    { title: "我们一家", url: "https://lmlcyp.ccwu.cc/raw/mp4/3.mp4", pic: "", group: "茂哥TV", from: "线路A", remarks: "置顶引流" },
    { title: "25年前", url: "https://lmlcyp.ccwu.cc/raw/mp4/VDO_0012.mp4", pic: "", group: "茂哥TV", from: "线路A", remarks: "置顶引流" },
];

const SPAM_KEYWORDS = [
    "注意事项", "加群", "小草口令", "轮播视频", "US", "关注Q群", "交流群", "防失联",
    "防丢关注", "网址", "更多软件", "广告位", "微信公众号", "最新资源",
    "获取资源", "备用地址", "防丢地址", "更新时间", "关于",
];

const REGROUP_RULES = [
    { group: "📺 高清", keywords: ["4K", "8K", "高清"] },
    { group: "📺 央视", keywords: ["CCTV", "央视", "中央", "CGTN"] },
    { group: "📡 卫视", keywords: ["卫视", "湖南", "浙江", "江苏", "东方", "北京", "广东", "深圳", "安徽", "山东", "河南", "河北", "湖北", "江西", "辽宁", "吉林", "黑龙江", "天津", "重庆", "四川", "贵州", "云南", "广西", "福建", "陕西", "甘肃", "青海", "宁夏", "新疆", "西藏", "内蒙古", "海南", "山西", "上海"] },
    { group: "🎬 影视", keywords: ["电影", "电视剧", "影视", "院线", "影院", "纪录片", "动漫", "动画"] },
    { group: "🏆 体育", keywords: ["体育", "足球", "篮球", "NBA", "CBA", "英超", "欧冠", "中超", "网球", "乒乓球", "羽毛球", "UFC"] },
    { group: "📰 新闻", keywords: ["新闻", "资讯", "时事", "财经", "凤凰", "环球"] },
    { group: "🎵 音乐", keywords: ["音乐", "MTV", "演唱会", "K歌"] },
    { group: "👶 少儿", keywords: ["少儿", "儿童", "亲子", "Cartoon"] },
    { group: "🎮 游戏", keywords: ["游戏", "电竞", "LOL", "王者", "GAME"] },
    { group: "🌍 国际", keywords: ["国际", "美国", "英国", "日本", "韩国", "USA", "UK", "Japan", "Korea"] },
    { group: "📻 广播", keywords: ["广播", "电台", "Radio", "FM", "AM"] },
    { group: "🎭 综艺", keywords: ["综艺", "娱乐", "选秀", "脱口秀"] },
    { group: "📚 教育", keywords: ["教育", "学习", "英语", "留学"] },
    { group: "🏥 健康", keywords: ["健康", "养生", "医疗", "健身"] },
    { group: "🛒 购物", keywords: ["购物", "电视购物", "QVC"] },
    { group: "🎬 地方台", keywords: ["地方", "市县", "区县", "乡村"] },
    { group: "📺 港澳台", keywords: ["香港", "澳门", "台湾", "TVB", "台视"] },
];

const DEFAULT_GROUP = "📺 其他频道";

const CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 20;
const MAX_RETURN_LIMIT = 500;
const FALLBACK_LOGO_BASE = "https://epg.112114.xyz/logo";
const FETCH_TIMEOUT_MS = 15 * 1000;
const SPEED_TEST_TIMEOUT_MS = 5000;
const SPEED_TEST_SAMPLE = 2;

const KV_CACHE_KEY = "all_channels_v1";
const KV_TTL_SECONDS = 600;

// ---------- 工具函数 ----------

function isValidHttpUrl(str) {
    if (!str || typeof str !== "string") return false;
    try {
        const u = new URL(str);
        return u.protocol === "http:" || u.protocol === "https:";
    } catch { return false; }
}

function normalizeSource(src) {
    const url = typeof src === "string" ? src : (src && src.url) || "";
    return { url, format: src && src.format, _skip: !isValidHttpUrl(url) };
}

function isSpam(text) {
    return text && SPAM_KEYWORDS.some(kw => text.includes(kw));
}

function extractAttr(line, key) {
    const re = new RegExp(key + '=(?:"([^"]+)"|\'([^\']+)\'|([^,\\s][^,]*?)(?=,\\s*\\w+=|$))');
    const m = line.match(re);
    return m ? (m[1] || m[2] || m[3] || "").trim() : "";
}

function fetchWithTimeout(url, timeoutMs, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function matchGroup(title) {
    if (!title) return DEFAULT_GROUP;
    for (const rule of REGROUP_RULES) {
        for (const kw of rule.keywords) {
            if (title.includes(kw)) return rule.group;
        }
    }
    return DEFAULT_GROUP;
}

// ---------- 频道名称规范化 ----------

// 按优先级从高到低排列的「精确前缀」规则：命中即归入对应分组，不再继续匹配
// 用于处理 "CCTV-4K" 这类应归入「央视」而非「高清」的场景
const EXACT_GROUP_RULES = [
    { group: "📺 央视", test: t => /^CCTV|央视|中央电视|CGTN/i.test(t) },
    { group: "📡 卫视", test: t => /卫视/.test(t) || /(湖南|浙江|江苏|东方|北京|广东|深圳|安徽|山东|河南|河北|湖北|江西|辽宁|吉林|黑龙江|天津|重庆|四川|贵州|云南|广西|福建|陕西|甘肃|青海|宁夏|新疆|西藏|内蒙古|海南|山西|上海)台?$/.test(t) },
];

// 增强版分组：先做精确匹配（高优先级），再走关键词模糊匹配
function matchGroupV2(title) {
    if (!title) return DEFAULT_GROUP;
    const norm = normalizeChannelName(title);
    const candidates = [norm, title];  // 同时用规范名和原名匹配
    for (const t of candidates) {
        for (const rule of EXACT_GROUP_RULES) {
            if (rule.test(t)) return rule.group;
        }
    }
    return matchGroup(title);  // 回退到原有规则
}

// 名称清洗：去除噪音、统一书写格式
function normalizeChannelName(rawTitle) {
    if (!rawTitle) return "未知频道";
    let name = rawTitle.trim();

    // 1. 去除常见分辨率 / 画质标注（连同前面的连字符 / 分隔一起替换为单个空格）
    name = name.replace(/(?:^|\s|[-·])+\s*\b(4K|8K|2160P|1080[PI]|720[PI]|480[PI]|FHD|UHD|HD)\b\s*/gi, " ");
    name = name.replace(/\s*[（(](?:4K|8K|HD|高清|超清|蓝光|标清|原画)[)）]/gi, "");

    // 2. 去除来源 / 线路标记（尾部 -线路1、[源A] 等）
    name = name.replace(/\s*[-－—]\s*(?:线路|源|备用|主用|首选|直播|官方|测试|临时|新)\d*\s*$/gi, "");
    name = name.replace(/\s*[\[【][^\]】]*?(?:线路|源|备用|L\d+)[^\]】]*?[\]】]/gi, "");

    // 3. 去除尾部方括号 / 圆括号整体（常见噪音）
    name = name.replace(/\s*[\[【].*?[\]】]/g, "");
    name = name.replace(/\s*[（(][^)）]*?[)）]/g, "");

    // 4. CCTV 系列统一：CCTV-1 / CCTV 1 / CCTV1 → CCTV1
    name = name.replace(/\bCCTV\s*[-·]?\s*(\d+|[A-Za-z])\b/gi, "CCTV$1");

    // 5. 卫视统一：去除多余分隔，确保「XX卫视」连续
    name = name.replace(/^(.+?)\s*(卫视)\s*$/, "$1$2");

    // 6. 去除首尾 / 中间多余标点与空白
    name = name.replace(/^[·•·\-\s]+|[·•·\-\s]+$/g, "");
    name = name.replace(/\s{2,}/g, " ");

    return name.trim() || rawTitle.trim();
}

// 生成去重 key：基于规范化名称（小写），提高跨源合并率
function dedupKey(title) {
    return normalizeChannelName(title).toLowerCase();
}

// ---------- 解析器 ----------

function parseM3U(text) {
    const list = [];
    let current = null;
    for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (!line) continue;
        if (line.startsWith('#EXTINF')) {
            const group = extractAttr(line, 'group-title') || "默认频道";
            let logo = extractAttr(line, 'tvg-logo');
            const commaIdx = line.lastIndexOf(',');
            const title = commaIdx > -1 ? line.substring(commaIdx + 1).trim() : "未知频道";
            if (!logo) logo = `${FALLBACK_LOGO_BASE}/${encodeURIComponent(title)}.png`;
            current = { group, logo, title };
        } else if (line.startsWith('#')) {
            continue;
        } else if (current) {
            const urls = line.split(',').map(s => s.trim()).filter(Boolean);
            if (urls.length > 0) {
                const channel = { ...current, url: urls[0], urls };
                if (!isSpam(channel.group) && !isSpam(channel.title)) list.push(channel);
            }
            current = null;
        }
    }
    return list;
}

function parseTXT(text) {
    const list = [];
    let currentGroup = "默认频道";
    for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        if (/,#genre#\s*$/i.test(line)) {
            currentGroup = line.split(',')[0].trim() || "默认频道";
            continue;
        }
        const commaIdx = line.indexOf(',');
        if (commaIdx < 0) continue;
        const title = line.substring(0, commaIdx).trim();
        let urlPart = line.substring(commaIdx + 1).trim();
        if (!title || !urlPart) continue;
        const hashIdx = urlPart.indexOf('#');
        if (hashIdx !== -1 && urlPart.substring(hashIdx + 1).trim()) {
            urlPart = urlPart.substring(0, hashIdx).trim();
        }
        if (!urlPart || isSpam(currentGroup) || isSpam(title)) continue;
        list.push({
            group: currentGroup,
            title,
            logo: `${FALLBACK_LOGO_BASE}/${encodeURIComponent(title)}.png`,
            url: urlPart,
            urls: [urlPart],
        });
    }
    return list;
}

function parseSource(text, formatHint) {
    const isM3U = formatHint === "m3u" ? true : formatHint === "txt" ? false : text.includes('#EXTM3U') || text.includes('#EXTINF');
    return isM3U ? parseM3U(text) : parseTXT(text);
}

// ---------- 抓取 ----------

async function fetchOneSource(srcConfig) {
    const { url, format, _skip } = normalizeSource(srcConfig);
    if (_skip) {
        console.error(`[fetchOneSource] 跳过无效 URL: ${url || "(empty)"}`);
        return { source: url || "(invalid)", channels: [], error: "Invalid URL" };
    }
    try {
        const resp = await fetchWithTimeout(url, FETCH_TIMEOUT_MS, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Accept": "*/*" },
        });
        if (!resp.ok) {
            console.error(`[fetchOneSource] HTTP ${resp.status} for ${url}`);
            return { source: url, channels: [], error: `HTTP ${resp.status}` };
        }
        const text = await resp.text();
        if (!text || !text.trim()) {
            console.error(`[fetchOneSource] Empty body from ${url}`);
            return { source: url, channels: [], error: "Empty body" };
        }
        const channels = parseSource(text, format);
        console.log(`[fetchOneSource] ${url} -> ${channels.length} channels`);
        return { source: url, channels, error: null };
    } catch (err) {
        console.error(`[fetchOneSource] ${url} -> ${err.message}`);
        return { source: url, channels: [], error: err.message };
    }
}

// ---------- 测速去重 ----------

// 对单个 URL 做 HEAD 探测，返回响应耗时（ms），超时/失败返回 Infinity
async function probeUrl(url) {
    const start = Date.now();
    try {
        const resp = await fetchWithTimeout(url, SPEED_TEST_TIMEOUT_MS, { method: "HEAD" });
        const cost = Date.now() - start;
        if (resp.ok) return cost;
        // HEAD 不支持时降级为 GET 探测前几个字节
        if (resp.status === 405 || resp.status === 404) return cost;
        return Infinity;
    } catch {
        return Infinity;
    }
}

// 对一个频道的多个 URL 做并发测速，返回按延迟升序排列的结果
async function speedTest(urls) {
    const samples = urls.slice(0, SPEED_TEST_SAMPLE);
    const results = await Promise.all(samples.map(async u => ({ url: u, time: await probeUrl(u) })));
    results.sort((a, b) => a.time - b.time);
    return results;
}

// 合并去重：规范化名称相同的频道合并 urls，测速后选最优
async function mergeAndDedup(channels) {
    const map = new Map();
    for (const ch of channels) {
        const key = dedupKey(ch.title);  // 基于规范化名称去重
        if (!map.has(key)) {
            map.set(key, { ...ch, title: normalizeChannelName(ch.title), urls: [...(ch.urls || [ch.url])] });
        } else {
            const exist = map.get(key);
            const newUrls = ch.urls || [ch.url];
            for (const u of newUrls) {
                if (!exist.urls.includes(u)) exist.urls.push(u);
            }
            // 保留更丰富的 group（非默认优先）
            if (exist.group === "默认频道" && ch.group !== "默认频道") {
                exist.group = ch.group;
                exist.orig_group = ch.group;
            }
            // 保留更规范的名称（无方括号 / 更长 / 原名更干净优先）
            const candidate = normalizeChannelName(ch.title);
            if (candidate && !/[\[【]/.test(candidate) && (/[\[【]/.test(exist.title) || candidate.length > exist.title.length)) {
                exist.title = candidate;
            }
        }
    }

    // 对每个频道做测速排序，选最快 URL 作为主 url
    const merged = Array.from(map.values());
    const speedResults = await Promise.all(merged.map(ch => speedTest(ch.urls)));

    return merged.map((ch, i) => {
        const ranked = speedResults[i];
        const best = ranked.find(r => r.time < Infinity) || ranked[0];
        return {
            ...ch,
            url: best.url,
            urls: ranked.filter(r => r.time < Infinity).map(r => r.url),
            _latency: best.time,
        };
    });
}

// ---------- 缓存读写 ----------

function resolveSourceUrls(env) {
    if (env && env.SOURCE_URLS) {
        try {
            const parsed = JSON.parse(env.SOURCE_URLS);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch (e) {
            console.error(`[resolveSourceUrls] 环境变量解析失败: ${e.message}`);
        }
    }
    return SOURCE_URLS;
}

function resolveEnablePromo(env) {
    if (env && typeof env.ENABLE_PROMO === "string") return env.ENABLE_PROMO !== "false";
    return true;
}

async function loadAllChannels(env, ctx) {
    const sources = resolveSourceUrls(env);
    const enablePromo = resolveEnablePromo(env);

    if (env && env.KV) {
        try {
            const cached = await env.KV.get(KV_CACHE_KEY, { type: "json" });
            if (cached && cached.expireAt > Date.now()) {
                console.log(`[loadAllChannels] KV cache HIT, ${cached.channels.length} channels`);
                return cached.channels;
            }
            console.log(`[loadAllChannels] KV cache ${cached ? "EXPIRED" : "MISS"}`);
        } catch (e) {
            console.error(`[loadAllChannels] KV read error: ${e.message}`);
        }
    } else {
        console.log(`[loadAllChannels] No KV binding, fetching directly`);
    }

    const results = await Promise.all(sources.map(u => fetchOneSource(u)));
    const successCount = results.filter(r => r.error === null).length;
    const allChannels = results.flatMap(r => r.channels);
    console.log(`[loadAllChannels] ${successCount}/${results.length} sources OK, ${allChannels.length} raw channels`);

    // 重新分组（使用增强版分组规则，避免 4K/CCTV 等被「高清」先抢走）
    const regrouped = allChannels.map(ch => ({ ...ch, orig_group: ch.group, group: matchGroupV2(ch.title) }));

    // 测速去重
    console.log(`[loadAllChannels] 开始测速去重 (${regrouped.length} channels)...`);
    const deduped = await mergeAndDedup(regrouped);
    console.log(`[loadAllChannels] 去重后 ${deduped.length} channels`);

    const writeKV = async () => {
        if (!env || !env.KV) return;
        try {
            await env.KV.put(KV_CACHE_KEY, JSON.stringify({ channels: deduped, expireAt: Date.now() + CACHE_TTL_MS }), {
                expirationTtl: KV_TTL_SECONDS,
            });
            console.log(`[loadAllChannels] KV cache written, ${deduped.length} channels`);
        } catch (e) {
            console.error(`[loadAllChannels] KV write error: ${e.message}`);
        }
    };

    if (ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(writeKV());
    } else {
        await writeKV();
    }

    return deduped;
}

// ---------- Vod 构造 ----------

function buildPromoVods() {
    return PROMO_LIST.map((p, idx) => ({
        vod_id: `live_promo_${idx}`,
        vod_name: p.title,
        vod_pic: p.pic || "",
        vod_remarks: p.remarks || "引流",
        vod_play_from: p.from || "推广线路",
        vod_play_url: `${p.title}$${p.url}`,
        type_name: p.group || "推流信息",
    }));
}

function channelToVod(ch, idx) {
    const playUrl = ch.urls && ch.urls.length > 1 ? `${ch.title}$${ch.urls.join('#')}` : `${ch.title}$${ch.url}`;
    return {
        vod_id: `ch_${idx}`,
        vod_name: ch.title,
        vod_pic: ch.logo,
        vod_remarks: ch._latency != null ? `${Math.round(ch._latency)}ms` : "直播",
        vod_play_from: ch.group,
        vod_play_url: playUrl,
        type_name: ch.group,
    };
}

// ---------- 响应构造 ----------

function buildHomeResponse(channels) {
    const groupMap = new Map();
    channels.forEach((ch, i) => {
        if (!groupMap.has(ch.group)) groupMap.set(ch.group, []);
        groupMap.get(ch.group).push({ ch, i });
    });

    const promoGroups = Array.from(new Set(PROMO_LIST.map(p => p.group || "推流信息")));
    const otherGroups = Array.from(groupMap.keys()).filter(g => !promoGroups.includes(g)).sort();
    const allGroups = [...promoGroups, ...otherGroups];

    const class_list = allGroups.map(g => ({ type_id: g, type_name: g }));
    const promoVods = buildPromoVods();
    const groupVods = [];
    for (const g of otherGroups) {
        const items = (groupMap.get(g) || []).slice(0, 5);
        for (const { ch, i } of items) groupVods.push(channelToVod(ch, i));
    }

    return { class: class_list, list: [...promoVods, ...groupVods] };
}

function buildCategoryResponse(channels, typeId, page, pageSize) {
    if (!typeId) {
        return { page: 1, pagecount: 1, limit: pageSize, total: 0, list: [], notice: "typeId (参数 t) 不能为空" };
    }

    const promoGroups = new Set(PROMO_LIST.map(p => p.group || "推流信息"));
    const list = [];
    if (promoGroups.has(typeId)) {
        list.push(...buildPromoVods().filter(v => v.type_name === typeId));
    }
    channels.forEach((ch, i) => {
        if (ch.group === typeId) list.push(channelToVod(ch, i));
    });

    const total = Math.min(list.length, MAX_RETURN_LIMIT);
    const totalPage = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPage);
    const start = (safePage - 1) * pageSize;

    return { page: safePage, pagecount: totalPage, limit: pageSize, total, list: list.slice(start, start + pageSize) };
}

function buildDetailResponse(channels, ids) {
    const idSet = new Set(ids);
    const list = [];
    for (const v of buildPromoVods()) {
        if (idSet.has(v.vod_id)) list.push(v);
    }
    channels.forEach((ch, i) => {
        const vodId = `ch_${i}`;
        if (idSet.has(vodId)) list.push(channelToVod(ch, i));
    });
    return { list };
}

function buildM3U(channels) {
    const lines = ['#EXTM3U'];
    for (const p of PROMO_LIST) {
        lines.push(`#EXTINF:-1 tvg-logo="${p.pic || ''}" group-title="${p.group || '推流信息'}",${p.title}`);
        lines.push(p.url);
    }
    for (const ch of channels) {
        lines.push(`#EXTINF:-1 tvg-logo="${ch.logo}" group-title="${ch.group}",${ch.title}`);
        lines.push(ch.urls && ch.urls.length > 1 ? ch.urls.join(',') : ch.url);
    }
    return lines.join('\n');
}

function buildTXT(channels) {
    const groupMap = new Map();
    for (const p of PROMO_LIST) {
        const g = p.group || "推流信息";
        if (!groupMap.has(g)) groupMap.set(g, []);
        groupMap.get(g).push({ title: p.title, url: p.url });
    }
    for (const ch of channels) {
        if (!groupMap.has(ch.group)) groupMap.set(ch.group, []);
        const u = ch.urls && ch.urls.length > 0 ? ch.urls[0] : ch.url;
        groupMap.get(ch.group).push({ title: ch.title, url: u });
    }
    const promoGroups = new Set(PROMO_LIST.map(p => p.group || "推流信息"));
    const groupOrder = [...Array.from(promoGroups), ...Array.from(groupMap.keys()).filter(g => !promoGroups.has(g)).sort()];

    const out = [];
    for (const group of groupOrder) {
        const items = groupMap.get(group) || [];
        if (items.length === 0) continue;
        out.push(`${group},#genre#`);
        for (const it of items) out.push(`${it.title},${it.url}`);
        out.push('');
    }
    return out.join('\n');
}

// ---------- 主入口 ----------

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
};

function jsonResponse(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
    });
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        const params = url.searchParams;

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            const channels = await loadAllChannels(env, ctx);

            if (path === '/m3u' || path === '/live.m3u') {
                return new Response(buildM3U(channels), {
                    headers: { ...corsHeaders, "Content-Type": "audio/x-mpegurl; charset=utf-8" },
                });
            }

            if (path === '/txt' || path === '/live.txt') {
                return new Response(buildTXT(channels), {
                    headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
                });
            }

            const ac = params.get('ac');

            if (ac === 'detail') {
                const ids = (params.get('ids') || '').split(',').filter(Boolean);
                return jsonResponse(buildDetailResponse(channels, ids));
            }

            if (ac === 'list' || params.has('t')) {
                const typeId = params.get('t') || '';
                const page = parseInt(params.get('pg') || '1', 10) || 1;
                const size = parseInt(params.get('limit') || String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE;
                return jsonResponse(buildCategoryResponse(channels, typeId, page, size));
            }

            return jsonResponse(buildHomeResponse(channels));

        } catch (err) {
            console.error(`[fetch] Unhandled error: ${err.message}`);
            return jsonResponse({ error: true, message: err.message || String(err) }, 500);
        }
    },
};
