/* ============================================================
 * Cloudflare Worker - 直播源聚合 / 引流注入
 * ------------------------------------------------------------
 * 能力：多源抓取（m3u/txt 自动识别）· KV 缓存 · 频道名规范化
 *       分组合并（央视/卫视/地方/香港/台湾/澳门）· 频道归类
 *       URL去重 · 死链探测（可选）· 择优排序 · 推流置顶
 *       垃圾过滤 · M3U/TXT/JSON 输出
 * 配置：仅改下方【用户配置区】；也可用环境变量覆盖（见 resolveConfig）
 * ============================================================ */

/* ===== 用户配置区（按需修改）========================================== */

const SOURCE_URLS = [
    { url: "https://0701.tv1288.xyz/txt", format: "txt" },
    { url: "https://gh-proxy.com/https://raw.githubusercontent.com/vbskycn/iptv/refs/heads/master/tv/iptv4.txt", format: "txt" },
    { url: "https://gh-proxy.com/https://raw.githubusercontent.com/lml1971/tv/refs/heads/main/tv1.txt", format: "txt" },    
    { url: "https://gh-proxy.com/https://raw.githubusercontent.com/best-fan/iptv-sources/refs/heads/main/cn_all_status.m3u8" },
    { url: "https://gh-proxy.com/https://raw.githubusercontent.com/kakaxi-1/IPTV/refs/heads/main/iptv.txt", format: "txt" },
    { url: "https://gh-proxy.com/https://raw.githubusercontent.com/akiralereal/iptv/refs/heads/main/IPTV.m3u", format: "m3u" },
];

const PROMO_LIST = [
    { title: "幸福家",   url: "https://wj.lmlcyp.ccwu.cc/raw/mp4/1.mp4",         pic: "https://ts1.tc.mm.bing.net/th/id/R-C.44a8fce5f82322ff6047579c70ba87a5?rik=GtFY9WEgT3mvmg&riu=http%3a%2f%2f5b0988e595225.cdn.sohucs.com%2fq_70%2cc_zoom%2cw_640%2fimages%2f20170819%2f31955e56cdbc478e8a9d53b54d92cbf0.jpeg&ehk=kYySxDkRdxi37EML22nDcDWX8ypoyqXbPt6ziempjDg%3d&risl=&pid=ImgRaw&r=0", group: "茂哥TV", from: "线路A", remarks: "置顶引流" },
    { title: "老李卡通",  url: "https://wj.lmlcyp.ccwu.cc/raw/mp4/2.mp4",         pic: "https://ts1.tc.mm.bing.net/th/id/R-C.44a8fce5f82322ff6047579c70ba87a5?rik=GtFY9WEgT3mvmg&riu=http%3a%2f%2f5b0988e595225.cdn.sohucs.com%2fq_70%2cc_zoom%2cw_640%2fimages%2f20170819%2f31955e56cdbc478e8a9d53b54d92cbf0.jpeg&ehk=kYySxDkRdxi37EML22nDcDWX8ypoyqXbPt6ziempjDg%3d&risl=&pid=ImgRaw&r=0", group: "茂哥TV", from: "线路A", remarks: "置顶引流" },
    { title: "我们一家",  url: "https://wj.lmlcyp.ccwu.cc/raw/mp4/3.mp4",         pic: "https://ts1.tc.mm.bing.net/th/id/R-C.44a8fce5f82322ff6047579c70ba87a5?rik=GtFY9WEgT3mvmg&riu=http%3a%2f%2f5b0988e595225.cdn.sohucs.com%2fq_70%2cc_zoom%2cw_640%2fimages%2f20170819%2f31955e56cdbc478e8a9d53b54d92cbf0.jpeg&ehk=kYySxDkRdxi37EML22nDcDWX8ypoyqXbPt6ziempjDg%3d&risl=&pid=ImgRaw&r=0", group: "茂哥TV", from: "线路A", remarks: "置顶引流" },
    { title: "25年前",    url: "https://wj.lmlcyp.ccwu.cc/raw/mp4/VDO_0012.mp4",  pic: "https://ts1.tc.mm.bing.net/th/id/R-C.44a8fce5f82322ff6047579c70ba87a5?rik=GtFY9WEgT3mvmg&riu=http%3a%2f%2f5b0988e595225.cdn.sohucs.com%2fq_70%2cc_zoom%2cw_640%2fimages%2f20170819%2f31955e56cdbc478e8a9d53b54d92cbf0.jpeg&ehk=kYySxDkRdxi37EML22nDcDWX8ypoyqXbPt6ziempjDg%3d&risl=&pid=ImgRaw&r=0", group: "茂哥TV", from: "线路A", remarks: "置顶引流" },
];

const SPAM_KEYWORDS = [
    "注意事项", "加群", "小草口令", "轮播视频", "关注Q群", "交流群", "防失联",
    "防丢关注", "网址", "更多软件", "广告位", "微信公众号", "最新资源",
    "获取资源", "备用地址", "防丢地址", "更新时间", "关于",
];

/* ===== 常量（一般不用改）============================================== */

const CACHE_TTL_MS        = 10 * 60 * 1000;
const DEFAULT_PAGE_SIZE   = 20;
const MAX_RETURN_LIMIT    = 500;
const FALLBACK_LOGO_BASE  = "https://epg.112114.xyz/logo";
const FETCH_TIMEOUT_MS    = 15 * 1000;
const KV_CACHE_KEY_PREFIX = "all_channels_v3";
const KV_TTL_SECONDS      = 600;
const PROMO_DEFAULT_GROUP = "推流信息";
const HTTP_SCHEMES        = ["http://", "https://"];

/* ===== 配置解析：环境变量 > 硬编码 ==================================== */

function resolveConfig(env) {
    let sources = SOURCE_URLS;
    if (env && env.SOURCE_URLS) {
        try {
            const parsed = JSON.parse(env.SOURCE_URLS);
            if (Array.isArray(parsed) && parsed.length > 0) sources = parsed;
        } catch (e) {
            console.error(`[resolveConfig] SOURCE_URLS 解析失败: ${e.message}`);
        }
    }
    const enablePromo = !(env && typeof env.ENABLE_PROMO === "string" && env.ENABLE_PROMO.toLowerCase() === "false");
    const logoBase = (env && env.FALLBACK_LOGO_BASE ? String(env.FALLBACK_LOGO_BASE) : FALLBACK_LOGO_BASE).replace(/\/+$/, "");
    const probeDeadLinks = !!(env && env.PROBE_DEAD_LINKS === "true");
    const probeTimeoutMs  = parseInt((env && env.PROBE_TIMEOUT_MS)  || "5000", 10);
    const probeMaxUrls    = parseInt((env && env.PROBE_MAX_URLS)    || "30",   10);
    const probeConcurrent = parseInt((env && env.PROBE_CONCURRENCY) || "10",   10);
    return { sources, enablePromo, logoBase, probeDeadLinks, probeTimeoutMs, probeMaxUrls, probeConcurrent };
}

function configHash(cfg) {
    const s = JSON.stringify(cfg.sources) + "|" + cfg.logoBase + "|" + (cfg.enablePromo ? 1 : 0) + "|" + (cfg.probeDeadLinks ? 1 : 0);
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

function extractAttr(line, key) {
    const re = new RegExp(key + '=(?:"([^"]+)"|\'([^\']+)\'|([^,\\s][^,]*?)(?=,\\s*\\w+=|$))');
    const m = line.match(re);
    return m ? (m[1] || m[2] || m[3] || "").trim() : "";
}

function sanitizeAttr(s) {
    return String(s == null ? "" : s).replace(/"/g, "'").replace(/[\r\n]+/g, " ").trim();
}

function sanitizeTxt(s) {
    return String(s == null ? "" : s).replace(/,/g, "，").replace(/[\r\n]+/g, " ").trim();
}

async function fetchWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Accept": "*/*" },
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timer);
    }
}

/* ===== 频道名规范化 ================================================== */

const _RES_SUFFIX_RE = /[\(（]\s*\d{2,4}\s*[ip]?\s*[\)）]|\bHD\b|\bUHD\b|\bFHD\b|\b4K\b|\b8K\b|高清|超清|标清|蓝光/gi;
const _WS_RE       = /\s+/g;
const _TAIL_SEP_RE = /[\s\-_－]+$/;
const _HEAD_SEP_RE = /^[\s\-_－]+/;
const _CCTV_NUM_RE = /^CCTV\s*[-_\s]?\s*(\d{1,2})/i;
const _CHC_RE      = /^CHC\s*[-－_]?\s*(.*)$/i;
const _CENTRAL_RE  = /^(CCTV|央视|CGTN|CETV|CHC|中国教育)/i;

const _CCTV_MAIN_SUB = {
    1:"综合", 2:"财经", 3:"综艺", 4:"中文国际", 5:"体育",
    6:"电影", 7:"国防军事", 8:"电视剧", 9:"纪录", 10:"科教",
    11:"戏曲", 12:"社会与法", 13:"新闻", 14:"少儿", 15:"音乐",
    16:"奥林匹克", 17:"农业农村",
};
const _CCTV_PLUS_SUB = { 5:"体育赛事" };
const _CCTV_SUB_ALIAS = {
    "中文国际":"中文国际","中文":"中文国际","国际":"中文国际",
    "综合":"综合","新闻":"新闻","体育":"体育","体育赛事":"体育赛事",
    "电影":"电影","电影频道":"电影","电视剧":"电视剧","电视剧频道":"电视剧",
    "纪录":"纪录","纪录频道":"纪录","科教":"科教","科学教育":"科教",
    "戏曲":"戏曲","社会与法":"社会与法","少儿":"少儿","少儿频道":"少儿",
    "音乐":"音乐","农业农村":"农业农村","农业":"农业农村",
    "国防军事":"国防军事","军事":"国防军事","军事农业":"国防军事",
    "奥林匹克":"奥林匹克","奥运":"奥林匹克","奥林匹克频道":"奥林匹克",
    "欧洲":"中文国际","美洲":"中文国际",
};
const _CCTV_EN2CN = {
    "billiards":"央视台球","culture of quality":"文化精品","golf and tennis":"高尔夫网球",
    "health":"卫生健康","nostalgia theater":"怀旧剧场","storm football":"风云足球",
    "storm music":"风云音乐","storm theater":"风云剧场","the first theater":"第一剧场",
    "weapon and technology":"兵器科技","womens fashion":"女性时尚","world geography":"世界地理",
};
const _CCTV_PAY_ALIAS = {
    "台球":"央视台球","央视台球":"央视台球","卫生健康":"卫生健康","健康":"卫生健康",
    "电视指南":"电视指南","指南":"电视指南","央视文化精品":"文化精品","文化精品":"文化精品",
    "央视高网":"高尔夫网球","高网":"高尔夫网球","央视高尔夫":"高尔夫网球","高尔夫":"高尔夫网球",
};
const _CGTN_ZH = {
    "法语":"法语","法文":"法语","french":"法语",
    "西班牙语":"西班牙语","西语":"西班牙语","spanish":"西班牙语",
    "阿拉伯语":"阿拉伯语","阿语":"阿拉伯语","arabic":"阿拉伯语",
    "俄语":"俄语","russian":"俄语",
    "纪录":"纪录","记录":"纪录","外语纪录":"纪录","documentary":"纪录","纪录频道":"纪录",
    "新闻":"新闻","news":"新闻",
    "财经":"财经","全球财经":"财经","global biz":"财经","global business":"财经",
};
const _CHC_CANON = [["动作","CHC-动作电影"],["家庭","CHC-家庭影院"],["影迷","CHC-影迷电影"]];

function stripClarity(name) {
    let n = (name || "").replace(_RES_SUFFIX_RE, "");
    n = n.replace(_WS_RE, " ").trim();
    n = n.replace(_TAIL_SEP_RE, "");
    return n.replace(_HEAD_SEP_RE, "").trim();
}

function _normEn(s) {
    s = (s || "").toLowerCase().replace(/&/g, " and ").replace(/'/g, "");
    return s.replace(_WS_RE, " ").trim();
}

function _cctvPayBody(n) {
    let body = n.replace(/^(CCTV|央视)\s*/i, "").trim();
    body = stripClarity(body).replace(_HEAD_SEP_RE, "").trim();
    if (body && !/[\u4e00-\u9fff]/.test(body)) {
        const cn = _CCTV_EN2CN[_normEn(body)];
        return cn ? `CCTV-${cn}` : n;
    }
    body = _CCTV_PAY_ALIAS[body] || body;
    const prefix = /^CCTV/i.test(n) ? "CCTV" : "央视";
    return body ? `${prefix}-${body}` : n;
}

function canonicalCctv(name) {
    const n = (name || "").trim();
    if (!n) return n;

    if (/CETV|中国教育|中央教育/i.test(n)) {
        const m = n.match(/CETV\s*[-_]?\s*(\d)/i);
        return `CETV-${m ? m[1] : '1'}`;
    }
    if (/^CGTN/i.test(n)) return canonicalCgtn(n);
    if (!/^(CCTV|央视)/i.test(n)) return n;

    const mK = n.match(/^CCTV\s*[-_]?\s*(\d)\s*[Kk]\b/i);
    if (mK) return `CCTV-${mK[1]}K`;

    const m = n.match(_CCTV_NUM_RE);
    if (m) {
        const num = parseInt(m[1], 10);
        const rawRest = n.substring(m[0].length);
        const mk = rawRest.match(/^[\s\-_]*(4K|8K)\b/i);
        if (mk) return `CCTV-${mk[1].toUpperCase()}`;

        let rest = stripClarity(rawRest).replace(_HEAD_SEP_RE, "").trim();

        if (rest.startsWith("+") || rest.startsWith("⁺")) {
            let sub = rest.replace(/^[+⁺]+/, "").trim();
            sub = _CCTV_SUB_ALIAS[sub] || sub;
            if (!sub) sub = _CCTV_PLUS_SUB[num] || "";
            return sub ? `CCTV-${num}+ ${sub}` : `CCTV-${num}+`;
        }
        if (rest.toUpperCase() === "4K" || rest.toUpperCase() === "8K") {
            return `CCTV-${num}${rest.toUpperCase()}`;
        }
        if (!rest) {
            const sub = _CCTV_MAIN_SUB[num];
            return sub ? `CCTV-${num} ${sub}` : `CCTV-${num}`;
        }
        rest = _CCTV_SUB_ALIAS[rest] || rest;
        return rest ? `CCTV-${num} ${rest}` : `CCTV-${num}`;
    }
    return _cctvPayBody(n);
}

function canonicalCgtn(name) {
    const n = (name || "").trim();
    if (!/^CGTN/i.test(n)) return n;
    let rest = stripClarity(n.substring(4)).replace(_HEAD_SEP_RE, "").trim();
    if (!rest) return "CGTN";
    const zh = _CGTN_ZH[rest] || _CGTN_ZH[_normEn(rest)];
    if (!zh) return `CGTN-${rest}`;
    return zh === "新闻" ? "CGTN" : `CGTN-${zh}`;
}

function canonicalChc(name) {
    const n = (name || "").trim();
    const m = n.match(_CHC_RE);
    if (!m) return n;
    const body = stripClarity(m[1]).trim();
    for (const [kw, canon] of _CHC_CANON) {
        if (body.includes(kw)) return canon;
    }
    return !body ? "CHC" : n;
}

function canonicalName(name) {
    let n = (name || "").trim().replace(_WS_RE, " ");
    if (!n) return n;

    const c = canonicalCctv(n);
    if (c !== n || /^(CCTV|CGTN|CETV|央视)/i.test(n)) return c;

    const ch = canonicalChc(n);
    if (ch !== n || /^CHC/i.test(n)) return ch;

    return stripClarity(n) || n;
}

/* ===== 频道分类与分组合并 ============================================= */

function isCentralChannel(name) {
    return _CENTRAL_RE.test(name || "");
}

const _GROUP_MERGE_RULES = [
    ["港澳台","香港频道"],["港台","香港频道"],
    ["央视","央视频道"],["卫视","卫视频道"],["地方","地方频道"],
    ["香港","香港频道"],["台湾","台湾频道"],["澳门","澳门频道"],
];

function mergeGroupName(group) {
    const g = (group || "").trim();
    if (!g || g === "茂哥TV" || g === "其他" || g === "其他频道" || g === "未分组") return g;
    for (const [kw, target] of _GROUP_MERGE_RULES) {
        if (g.includes(kw)) return target;
    }
    return g;
}

const _HK_KEYWORDS = ["TVB","翡翠台","J2","Pearl","明珠台","VIU TV","Now TV","香港卫视","HKC","RHK","凤凰香港","凤凰中文","凤凰资讯","凤凰","HKS","香港"];
const _TW_KEYWORDS = ["台视","中视","华视","民视","公共电视","PTS","三立","TVBS","东森","中天","年代","八大","霹雳","客家电视","原住民电视台","台湾"];
const _RECLASSIFY_RULES = [
    [["卫视"],"卫视频道"],
    [["北京","上海","广东","湖南","浙江","江苏","深圳","四川","湖北","辽宁","山东","河南","河北","福建","安徽","江西","黑龙江","吉林","云南","贵州","重庆","陕西","甘肃","广西","新疆","内蒙古","西藏","宁夏","青海","海南","天津","山西","地方","省台","市台","都市"],"地方频道"],
    [["体育","NBA","足球","篮球","网球","高尔夫","搏击","赛车"],"体育频道"],
    [["电影","影视","CINEMA","MOVIE"],"电影频道"],
    [["新闻","资讯"],"新闻频道"],
    [["少儿","卡通","动漫","动画","亲子","BABY","儿童"],"少儿频道"],
    [["纪录","DOC"],"纪实频道"],
    [["财经"],"财经频道"],
    [["音乐","MUSIC"],"音乐频道"],
    [["戏曲","京剧"],"戏曲频道"],
    [["教育"],"教育频道"],
    [["法治","社会"],"社会与法频道"],
    [["旅游","美食","生活","健康"],"生活频道"],
];

function _nameHas(name, keywords) {
    const low = (name || "").toLowerCase();
    return keywords.some(kw => low.includes(kw.toLowerCase()));
}

function classifyChannel(name, currentGroup) {
    const nm = name || "";
    if (isCentralChannel(nm)) return "央视频道";

    const lowNm = nm.toLowerCase();
    const lowNoTvbs = lowNm.replace("tvbs", "");
    const hasTw = _TW_KEYWORDS.some(kw => lowNm.includes(kw.toLowerCase()));
    const hasHk = _HK_KEYWORDS.some(kw => lowNoTvbs.includes(kw.toLowerCase()));

    if (hasTw && !hasHk) return "台湾频道";
    if (hasHk && !hasTw) return "香港频道";
    if (hasHk && hasTw) return nm.includes("台湾") ? "台湾频道" : "香港频道";
    if (_nameHas(nm, ["澳门"])) return "澳门频道";

    const g = (currentGroup || "").trim();
    if (g === "其他频道" || g === "其他" || g === "未分组") {
        for (const [keywords, target] of _RECLASSIFY_RULES) {
            if (_nameHas(nm, keywords)) return target;
        }
    }
    return null;
}

/* ===== 分组排序与组内排序 ============================================= */

function groupTier(name) {
    const n = String(name || "").toLowerCase();
    if (/央视|中央|cctv|cgtn/.test(n)) return 1;
    if (/卫视/.test(n)) return 2;
    if (/地方|省市|省台|省级/.test(n)) return 3;
    if (/香港/.test(n)) return 4;
    if (/台湾|澳门/.test(n)) return 5;
    if (/体育/.test(n)) return 6;
    if (/电影|影视|轮播/.test(n)) return 7;
    if (/新闻|new|资讯/.test(n)) return 8;
    if (/少儿|卡通|动漫|儿童/.test(n)) return 9;
    if (/纪实|纪录/.test(n)) return 10;
    if (/财经/.test(n)) return 11;
    if (/音乐|music/.test(n)) return 12;
    if (/戏曲/.test(n)) return 13;
    if (/教育/.test(n)) return 14;
    if (/社会|法治/.test(n)) return 15;
    if (/生活|旅游|美食|健康/.test(n)) return 16;
    return 99;
}

function orderedGroupNames(allNames, promoGroups) {
    return allNames.filter(g => !promoGroups.has(g)).sort((a, b) => groupTier(a) - groupTier(b));
}

const _CCTV_SORT_RE = /CCTV[- ]?(\d+)/;

function channelSortKey(name) {
    const m = (name || "").match(_CCTV_SORT_RE);
    if (m) return [0, parseInt(m[1], 10), name.includes("+") ? 1 : 0, name.toLowerCase()];
    return [1, 0, 0, name.toLowerCase()];
}

function sortChannelsInGroup(channels) {
    return channels.sort((a, b) => {
        const ka = channelSortKey(a.title), kb = channelSortKey(b.title);
        for (let i = 0; i < ka.length; i++) {
            if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
        }
        return 0;
    });
}

/* ===== 解析器 ======================================================== */

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
                if (!isSpam(channel.group) && !isSpam(channel.title)) list.push(channel);
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
        list.push({ group: currentGroup, title, logo: `${logoBase}/${encodeURIComponent(title)}.png`, url: urlPart, urls: [urlPart] });
    }
    return list;
}

function parseSource(text, formatHint, logoBase) {
    const isM3U = formatHint === "m3u" ? true : formatHint === "txt" ? false : text.includes('#EXTM3U') || text.includes('#EXTINF');
    return isM3U ? parseM3U(text, logoBase) : parseTXT(text, logoBase);
}

/* ===== 死链探测与测速（可选）========================================= */

async function probeUrls(urlList, timeoutMs, maxConcurrent) {
    const results = new Map();
    const queue = urlList.slice();

    async function probeOne(url) {
        const start = Date.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const resp = await fetch(url, {
                method: 'GET',
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; IPTV-Aggregator/2.0)', 'Range': 'bytes=0-0' },
                signal: controller.signal,
            });
            results.set(url, { alive: resp.status < 400, responseTime: Date.now() - start });
        } catch {
            results.set(url, { alive: false, responseTime: Date.now() - start });
        } finally {
            clearTimeout(timer);
        }
    }

    const worker = async () => { while (queue.length > 0) { const u = queue.shift(); if (u) await probeOne(u); } };
    const workers = [];
    for (let i = 0; i < Math.min(maxConcurrent, urlList.length); i++) workers.push(worker());
    await Promise.all(workers);
    return results;
}

/* ===== 抓取与合并 ==================================================== */

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
 * 加载全部频道：KV 缓存命中直接返回；否则并发抓取 → 规范化 → 分组合并
 * → 频道归类 → URL去重 → 死链探测（可选）→ 择优排序 → 异步写回 KV。
 */
async function loadAll(env, ctx) {
    const cfg = resolveConfig(env);
    const promos = (cfg.enablePromo ? PROMO_LIST : []).map(p => ({ ...p, group: p.group || PROMO_DEFAULT_GROUP }));
    const cacheKey = `${KV_CACHE_KEY_PREFIX}_${configHash(cfg)}`;

    // 1. KV 缓存
    if (env && env.KV) {
        try {
            const cached = await env.KV.get(cacheKey, { type: "json" });
            if (cached && cached.expireAt > Date.now()) {
                console.log(`[loadAll] KV HIT, ${cached.channels.length} channels`);
                return { channels: cached.channels, promos };
            }
            console.log(cached ? "[loadAll] KV EXPIRED" : "[loadAll] KV MISS");
        } catch (e) {
            console.error(`[loadAll] KV read error: ${e.message}`);
        }
    } else {
        console.log("[loadAll] No KV binding");
    }

    // 2. 并发抓取所有源
    const results = await Promise.all(cfg.sources.map(u => fetchOneSource(u, cfg.logoBase)));
    const okCount = results.filter(r => r.error === null).length;
    console.log(`[loadAll] ${okCount}/${results.length} sources OK`);

    // 3. 规范化 + 分组合并 + 频道归类 + URL去重
    const urlSeen = new Set();
    const merged = new Map();

    for (const r of results) {
        for (const ch of r.channels) {
            const canonTitle = canonicalName(ch.title);
            const classified = classifyChannel(canonTitle, ch.group);
            const group = classified !== null ? classified : mergeGroupName(ch.group);
            const key = `${group}|${canonTitle}`;

            const urls = (ch.urls && ch.urls.length > 0) ? ch.urls : [ch.url];
            const newUrls = [];
            for (const u of urls) {
                if (!urlSeen.has(u)) { urlSeen.add(u); newUrls.push(u); }
            }
            if (newUrls.length === 0) continue;

            if (!merged.has(key)) {
                merged.set(key, { group, logo: ch.logo, title: canonTitle, url: newUrls[0], urls: newUrls });
            } else {
                merged.get(key).urls.push(...newUrls);
            }
        }
    }
    let channels = Array.from(merged.values());
    console.log(`[loadAll] After canonical+classify+dedup: ${channels.length} channels`);

    // 4. 死链探测 + 择优排序（可选）
    if (cfg.probeDeadLinks && channels.length > 0) {
        const allUrls = [];
        for (const ch of channels) {
            allUrls.push(...ch.urls);
            if (allUrls.length >= cfg.probeMaxUrls) break;
        }
        const toProbe = allUrls.slice(0, cfg.probeMaxUrls).filter(u => HTTP_SCHEMES.some(s => u.startsWith(s)));
        if (toProbe.length > 0) {
            console.log(`[loadAll] Probing ${toProbe.length} URLs...`);
            const probeResults = await probeUrls(toProbe, cfg.probeTimeoutMs, cfg.probeConcurrent);

            const before = channels.length;
            channels = channels.filter(ch => {
                ch.urls = ch.urls.filter(u => { const info = probeResults.get(u); return !info || info.alive; });
                if (ch.urls.length === 0) return false;
                ch.urls.sort((a, b) => (probeResults.get(a)?.responseTime ?? 999999) - (probeResults.get(b)?.responseTime ?? 999999));
                ch.url = ch.urls[0];
                return true;
            });
            console.log(`[loadAll] Dead link removal: ${before - channels.length} removed, URLs sorted by speed`);
        }
    }

    // 5. 组内排序（CCTV按编号升序，其余按名称）
    const groupMap = new Map();
    for (const ch of channels) {
        if (!groupMap.has(ch.group)) groupMap.set(ch.group, []);
        groupMap.get(ch.group).push(ch);
    }
    const promoGroups = new Set(promos.map(p => p.group || PROMO_DEFAULT_GROUP));
    const groupOrder = [...Array.from(promoGroups), ...orderedGroupNames(Array.from(groupMap.keys()), promoGroups)];

    const sorted = [];
    for (const g of groupOrder) {
        const gc = groupMap.get(g);
        if (gc && gc.length > 0) sorted.push(...sortChannelsInGroup(gc));
    }
    channels = sorted;

    // 6. 异步写回 KV
    const writeKV = async () => {
        if (!env || !env.KV) return;
        try {
            await env.KV.put(cacheKey, JSON.stringify({ channels, expireAt: Date.now() + CACHE_TTL_MS }), { expirationTtl: KV_TTL_SECONDS });
            console.log(`[loadAll] KV written, ${channels.length} channels`);
        } catch (e) {
            console.error(`[loadAll] KV write error: ${e.message}`);
        }
    };
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(writeKV());
    else await writeKV();

    return { channels, promos };
}

/* ===== Vod / 输出构造 ================================================ */

function buildPromoVods(promos) {
    return promos.map((p, idx) => ({
        vod_id: `live_promo_${idx}`, vod_name: p.title, vod_pic: p.pic || "",
        vod_remarks: p.remarks || "引流", vod_play_from: p.from || "推广线路",
        vod_play_url: `${p.title}$${p.url}`, type_name: p.group || PROMO_DEFAULT_GROUP,
    }));
}

function channelToVod(ch, idx) {
    const playUrl = ch.urls && ch.urls.length > 1 ? `${ch.title}$${ch.urls.join('#')}` : `${ch.title}$${ch.url}`;
    return {
        vod_id: `ch_${idx}`, vod_name: ch.title, vod_pic: ch.logo, vod_remarks: "直播",
        vod_play_from: ch.group, vod_play_url: playUrl, type_name: ch.group,
    };
}

function buildHomeResponse(channels, promos) {
    const groupMap = new Map();
    channels.forEach((ch, i) => { if (!groupMap.has(ch.group)) groupMap.set(ch.group, []); groupMap.get(ch.group).push({ ch, i }); });
    const promoGroups = new Set(promos.map(p => p.group || PROMO_DEFAULT_GROUP));
    const groupNames = [...Array.from(promoGroups), ...orderedGroupNames(Array.from(groupMap.keys()), promoGroups)];
    const class_list = groupNames.map(g => ({ type_id: g, type_name: g }));
    const list = buildPromoVods(promos);
    for (const g of groupNames) {
        if (promoGroups.has(g)) continue;
        for (const { ch, i } of (groupMap.get(g) || []).slice(0, 5)) list.push(channelToVod(ch, i));
    }
    return { code: 1, msg: "success", class: class_list, list };
}

function buildCategoryResponse(channels, promos, typeId, page, pageSize) {
    if (!typeId) return { code: 0, msg: "参数 t 不能为空", page: 1, pagecount: 1, limit: pageSize, total: 0, list: [] };
    const promoGroups = new Set(promos.map(p => p.group || PROMO_DEFAULT_GROUP));
    const list = [];
    if (promoGroups.has(typeId)) list.push(...buildPromoVods(promos).filter(v => v.type_name === typeId));
    channels.forEach((ch, i) => { if (ch.group === typeId) list.push(channelToVod(ch, i)); });
    const total = Math.min(list.length, MAX_RETURN_LIMIT);
    const totalPage = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPage);
    const start = (safePage - 1) * pageSize;
    return { code: 1, msg: "success", page: safePage, pagecount: totalPage, limit: pageSize, total, list: list.slice(start, start + pageSize) };
}

function buildDetailResponse(channels, promos, ids) {
    const idSet = new Set(ids);
    const list = [];
    for (const v of buildPromoVods(promos)) { if (idSet.has(v.vod_id)) list.push(v); }
    channels.forEach((ch, i) => { if (idSet.has(`ch_${i}`)) list.push(channelToVod(ch, i)); });
    return { code: 1, msg: "success", list };
}

function buildM3U(channels, promos) {
    const groupMap = new Map();
    for (const ch of channels) { if (!groupMap.has(ch.group)) groupMap.set(ch.group, []); groupMap.get(ch.group).push(ch); }
    const promoGroups = new Set(promos.map(p => p.group || PROMO_DEFAULT_GROUP));
    const groupOrder = [...Array.from(promoGroups), ...orderedGroupNames(Array.from(groupMap.keys()), promoGroups)];
    const lines = ['#EXTM3U'];
    for (const p of promos) {
        lines.push(`#EXTINF:-1 tvg-logo="${sanitizeAttr(p.pic)}" group-title="${sanitizeAttr(p.group || PROMO_DEFAULT_GROUP)}",${sanitizeAttr(p.title)}`);
        lines.push(p.url);
    }
    for (const g of groupOrder) {
        if (promoGroups.has(g)) continue;
        for (const ch of (groupMap.get(g) || [])) {
            // ★ 同一频道的多个不同 URL 全部保留，每个 URL 输出一组 #EXTINF + URL
            const urls = (ch.urls && ch.urls.length > 0) ? ch.urls : [ch.url];
            for (const u of urls) {
                lines.push(`#EXTINF:-1 tvg-logo="${sanitizeAttr(ch.logo)}" group-title="${sanitizeAttr(ch.group)}",${sanitizeAttr(ch.title)}`);
                lines.push(u);
            }
        }
    }
    return lines.join('\n');
}

function buildTXT(channels, promos) {
    const groupMap = new Map();
    const add = (g, title, url) => { if (!groupMap.has(g)) groupMap.set(g, []); groupMap.get(g).push({ title, url }); };
    for (const p of promos) add(p.group || PROMO_DEFAULT_GROUP, p.title, p.url);
    // ★ 同一频道的多个不同 URL 全部保留，每个 URL 输出一行
    for (const ch of channels) {
        if (ch.urls && ch.urls.length > 0) {
            for (const u of ch.urls) add(ch.group, ch.title, u);
        } else {
            add(ch.group, ch.title, ch.url);
        }
    }
    const promoGroups = new Set(promos.map(p => p.group || PROMO_DEFAULT_GROUP));
    const groupOrder = [...Array.from(promoGroups), ...orderedGroupNames(Array.from(groupMap.keys()), promoGroups)];
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

/* ===== 主入口 ======================================================== */

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
        if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
        if (request.method !== "GET" && request.method !== "POST") return jsonResponse({ code: 0, msg: "Method Not Allowed" }, 405);

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
