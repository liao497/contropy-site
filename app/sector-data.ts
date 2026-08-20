export type Tone = "positive" | "warning" | "danger" | "neutral";
export type InterpretationType = "opportunity" | "risk" | "watch" | "none";

export type MetricRow = {
  id: string;
  name: string;
  latest: string;
  previous: string;
  yoy: string;
  interpretation?: string;
  interpretationType?: InterpretationType;
  source?: string;
};

export type SectorOpportunity = {
  rank: number;
  name: string;
  type: string;
  score: number;
  quality: string;
  thesis: string;
  evidence: string[];
  valuation: string;
  drawdown: string;
  deviation: string;
  atr: string;
  catalyst: string;
  risk: string;
  confirmation: string;
  invalidation: string;
  tone: Tone;
};

export const summarySignals = [
  { label: "A股市场环境", value: "中性", note: "量能与风格等待确认", tone: "neutral" as Tone },
  { label: "宏观与政策", value: "中性偏松", note: "示例判断，非实时", tone: "positive" as Tone },
  { label: "海外映射", value: "科技链较强", note: "仅作行业参考", tone: "positive" as Tone },
  { label: "综合风险灯", value: "黄色观察", note: "2个风险组接近阈值", tone: "warning" as Tone },
];

export const marketRows: MetricRow[] = [
  { id: "M1-A01/02", name: "上涨 / 下跌家数", latest: "3,018 / 2,126", previous: "2,741 / 2,396", yoy: "+8.4% / -6.1%", interpretation: "市场广度温和改善", interpretationType: "watch", source: "交易所行情" },
  { id: "M1-A03/04", name: "涨停 / 跌停家数", latest: "64 / 9", previous: "51 / 13", yoy: "+10 / -2", interpretationType: "none", source: "交易所行情" },
  { id: "M1-A05/06/07", name: "全市场成交额", latest: "11,420亿元 · 5日1.06× · 20日1.11×", previous: "10,870亿元", yoy: "+13.2%", interpretation: "放量需等待价格趋势确认", interpretationType: "watch", source: "交易所行情" },
  { id: "M1-A08/09", name: "大/小盘 · 价值/成长", latest: "小盘+0.6% · 成长+0.4%", previous: "大盘+0.2% · 价值+0.1%", yoy: "分位 58% / 61%", interpretationType: "none", source: "指数行情" },
  { id: "M1-A10/11", name: "成交额集中度", latest: "前50 26.4% · 前100 35.7%", previous: "25.8% · 35.1%", yoy: "+2.1pct / +2.4pct", interpretation: "集中度抬升，尚未触发拥挤风险", interpretationType: "watch", source: "派生" },
  { id: "M1-A12/13/14", name: "指数波动 / ATR / 回撤", latest: "波动率18.2% · ATR1.4% · 60日回撤-5.8%", previous: "17.6% · 1.3% · -6.1%", yoy: "波动率+1.8pct", interpretationType: "none", source: "指数行情" },
  { id: "M1-A15/16", name: "融资活动", latest: "余额+36亿元 · 买入占比9.4%", previous: "+12亿元 · 9.1%", yoy: "余额+4.8%", interpretationType: "none", source: "沪深京交易所" },
  { id: "M1-A17/18", name: "ETF份额变化", latest: "宽基+0.7% · 重点行业+1.2%", previous: "+0.2% · +0.5%", yoy: "+9.6% / +14.3%", interpretation: "行业ETF份额扩张，需与RPS验证", interpretationType: "watch", source: "交易所ETF份额" },
  { id: "M1-B01/02", name: "南向资金", latest: "净买入62亿港元 · 连续4日", previous: "净买入41亿港元 · 连续3日", yoy: "+18亿港元", interpretationType: "none", source: "港交所/交易所" },
];

export const globalRows: MetricRow[] = [
  { id: "M1-C01", name: "美国宽基", latest: "标普+0.4% · 纳指100+0.7% · Russell-0.2%", previous: "+0.1% · +0.2% · +0.3%", yoy: "+11.2% · +14.8% · +5.1%", interpretation: "科技相对占优", interpretationType: "opportunity" },
  { id: "M1-C02", name: "美国科技链", latest: "半导体+1.3% · 云计算+0.8%", previous: "+0.4% · +0.2%", yoy: "+19.6% · +13.1%", interpretation: "为国内AI链提供海外映射", interpretationType: "opportunity" },
  { id: "M1-C03", name: "日本市场", latest: "日经+0.2% · 东证+0.1%", previous: "-0.3% · -0.2%", yoy: "+7.4% · +6.9%", interpretationType: "none" },
  { id: "M1-C04", name: "韩国与半导体链", latest: "KOSPI+0.6% · 半导体+1.1%", previous: "+0.1% · +0.3%", yoy: "+8.1% · +16.4%", interpretation: "存储与半导体景气映射偏正面", interpretationType: "opportunity" },
  { id: "M1-C05", name: "VIX / MOVE", latest: "15.8 / 96.2", previous: "15.2 / 94.7", yoy: "-2.1 / -7.4", interpretationType: "none" },
  { id: "M1-C06", name: "美国2Y / 10Y / 实际利率", latest: "4.08% / 4.31% / 1.86%", previous: "4.05% / 4.28% / 1.83%", yoy: "+12bp / +18bp / +9bp", interpretation: "实际利率上行对成长估值构成观察项", interpretationType: "watch" },
  { id: "M1-C07", name: "美元 / 离岸人民币", latest: "DXY 102.4 · CNH 7.19", previous: "102.1 · 7.18", yoy: "+1.3% · +0.8%", interpretationType: "none" },
  { id: "M1-C08", name: "原油 / 铜 / 黄金", latest: "+0.3% / +0.7% / -0.2%", previous: "-0.4% / +0.1% / +0.5%", yoy: "+4.2% / +9.1% / +15.6%", interpretationType: "none" },
];

export const macroRows: MetricRow[] = [
  { id: "M2-A01", name: "制造业PMI / 新订单", latest: "50.3 / 50.7", previous: "49.9 / 50.1", yoy: "+0.6 / +0.8", interpretation: "新订单回到扩张区，关注顺周期验证", interpretationType: "opportunity", source: "国家统计局" },
  { id: "M2-A04/05/06", name: "工业 / 投资 / 消费", latest: "同比+5.4% / +4.1% / +4.8%", previous: "+5.1% / +4.0% / +4.5%", yoy: "官方同比", interpretationType: "none", source: "国家统计局" },
  { id: "M2-A07", name: "出口 / 进口", latest: "同比+6.2% / +2.7%", previous: "+5.5% / +1.9%", yoy: "官方同比", interpretation: "外需改善，重点观察电子与设备出口", interpretationType: "opportunity", source: "海关总署" },
  { id: "M2-A08", name: "CPI / 核心CPI / PPI", latest: "+0.8% / +1.1% / -0.7%", previous: "+0.5% / +0.9% / -1.1%", yoy: "官方同比", interpretationType: "none", source: "国家统计局" },
  { id: "M2-B01/02", name: "社融 / M1 / M2", latest: "社融增速8.9% · M1+4.2% · M2+7.3%", previous: "8.7% · +3.8% · +7.1%", yoy: "+0.3 / +2.1 / -0.2pct", interpretation: "信用与资金活化边际改善", interpretationType: "watch", source: "人民银行" },
  { id: "M2-B07/08", name: "政策与资金利率", latest: "7天逆回购1.40% · DR007 1.52%", previous: "1.40% · 1.49%", yoy: "-20bp / -14bp", interpretationType: "none", source: "人民银行/中国货币网" },
  { id: "M2-B10", name: "国债1Y / 10Y / 曲线", latest: "1.55% / 1.98% / +43bp", previous: "1.54% / 1.96% / +42bp", yoy: "-8bp / -5bp / +3bp", interpretationType: "none" },
  { id: "M2-B12", name: "人民币汇率", latest: "在岸7.17 · 离岸7.19", previous: "7.16 · 7.18", yoy: "+0.6% / +0.8%", interpretationType: "none" },
  { id: "M2-C02", name: "市场隐含美联储预期", latest: "年内降息概率示例 57%", previous: "54%", yoy: "—", interpretation: "市场隐含值，不是美联储预测", interpretationType: "watch", source: "CME，待授权核验" },
  { id: "M2-C04/05", name: "日本 / 韩国政策与出口", latest: "BOJ观察 · BOK观察 · 韩国半导体出口+12%", previous: "政策不变 · 出口+9%", yoy: "出口官方同比", interpretation: "亚洲科技外需偏正面", interpretationType: "opportunity" },
];

export const sectorRows = [
  { rank: 1, name: "AI算力与互连", rps5: 91, rps20: 88, rps60: 79, turnover: "8.4% · 较20日+1.6pct", volatility: "23.1%", crowding: "72分", concentration: "前5 48%", interpretation: "趋势与海外映射共振" },
  { rank: 2, name: "机器人", rps5: 84, rps20: 81, rps60: 73, turnover: "5.2% · 较20日+0.9pct", volatility: "27.8%", crowding: "78分", concentration: "前5 55%", interpretation: "强度较高，但拥挤需降权" },
  { rank: 3, name: "智能驾驶", rps5: 72, rps20: 76, rps60: 69, turnover: "4.6% · 较20日+0.5pct", volatility: "21.4%", crowding: "63分", concentration: "前5 43%", interpretation: "前瞻数据改善，等待催化" },
  { rank: 4, name: "商业航天", rps5: 68, rps20: 71, rps60: 62, turnover: "3.3% · 较20日+0.8pct", volatility: "31.2%", crowding: "81分", concentration: "前5 58%", interpretation: "高波动与高拥挤限制得分" },
  { rank: 5, name: "新能源", rps5: 57, rps20: 61, rps60: 54, turnover: "7.1% · 较20日-0.2pct", volatility: "19.7%", crowding: "49分", concentration: "前5 36%", interpretation: "估值较低，景气拐点待确认" },
];

export const opportunities: SectorOpportunity[] = [
  { rank: 1, name: "AI算力与互连", type: "高景气低估值 + 主线催化", score: 78, quality: "82%", thesis: "海外资本开支与国内成交强度形成双重验证，景气信号在三个行业中最完整。", evidence: ["RPS-20处于前12%", "成交占比较20日均值上升1.6pct", "海外半导体与云计算映射偏强"], valuation: "历史分位 56%", drawdown: "60日 -4.8%", deviation: "MA20 +3.1% · MA60 +6.4%", atr: "2.1%", catalyst: "未来30日产业活动与资本开支更新", risk: "实际利率上行、交易拥挤加速", confirmation: "行业成交占比维持高于20日均值，前瞻直接信号继续改善", invalidation: "RPS-20跌破50且海外映射与订单信号同时转弱", tone: "positive" },
  { rank: 2, name: "机器人", type: "主线催化 + 景气拐点", score: 72, quality: "76%", thesis: "产业催化与订单代理改善，但波动率和龙头集中度较高，评分已作拥挤惩罚。", evidence: ["RPS-20处于前19%", "成交占比连续3日高于20日均值", "工业机器人产量与客户资本开支代理改善"], valuation: "历史分位 68%", drawdown: "60日 -8.7%", deviation: "MA20 +1.8% · MA60 +4.2%", atr: "2.8%", catalyst: "产业展会与量产节点", risk: "拥挤78分、前5成交集中55%", confirmation: "直接订单或量产数据形成第二来源验证", invalidation: "成交占比跌回20日均值下方且产量/订单转弱", tone: "warning" },
  { rank: 3, name: "智能驾驶", type: "景气拐点 / 预期差", score: 68, quality: "73%", thesis: "车型搭载率和智驾芯片出货代理改善，行业强度尚未过热，赔率相对均衡。", evidence: ["RPS-20升至76", "成交拥挤低于机器人与航天", "车型与搭载率前瞻信号改善"], valuation: "历史分位 52%", drawdown: "60日 -10.2%", deviation: "MA20 +0.7% · MA60 -1.2%", atr: "2.0%", catalyst: "新车型与城市NOA覆盖更新", risk: "渗透率改善不等于行业利润同步兑现", confirmation: "搭载率、销量与域控/芯片出货至少两项同向", invalidation: "车型销量或搭载率连续两期回落", tone: "neutral" },
];

export const forwardRows = [
  { industry: "AI", latest: "云资本开支↑ · 服务器/互连需求↑", previous: "温和改善", yoy: "资本开支高于同期", interpretation: "直接信号覆盖较高", type: "opportunity" as InterpretationType },
  { industry: "机器人", latest: "产量↑ · 订单代理↑ · 量产节点待验证", previous: "订单代理持平", yoy: "产量高于同期", interpretation: "等待第二条直接证据", type: "watch" as InterpretationType },
  { industry: "商业航天", latest: "发射与招标计划密集", previous: "项目数量上升", yoy: "发射次数高于同期", interpretation: "高拥挤降低机会等级", type: "risk" as InterpretationType },
  { industry: "新能源", latest: "销量↑ · 价格低位 · 库存分化", previous: "价格仍承压", yoy: "销量增长、价格下降", interpretation: "利润拐点尚未确认", type: "watch" as InterpretationType },
  { industry: "自动驾驶", latest: "搭载率↑ · 芯片出货代理↑", previous: "搭载率温和上升", yoy: "渗透率提升", interpretation: "进入波段候选", type: "opportunity" as InterpretationType },
];

export const vulnerabilityRisks = [
  { name: "估值与风险溢价", state: "中性", latest: "重点行业估值分位 52%—68%", previous: "51%—66%", yoy: "整体+4pct", note: "机器人估值偏高", tone: "warning" as Tone },
  { name: "集中与拥挤", state: "观察", latest: "2个行业拥挤度>75", previous: "1个", yoy: "+1个", note: "机器人、商业航天", tone: "warning" as Tone },
  { name: "杠杆", state: "中性", latest: "融资买入占比9.4%", previous: "9.1%", yoy: "+0.6pct", note: "", tone: "neutral" as Tone },
  { name: "信用与地产", state: "中性", latest: "信用脉冲边际改善", previous: "平稳", yoy: "高于同期", note: "", tone: "neutral" as Tone },
  { name: "外部金融条件", state: "观察", latest: "美国实际利率1.86%", previous: "1.83%", yoy: "+9bp", note: "成长估值压力上升", tone: "warning" as Tone },
];

export const stressRisks = [
  { name: "全球波动", state: "未触发", latest: "VIX 15.8 · MOVE 96.2", previous: "15.2 · 94.7", yoy: "均低于同期", note: "", tone: "positive" as Tone },
  { name: "信用与融资压力", state: "未触发", latest: "信用利差平稳", previous: "平稳", yoy: "低于同期", note: "", tone: "positive" as Tone },
  { name: "汇率压力", state: "未触发", latest: "CNH 7.19", previous: "7.18", yoy: "+0.8%", note: "", tone: "positive" as Tone },
  { name: "A股内部压力", state: "未触发", latest: "下跌2,126 · 跌停9", previous: "2,396 · 13", yoy: "均低于同期", note: "", tone: "positive" as Tone },
  { name: "跨资产共振", state: "未触发", latest: "未见三类资产同时恶化", previous: "未触发", yoy: "—", note: "", tone: "positive" as Tone },
];

export const events = [
  { window: "未来7日", date: "示例日期", type: "宏观", event: "中国高影响月度数据窗口", impact: "高", industries: "全市场 / 顺周期", scenario: "高于预期利好顺周期；低于预期关注政策对冲" },
  { window: "未来7日", date: "示例日期", type: "海外政策", event: "美联储政策表述窗口", impact: "高", industries: "成长 / 科技", scenario: "实际利率方向决定估值压力" },
  { window: "未来30日", date: "示例日期", type: "行业", event: "AI与计算产业活动", impact: "中", industries: "AI算力与互连", scenario: "只认正式议程、产品和资本开支证据" },
  { window: "未来30日", date: "示例日期", type: "行业", event: "机器人产业会议与量产节点", impact: "中", industries: "机器人", scenario: "量产数据未验证时防止主题脉冲" },
  { window: "未来90日", date: "示例日期", type: "政策", event: "新能源与智能驾驶政策窗口", impact: "中", industries: "新能源 / 智能驾驶", scenario: "政策强度与销量、搭载率共同验证" },
  { window: "未来90日", date: "示例日期", type: "海外行业", event: "海外科技龙头资本开支更新", impact: "高", industries: "AI / 半导体", scenario: "只提取行业需求和资本开支信号" },
];
