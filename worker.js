/* ============================================================================
 * 茂哥TV · 直播源聚合 Worker
 * ----------------------------------------------------------------------------
 * 功能：聚合多个直播源 → 测速去重 → 按分组重排 → 输出 m3u / txt / JSON
 *       （兼容苹果 CMS / 猫点 / TVBox 的 list / detail 接口）
 *
 * ★ 后续需要修改的只有两处：「直播源」和「引流地址」
 *   ——分别在下方 [MODIFY-1] 与 [MODIFY-2] 标记，其余逻辑无需改动。
 * ========================================================================== */

/* ============================================================================
 * [MODIFY-1] 直播源（上游地址）
 * ----------------------------------------------------------------------------
 * 后续增删直播源，只改这一个数组即可：
 *   · url        : 直播源地址（m3u 或 txt 格式）
 *   · format     : 显式指定 "m3u" / "txt"；省略则按内容自动判断
 * 也可通过环境变量 SOURCE_URLS（JSON 数组）在部署端覆盖，无需改代码。
 * ========================================================================== */
const SOURCE_URLS = [
    { url: "https://0701.tv1288.xyz/m3u",                              format: "m3u" },
    { url: "https://gh-proxy.com/https://raw.githubusercontent.com/kakaxi-1/IPTV/refs/heads/main/iptv.txt", format: "txt" },
];

/* ============================================================================
 * [MODIFY-2] 引流节目（茂哥TV 置顶）
 * ----------------------------------------------------------------------------
 * 后续更换引流内容，只改这一个数组即可。字段：
 *   · title   : 展示名（用于分组排序与播放名）
 *   · url     : 播放地址（mp4 等）
 *   · group   : 固定为 "茂哥TV"，即置顶分组
 *   · remarks : 备注（如 "置顶引流"）
 * 可通过环境变量 ENABLE_PROMO="false" 关闭引流。
 * ========================================================================== */
const PROMO_LIST = [
    { title: "幸福家",     url: "https://lmlcyp.ccwu.cc/raw/mp4/1.mp4",         pic: "", group: "茂哥TV", from: "线路A", remarks: "置顶引流" },
    { title: "老李卡通",   url: "https://lmlcyp.ccwu.cc/raw/mp4/2.mp4",         pic: "", group: "茂哥TV", from: "线路A", remarks: "置顶引流" },
    { title: "我们一家",   url: "https://lmlcyp.ccwu.cc/raw/mp4/3.mp4",         pic: "", group: "茂哥TV", from: "线路A", remarks: "置顶引流" },
    { title: "25年前",     url: "https://lmlcyp.ccwu.cc/raw/mp4/VDO_0012.mp4",  pic: "", group: "茂哥TV", from: "线路A", remarks: "置顶引流" },
];

/* ============================================================================
 * 以下为「规则配置区」——一般无需改动，按需微调即可。
 * ========================================================================== */

// 垃圾条目过滤（含这些关键词的组名/频道名直接丢弃）
const SPAM_KEYWORDS = [
    "注意事项", "加群", "小草口令", "轮播视频", "US", "关注Q群", "交流群", "防失联",
    "防丢关注", "网址", "更多软件", "广告位", "微信公众号", "最新资源",
    "获取资源", "备用地址", "防丢地址", "更新时间", "关于",
];

// 分组规则：先走精确规则（EXACT_GROUP_RULES），未命中再走这里的关键词首命中
// 顺序敏感：📺 高清频道 需在 🏆 体育 之后（体育赛事名可能含"高清/4K"但优先体育）
const REGROUP_RULES = [
    { group: "📺 高清频道", keywords: ["4K", "8K", "高清", "UHD", "超清", "2160p"] },
    { group: "🏆 体育", keywords: ["体育", "足球", "篮球", "NBA", "CBA", "英超", "欧冠", "中超", "网球", "乒乓球", "羽毛球", "UFC",
        "意甲", "德甲", "西甲", "法甲", "中甲", "足协杯", "超三联赛", "攀岩", "棒球", "海河超", "网球公开赛",
        "斯诺克", "高尔夫", "风云足球", "睛彩篮球", "魅力足球", "游戏风云",
        "WTA", "ATP", "WTT", "德约科维奇", "王欣瑜", "吴易昺", "张帅", "美网", "法网", "温网", "澳网",
        "世预赛", "全场回放", "系列赛", "公开赛", "挑战赛", "马拉松", "滑雪", "自行车", "铁人三项",
        "世界杯", "湘超", "海河", "体坛", "钓鱼", "四海钓鱼", "武术", "拳击", "赛车",
        "羽毛球专场", "乒乓球专场", "篮球专场", "足球赛事", "NBA上海", "国际米兰", "卡利亚里",
        "摔跤", "格斗", "柔道", "WWE", "健美", "越野", "飞盘", "飞镖", "瑜伽", "赛事", "专场",
        "斗地主", "英雄联盟", "和平精英", "穿越火线", "绝地求生", "Big3", "笑看风云",
        "先锋乒羽", "天元围棋", "汽摩"] },
    { group: "🎬 影视", keywords: ["电影", "电视剧", "影视", "院线", "纪录片", "动漫", "动画", "CHC", "华数",
        "韩剧", "美剧", "英剧", "日剧", "泰剧", "剧专区", "探案剧", "都市剧", "刑侦剧", "家庭剧",
        "经典剧", "怀旧剧", "僵尸剧", "抗战剧", "校园剧", "谍战剧", "古装剧", "偶像剧", "爱情剧",
        "搞笑剧", "武侠剧", "穿越剧", "年代剧", "台湾剧", "影院", "剧场", "重温经典", "老故事",
        "经典影片", "新片放映", "抗战经典", "楚汉骄雄", "天地争霸美猴王", "天映", "淘电影", "淘剧场",
        "第一剧场", "风云剧场", "都市剧场", "欢笑剧场"] },
    { group: "📺 港澳台", keywords: ["香港", "澳门", "台湾", "TVB", "台视", "三立", "民视"] },
    { group: "📰 新闻", keywords: ["新闻", "资讯", "时事", "财经", "凤凰", "环球", "公共新闻"] },
    { group: "🎵 音乐人", keywords: ["音乐", "MTV", "K歌", "演唱会", "歌手", "金曲", "老歌", "DJ", "舞曲", "串烧", "精选", "合集"] },
    { group: "👶 少儿", keywords: ["少儿", "儿童", "亲子", "Cartoon", "卡酷", "优漫卡通", "嘉佳卡通", "金鹰卡通"] },
    { group: "🏆 体育", keywords: ["游戏", "电竞", "LOL", "王者", "GAME", "JJ斗地主", "DOTA", "DOTA2", "CSGO"] },
    // 综艺 + 小品曲艺 合并
    { group: "🎭 综艺小品", keywords: ["综艺", "娱乐", "选秀", "脱口秀", "小品", "相声", "曲艺", "戏曲", "淘娱乐", "本山", "麻花", "开心麻花", "赵本山", "潘长江"] },
    // 教育组以精确匹配为主（见 EXACT_GROUP_RULES），此处仅补充不易误伤的窄关键词
    { group: "📚 教育", keywords: ["CETV", "留学", "职业教育", "少儿教育", "早期教育", "远程教育", "中学生", "书画", "文物", "世界地理", "茶频道", "发现之旅", "兵器科技", "生物多样性"] },
    // 注：游戏分组已废弃（并入体育）；购物/健康/广播分组已删除
];

const DEFAULT_GROUP = "📺 其他频道";

// ---- 运行时参数 ----
const CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 20;
const MAX_RETURN_LIMIT = 500;
const FALLBACK_LOGO_BASE = "https://epg.112114.xyz/logo";
const FETCH_TIMEOUT_MS = 15 * 1000;
const SPEED_TEST_TIMEOUT_MS = 5000;
const SPEED_TEST_SAMPLE = 2;

// ---- KV 缓存 ----
const KV_CACHE_KEY = "all_channels_v1";
const KV_TTL_SECONDS = 600;

/* ============================================================================
 * 工具函数
 * ========================================================================== */
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

/* ============================================================================
 * 频道名称规范化
 * ========================================================================== */

// 歌手精确名单（🎵 音乐人 判定用）
const SINGER_NAMES = [
    "周杰伦","林俊杰","邓紫棋","薛之谦","毛不易","李荣浩","陈奕迅","张学友","刘德华","周华健",
    "王力宏","陶喆","李健","张杰","华晨宇","赵雷","汪峰","许巍","朴树","张信哲","周传雄","郑源",
    "费玉清","谭咏麟","张国荣","陈百强","黄家驹","Beyond","beyond","BEYOND","王菲","那英","莫文蔚",
    "梁静茹","张惠妹","孙燕姿","蔡健雅","汪明荃","韩宝仪","高胜美","卓依婷","毛阿敏","陈粒","周深",
    "刀郎","云朵","云菲菲","任然","任贤齐","古巨基","刘若英","徐良","方大同","杨丞琳","杨钰莹",
    "林依轮","林忆莲","林志炫","汪苏泷","庄心妍","姜育恒","孙露","梅朵","汤潮","乔洋","丁当",
    "南拳妈妈","By2","Tank","Alin","五月天","阿悠悠","阿杜","屠洪刚","黄家强","李宗盛","童安格",
    "齐秦","赵传","伍佰","罗大佑","崔健","许冠杰","谭晶","韩磊","阎维文","吕继宏","戴玉强","廖昌永",
    "殷秀梅","关牧村","宋祖英","祖海","张也","汤灿","谭维维","李宇春","周笔畅","何洁","尚雯婕",
    "郁可唯","黄龄","王心凌","罗志祥","蔡依林","萧亚轩","许嵩","黎明","甄妮","腾格尔","赵本山",
    "贾玲","邓丽君","陈慧娴","陈慧琳","陈淑桦","金海心","郭静","魏佳艺","魏新雨","颜人中","董贞",
    "权志龙","潘玮柏","贾斯汀比伯","星弟","小贱","徐小凤","李玉刚","李翊君","张韶涵","张靓颖",
    "吴克群","光良","品冠","陈小春","郑中基","苏永康","许志安","陈晓东","张卫健","谢霆锋","余文乐",
    "吴镇宇","黄秋生","刘青云","郑伊健","陈瑞","许蒿","红歌","韦小宝","飞轮海","Twins","草蜢","温拿","达明一派",
];

// 小品/曲艺精确白名单
const CROSSTALK_NAMES = new Set([
    "不差钱","卖拐","卖车","捐助","捐助后传","钟点工","昨天今天明天","就差钱","中奖了","吃面",
    "我想有个家","最佳酒友","家庭欢乐秀","超级大明星","龙腾虎跃","幸福密码","火炬手","欢乐小贩",
    "欢乐相伴","老王卖瓜","经典小品","开心小品","晶晶小品","yy小品","许君聪","中国航天“逆袭”之路","新动力量创一流",
]);
const CROSSTALK_PAT = /小品|相声|二人转|杂技|魔术|曲艺|本山|贾玲|开心麻花|爱笑会议室|阳仔演笑会|演笑会|赵本山|潘长江/;

// 单部影视作品名关键词
const MOVIE_TITLE_KEYWORDS = [
    "变形金刚","星球大战","长津湖","钢铁侠","封神榜","雪山飞狐","司藤","洗冤录","陀枪师姐","刑事侦缉档案",
    "X战警","黑凤凰","金刚狼","死侍","复仇者","蜘蛛侠","蝙蝠侠","超人","神奇女侠","雷神","美国队长",
    "黑豹","奇异博士","银河护卫队","蚁人","绿巨人","海王","闪电侠","正义联盟","哥斯拉","侏罗纪","金刚",
    "大唐双龙传","妙手仁心","扫黄先锋","天地争霸美猴王","楚汉骄雄","功夫之王","头号玩家","终结者",
    "木叶上忍","同桌的你","酒醉的蝴蝶","千里江山图","港版西游记","日月神剑","韦小宝","野蛮亲家",
    "整容归来","非诚来扰","狭路相逢","新鸳鸯蝴蝶梦","小丑","阿凡达","泰坦尼克","黑客帝国","指环王",
    "哈利波特","速度与激情","战狼","红海行动","你好李焕英","流浪地球","满江红","独行月球",
    "西游记","水浒传","三国演义","红楼梦","射雕英雄传","天龙八部","鹿鼎记","笑傲江湖","倚天屠龙记",
    "乡村爱情","刘老根","马大帅","家有儿女","武林外传","炊事班的故事","地下交通站","闲人马大姐","东北一家人",
];

function isMusician(t) {
    const low = t.toLowerCase();
    if (SINGER_NAMES.some(s => s.toLowerCase() === low || (s.length >= 2 && low.includes(s.toLowerCase())
            && /(精选|\d+首|歌曲|金曲|老歌|怀旧|经典|合集|点播|串烧|舞曲|DJ|演唱会|专辑|单曲|歌单|$)/.test(low)))) return true;
    if (SINGER_NAMES.some(s => low.includes(s.toLowerCase())) && /(精选|\d+首|歌曲|金曲|老歌|怀旧|经典|合集|点播|串烧|舞曲|DJ|演唱会|专辑|单曲|歌单|\d)$/.test(t)) return true;
    if (/(精选|\d+首|经典歌曲?|金曲|老歌|热歌|新歌|怀旧|试音|天碟|人声测试|歌单)\d*$/.test(t)) return true;
    if (/(歌曲|DJ|舞曲|老歌|金曲|合集|点播|串烧|红歌|热歌|伤感|歌单)/i.test(t)) return true;
    if (/^\d+(首|首经典)/.test(t)) return true;
    if (/DJ串烧|DJ舞曲|DJ混音|舞曲|EDM|车载DJ|夜店|越南鼓/.test(t)) return true;
    if (/演唱会|MV$|专辑|单曲|OST|合唱|演奏|钢琴|二胡|古筝|民乐|交响|声乐/.test(t)) return true;
    if (/梨园|戏曲|京剧|越剧|黄梅戏|豫剧|评剧/.test(t)) return true;
    if (/^(串烧|华语|国语|粤语|日语|韩语|英文|欧美|车载|夜店|DJ)/.test(t)) return true;
    if (/一人一首|\d+首经典?歌曲?|车载|经典老歌|怀旧金曲/.test(t)) return true;
    if (/听闻远方有你|月亮.*你别睡|月亮代表我的心/.test(t)) return true;
    return false;
}

function isCrosstalk(t) {
    if (CROSSTALK_NAMES.has(t)) return true;
    const base = t.replace(/\d+$/, "").replace(/后传$/, "");
    if (CROSSTALK_NAMES.has(base) || CROSSTALK_NAMES.has(t.replace(/\d+$/, ""))) return true;
    if (CROSSTALK_PAT.test(t)) return true;
    if (/小品/.test(t)) return true;
    return false;
}

// 地名前缀（有地名 → 地方台）
const PLACE_PREFIXES = [
    "北京","天津","上海","重庆","河北","山西","辽宁","吉林","黑龙江","江苏","浙江","安徽","福建","江西",
    "山东","河南","湖北","湖南","广东","广西","海南","四川","贵州","云南","陕西","甘肃","青海","宁夏",
    "新疆","内蒙古","西藏","深圳","广州","东莞","苏州","南京","无锡","绍兴","湖州","哈尔滨","太原",
    "西安","成都","昆明","福州","厦门","南昌","合肥","郑州","武汉","长沙","杭州","沈阳","大连","青岛",
    "宁波","咸阳","延安","榆林","商洛","铜川","宝鸡","安康","运城","大同","嘉兴","温州","金华","扬州",
    "镇江","宿迁","淮安","连云港","徐州","常州","南通","泰州","盐城","佛山","珠海","惠州","中山","江门",
    "肇庆","汕头","汕尾","茂名","湛江","梅州","河源","清远","韶关","阳江","潮州","揭阳","云浮","桂林",
    "柳州","贵港","玉林","百色","来宾","崇左","钦州","北海","安顺","毕节","铜仁","六盘水","遵义",
    "黔东南","黔南","黔西南","大理","丽江","红河","曲靖","玉溪","楚雄","保山","昭通","临沧","文山",
    "德宏","怒江","迪庆","天水","白银","武威","张掖","平凉","庆阳","定西","陇南","临夏","甘南","酒泉",
    "嘉峪关","金昌","呼和浩特","包头","赤峰","通辽","鄂尔多斯","呼伦贝尔","巴彦淖尔","乌兰察布","拉萨",
    "日喀则","山南","林芝","昌都","那曲","阿里","银川","石嘴山","吴忠","固原","中卫","忻州","晋中",
    "临汾","长治","晋城","朔州","吕梁","阳泉","渭南","汉中","密云","延庆","房山","通州","徐水","邯郸",
    "邢台","涞源","象山","桐乡","海宁","平湖","嘉善","长兴","德清","景德镇","金坛",
];
const PLACE_SUFFIXES = [
    "电视台","融媒","综合","公共","文旅","民生","法治","科教","银龄","城市","经济","生活","社会","都市",
    "乡村","农民","农科","纪录","纪实","娱乐","影视剧","电视剧","少儿","新闻","文体","一套","二套","三套",
    "四套","五套","六套","七套","八套","九套","十套","城乡","国际频道","自贸频道",
];

function isPlace(t) {
    for (const p of PLACE_PREFIXES) if (t.startsWith(p)) return true;
    for (const s of PLACE_SUFFIXES) if (t.endsWith(s)) return true;
    return false;
}

// 是否为体育频道（用于在高清频道组中排除，使其归入 🏆体育）
function isSportsChannel(t) {
    if (/体育(休闲|频道)?$|体育休闲频道|竞技频道|睛彩竞技|睛彩篮球|睛彩足球|睛彩赛车/.test(t)) return true;
    return /^(北京|天津|上海|重庆|河北|山西|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|广东|广西|海南|四川|贵州|云南|陕西|甘肃|青海|宁夏|新疆|内蒙古|深圳|广州|苏州|南京|成都|武汉|长沙|沈阳|大连|青岛)体育$/.test(t);
}

/* ============================================================================
 * 精确分组规则（最高优先级）：命中即定组，不再继续匹配
 * 顺序敏感：春晚 / 熊猫 / 音乐人 / 曲艺 必须在「央视 / 高清 / 影视」等通用规则之前
 * ========================================================================== */
const EXACT_GROUP_RULES = [
    // 茂哥TV 推广节目：由 PROMO_LIST [MODIFY-2] 硬编码独立置顶
    { group: "茂哥TV", test: t => /^(幸福家|老李卡通|我们一家|25年前)$/.test(t) },
    // 咪咕独立分组
    { group: "📡 咪咕", test: t => /咪咕/.test(t) || t === "看东方" },
    { group: "🎬 影视", test: t => t === "笑傲" || t === "中国航天逆袭之路" },
    // 体育精确指定（睛彩系列 / 城市联赛轮播台 / 赛事）
    { group: "🏆 体育", test: t => /^(睛彩中原|睛彩广场舞|睛彩青少|24小时城市联赛轮播台)/.test(t)
        || /英超|城市联赛|足球赛事|篮球赛事/i.test(t) },
    { group: "🎭 综艺小品", test: t => t === "小崔说事" || t === "小崔说事儿" || t === "相亲1" || t === "相亲2" || t === "许君聪" },
    // 购物/健康/广播分组已废弃或合并 → 新闻 / 教育
    { group: "📰 新闻", test: t => t === "财富天下" || t === "家庭理财" },
    { group: "📚 教育", test: t => /养生|中医|食疗|健身|瑜伽|心理/.test(t) && !/卫生健康/.test(t) },
    { group: "📰 新闻", test: t => /卫生健康|健康资讯/.test(t) },
    { group: "📰 新闻", test: t => /广播|电台|之声|Radio|radio/.test(t) },
    // 春晚 / 熊猫（需在央视规则之前）
    { group: "🎉 春晚", test: t => /春晚|春节联欢|春节晚会|元宵晚会|中秋晚会|跨年晚会|组团上春晚/.test(t) },
    { group: "🐼 熊猫", test: t => /熊猫频道|Panda/i.test(t) },
    // 中央频道：凡以 CCTV 开头一律归中央频道（CCTV5+ 除外 → 体育）
    { group: "中央频道", test: t => {
        if (!/^CCTV/i.test(t)) return /央视|CGTN|中央电视/.test(t);
        if (/^CCTV\s*5\s*[+＋]/i.test(t)) return false;   // CCTV5+ → 体育
        return true;
    } },
    // 高清频道（CCTV* 已归中央频道，体育频道由 🏆体育 先匹配）
    { group: "📺 高清频道", test: (t, u) => {
        const isHd = (
            /(IPTV\s*(淘|萌宠|超清|Baby)|淘Baby|淘萌宠|淘剧场|淘电影|淘娱乐|淘BABY|淘萌宠TV|睛彩|BTV|北京高清)/i.test(t)
            && !/^CCTV/i.test(t)
        ) || /(?<![A-Za-z0-9])(4K|8K|UHD)(?![A-Za-z0-9])/.test(t)
            || (/高清$/.test(t) && !/体育高清/.test(t))
            || (u && /4[kK]|uhd|2160p|4k2160p/i.test(u))
            || /变形金刚|混剪3D|3D投影|艺术科技/i.test(t)
            || /4[kK]2160p|2160[pP]|_4[kK]\./.test(t);
        if (!isHd) return false;
        return !isSportsChannel(t);
    } },
    // 体育频道（睛彩竞技 / 竞技频道 / XX体育）→ 🏆体育
    { group: "🏆 体育", test: t => /^CCTV\s*5\s*[+＋]/i.test(t) || isSportsChannel(t) },
    { group: "🎭 综艺小品", test: t => isCrosstalk(t) },
    // 歌手 / 音乐人
    { group: "🎵 音乐人", test: t => isMusician(t) },
    // 影视（单部作品 / 剧场频道；非歌曲前提下）
    { group: "🎬 影视", test: t => !isMusician(t) && (
        MOVIE_TITLE_KEYWORDS.some(k => t.includes(k))
        || ["电影","电视剧","院线","纪录片","动漫","动画","重温经典","老故事","经典影片","新片放映","抗战经典影片",
            "天映频道","淘电影","淘剧场","第一剧场","风云剧场","都市剧场","欢笑剧场","电影台","影视剧","功夫"]
            .some(k => t.includes(k))
        || /^(电影|电视剧|影院|剧场|影视|剧集|连续剧|短剧)/.test(t)
        || /(剧场|影院|影视)$/.test(t)
        || /(究极对决|忍者|海贼王|火影|龙珠|奥特曼|铠甲勇士)/.test(t)) },
    // 省级卫视
    { group: "📡 卫视", test: t => /卫视$/.test(t) || /^(湖南|浙江|江苏|东方|北京|广东|深圳|安徽|山东|河南|河北|湖北|江西|辽宁|吉林|黑龙江|天津|重庆|四川|贵州|云南|广西|福建|陕西|甘肃|青海|宁夏|新疆|西藏|内蒙古|海南|山西|上海)卫视$/.test(t) },
    // 教育频道（精确匹配，避免"学习教育"等误入）
    { group: "📚 教育", test: t => /^中央教育[-_]?\d$|^(CETV|中国教育)\s*[-_]?\s*\d/i.test(t)
        || /书画|文物|发现之旅|世界地理|生物多样性|茶频道|视觉艺术|艺术科技|不同国家|兵器科技|文化旅游|文物宝库/.test(t) },
    // 地方台
    { group: "🎬 地方台", test: t => isPlace(t) },
];

function matchGroup(title) {
    if (!title) return DEFAULT_GROUP;
    for (const rule of REGROUP_RULES) {
        for (const kw of rule.keywords) {
            if (title.includes(kw)) return rule.group;
        }
    }
    return DEFAULT_GROUP;
}

// 增强版分组：精确匹配优先 → 关键词模糊匹配
function matchGroupV2(title, url) {
    if (!title) return DEFAULT_GROUP;
    const norm = normalizeChannelName(title);
    const candidates = [norm, title];
    for (const t of candidates) {
        for (const rule of EXACT_GROUP_RULES) {
            try {
                if (rule.test(t, url)) {
                    if (rule.group === "🎬 地方台" && /体育/.test(t)) continue;
                    return rule.group;
                }
            } catch (e) {
                if (rule.test(t)) {
                    if (rule.group === "🎬 地方台" && /体育/.test(t)) continue;
                    return rule.group;
                }
            }
        }
    }
    // CCTV 兜底：凡以 CCTV 开头一律中央频道（CCTV5+ 除外 → 体育）
    if (/^CCTV/i.test(norm) && !/^CCTV\s*5\s*[+＋]/i.test(norm)) return "中央频道";
    if (/央视|CGTN|中央电视/.test(norm)) return "中央频道";
    return matchGroup(norm);
}

/* ============================================================================
 * 名称清洗：去噪音、统一书写格式
 * ========================================================================== */
function normalizeChannelName(rawTitle) {
    if (!rawTitle) return "未知频道";
    let name = rawTitle.trim();

    // 0) 占位符清洗
    name = name.replace(/\s*undefined\s*/gi, " ");
    name = name.replace(/\s*null\s*/gi, " ");
    name = name.replace(/\s*\[object\s+[^\]]*?\]\s*/g, "");

    // CCTV 主台号 → 官方名映射（函数级，供下方 5(b+)、5b 各处复用）
    const CCTV_MAIN = {
        "1": "综合", "2": "财经", "3": "综艺", "4": "中文国际",
        "5": "体育", "6": "电影", "7": "国防军事", "8": "电视剧",
        "9": "纪录", "10": "科教", "11": "戏曲", "12": "社会与法",
        "13": "新闻", "14": "少儿", "15": "音乐", "16": "奥林匹克", "17": "农业农村",
    };

    // 1) 保留作为频道身份的 4K/8K/UHD，仅清理括号画质 / 尾部规格词 / 孤立"高清"
    name = name.replace(/\s*[（(](?:4K|8K|HD|高清|超清|蓝光|标清|原画)[)）]/gi, "");
    name = name.replace(/\s*(超清|蓝光|标清|原画|2160P|1080[PI]|720[PI]|480[PI]|FHD)\s*$/gi, "");
    name = name.replace(/\s*(高清|HD)\s*$/gi, "");

    // 2) 去除来源 / 线路标记
    name = name.replace(/\s*[-－—]\s*(?:线路|源|备用|主用|首选|直播|官方|测试|临时|新)\s*[\d一二三四五六七八九十①②③④⑤]?\s*$/gi, "");
    name = name.replace(/\s*[\[【][^\]】]*?(?:线路|源|备用|L\d+)[^\]】]*?[\]】]/gi, "");

    // 3) 去除重复短语
    name = name.replace(/\s*([\u4e00-\u9fa5A-Za-z]{2,})\s+\1\s*/g, " $1 ");

    // 4) 去除尾部方括号 / 圆括号噪音
    name = name.replace(/\s*[\[【]\s*[\]】]/g, "");
    name = name.replace(/\s*[\[【][^\[\]】]*?[\]】]/g, "");
    name = name.replace(/\s*[（(][^()）]*?[)）]/g, "");

    // 5) CCTV 前缀 / 序号噪声清理（只动结构，不改写名称主体）
    //   (b+) 把「CCTV<n>-<m>」合成为两位真实台号并直接补全官方名
    //        （CCTV1-1 → CCTV11-戏曲），仅当合成结果属于 CCTV11~CCTV17 时生效。
    //        直接补全官方名可避免被下方 5b(1) 的贪婪正则把 "CCTV11" 误拆为 n=1,suffix=1。
    name = name.replace(/^CCTV\s*(\d)\s*-\s*([1-7])\s*$/i, (_, a, b) => {
        const two = a + b;  // "11".."17"
        return CCTV_MAIN[two] ? "CCTV" + two + "-" + CCTV_MAIN[two] : "CCTV" + a + "-" + b;
    });
    name = name.replace(/^CCTV\s*(\d)\s*-\s*([1-7])\s*(-\s*)([^\s].*)$/i, (_, a, b, dash, rest) => {
        const two = a + b;
        return CCTV_MAIN[two] ? "CCTV" + two + "-" + rest : "CCTV" + a + "-" + b + dash + rest;
    });
    //   (a) CCTV-1 / CCTV 1 → CCTV1
    name = name.replace(/\bCCTV\s*[-·.\s]?\s*(\d+)\b/gi, "CCTV$1");
    //   (b) CCTV1-1-戏曲 → CCTV1-戏曲（剔除台号后紧跟的单个数字序号段）
    name = name.replace(/^CCTV\s*(\d+)\s*-\s*(\d)\s*(-\s*)([^\s].*)$/i, (_, n, m, dash, rest) => {
        const nn = Number(n), mm = Number(m);
        return (mm === nn || mm < nn) ? "CCTV" + nn + "-" + rest : "CCTV" + n + "-" + m + dash + rest;
    });
    name = name.replace(/^CCTV\s*(\d+)\s*-\s*(\d)\s*(-\s*)$/i, (_, n, m, tail) => {
        const nn = Number(n), mm = Number(m);
        return (mm === nn || mm < nn) ? "CCTV" + nn + tail.replace(/-$/, "") : "CCTV" + n + "-" + m + tail;
    });
    //   (c) CCTV1-0-科教 → CCTV10-科教（-0 是台号十位被拆分）
    name = name.replace(/^CCTV\s*(\d+)\s*-\s*0\s*(-\s*)?/i, (_, n, dash) => "CCTV" + n + "0" + (dash || "-"));
    //   (d) 清理残留重复台号段
    name = name.replace(/^(CCTV\s*\d+)\s*-\s*\d\d?\s*(-\s*|\s+)([^\s].*)$/i, (_, head, sep, rest) => head + "-" + rest);
    name = name.replace(/^(CCTV\s*\d+)\s*-\s*\d\d?\s*$/i, (_, head) => head);
    //   (e) CCTV-品牌 内冗余"央视"前缀剥离（CCTV-央视文化精品 → CCTV-文化精品）
    name = name.replace(/^CCTV-(央视)([^\s].*)$/i, "CCTV-$2");

    // 5b) CCTV 命名规范：统一为「CCTV<台号>-<官方名>」
    //   主台 CCTV1~CCTV17、同台号后缀（CCTV4-欧洲）、品牌付费（CCTV-世界地理）、CCTV5+ 保留
    // (1) CCTV + 数字 + 后缀 → CCTV<n>-<后缀>
    name = name.replace(/^CCTV\s*(\d+)\s*[-·—－\s]?\s*([^\s\-+＋][^\s]*)$/i, (_, n, suffix) => {
        if (n === "1" && /^0-?科教/.test(suffix)) return "CCTV10-科教";
        let s = suffix.replace(/(频道|台|Channel|CH)$/i, "").trim();
        if (n === "1" && s === "科教") return "CCTV10-科教";
        if (n === "1" && /^CCTV1[-_]?/.test(s)) s = s.replace(/^CCTV1[-_]?/, "");
        if (s === "" || s === CCTV_MAIN[n]) s = CCTV_MAIN[n] || s;
        return "CCTV" + n + "-" + s;
    });
    // (2) CCTV + 无数字（品牌付费频道）→ CCTV-<品牌名>
    name = name.replace(/^CCTV\s*([^\s\d\-+＋][^\s]*)$/i, (_, brand) => {
        let b = brand.replace(/(频道|台|Channel|CH)$/i, "").trim();
        b = b.replace(/^央视/, "");
        return "CCTV-" + b;
    });
    // (3) 纯数字主台 CCTV<n>（无后缀）→ CCTV<n>-<官方名>
    name = name.replace(/^CCTV(\d+)$/i, (_, n) => {
        const map = {};
        for (const [k, v] of Object.entries(CCTV_MAIN)) map[k] = "CCTV" + k + "-" + v;
        return map[n] || ("CCTV" + n);
    });
    // (4) CCTV5+ 保留「CCTV5+」（归体育）
    name = name.replace(/^CCTV\s*5\s*[+＋]\s*$/i, "CCTV5+");

    // 5b-2) 央视XX → CCTV-<名>
    name = name.replace(/^央视\s*([^\s\-+＋].*)$/, (_, b) => {
        const map = { "台球": "台球", "文化精品": "文化精品", "精品": "精品" };
        return "CCTV-" + (map[b] || b);
    });
    // 5b-3) CGTN 系列统一为「CGTN-<语种>」
    name = name.replace(/^CGTN\s*([^\s].*)$/i, (_, s) => {
        let v = s.replace(/语$/, "");
        const short = { "阿拉伯语": "阿语", "法语": "法", "俄语": "俄", "西班牙语": "西语", "纪录": "纪录", "外语纪录": "纪录", "阿语": "阿语", "西语": "西语" };
        v = short[v] || v;
        return "CGTN" + (v ? "-" + v : "");
    });

    // 5c) 中央教育统一：中央教育1 / 中央教育-1 / CETV1 → 中央教育-1
    {
        const m1 = name.match(/^中央教育\s*[-_]?\s*(\d)\s*台?$/);
        const m2 = name.match(/^CETV\s*[-_]?\s*(\d)/i);
        const m3 = name.match(/^中国教育\s*[-_]?\s*(\d)/);
        const m = m1 || m2 || m3;
        if (m) name = "中央教育-" + m[1];
    }

    // 6) 卫视统一
    name = name.replace(/^(.+?)\s*(卫视)\s*$/, "$1$2");
    // 6.1) 熊猫频道：频道01 → 频道1
    name = name.replace(/(熊猫频道)0(\d)/, "$1$2");
    // 7) 全角 → 半角
    const full2half = { "（": "(", "）": ")", "【": "[", "】": "]", "［": "[", "］": "]", "：": ":", "；": ";", "，": "," };
    name = name.replace(/[（）、。；：！？「」『』（）【】［］：；，]/g, m => full2half[m] || m);
    // 6.2) 重复短横归一：CCTV--俄语 / CGTN---俄 → CCTV-俄语 / CGTN-俄
    name = name.replace(/^(CCTV|CGTN)\s*[-–—－]{2,}/i, "$1-");
    // 8) 清理首尾标点与多余空白
    name = name.replace(/^[·•·\-－—\s]+|[·•·\-－—\s]+$/g, "");
    name = name.replace(/\s{2,}/g, " ");

    // 9) 名称兜底修正（规范化完成后处理，避免被 5b 误判台号）
    //   CCTV1-0-科教 → CCTV10-科教（双保险）
    name = name.replace(/^CCTV\s*1\s*-\s*0\s*(-\s*科教)?$/i, "CCTV10-科教");
    //   反混淆：CCTV10~17 台号常被误写为 "1"（CCTV1-农业农村 → CCTV17-农业农村）
    //   仅作用于 "CCTV1-<官方名>"，真正属于 CCTV1 的（CCTV1-综合）保持不变
    {
        const SUFFIX_TO_NO = {
            "科教": "10", "戏曲": "11", "社会与法": "12", "新闻": "13",
            "少儿": "14", "音乐": "15", "奥林匹克": "16", "农业农村": "17",
        };
        const m = name.match(/^CCTV\s*1\s*-\s*([^\s\-+＋][^\s]*)$/i);
        if (m && SUFFIX_TO_NO.hasOwnProperty(m[1])) {
            name = "CCTV" + SUFFIX_TO_NO[m[1]] + "-" + m[1];
        }
    }

    return name.trim() || rawTitle.trim();
}

/* ============================================================================
 * 解析器
 * ========================================================================== */
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

// 清理 URL 中 '$标记' 后缀（如 $北京联通11、$天津联通11）
function cleanUrl(rawUrl) {
    let u = rawUrl.trim();
    const hi = u.indexOf('#');
    if (hi !== -1 && u.substring(hi + 1).trim()) u = u.substring(0, hi).trim();
    const di = u.indexOf('$');
    if (di !== -1) u = u.substring(0, di).trim();
    return u;
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
        let urlPart = cleanUrl(line.substring(commaIdx + 1));
        if (!title || !urlPart) continue;
        if (isSpam(currentGroup) || isSpam(title)) continue;
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

/* ============================================================================
 * 抓取
 * ========================================================================== */
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

/* ============================================================================
 * 测速去重
 * ========================================================================== */
async function probeUrl(url) {
    const start = Date.now();
    try {
        const resp = await fetchWithTimeout(url, SPEED_TEST_TIMEOUT_MS, { method: "HEAD" });
        const cost = Date.now() - start;
        if (resp.ok) return cost;
        if (resp.status === 405 || resp.status === 404) return cost;
        return Infinity;
    } catch {
        return Infinity;
    }
}

async function speedTest(urls) {
    const samples = urls.slice(0, SPEED_TEST_SAMPLE);
    const results = await Promise.all(samples.map(async u => ({ url: u, time: await probeUrl(u) })));
    results.sort((a, b) => a.time - b.time);
    return results;
}

// 去重原则：同一播放地址(URL)保留唯一一条；同名合并，title 取最短
async function mergeAndDedup(channels) {
    const byUrl = new Map();
    for (const ch of channels) {
        const normTitle = normalizeChannelName(ch.title);
        const urls = Array.isArray(ch.urls) && ch.urls.length > 0 ? ch.urls : [ch.url];
        for (const u of urls) {
            if (!u) continue;
            if (!byUrl.has(u)) {
                byUrl.set(u, { ...ch, title: normTitle, names: [normTitle], urls: [u], url: u });
            } else {
                const rec = byUrl.get(u);
                if (!rec.names.includes(normTitle)) rec.names.push(normTitle);
                rec.title = pickShortestTitle(rec.title, normTitle);
                if (!rec.urls.includes(u)) rec.urls.push(u);
                if (rec.group === DEFAULT_GROUP && ch.group !== DEFAULT_GROUP) {
                    rec.group = ch.group;
                    rec.orig_group = ch.group;
                }
            }
        }
    }
    const merged = [];
    for (const rec of byUrl.values()) {
        const names = [...rec.names].sort((a, b) => a.length - b.length || a.localeCompare(b));
        const shortest = names[0];
        let displayTitle = shortest;
        if (names.length > 1) {
            const aliases = names.filter(n => n !== shortest).join("/");
            displayTitle = `${shortest}(${aliases})`;
        }
        merged.push({ ...rec, title: displayTitle, url: rec.urls[0], urls: rec.urls });
    }
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

function pickShortestTitle(a, b) {
    if (!a) return b;
    if (!b) return a;
    if (a.length !== b.length) return a.length < b.length ? a : b;
    return a.localeCompare(b) <= 0 ? a : b;
}

/* ============================================================================
 * 缓存读写
 * ========================================================================== */
function resolveSourceUrls(env) {
    if (env && env.SOURCE_URLS) {
        try {
            const parsed = JSON.parse(env.SOURCE_URLS);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch (e) {
            console.error(`[resolveSourceUrls] 环境变量解析失败: ${e.message}`);
        }
    }
    return SOURCE_URLS;   // 回退到 [MODIFY-1] 的硬编码值
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

    // 重新分组（精确优先 + 传首个 url 用于 4K 识别）
    const regrouped = allChannels.map(ch => {
        const firstUrl = (Array.isArray(ch.urls) && ch.urls[0]) || ch.url || "";
        return { ...ch, orig_group: ch.group, group: matchGroupV2(ch.title, firstUrl) };
    });

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

/* ============================================================================
 * Vod 构造
 * ========================================================================== */
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
    const urls = (ch.urls && ch.urls.length > 0) ? ch.urls : [ch.url];
    const playUrl = urls.length > 1 ? `${ch.title}$${urls.join('#')}` : `${ch.title}$${urls[0]}`;
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

/* ============================================================================
 * 响应构造
 * ========================================================================== */

// 地区排序（用于地方台按省份拆分）
const REGION_ORDER = [
    "北京", "天津", "上海", "重庆",
    "河北", "山西", "辽宁", "吉林", "黑龙江", "江苏", "浙江", "安徽", "福建", "江西",
    "山东", "河南", "湖北", "湖南", "广东", "广西", "海南", "四川", "贵州", "云南",
    "陕西", "甘肃", "青海", "宁夏", "新疆", "内蒙古", "西藏",
    "深圳", "广州", "苏州", "南京", "杭州", "成都", "武汉", "长沙", "西安",
];

// 城市 → 所属省份
const CITY_TO_REGION = {
    "南京": "江苏", "苏州": "江苏", "无锡": "江苏", "常州": "江苏", "南通": "江苏",
    "扬州": "江苏", "徐州": "江苏", "盐城": "江苏", "镇江": "江苏", "泰州": "江苏",
    "淮安": "江苏", "连云港": "江苏", "宿迁": "江苏", "嘉兴": "浙江", "湖州": "浙江",
    "绍兴": "浙江", "温州": "浙江", "金华": "浙江", "台州": "浙江", "丽水": "浙江",
    "衢州": "浙江", "舟山": "浙江", "合肥": "安徽", "芜湖": "安徽", "阜阳": "安徽",
    "马鞍山": "安徽", "安庆": "安徽", "蚌埠": "安徽", "泉州": "福建", "厦门": "福建",
    "福州": "福建", "漳州": "福建", "南昌": "江西", "赣州": "江西", "济南": "山东",
    "青岛": "山东", "烟台": "山东", "潍坊": "山东", "临沂": "山东", "淄博": "山东",
    "济宁": "山东", "泰安": "山东", "威海": "山东", "郑州": "河南", "洛阳": "河南",
    "开封": "河南", "武汉": "湖北", "宜昌": "湖北", "襄阳": "湖北", "荆州": "湖北",
    "长沙": "湖南", "邵阳": "湖南", "岳阳": "湖南", "常德": "湖南", "衡阳": "湖南",
    "株洲": "湖南", "广州": "广东", "深圳": "广东", "东莞": "广东", "佛山": "广东",
    "珠海": "广东", "惠州": "广东", "中山": "广东", "汕头": "广东", "江门": "广东",
    "湛江": "广东", "茂名": "广东", "清远": "广东", "揭阳": "广东", "梅州": "广东",
    "南宁": "广西", "桂林": "广西", "柳州": "广西", "海口": "海南", "三亚": "海南",
    "成都": "四川", "绵阳": "四川", "德阳": "四川", "宜宾": "四川", "南充": "四川",
    "贵阳": "贵州", "遵义": "贵州", "安顺": "贵州", "六盘水": "贵州", "铜仁": "贵州",
    "毕节": "贵州", "黔东南": "贵州", "黔南": "贵州", "昆明": "云南", "大理": "云南",
    "丽江": "云南", "曲靖": "云南", "西安": "陕西", "咸阳": "陕西", "宝鸡": "陕西",
    "延安": "陕西", "榆林": "陕西", "渭南": "陕西", "汉中": "陕西", "安康": "陕西",
    "商洛": "陕西", "铜川": "陕西", "太原": "山西", "大同": "山西", "运城": "山西",
    "临汾": "山西", "晋中": "山西", "晋城": "山西", "长治": "山西", "朔州": "山西",
    "忻州": "山西", "吕梁": "山西", "阳泉": "山西", "呼和浩特": "内蒙古", "包头": "内蒙古",
    "赤峰": "内蒙古", "通辽": "内蒙古", "鄂尔多斯": "内蒙古", "呼伦贝尔": "内蒙古",
    "巴彦淖尔": "内蒙古", "乌兰察布": "内蒙古", "锡林郭勒盟": "内蒙古", "阿拉善": "内蒙古",
    "拉萨": "西藏", "日喀则": "西藏", "沈阳": "辽宁", "大连": "辽宁", "鞍山": "辽宁",
    "抚顺": "辽宁", "本溪": "辽宁", "丹东": "辽宁", "锦州": "辽宁", "营口": "辽宁",
    "阜新": "辽宁", "辽阳": "辽宁", "盘锦": "辽宁", "铁岭": "辽宁", "朝阳": "辽宁",
    "葫芦岛": "辽宁", "长春": "吉林", "吉林市": "吉林", "四平": "吉林", "通化": "吉林",
    "延边": "吉林", "松原": "吉林", "白城": "吉林", "哈尔滨": "黑龙江", "齐齐哈尔": "黑龙江",
    "大庆": "黑龙江", "牡丹江": "黑龙江", "佳木斯": "黑龙江", "鸡西": "黑龙江",
    "鹤岗": "黑龙江", "双鸭山": "黑龙江", "伊春": "黑龙江", "七台河": "黑龙江",
    "绥化": "黑龙江", "黑河": "黑龙江", "银川": "宁夏", "石嘴山": "宁夏", "吴忠": "宁夏",
    "固原": "宁夏", "中卫": "宁夏", "兰州": "甘肃", "天水": "甘肃", "酒泉": "甘肃",
    "西宁": "青海", "乌鲁木齐": "新疆", "景德镇": "江西", "金坛": "江苏",
    "呼市": "内蒙古", "兴安": "内蒙古", "汕尾": "广东",
};

const MUNICIPALITIES = ["北京", "天津", "上海", "重庆"];

function detectRegion(title) {
    if (!title) return null;
    for (const m of MUNICIPALITIES) if (title.startsWith(m)) return m;
    for (const prov of REGION_ORDER) if (title.startsWith(prov)) return prov;
    for (const city of Object.keys(CITY_TO_REGION)) if (title.startsWith(city)) return CITY_TO_REGION[city];
    return null;
}

function regionDisplay(region) {
    return MUNICIPALITIES.includes(region) ? region : region + "地区";
}

// 分组名归一化（别名 → 标准名）
//   · 🎵 音乐 / 🎤 音乐人 → 🎵 音乐人
//   · 🎭 综艺 / 🎭 综艺小品 → 🎭 小品曲艺
//   · 📺 央视 → 中央频道
const GROUP_ALIAS_MAP = {
    "🎵 音乐": "🎵 音乐人", "🎤 音乐人": "🎵 音乐人",
    "🎭 综艺": "🎭 小品曲艺", "🎭 综艺小品": "🎭 小品曲艺", "小品曲艺": "🎭 小品曲艺",
    "📺 央视": "中央频道",
};
function normalizeGroupName(g) {
    return GROUP_ALIAS_MAP[g] || g;
}

// 固定分组顺序：茂哥TV / 中央频道置顶，春晚 / 熊猫置底，地方台锚点在春晚之前
const MAIN_GROUP_ORDER = [
    "茂哥TV", "中央频道", "📺 高清频道", "📡 卫视", "🎬 影视", "📡 咪咕", "🏆 体育", "📰 新闻",
    "🎵 音乐人", "🎭 小品曲艺", "📺 港澳台",
    "👶 少儿", "📚 教育", "📺 其他频道",
    // 🎬 地方台 锚点：splitPlaces 拆为「🎬 地方台-XX地区」子分组，输出时展开，排在春晚/熊猫之前
    "🎬 地方台",
    // 春晚 / 熊猫 放到最后（真正末尾）
    "🎉 春晚", "🐼 熊猫",
];

function sortedGroupMap(channels) {
    const groupMap = new Map();
    for (const g of MAIN_GROUP_ORDER) groupMap.set(g, []);
    for (const ch of channels) {
        const g = normalizeGroupName(ch.group);
        if (!groupMap.has(g)) groupMap.set(g, []);
        groupMap.get(g).push({ ...ch, group: g });
    }
    return groupMap;
}

// 自然序："咪咕视频-1" < "咪咕视频-2" < ... < "咪咕视频-10"
function naturalKey(s) {
    return String(s).split(/(\d+)/).map(p => p.match(/^\d+$/) ? Number(p) : p.toLowerCase());
}
function naturalCompare(a, b) {
    const ka = naturalKey(a), kb = naturalKey(b);
    for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
        if (ka[i] < kb[i]) return -1;
        if (ka[i] > kb[i]) return 1;
    }
    return 0;
}

// 各组内排序：中央频道（CCTV1→CCTV17 升序，品牌/CGTN 置后）、春晚（年份）、熊猫（编号）、咪咕（系列序），其余自然序
function sortGroups(groupMap) {
    const cctv = groupMap.get("中央频道") || [];
    function cctvKey(t) {
        const m = t.match(/^CCTV\s*(\d+)/);
        if (m) return { kind: 1, no: Number(m[1]), suffix: t.slice(m[0].length).replace(/^[-–]/, "") };
        return { kind: 2, no: 0, suffix: t };
    }
    cctv.sort((a, b) => {
        const ka = cctvKey(a.title), kb = cctvKey(b.title);
        if (ka.kind !== kb.kind) return ka.kind - kb.kind;   // 主台优先于品牌/CGTN
        const az = ka.no === 1 && (ka.suffix === "综合" || ka.suffix === ""),
              bz = kb.no === 1 && (kb.suffix === "综合" || kb.suffix === "");
        if (az !== bz) return az ? -1 : 1;
        if (az && bz) return 0;
        const aOne = ka.no === 1, bOne = kb.no === 1;
        if (aOne !== bOne) return aOne ? -1 : 1;
        if (ka.no !== kb.no) return ka.no - kb.no;            // CCTV1 → CCTV2 → ... → CCTV17
        return naturalCompare(ka.suffix || "", kb.suffix || "");
    });
    (groupMap.get("🎉 春晚") || []).sort((a, b) => {
        const ya = a.title.match(/(19\d{2}|20\d{2})/), yb = b.title.match(/(19\d{2}|20\d{2})/);
        return (ya ? Number(ya[1]) : -1) - (yb ? Number(yb[1]) : -1);
    });
    (groupMap.get("🐼 熊猫") || []).sort((a, b) => {
        const na = a.title.match(/\d+/), nb = b.title.match(/\d+/);
        return (na ? Number(na[0]) : 0) - (nb ? Number(nb[0]) : 0);
    });
    (groupMap.get("📡 咪咕") || []).sort((a, b) => {
        const SERIES = { "咪咕体育": 0, "咪咕体育日报": 1, "咪咕视频": 2, "咪咕足球赛事": 3, "咪咕游戏赛事": 4 };
        function miguKey(t) {
            const m = t.match(/(咪咕视频|咪咕足球赛事|咪咕游戏赛事|咪咕体育日报|咪咕体育)(?:-(\d+))?$/);
            if (m) return [0, SERIES[m[1]], m[2] ? Number(m[2]) : 0];
            return [1, 0, 0];
        }
        const ka = miguKey(a.title), kb = miguKey(b.title);
        for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
        return 0;
    });
    const alphaGroups = ["📡 卫视", "🎬 影视", "🏆 体育", "📰 新闻", "📺 高清频道",
        "👶 少儿", "📚 教育", "🎵 音乐人", "🎭 小品曲艺", "📺 其他频道", "📺 港澳台"];
    for (const g of alphaGroups) {
        const arr = groupMap.get(g);
        if (arr) arr.sort((a, b) => naturalCompare(a.title, b.title));
    }
    splitPlaces(groupMap);
    return groupMap;
}

// 地方台按省份拆成「🎬 地方台-XX地区」子分组，整体置于输出末尾（春晚/熊猫之前）
function splitPlaces(groupMap) {
    const placeKey = "🎬 地方台";
    const items = groupMap.get(placeKey);
    if (!items || !items.length) return;

    const buckets = new Map();
    const order = [];
    for (const ch of items) {
        const region = detectRegion(ch.title);
        if (!region) continue;
        if (!buckets.has(region)) { buckets.set(region, []); order.push(region); }
        buckets.get(region).push(ch);
    }

    groupMap.delete(placeKey);
    const sortedRegions = [...order].sort((a, b) => {
        const wa = REGION_ORDER.indexOf(a), wb = REGION_ORDER.indexOf(b);
        const za = wa >= 0 ? wa : 1000, zb = wb >= 0 ? wb : 1000;
        if (za !== zb) return za - zb;
        return a.localeCompare(b);
    });

    for (const r of sortedRegions) {
        const arr = buckets.get(r).sort((a, b) => naturalCompare(a.title, b.title));
        groupMap.set("🎬 地方台-" + regionDisplay(r), arr);
    }
}

function buildHomeResponse(channels) {
    const groupMap = sortedGroupMap(channels);
    const promoGroups = Array.from(new Set(PROMO_LIST.map(p => p.group || "推流信息")));
    const otherGroups = MAIN_GROUP_ORDER
        .filter(g => g !== "🎬 地方台")
        .filter(g => groupMap.has(g) && !promoGroups.includes(g) && groupMap.get(g).length > 0);
    const allGroups = [...promoGroups, ...otherGroups];

    const class_list = allGroups.map(g => ({ type_id: g, type_name: g }));
    const promoVods = buildPromoVods();
    const groupVods = [];
    for (const g of otherGroups) {
        const items = groupMap.get(g).slice(0, 5);
        for (const ch of items) groupVods.push(channelToVod(ch, channels.indexOf(ch)));
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
    const groupMap = sortGroups(sortedGroupMap(channels));
    const hasPlaces = [...groupMap.keys()].some(k => k.startsWith("🎬 地方台-"));
    const mainOrder = MAIN_GROUP_ORDER.filter(g => groupMap.has(g) || (g === "🎬 地方台" && hasPlaces));
    for (const g of mainOrder) {
        if (g === "🎬 地方台") {
            const regionKeys = [...groupMap.keys()].filter(k => k.startsWith("🎬 地方台-"));
            for (const rg of regionKeys) {
                const ritems = groupMap.get(rg) || [];
                if (!ritems.length) continue;
                for (const ch of ritems) {
                    lines.push(`#EXTINF:-1 tvg-logo="${ch.logo}" group-title="${rg}",${ch.title}`);
                    const urls = (ch.urls && ch.urls.length > 0) ? ch.urls : [ch.url];
                    lines.push(urls.join('#'));
                }
            }
            continue;
        }
        const items = groupMap.get(g) || [];
        if (!items.length) continue;
        for (const ch of items) {
            lines.push(`#EXTINF:-1 tvg-logo="${ch.logo}" group-title="${ch.group}",${ch.title}`);
            const urls = (ch.urls && ch.urls.length > 0) ? ch.urls : [ch.url];
            lines.push(urls.join('#'));
        }
    }
    return lines.join('\n');
}

function buildTXT(channels) {
    const groupMap = sortGroups(sortedGroupMap(channels));
    const out = [];

    // ★ 引流节目置顶（与 buildM3U 保持一致）：茂哥TV 分组始终排在最前
    const promoGroup = "茂哥TV";
    out.push(`${promoGroup},#genre#`);
    for (const p of PROMO_LIST) {
        out.push(`${p.title},${p.url}`);
    }
    out.push('');

    const hasPlaces = [...groupMap.keys()].some(k => k.startsWith("🎬 地方台-"));
    const mainOrder = MAIN_GROUP_ORDER.filter(g => groupMap.has(g) || (g === "🎬 地方台" && hasPlaces));
    for (const group of mainOrder) {
        if (group === "🎬 地方台") {
            const regionKeys = [...groupMap.keys()].filter(k => k.startsWith("🎬 地方台-"));
            for (const rg of regionKeys) {
                const ritems = groupMap.get(rg) || [];
                if (!ritems.length) continue;
                out.push(`${rg},#genre#`);
                for (const ch of ritems) {
                    const urls = (ch.urls && ch.urls.length > 0) ? ch.urls : [ch.url];
                    out.push(`${ch.title},${urls.join('#')}`);
                }
                out.push('');
            }
            continue;
        }
        const items = groupMap.get(group) || [];
        if (!items.length) continue;
        out.push(`${group},#genre#`);
        for (const ch of items) {
            const urls = (ch.urls && ch.urls.length > 0) ? ch.urls : [ch.url];
            out.push(`${ch.title},${urls.join('#')}`);
        }
        out.push('');
    }
    return out.join('\n');
}

/* ============================================================================
 * 主入口（Cloudflare Worker）
 * ========================================================================== */
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

// 本地复用导出（Cloudflare Worker 环境无 module.exports，此处仅作兜底）
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        parseSource, parseTXT, parseM3U,
        normalizeChannelName, matchGroupV2, matchGroup,
        sortedGroupMap, sortGroups,
        MAIN_GROUP_ORDER,
    };
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
