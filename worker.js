/* ============================================================
 * Cloudflare Worker - 直播源聚合 / 引流注入
 * ------------------------------------------------------------
 * 能力：多源抓取（m3u/txt 自动识别）· KV 缓存 · 沿用上游分组
 *       分组排序（央视→卫视→地方→港澳台→其他）· 推流置顶 · 垃圾过滤
 *       · M3U/TXT/JSON 三种输出
 * 配置：仅改下方【用户配置区】；也可用环境变量覆盖（见 resolveConfig）
 * ============================================================ */

/* ===== 用户配置区（按需修改）========================================== */

/**
 * 直播源列表
 *   url     : 直播源地址（http/https），支持 m3u / txt
 *   format? : 可选，"m3u" | "txt"；不填则按内容自动判断
 */
const SOURCE_URLS = [
    { url: "https://0701.tv1288.xyz/m3u", format: "m3u" },
    { url: "https://gh-proxy.com/https://raw.githubusercontent.com/kakaxi-1/IPTV/refs/heads/main/iptv.txt", format: "txt" },
    { url: "https://raw.githubusercontent.com/akiralereal/iptv/refs/heads/main/IPTV.m3u", format: "m3u" },
];

/**
 * 引流节目（置顶，排在所有频道前面）
 *   title / url / pic / group / from / remarks
 */
const PROMO_LIST = [
    {
        title: "幸福家",
        url:   "https://lmlcyp.ccwu.cc/raw/mp4/1.mp4",
        pic:   "https://ts1.tc.mm.bing.net/th/id/R-C.44a8fce5f82322ff6047579c70ba87a5?rik=GtFY9WEgT3mvmg&riu=http%3a%2f%2f5b0988e595225.cdn.sohucs.com%2fq_70%2cc_zoom%2cw_640%2fimages%2f20170819%2f31955e56cdbc478e8a9d53b54d92cbf0.jpeg&ehk=kYySxDkRdxi37EML22nDcDWX8ypoyqXbPt6ziempjDg%3d&risl=&pid=ImgRaw&r=0",
        group: "茂哥TV",
        from:  "线路A",
        remarks: "置顶引流",
    },
    {
        title: "老李卡通",
        url:   "https://lmlcyp.ccwu.cc/raw/mp4/2.mp4",
        pic:   "https://ts1.tc.mm.bing.net/th/id/R-C.44a8fce5f82322ff6047579c70ba87a5?rik=GtFY9WEgT3mvmg&riu=http%3a%2f%2f5b0988e595225.cdn.sohucs.com%2fq_70%2cc_zoom%2cw_640%2fimages%2f20170819%2f31955e56cdbc478e8a9d53b54d92cbf0.jpeg&ehk=kYySxDkRdxi37EML22nDcDWX8ypoyqXbPt6ziempjDg%3d&risl=&pid=ImgRaw&r=0",
        group: "茂哥TV",
        from:  "线路A",
        remarks: "置顶引流",
    },
    {
        title: "我们一家",
        url:   "https://lmlcyp.ccwu.cc/raw/mp4/3.mp4",
        pic:   "https://ts1.tc.mm.bing.net/th/id/R-C.44a8fce5f82322ff6047579c70ba87a5?rik=GtFY9WEgT3mvmg&riu=http%3a%2f%2f5b0988e595225.cdn.sohucs.com%2fq_70%2cc_zoom%2cw_640%2fimages%2f20170819%2f31955e56cdbc478e8a9d53b54d92cbf0.jpeg&ehk=kYySxDkRdxi37EML22nDcDWX8ypoyqXbPt6ziempjDg%3d&risl=&pid=ImgRaw&r=0",
        group: "茂哥TV",
        from:  "线路A",
        remarks: "置顶引流",
    },
    {
        title: "25年前",
        url:   "https://lmlcyp.ccwu.cc/raw/mp4/VDO_0012.mp4",
        pic:   "https://ts1.tc.mm.bing.net/th/id/R-C.44a8fce5f82322ff6047579c70ba87a5?rik=GtFY9WEgT3mvmg&riu=http%3a%2f%2f5b0988e595225.cdn.sohucs.com%2fq_70%2cc_zoom%2cw_640%2fimages%2f20170819%2f31955e56cdbc478e8a9d53b54d92cbf0.jpeg&ehk=kYySxDkRdxi37EML22nDcDWX8ypoyqXbPt6ziempjDg%3d&risl=&pid=ImgRaw&r=0",
        group: "茂哥TV",
        from:  "线路A",
        remarks: "置顶引流",
    },
];

/** 垃圾关键词：频道标题或分组名命中即丢弃 */
const SPAM_KEYWORDS = [
    "注意事项", "加群", "小草口令", "轮播视频", "关注Q群", "交流群", "防失联",
    "防丢关注", "网址", "更多软件", "广告位", "微信公众号", "最新资源",
    "获取资源", "备用地址", "防丢地址", "更新时间", "关于",
];

/* 分组策略：沿用上游源自带的分组名（不重新分组）。
 * 输出时仅对「组」重新排序（见 groupTier / orderedGroupNames），
 * 推流组（如「茂哥TV」）始终置顶。 */

/* ===== 常量（一般不用改）============================================== */

const CACHE_TTL_MS        = 10 * 60 * 1000;
const DEFAULT_PAGE_SIZE   = 20;
const MAX_RETURN_LIMIT    = 500;
const FALLBACK_LOGO_BASE  = "https://epg.112114.xyz/logo";
const FETCH_TIMEOUT_MS    = 15 * 1000;
const KV_CACHE_KEY_PREFIX = "all_channels_v2";   // v2：分组结构/配置哈希变更后旧缓存自动失效
const KV_TTL_SECONDS      = 600;                 // KV TTL 10 分钟
const PROMO_DEFAULT_GROUP = "推流信息";

/* ===== 配置解析：环境变量 > 硬编码 ==================================== */

function resolveConfig(env) {
    // SOURCE_URLS：JSON 字符串，如 [{"url":"https://...m3u"}]
    let sources = SOURCE_URLS;
    if (env && env.SOURCE_URLS) {
        try {
            const parsed = JSON.parse(env.SOURCE_URLS);
            if (Array.isArray(parsed) && parsed.length > 0) sources = parsed;
        } catch (e) {
            console.error(`[resolveConfig] 环境变量 SOURCE_URLS 解析失败，回退硬编码: ${e.message}`);
        }
    }
    // ENABLE_PROMO："false" 关闭引流注入（默认开启）
    const enablePromo = !(env && typeof env.ENABLE_PROMO === "string" && env.ENABLE_PROMO.toLowerCase() === "false");
    // FALLBACK_LOGO_BASE：自定义台标兜底域名（去掉结尾斜杠）
    const logoBase = (env && env.FALLBACK_LOGO_BASE ? String(env.FALLBACK_LOGO_BASE) : FALLBACK_LOGO_BASE)
        .replace(/\/+$/, "");
    return { sources, enablePromo, logoBase };
}

/** 配置指纹：不同源/台标/开关对应不同缓存 key，避免串缓存 */
function configHash(cfg) {
    const s = JSON.stringify(cfg.sources) + "|" + cfg.logoBase + "|" + (cfg.enablePromo ? 1 : 0);
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(36);
}

/* ===== 工具函数 ======================================================= */

function isValidHttpUrl(str) {
    if (!str || typeof str !== "string") return false;
    try {
        const u = new URL(str);
        return u.protocol === "http:" || u.protocol === "https:";
    } catch {
        return false;
    }
}

function normalizeSource(src) {
    const url = typeof src === "string" ? src : (src && src.url) || "";
    return { url, format: src && src.format, _skip: !isValidHttpUrl(url) };
}

function isSpam(text) {
    return !!text && SPAM_KEYWORDS.some(kw => text.includes(kw));
}

/** 从 #EXTINF 行提取属性值（兼容有/无引号） */
function extractAttr(line, key) {
    const re = new RegExp(
        key + '=(?:"([^"]+)"|\'([^\']+)\'|([^,\\s][^,]*?)(?=,\\s*\\w+=|$))'
    );
    const m = line.match(re);
    return m ? (m[1] || m[2] || m[3] || "").trim() : "";
}

/** M3U 属性值清洗：引号/换行会破坏 #EXTINF 结构 */
function sanitizeAttr(s) {
    return String(s == null ? "" : s).replace(/"/g, "'").replace(/[\r\n]+/g, " ").trim();
}

/** TXT 行清洗：逗号会破坏「名称,地址」结构（转全角） */
function sanitizeTxt(s) {
    return String(s == null ? "" : s).replace(/,/g, "，").replace(/[\r\n]+/g, " ").trim();
}

async function fetchWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "*/*",
            },
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timer);
    }
}

/* ===== 分组排序（沿用上游分组名，只排组间顺序）======================== */

/**
 * 组分档：数字越小越靠前。
 *   1 央视/中央 → 2 卫视 → 3 地方 → 4 港澳台/国际 → 9 其他
 * 推流组（promoGroups）在调用处单独钉在最前。
 */
function groupTier(name) {
    const n = String(name || "");
    if (/央视|中央|CCTV|CGTN|CETV|CHC/i.test(n)) return 1;
    if (/卫视/.test(n)) return 2;
    if (/地方|省台|省级|省市/.test(n)) return 3;
    if (/港澳|香港|澳门|台湾|国际|境外|海外|TVB/i.test(n)) return 4;
    return 9;
}

/**
 * 稳定排序：只调组间顺序，不改组名、不动组内条目。
 * JS 的 sort 是稳定排序，同档组保持首次出现的先后顺序。
 */
function orderedGroupNames(allNames, promoGroups) {
    return allNames
        .filter(g => !promoGroups.has(g))
        .sort((a, b) => groupTier(a) - groupTier(b));
}

/* ===== 解析器 ========================================================= */

function parseM3U(text, logoBase) {
    const list = [];
    let current = null;

    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('#EXTINF')) {
            const group = extractAttr(trimmed, 'group-title') || "默认频道";
            let logo = extractAttr(trimmed, 'tvg-logo');
            const commaIdx = trimmed.lastIndexOf(',');
            const title = commaIdx > -1 ? trimmed.substring(commaIdx + 1).trim() : "未知频道";
            if (!logo) logo = `${logoBase}/${encodeURIComponent(title)}.png`;
            current = { group, logo, title };
        } else if (trimmed.startsWith('#')) {
            continue;
        } else if (current) {
            const urls = trimmed.split(',').map(s => s.trim()).filter(Boolean);
            if (urls.length > 0) {
                const channel = { ...current, url: urls[0], urls };
                if (!isSpam(channel.group) && !isSpam(channel.title)) {
                    list.push(channel);
                }
            }
            current = null;
        }
    }
    return list;
}

function parseTXT(text, logoBase) {
    const list = [];
    let currentGroup = "默认频道";

    for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;

        // 分组行: xxx,#genre#
        if (/,#genre#\s*$/i.test(line)) {
            currentGroup = line.split(',')[0].trim() || "默认频道";
            continue;
        }

        // 频道行: title,url[#备用地址]
        const commaIdx = line.indexOf(',');
        if (commaIdx < 0) continue;
        const title = line.substring(0, commaIdx).trim();
        let urlPart = line.substring(commaIdx + 1).trim();
        if (!title || !urlPart) continue;

        // 仅当 # 后非空时才按注释截断
        const hashIdx = urlPart.indexOf('#');
        if (hashIdx !== -1 && urlPart.substring(hashIdx + 1).trim()) {
            urlPart = urlPart.substring(0, hashIdx).trim();
        }
        if (!urlPart || isSpam(currentGroup) || isSpam(title)) continue;

        list.push({
            group: currentGroup,
            title,
            logo: `${logoBase}/${encodeURIComponent(title)}.png`,
            url: urlPart,
            urls: [urlPart],
        });
    }
    return list;
}

function parseSource(text, formatHint, logoBase) {
    const isM3U = formatHint === "m3u"
        ? true
        : formatHint === "txt"
            ? false
            : text.includes('#EXTM3U') || text.includes('#EXTINF');
    return isM3U ? parseM3U(text, logoBase) : parseTXT(text, logoBase);
}

/* ===== 抓取与合并（KV 缓存）=========================================== */

async function fetchOneSource(srcConfig, logoBase) {
    const { url, format, _skip } = normalizeSource(srcConfig);
    if (_skip) {
        console.error(`[fetchOneSource] 跳过无效 URL: ${url || "(empty)"}`);
        return { source: url || "(invalid)", channels: [], error: "Invalid URL" };
    }
    try {
        const resp = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
        if (!resp.ok) {
            console.error(`[fetchOneSource] HTTP ${resp.status} for ${url}`);
            return { source: url, channels: [], error: `HTTP ${resp.status}` };
        }
        const text = await resp.text();
        if (!text || !text.trim()) {
            console.error(`[fetchOneSource] Empty body from ${url}`);
            return { source: url, channels: [], error: "Empty body" };
        }
        const channels = parseSource(text, format, logoBase);
        console.log(`[fetchOneSource] ${url} -> ${channels.length} channels`);
        return { source: url, channels, error: null };
    } catch (err) {
        console.error(`[fetchOneSource] ${url} -> ${err.message}`);
        return { source: url, channels: [], error: err.message };
    }
}

/**
 * 加载全部频道：KV 缓存命中直接返回；否则并发抓取 → 合并 → 自动分组 → 异步写回 KV。
 * 返回 { channels, promos }：promos 为实际启用的引流节目（ENABLE_PROMO=false 时为空）。
 */
async function loadAll(env, ctx) {
    const cfg = resolveConfig(env);
    const promos = (cfg.enablePromo ? PROMO_LIST : []).map(p => ({
        ...p,
        group: p.group || PROMO_DEFAULT_GROUP,
    }));
    const cacheKey = `${KV_CACHE_KEY_PREFIX}_${configHash(cfg)}`;

    // 1. 尝试读 KV 缓存
    if (env && env.KV) {
        try {
            const cached = await env.KV.get(cacheKey, { type: "json" });
            if (cached && cached.expireAt > Date.now()) {
                console.log(`[loadAll] KV cache HIT, ${cached.channels.length} channels`);
                return { channels: cached.channels, promos };
            }
            console.log(cached ? "[loadAll] KV cache EXPIRED, re-fetching" : "[loadAll] KV cache MISS");
        } catch (e) {
            console.error(`[loadAll] KV read error: ${e.message}`);
        }
    } else {
        console.log("[loadAll] No KV binding, fetching directly");
    }

    // 2. 并发抓取所有源（单源失败不阻塞）；黑名单过滤已在解析器内完成
    const results = await Promise.all(cfg.sources.map(u => fetchOneSource(u, cfg.logoBase)));
    const okCount = results.filter(r => r.error === null).length;
    const channels = [];
    for (const r of results) {
        for (const ch of r.channels) channels.push({ ...ch });
    }
    console.log(`[loadAll] ${okCount}/${results.length} sources OK, ${channels.length} channels（沿用上游分组）`);

    // 3. 异步写回 KV（不阻塞响应；Workers 中 fetch 后继续 I/O 必须用 waitUntil）
    const writeKV = async () => {
        if (!env || !env.KV) return;
        try {
            await env.KV.put(cacheKey, JSON.stringify({
                channels,
                expireAt: Date.now() + CACHE_TTL_MS,
            }), { expirationTtl: KV_TTL_SECONDS });
            console.log(`[loadAll] KV cache written, ${channels.length} channels`);
        } catch (e) {
            console.error(`[loadAll] KV write error: ${e.message}`);
        }
    };
    if (ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(writeKV());
    } else {
        await writeKV();
    }

    return { channels, promos };
}

/* ===== Vod / 输出构造 ================================================= */

function buildPromoVods(promos) {
    return promos.map((p, idx) => ({
        vod_id:        `live_promo_${idx}`,
        vod_name:      p.title,
        vod_pic:       p.pic || "",
        vod_remarks:   p.remarks || "引流",
        vod_play_from: p.from  || "推广线路",
        vod_play_url:  `${p.title}$${p.url}`,
        type_name:     p.group || PROMO_DEFAULT_GROUP,
    }));
}

function channelToVod(ch, idx) {
    const playUrl = ch.urls && ch.urls.length > 1
        ? `${ch.title}$${ch.urls.join('#')}`
        : `${ch.title}$${ch.url}`;
    return {
        vod_id:        `ch_${idx}`,
        vod_name:      ch.title,
        vod_pic:       ch.logo,
        vod_remarks:   "直播",
        vod_play_from: ch.group,
        vod_play_url:  playUrl,
        type_name:     ch.group,
    };
}

function buildHomeResponse(channels, promos) {
    const groupMap = new Map();
    channels.forEach((ch, i) => {
        if (!groupMap.has(ch.group)) groupMap.set(ch.group, []);
        groupMap.get(ch.group).push({ ch, i });
    });

    const promoGroups = new Set(promos.map(p => p.group || PROMO_DEFAULT_GROUP));
    const groupNames = [
        ...Array.from(promoGroups),
        ...orderedGroupNames(Array.from(groupMap.keys()), promoGroups),
    ];

    const class_list = groupNames.map(g => ({ type_id: g, type_name: g }));

    const list = buildPromoVods(promos);
    for (const g of groupNames) {
        if (promoGroups.has(g)) continue;
        for (const { ch, i } of (groupMap.get(g) || []).slice(0, 5)) {
            list.push(channelToVod(ch, i));
        }
    }

    return { code: 1, msg: "success", class: class_list, list };
}

function buildCategoryResponse(channels, promos, typeId, page, pageSize) {
    if (!typeId) {
        return { code: 0, msg: "参数 t（分类名）不能为空", page: 1, pagecount: 1, limit: pageSize, total: 0, list: [] };
    }

    const promoGroups = new Set(promos.map(p => p.group || PROMO_DEFAULT_GROUP));
    const list = [];

    if (promoGroups.has(typeId)) {
        list.push(...buildPromoVods(promos).filter(v => v.type_name === typeId));
    }
    channels.forEach((ch, i) => {
        if (ch.group === typeId) list.push(channelToVod(ch, i));
    });

    const total = Math.min(list.length, MAX_RETURN_LIMIT);
    const totalPage = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPage);
    const start = (safePage - 1) * pageSize;

    return {
        code: 1,
        msg: "success",
        page: safePage,
        pagecount: totalPage,
        limit: pageSize,
        total,
        list: list.slice(start, start + pageSize),
    };
}

function buildDetailResponse(channels, promos, ids) {
    const idSet = new Set(ids);
    const list = [];

    for (const v of buildPromoVods(promos)) {
        if (idSet.has(v.vod_id)) list.push(v);
    }
    channels.forEach((ch, i) => {
        if (idSet.has(`ch_${i}`)) list.push(channelToVod(ch, i));
    });

    return { code: 1, msg: "success", list };
}

function buildM3U(channels, promos) {
    // 先按分档整理组顺序（推流组置顶），再按组输出
    const groupMap = new Map();
    for (const ch of channels) {
        if (!groupMap.has(ch.group)) groupMap.set(ch.group, []);
        groupMap.get(ch.group).push(ch);
    }
    const promoGroups = new Set(promos.map(p => p.group || PROMO_DEFAULT_GROUP));
    const groupOrder = [
        ...Array.from(promoGroups),
        ...orderedGroupNames(Array.from(groupMap.keys()), promoGroups),
    ];

    const lines = ['#EXTM3U'];
    for (const p of promos) {
        lines.push(`#EXTINF:-1 tvg-logo="${sanitizeAttr(p.pic)}" group-title="${sanitizeAttr(p.group || PROMO_DEFAULT_GROUP)}",${sanitizeAttr(p.title)}`);
        lines.push(p.url);
    }
    for (const g of groupOrder) {
        if (promoGroups.has(g)) continue;
        for (const ch of (groupMap.get(g) || [])) {
            lines.push(`#EXTINF:-1 tvg-logo="${sanitizeAttr(ch.logo)}" group-title="${sanitizeAttr(ch.group)}",${sanitizeAttr(ch.title)}`);
            lines.push(ch.urls && ch.urls.length > 1 ? ch.urls.join(',') : ch.url);
        }
    }
    return lines.join('\n');
}

function buildTXT(channels, promos) {
    const groupMap = new Map();
    const add = (g, title, url) => {
        if (!groupMap.has(g)) groupMap.set(g, []);
        groupMap.get(g).push({ title, url });
    };
    for (const p of promos) add(p.group || PROMO_DEFAULT_GROUP, p.title, p.url);
    for (const ch of channels) {
        const u = ch.urls && ch.urls.length > 0 ? ch.urls[0] : ch.url;
        add(ch.group, ch.title, u);
    }

    const promoGroups = new Set(promos.map(p => p.group || PROMO_DEFAULT_GROUP));
    const groupOrder = [
        ...Array.from(promoGroups),
        ...orderedGroupNames(Array.from(groupMap.keys()), promoGroups),
    ];

    const out = [];
    for (const group of groupOrder) {
        const items = groupMap.get(group) || [];
        if (items.length === 0) continue;
        out.push(`${sanitizeTxt(group)},#genre#`);
        for (const it of items) out.push(`${sanitizeTxt(it.title)},${it.url}`);
        out.push('');
    }
    return out.join('\n');
}

/* ===== 主入口 ========================================================= */

const corsHeaders = {
    "Access-Control-Allow-Origin":  "*",
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
        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }
        if (request.method !== "GET" && request.method !== "POST") {
            return jsonResponse({ code: 0, msg: "Method Not Allowed" }, 405);
        }

        const url = new URL(request.url);
        const path = url.pathname;
        const params = url.searchParams;

        try {
            const { channels, promos } = await loadAll(env, ctx);

            if (path === '/m3u' || path === '/live.m3u') {
                return new Response(buildM3U(channels, promos), {
                    headers: { ...corsHeaders, "Content-Type": "audio/x-mpegurl; charset=utf-8" },
                });
            }

            if (path === '/txt' || path === '/live.txt') {
                return new Response(buildTXT(channels, promos), {
                    headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
                });
            }

            const ac = params.get('ac');

            if (ac === 'detail') {
                const ids = (params.get('ids') || '').split(',').filter(Boolean);
                return jsonResponse(buildDetailResponse(channels, promos, ids));
            }

            if (ac === 'list' || params.has('t')) {
                const typeId = params.get('t') || '';
                const page = parseInt(params.get('pg') || '1', 10) || 1;
                const size = parseInt(params.get('limit') || String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE;
                return jsonResponse(buildCategoryResponse(channels, promos, typeId, page, size));
            }

            return jsonResponse(buildHomeResponse(channels, promos));

        } catch (err) {
            console.error(`[fetch] Unhandled error: ${err.message}`);
            return jsonResponse({ code: 0, msg: err.message || String(err) }, 500);
        }
    },
};
