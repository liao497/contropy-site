export type Tone = "positive" | "warning" | "danger" | "neutral";

export type Opportunity = {
  name: string;
  ticker: string;
  market: "A股" | "港股通";
  score: number;
  change: string;
  reason: string;
  catalyst: string;
  risk: string;
  tone: Tone;
};

export const marketPulse = [
  { label: "A股风险偏好", value: "中性偏多", delta: "广度回升", tone: "positive" as Tone },
  { label: "港股通环境", value: "中性", delta: "等待确认", tone: "neutral" as Tone },
  { label: "美股映射", value: "科技占优", delta: "仅作参考", tone: "positive" as Tone },
  { label: "系统风险灯", value: "黄灯", delta: "2项需观察", tone: "warning" as Tone },
];

export const sectors = [
  { rank: "01", name: "AI算力与互连", signal: "海外映射 + 景气", score: 78, trend: "+6.8", note: "板块宽度与相对强度同步改善" },
  { rank: "02", name: "机器人执行器", signal: "催化 + 量价", score: 74, trend: "+4.2", note: "催化密集，等待成交确认" },
  { rank: "03", name: "智能驾驶", signal: "前瞻数据", score: 69, trend: "+2.7", note: "车型周期与渗透率是核心变量" },
];

export const shortOpportunities: Opportunity[] = [
  { name: "澜起科技", ticker: "688008.SH", market: "A股", score: 77, change: "+7", reason: "相对强度改善，海外半导体映射偏强", catalyst: "新品与财报窗口", risk: "高估值与波动放大", tone: "positive" },
  { name: "德科立", ticker: "688205.SH", market: "A股", score: 73, change: "+5", reason: "主题热度回升，量价出现确认", catalyst: "高速光模块需求", risk: "流动性与拥挤度", tone: "positive" },
  { name: "环旭电子", ticker: "601231.SH", market: "A股", score: 68, change: "+3", reason: "电子链修复，波动率尚可", catalyst: "消费电子旺季", risk: "需求验证滞后", tone: "neutral" },
  { name: "三花智控", ticker: "002050.SZ", market: "A股", score: 66, change: "+2", reason: "机器人与汽零双主题映射", catalyst: "产业事件", risk: "预期交易较充分", tone: "neutral" },
  { name: "长飞光纤光缆", ticker: "6869.HK", market: "港股通", score: 63, change: "+1", reason: "光通信景气映射，等待突破确认", catalyst: "海外需求", risk: "港股流动性", tone: "warning" },
];

export const swingOpportunities: Opportunity[] = [
  { name: "腾讯控股", ticker: "0700.HK", market: "港股通", score: 76, change: "+4", reason: "现金流质量与AI投入形成支撑", catalyst: "财报与产品进展", risk: "监管与资本开支", tone: "positive" },
  { name: "澜起科技", ticker: "688008.SH", market: "A股", score: 72, change: "+3", reason: "内存接口景气与产品周期共振", catalyst: "新品放量", risk: "景气兑现节奏", tone: "positive" },
  { name: "三花智控", ticker: "002050.SZ", market: "A股", score: 69, change: "+2", reason: "业务质量较稳，机器人提供弹性", catalyst: "订单验证", risk: "估值消化", tone: "neutral" },
  { name: "环旭电子", ticker: "601231.SH", market: "A股", score: 65, change: "+1", reason: "估值与周期位置具备平衡", catalyst: "新产品周期", risk: "终端需求", tone: "neutral" },
  { name: "MINIMAX-W", ticker: "0100.HK", market: "港股通", score: 61, change: "0", reason: "AI应用前瞻信号进入观察区", catalyst: "产品与用户数据", risk: "证据覆盖不足", tone: "warning" },
];

export const initialWatchlist = [
  { name: "环旭电子", ticker: "601231.SH", market: "A股", theme: "电子", state: "观察", score: 65 },
  { name: "澜起科技", ticker: "688008.SH", market: "A股", theme: "AI", state: "偏强", score: 74 },
  { name: "腾讯控股", ticker: "0700.HK", market: "港股通", theme: "AI应用", state: "偏强", score: 76 },
  { name: "长飞光纤光缆", ticker: "6869.HK", market: "港股通", theme: "光通信", state: "观察", score: 63 },
  { name: "德科立", ticker: "688205.SH", market: "A股", theme: "AI", state: "偏强", score: 71 },
  { name: "MINIMAX-W", ticker: "0100.HK", market: "港股通", theme: "AI应用", state: "待核验", score: 58 },
  { name: "三花智控", ticker: "002050.SZ", market: "A股", theme: "机器人", state: "观察", score: 68 },
];

export const macroSignals = [
  { name: "中国信用与流动性", value: "中性", change: "等待月度社融确认", tone: "neutral" as Tone, source: "人民银行 / 国家统计局", tier: "E0/E1", freshness: "按发布日" },
  { name: "银行间资金压力", value: "低", change: "DR007 与政策利率利差", tone: "positive" as Tone, source: "中国货币网 / 人民银行", tier: "E0/E1", freshness: "日频" },
  { name: "美国利率冲击", value: "观察", change: "实际利率与美元组合", tone: "warning" as Tone, source: "美联储 / 美国财政部 / FRED", tier: "E0/E1", freshness: "日频" },
  { name: "亚洲风险传导", value: "中性", change: "日经、韩综与半导体映射", tone: "neutral" as Tone, source: "交易所公开数据", tier: "E1/E3", freshness: "交易日" },
];

export const riskSignals = [
  { group: "市场内部", name: "宽度坍塌", status: "未触发", rule: "上涨占比、MA20宽度和新低数三者至少两项恶化", tone: "positive" as Tone },
  { group: "波动压力", name: "跨市场波动", status: "观察", rule: "VIX / MOVE 升幅与人民币波动连续确认", tone: "warning" as Tone },
  { group: "信用资金", name: "融资与信用", status: "未触发", rule: "信用利差、融资余额和银行间压力组合", tone: "positive" as Tone },
  { group: "估值拥挤", name: "主题集中度", status: "观察", rule: "成交集中、估值分位与高位股分化", tone: "warning" as Tone },
  { group: "尾部事件", name: "治理硬门", status: "未触发", rule: "审计、债务、退市、停牌与重大事件逐项核验", tone: "positive" as Tone },
  { group: "数据质量", name: "源与时效", status: "未触发", rule: "核心字段覆盖率 <70% 或加权质量 <55% 则关闭方向性结论", tone: "positive" as Tone },
];

export const earningsItems = [
  { company: "腾讯控股", window: "待接入日历", headline: "关注游戏、广告、金融科技收入与资本开支", fields: "收入 / 毛利率 / FCF / 回购 / AI投入", badge: "重点" },
  { company: "澜起科技", window: "待接入日历", headline: "关注互连芯片出货、毛利率和合同负债", fields: "收入 / 毛利率 / 存货 / 研发 / 指引", badge: "重点" },
  { company: "三花智控", window: "待接入日历", headline: "关注汽零需求、机器人业务验证和现金转化", fields: "分部收入 / 订单 / CFO / 应收", badge: "跟踪" },
  { company: "环旭电子", window: "待接入日历", headline: "关注消费电子周期与新产品爬坡", fields: "营收 / 毛利率 / 库存 / 资本开支", badge: "跟踪" },
];

export const forwardSignals = [
  { theme: "AI", direct: "云厂商资本开支、服务器与高速互连订单", indirect: "开发者活跃、招聘、网页流量", bridge: "出货 × 单价 × 公司份额 → 毛利 / 现金流", halfLife: "45–180天" },
  { theme: "机器人", direct: "定点、送样、量产节奏与客户资本开支", indirect: "供应链交期、招聘、展会样机", bridge: "项目数 × 单机价值量 × 量产概率", halfLife: "90–180天" },
  { theme: "商业航天", direct: "发射计划、招标、中标与卫星交付", indirect: "项目审批、产业链招聘、供应商排产", bridge: "订单 → 交付验收 → 收入确认与回款", halfLife: "90–180天" },
  { theme: "新能源", direct: "销量、装机、价格、库存与产能利用率", indirect: "渠道调研、产业链排产", bridge: "销量 × 单车/单瓦价值量 × 毛利弹性", halfLife: "45–90天" },
  { theme: "自动驾驶", direct: "新车发布、搭载率、芯片/域控订单", indirect: "道路测试、招聘、软件版本频率", bridge: "车型销量 × 渗透率 × 单车价值量", halfLife: "45–180天" },
];

export const calendarItems = [
  { when: "未来 7 日", type: "宏观", event: "国内外高影响数据发布窗口", impact: "高", action: "前一日锁定实际可得时间" },
  { when: "未来 14 日", type: "财报", event: "观察池公司业绩与公告窗口", impact: "高", action: "财报后重算评分，收盘后公告次日生效" },
  { when: "未来 30 日", type: "产业", event: "AI / 机器人 / 汽车产业活动", impact: "中", action: "只记录可核验议程和公司映射" },
  { when: "未来 90 日", type: "公司行动", event: "解禁、股东大会、回购与减持", impact: "中", action: "与流动性和估值组合判断" },
];

export const scoringWeights = [
  { dimension: "基本面", short: 4, swing: 7 },
  { dimension: "财报质量", short: 4, swing: 5 },
  { dimension: "竞争力", short: 4, swing: 7 },
  { dimension: "业务前瞻", short: 10, swing: 16 },
  { dimension: "估值", short: 7, swing: 10 },
  { dimension: "技术面", short: 27, swing: 22 },
  { dimension: "情绪与资金", short: 20, swing: 14 },
  { dimension: "行业与海外", short: 12, swing: 9 },
  { dimension: "宏观与利率", short: 5, swing: 4 },
  { dimension: "治理与尾部风险", short: 7, swing: 6 },
];

export const sourceRegistry = [
  { tier: "E0", label: "法定 / 原始证据", sources: "交易所公告、定期报告、监管文件、央行与统计部门", use: "核心财务与重大事实" },
  { tier: "E1", label: "官方结构化数据", sources: "交易所统计、XBRL、FRED / ALFRED、SEC API", use: "行情、宏观与结构化校验" },
  { tier: "E2", label: "获授权商业数据", sources: "后续可接入 Wind、Choice、iFinD、CME", use: "一致预期与稳定生产数据" },
  { tier: "E3", label: "聚合 / 抓取 / 推断", sources: "AKShare、公开网页与代理指标", use: "免费原型辅助，必须标记并交叉验证" },
];
