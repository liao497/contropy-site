import snapshotJson from "../data/current-snapshot.json";

type Tone = "positive" | "warning" | "danger" | "neutral";
type InterpretationType = "none" | "opportunity" | "risk" | "watch";

type Metric = {
  indicator_id: string;
  indicator_name: string;
  module: string;
  value: string | number | null;
  unit: string | null;
  period: string;
  previous_value: string | number | null;
  yoy_value: string | number | null;
  publisher: string;
  canonical_url: string;
  component_summary?: string | null;
  interpretation_type: InterpretationType;
  interpretation: string | null;
};

type Risk = {
  risk_type: "vulnerability" | "stress";
  name: string;
  status: string;
  interpretation: string;
  tone: Tone;
};

type Event = {
  event_at: string;
  window: string;
  event_type: string;
  event_name: string;
  impact: string;
  industries: string;
  scenario: string;
  source: string;
};

type MajorNews = {
  category: "政要发言" | "主要央行" | "地缘与能源";
  headline: string;
  summary: string | null;
  published_at: string;
  time_basis: string;
  source_name: string;
  source_url: string;
  source_type: "official" | "media_monitoring";
  impact_level: "high" | "medium" | "low";
  tone: "danger" | "warning" | "neutral";
  affected_assets: string;
  market_impact: string;
};

type ShippingFlow = {
  route_id: string;
  route_name: string;
  period: string;
  vessel_count: number;
  tanker_count: number;
  previous_vessel_count: number;
  average_7d: number;
  average_28d: number;
  change_vs_28d_pct: number;
  interpretation_type: InterpretationType;
  interpretation: string | null;
  publisher: string;
  canonical_url: string;
};

type CommodityQuote = {
  group: string;
  symbol: string;
  name: string;
  contract: string;
  price: number;
  unit: string;
  daily_change_pct: number;
  weekly_change_pct: number;
  period: string;
  signal: "surge" | "drop" | "neutral";
  interpretation: string | null;
  publisher: string;
  canonical_url: string;
};

type ShareChange = { code: string; name: string; change_100m_shares: number };
type SectorActivity = { name: string; share_pct: number; previous_share_pct: number; change_pp: number; amount20x: number };
type CapitalFlows = {
  etf: { period: string; previous_period: string; change_100m_shares: number; change_pct: number; matched_count: number; excluded_new_count: number; coverage: number; top_increase: ShareChange[]; top_decrease: ShareChange[]; publisher: string; canonical_url: string } | null;
  southbound: { period: string; net_buy_100m_cny: number; previous_net_buy_100m_cny: number; streak: number; publisher: string; canonical_url: string } | null;
  margin: { period: string; balance_100m_cny: number; balance_change_100m_cny: number; buy_turnover_pct: number | null; publisher: string; canonical_url: string } | null;
  sectors: { period: string; increasing: SectorActivity[]; decreasing: SectorActivity[]; basis?: string; publisher: string; canonical_url: string } | null;
};
type ForwardFlows = {
  market_day: string;
  windows: Array<{
    days: number; from_period: string; to_period: string;
    equity_etf: { change_100m_shares: number; change_pct: number; matched_count: number; coverage: number } | null;
    margin: { from_period: string; to_period: string; balance_change_100m_cny: number; change_pct: number } | null;
    southbound: { net_buy_100m_cny: number; to_period: string } | null;
    northbound: { avg_turnover_100m_cny: number; observations: number; from_period: string; to_period: string } | null;
    foreign_conditions: { dollar_change_pct?: number; real_yield_change_pp?: number; vix_change_points?: number; dollar_change_pct_period?: string; real_yield_change_pp_period?: string; vix_change_points_period?: string };
  }>;
  verdict: { domestic: string; hong_kong: string; foreign_environment: string; participation: string; headline: string };
  sources: Record<string, string>;
  method_note: string;
};

type Snapshot = {
  report_date: string;
  as_of: string;
  data_state: "demo" | "partial" | "verified";
  metrics: Metric[];
  opportunities: Array<{ rank: number; industry_name: string; adjusted_score: number; thesis: string }>;
  sector_candidates?: Array<{
    rank: number; industry_name: string; opportunity_type: string; adjusted_score: number;
    status: string; market_data_date: string; evidence: string[];
    confirmation_conditions: string; invalidation_conditions: string; caveat: string;
  }>;
  risks: Risk[];
  events: Event[];
  major_news?: MajorNews[];
  shipping?: ShippingFlow[];
  commodities?: CommodityQuote[];
  capital_flows?: CapitalFlows;
  forward_flows?: ForwardFlows;
  data_gaps: Array<{ indicator_id: string; reason: string }>;
  run: { top_call: string; risk_level: string; coverage_note: string; market_data_date?: string };
};

const snapshot = snapshotJson as Snapshot;

function display(value: string | number | null, unit?: string | null) {
  if (value === null || value === "") return "—";
  return `${value}${unit ? ` ${unit}` : ""}`;
}

function MetricValue({ metric }: { metric: Metric }) {
  const raw = display(metric.value);
  if (["M1-A01/02", "M1-A03/04"].includes(metric.indicator_id)) {
    const [rising, falling] = raw.split("/").map((part) => part.trim());
    if (rising && falling) {
      return <><span className="s-market-up">{rising}</span><span className="s-market-separator"> / </span><span className="s-market-down">{falling}</span>{metric.unit ? ` ${metric.unit}` : ""}</>;
    }
  }
  return <>{display(metric.value, metric.unit)}</>;
}

function Dot({ tone }: { tone: Tone }) {
  return <span className={`s-dot s-dot--${tone}`} aria-hidden="true" />;
}

function Interpretation({ metric }: { metric: Metric }) {
  if (metric.interpretation_type === "none" || !metric.interpretation) return <span className="s-empty">—</span>;
  const labels = { opportunity: "机会", risk: "风险", watch: "观察" };
  return (
    <span className={`s-interpretation s-interpretation--${metric.interpretation_type}`}>
      <b>{labels[metric.interpretation_type]}</b>{metric.interpretation}
    </span>
  );
}

function MetricTable({ rows, label }: { rows: Metric[]; label: string }) {
  return (
    <div className="s-table-wrap">
      <table className="s-metric-table" aria-label={label}>
        <thead><tr><th>指标</th><th>最新数据</th><th>上一日/期</th><th>同比情况</th><th>解读</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr className={`s-row--${row.interpretation_type}`} key={row.indicator_id}>
              <th scope="row"><span>{row.indicator_id} · {row.period}</span>{row.indicator_name}<small>{row.publisher}</small></th>
              <td><strong><MetricValue metric={row} /></strong></td>
              <td>{display(row.previous_value)}</td><td>{display(row.yoy_value)}</td>
              <td><Interpretation metric={row} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MetricCard({ metric }: { metric: Metric }) {
  const tone: Tone = metric.interpretation_type === "risk" ? "danger" : metric.interpretation_type === "watch" ? "warning" : metric.interpretation_type === "opportunity" ? "positive" : "neutral";
  return (
    <article className={`s-metric-card s-metric-card--${metric.interpretation_type}`}>
      <div><Dot tone={tone} /><span>{metric.indicator_name}</span></div>
      <strong><MetricValue metric={metric} /></strong><small>{metric.period}</small>
    </article>
  );
}

function SentimentCard({ metric }: { metric: Metric }) {
  const score = Math.max(0, Math.min(100, Number(String(metric.value).match(/^\d+/)?.[0] ?? 50)));
  const tone: Tone = metric.interpretation_type === "risk" ? "danger" : metric.interpretation_type === "watch" ? "warning" : "neutral";
  return (
    <article className={`s-sentiment-card s-sentiment-card--${metric.interpretation_type}`}>
      <div className="s-sentiment-head"><span><Dot tone={tone} />{metric.indicator_name}</span><strong>{display(metric.value)}</strong></div>
      <div className="s-sentiment-scale" aria-label={`${metric.indicator_name} ${score}分`}><i style={{ width: `${score}%` }} /></div>
      <div className="s-sentiment-axis"><span>极度悲观</span><span>中性</span><span>狂热</span></div>
      <p>{metric.component_summary ?? "成分数据暂未披露"}</p>
      <dl><div><dt>上一日/期</dt><dd>{display(metric.previous_value)}</dd></div><div><dt>同比情况</dt><dd>{display(metric.yoy_value)}</dd></div></dl>
      {metric.interpretation_type !== "none" && metric.interpretation ? <footer><Interpretation metric={metric} /></footer> : null}
    </article>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}

function signedSummary(value: number | null | undefined, unit: string) {
  return value === null || value === undefined || !Number.isFinite(value) ? null : `${value > 0 ? "+" : ""}${formatNumber(value)}${unit}`;
}

function summaryLine(parts: Array<string | null | undefined>, fallback = "本期暂无可用数据") {
  return parts.filter((part): part is string => Boolean(part)).join(" · ") || fallback;
}

function firstChange(value: string | number | null | undefined) {
  return String(value ?? "").match(/[+-]\d+(?:\.\d+)?%/)?.[0] ?? null;
}

function Change({ value }: { value: number }) {
  const tone = value > 0 ? "up" : value < 0 ? "down" : "flat";
  return <span className={`s-change s-change--${tone}`}>{value > 0 ? "+" : ""}{value.toFixed(2)}%</span>;
}

function SignedValue({ value, suffix }: { value: number; suffix: string }) {
  return <span className={value > 0 ? "s-flow-positive" : value < 0 ? "s-flow-negative" : ""}>{value > 0 ? "+" : ""}{formatNumber(value)}{suffix}</span>;
}

function CapitalFlowSection({ flows, metrics }: { flows?: CapitalFlows; metrics: Metric[] }) {
  const byId = (id: string) => metrics.find((item) => item.indicator_id === id);
  const etfFallback = byId("M1-A17/18");
  const southFallback = byId("M1-B01/02");
  const marginFallback = byId("M1-A15/16");
  const sectorFallback = byId("M3-A06/07");
  const etf = flows?.etf;
  const southbound = flows?.southbound;
  const margin = flows?.margin;
  const sectors = flows?.sectors;
  if (!etf && !southbound && !margin && !sectors && !etfFallback && !southFallback && !marginFallback && !sectorFallback) return null;
  return <section className="s-section s-flow-section" aria-label="资金流向">
    <div className="s-section-heading"><h2>资金流向</h2><span>真实净买入与交易活跃度分开呈现</span></div>
    <div className="s-flow-grid">
      <article className="s-flow-panel">
        <div className="s-flow-panel-head"><span>ETF份额变化</span><small>申赎方向代理 · 上交所</small></div>
        {etf ? <>
          <strong className="s-flow-value"><SignedValue value={etf.change_100m_shares} suffix=" 亿份" /></strong>
          <p>可比基金较上一期 <SignedValue value={etf.change_pct} suffix="%" /> · {etf.matched_count}只 · 覆盖{(etf.coverage * 100).toFixed(0)}%</p>
          <div className="s-flow-rank"><b>增加</b>{etf.top_increase.length ? etf.top_increase.map((item) => <span key={item.code}>{item.name} <SignedValue value={item.change_100m_shares} suffix="亿份" /></span>) : <span>无显著增加</span>}</div>
          <div className="s-flow-rank"><b>减少</b>{etf.top_decrease.length ? etf.top_decrease.map((item) => <span key={item.code}>{item.name} <SignedValue value={item.change_100m_shares} suffix="亿份" /></span>) : <span>无显著减少</span>}</div>
          <small className="s-flow-source">{etf.previous_period} → {etf.period} · <a href={etf.canonical_url} target="_blank" rel="noreferrer">{etf.publisher}</a></small>
        </> : <><strong className="s-flow-value">{etfFallback?.value ?? "待更新"}</strong><p>仅有ETF总份额，基金级可比份额排行待下一次采集。</p><small className="s-flow-source">{etfFallback?.period ?? "—"} · {etfFallback?.publisher ?? "—"}</small></>}
      </article>
      <article className="s-flow-panel">
        <div className="s-flow-panel-head"><span>境内与跨境</span><small>南向净买入 · 境内两融</small></div>
        <div className="s-flow-stat"><span>南向资金成交净买额</span><strong>{southbound ? <SignedValue value={southbound.net_buy_100m_cny} suffix=" 亿元" /> : southFallback?.value ?? "待更新"}</strong><small>{southbound ? `${southbound.period} · 连续净买入${southbound.streak}日` : southFallback?.period ?? "—"}</small></div>
        <div className="s-flow-stat"><span>两融余额变化</span><strong>{margin ? <SignedValue value={margin.balance_change_100m_cny} suffix=" 亿元" /> : marginFallback?.value ?? "待更新"}</strong><small>{margin ? `${margin.period} · 余额${formatNumber(margin.balance_100m_cny)}亿元` : marginFallback?.period ?? "—"}</small></div>
        <p>北向日净买额已停止公开披露，不展示估算值。两融余额变化反映杠杆活动，不等同于资金净流入。</p>
        <small className="s-flow-source">{southbound ? <a href={southbound.canonical_url} target="_blank" rel="noreferrer">{southbound.publisher}</a> : southFallback?.publisher ?? "—"} · {margin ? <a href={margin.canonical_url} target="_blank" rel="noreferrer">{margin.publisher}</a> : marginFallback?.publisher ?? "—"}</small>
      </article>
      <article className="s-flow-panel">
        <div className="s-flow-panel-head"><span>板块成交占比</span><small>交易关注度迁移</small></div>
        {sectors ? <>
          <div className="s-flow-rank"><b>占比上升</b>{sectors.increasing.length ? sectors.increasing.map((item) => <span key={item.name}>{item.name} <SignedValue value={item.change_pp} suffix="个百分点" /></span>) : <span>暂无可比板块</span>}</div>
          <div className="s-flow-rank"><b>占比下降</b>{sectors.decreasing.length ? sectors.decreasing.map((item) => <span key={item.name}>{item.name} <SignedValue value={item.change_pp} suffix="个百分点" /></span>) : <span>暂无可比板块</span>}</div>
          <small className="s-flow-source">{sectors.period} · 基数：{sectors.basis ?? "沪深股票成交额"} · <a href={sectors.canonical_url} target="_blank" rel="noreferrer">{sectors.publisher}</a></small>
        </> : <><p>{sectorFallback?.value ? String(sectorFallback.value).split("；").slice(0, 3).join("；") : "待更新"}</p><small className="s-flow-source">{sectorFallback?.period ?? "—"} · 可比前期占比待下一次采集</small></>}
        <p>成交占比变化只是相对交易活跃度，不等同于净资金流入。</p>
      </article>
    </div>
  </section>;
}

function ForwardFlowSection({ outlook }: { outlook?: ForwardFlows }) {
  if (!outlook?.windows?.length) return null;
  const five = outlook.windows.find((item) => item.days === 5);
  const ten = outlook.windows.find((item) => item.days === 10);
  const twenty = outlook.windows.find((item) => item.days === 20);
  const fiveEtfChange = signedSummary(five?.equity_etf?.change_100m_shares, "亿份");
  const fiveMarginChange = signedSummary(five?.margin?.balance_change_100m_cny, "亿元");
  const signed = (value: number | undefined, suffix: string) => value === undefined ? "—" : `${value > 0 ? "+" : ""}${formatNumber(value)}${suffix}`;
  return <section className="s-section s-forward-flow" aria-label="未来资金方向观察">
    <div className="s-section-heading"><h2>未来资金方向</h2><span>{summaryLine([fiveEtfChange && `近5日ETF ${fiveEtfChange}`, fiveMarginChange && `融资 ${fiveMarginChange}`, `截至${outlook.market_day}`])}</span></div>
    <p className={`s-forward-flow-headline ${outlook.verdict.headline.includes("承压") || outlook.verdict.headline.includes("压力较高") ? "s-forward-flow-headline--danger" : outlook.verdict.headline.includes("改善") ? "s-forward-flow-headline--positive" : ""}`}>{outlook.verdict.headline}</p>
    <div className="s-forward-flow-grid">
      <article className={`s-forward-flow-card s-forward-flow-card--${outlook.verdict.domestic.includes("持续增配") ? "positive" : outlook.verdict.domestic.includes("持续减配") ? "danger" : "warning"}`}>
        <span>A股 · ETF份额与融资余额</span><strong>{outlook.verdict.domestic}</strong>
        <p>权益ETF 5 / 10 / 20日：{signed(five?.equity_etf?.change_100m_shares, "亿份")} / {signed(ten?.equity_etf?.change_100m_shares, "亿份")} / {signed(twenty?.equity_etf?.change_100m_shares, "亿份")}。</p>
      </article>
      <article className={`s-forward-flow-card s-forward-flow-card--${outlook.verdict.hong_kong.includes("均净买入") ? "positive" : outlook.verdict.hong_kong.includes("均净卖出") ? "danger" : "warning"}`}>
        <span>港股通 · 内地资金南向成交</span><strong>{outlook.verdict.hong_kong}</strong>
        <p>5 / 10 / 20日净买额：{signed(five?.southbound?.net_buy_100m_cny, "亿元")} / {signed(ten?.southbound?.net_buy_100m_cny, "亿元")} / {signed(twenty?.southbound?.net_buy_100m_cny, "亿元")}。不计入A股资金判断。</p>
      </article>
      <article className={`s-forward-flow-card s-forward-flow-card--${outlook.verdict.foreign_environment.includes("改善") ? "positive" : outlook.verdict.foreign_environment.includes("偏紧") ? "danger" : "warning"}`}>
        <span>外资 · 配置条件与沪股通活跃度</span><strong>{outlook.verdict.foreign_environment}</strong>
        <p>{outlook.verdict.participation}。近5日美国实际利率 {signed(five?.foreign_conditions.real_yield_change_pp, "个百分点")}；VIX {signed(five?.foreign_conditions.vix_change_points, "点")}。北向净买额无公开日度数据。</p>
      </article>
    </div>
    <div className="s-forward-flow-table-wrap"><table className="s-forward-flow-table" aria-label="5日10日20日资金证据"><thead><tr><th>区间</th><th>A股权益ETF份额</th><th>融资余额</th><th>南向净买额</th><th>沪股通日均成交</th><th>实际利率 / VIX</th></tr></thead><tbody>{outlook.windows.map((item) => <tr key={item.days}><th>{item.days}日<small>{item.from_period} → {item.to_period}</small></th><td className={item.equity_etf && item.equity_etf.change_pct > 0 ? "s-flow-positive" : item.equity_etf && item.equity_etf.change_pct < 0 ? "s-flow-negative" : ""}>{signed(item.equity_etf?.change_100m_shares, "亿份")}<small>{signed(item.equity_etf?.change_pct, "%")} · 可比{item.equity_etf?.matched_count ?? "—"}只</small></td><td>{signed(item.margin?.balance_change_100m_cny, "亿元")}<small>{item.margin ? `${item.margin.from_period} → ${item.margin.to_period}` : "—"}</small></td><td className={item.southbound && item.southbound.net_buy_100m_cny > 0 ? "s-flow-positive" : item.southbound && item.southbound.net_buy_100m_cny < 0 ? "s-flow-negative" : ""}>{signed(item.southbound?.net_buy_100m_cny, "亿元")}<small>截至{item.southbound?.to_period ?? "—"}</small></td><td>{signed(item.northbound?.avg_turnover_100m_cny, "亿元")}<small>仅沪股通 · 无方向</small></td><td>实际利率 {signed(item.foreign_conditions.real_yield_change_pp, "个百分点")}<small>VIX {signed(item.foreign_conditions.vix_change_points, "点")} · 截至{item.foreign_conditions.real_yield_change_pp_period ?? item.foreign_conditions.vix_change_points_period ?? "—"}</small></td></tr>)}</tbody></table></div>
    <details className="s-forward-flow-detail"><summary>数据来源与判断边界</summary>
      <div className="s-forward-flow-source-list">{Object.entries(outlook.sources).map(([key, url]) => <a href={url} key={key} target="_blank" rel="noreferrer">{({equity_etf:"上交所ETF",margin:"上交所两融",southbound:"南向净买",northbound:"沪股通成交",dollar:"美元指数",real_yield:"实际利率",vix:"VIX"} as Record<string,string>)[key] ?? key}</a>)}</div>
      <p className="s-forward-flow-note">{outlook.method_note}</p>
    </details>
  </section>;
}

function MajorNewsSection({ news, shipping }: { news: MajorNews[]; shipping: ShippingFlow[] }) {
  if (!news.length && !shipping.length) return null;
  const impactLabels = { high: "高影响", medium: "需关注", low: "一般" };
  return (
    <section className="s-section s-news-section">
      <div className="s-section-heading"><h2>重大新闻</h2><span>近36小时 · 新闻注明来源与时点</span></div>
      <div className="s-news-layout">
        <div className="s-news-list">
          {news.map((item) => (
            <article className={`s-news-item s-news-item--${item.tone}`} key={`${item.published_at}-${item.source_url}`}>
              <div className="s-news-meta">
                <span>{item.category}</span><em>{impactLabels[item.impact_level]}</em>
                <time dateTime={item.published_at}>{formatDateTime(item.published_at)}</time>
              </div>
              <h3><a href={item.source_url} target="_blank" rel="noreferrer">{item.headline}</a></h3>
              {item.summary ? <p>{item.summary}</p> : null}
              <div className="s-news-take"><strong>影响</strong><span>{item.market_impact}</span></div>
              <footer><span>{item.affected_assets}</span><a href={item.source_url} target="_blank" rel="noreferrer">{item.source_name} · {item.time_basis}</a></footer>
            </article>
          ))}
        </div>
        {shipping.length ? (
          <aside className="s-shipping-panel" aria-label="航运要道通行情况">
            <div className="s-shipping-title"><h3>航运要道</h3><span>每日船舶通行 · AIS</span></div>
            {shipping.map((route) => (
              <article className={`s-shipping-item s-shipping-item--${route.interpretation_type}`} key={route.route_id}>
                <div><strong>{route.route_name}</strong><time>{route.period}</time></div>
                <dl>
                  <div><dt>当日通行</dt><dd>{route.vessel_count} 艘</dd></div>
                  <div><dt>其中油轮</dt><dd>{route.tanker_count} 艘</dd></div>
                  <div><dt>近7日均值</dt><dd>{route.average_7d} 艘</dd></div>
                  <div><dt>较28日均值</dt><dd><Change value={route.change_vs_28d_pct} /></dd></div>
                </dl>
                {route.interpretation ? <p>{route.interpretation}</p> : null}
                <a href={route.canonical_url} target="_blank" rel="noreferrer">{route.publisher}</a>
              </article>
            ))}
          </aside>
        ) : null}
      </div>
      <p className="s-news-note">政要社交平台原帖没有稳定免费接口；当前以官方发布为优先，并用公开新闻源监测可能影响市场的发言或帖子报道。</p>
    </section>
  );
}

function CommoditySection({ commodities }: { commodities: CommodityQuote[] }) {
  if (!commodities.length) return null;
  const groups = ["能源", "贵金属", "有色金属", "黑色金属", "新能源材料"];
  return (
    <section className="s-section s-commodity-section">
      <div className="s-section-heading"><h2>主要大宗商品</h2><span>主力连续收盘 · 日涨跌 / 近5个交易日涨跌</span></div>
      <div className="s-commodity-grid">
        {groups.map((group) => {
          const rows = commodities.filter((item) => item.group === group);
          if (!rows.length) return null;
          return (
            <article className="s-commodity-group" key={group}>
              <h3>{group}</h3>
              <div className="s-commodity-table-wrap">
                <table className="s-commodity-table">
                  <thead><tr><th>品种</th><th>收盘价</th><th>当日</th><th>近一周</th></tr></thead>
                  <tbody>{rows.map((item) => (
                    <tr className={`s-commodity-row--${item.signal}`} key={item.symbol}>
                      <th scope="row"><a href={item.canonical_url} target="_blank" rel="noreferrer">{item.name}</a><small>{item.symbol} · {item.period}</small></th>
                      <td><strong>{formatNumber(item.price)}</strong><small>{item.unit}</small></td>
                      <td><Change value={item.daily_change_pct} /></td>
                      <td><Change value={item.weekly_change_pct} /></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </article>
          );
        })}
      </div>
      <p className="s-commodity-note">来源：新浪财经主力连续合约（AKShare采集）。钨暂无成熟标准化期货；钼虽有海外现金结算合约，但免费历史行情未达到稳定发布门槛，暂不使用非同口径现货价格替代。</p>
    </section>
  );
}

export function SectorDashboard() {
  const domestic = snapshot.metrics.filter((item) => /^M1-[AB]/.test(item.indicator_id));
  const global = snapshot.metrics.filter((item) => item.indicator_id.startsWith("M1-C"));
  const macro = snapshot.metrics.filter((item) => item.indicator_id.startsWith("M2-"));
  const industry = snapshot.metrics.filter((item) => item.indicator_id.startsWith("M3-"));
  const riskMetrics = snapshot.metrics.filter((item) => item.indicator_id.startsWith("M6-B"));
  const sentiment = snapshot.metrics.filter((item) => item.indicator_id.startsWith("M6-C"));
  const coreIds = ["M1-A01/02", "M1-A03/04", "M1-A05/06/07", "M1-B01/02", "M2-A01/03"];
  const core = coreIds.map((id) => snapshot.metrics.find((item) => item.indicator_id === id)).filter((item): item is Metric => Boolean(item));
  const triggeredRisks = snapshot.risks.filter((risk) => risk.tone === "danger" && ["触发", "显著触发"].includes(risk.status));
  const watchingRisks = snapshot.risks.filter((risk) => risk.tone === "warning" && risk.status !== "未确认");
  const criticalRisks = [...triggeredRisks, ...watchingRisks].slice(0, 3);
  const riskLevel = snapshot.run.risk_level;
  const sectorCandidates = snapshot.sector_candidates ?? [];
  const marketDataDate = domestic.find((item) => /^\d{4}-\d{2}-\d{2}/.test(item.period))?.period.slice(0, 10) ?? snapshot.run.market_data_date ?? snapshot.report_date;
  const marketDataIsStale = Boolean(snapshot.run.market_data_date && marketDataDate < snapshot.run.market_data_date);
  const majorNews = snapshot.major_news ?? [];
  const headlineNews = majorNews.filter((item) => item.impact_level === "high").slice(0, 2);
  const shipping = snapshot.shipping ?? [];
  const commodities = snapshot.commodities ?? [];
  const metricValue = (id: string) => snapshot.metrics.find((item) => item.indicator_id === id)?.value;
  const turnoverParts = String(metricValue("M1-A05/06/07") ?? "").split("；");
  const bondParts = String(metricValue("M2-B10") ?? "").split(" / ");
  const industryLeaders = String(metricValue("M3-A01/03") ?? "").split("；").slice(0, 2).map((part) => part.match(/^(.+?) RPS20/)?.[1]).filter(Boolean);
  const crowdedIndustry = String(metricValue("M3-A10") ?? "").split("；")[0];
  const riskParts = String(metricValue("M6-B02") ?? "").split("；");
  const featuredNews = headlineNews[0] ?? majorNews[0];
  const hormuz = shipping.find((item) => item.route_name.includes("霍尔木兹"));
  const commodityDeclines = commodities.filter((item) => item.daily_change_pct < 0).length;
  const largestCommodityMove = commodities.reduce<CommodityQuote | null>((largest, item) => !largest || Math.abs(item.daily_change_pct) > Math.abs(largest.daily_change_pct) ? item : largest, null);
  const capitalSummary = summaryLine([
    snapshot.capital_flows?.etf && `ETF ${signedSummary(snapshot.capital_flows.etf.change_100m_shares, "亿份")}`,
    snapshot.capital_flows?.southbound && `南向 ${signedSummary(snapshot.capital_flows.southbound.net_buy_100m_cny, "亿元")}`,
    snapshot.capital_flows?.margin && `融资 ${signedSummary(snapshot.capital_flows.margin.balance_change_100m_cny, "亿元")}`,
    snapshot.capital_flows?.sectors?.increasing[0] && `${snapshot.capital_flows.sectors.increasing[0].name}成交占比 ${signedSummary(snapshot.capital_flows.sectors.increasing[0].change_pp, "百分点")}`,
  ]);
  const newsSummary = summaryLine([
    featuredNews && `${featuredNews.headline.length > 25 ? `${featuredNews.headline.slice(0, 24)}…` : featuredNews.headline}（${formatDateTime(featuredNews.published_at)}）`,
    hormuz && `霍尔木兹${hormuz.vessel_count}艘（${hormuz.period.slice(5)}）`,
  ]);
  const commoditySummary = summaryLine([
    commodities.length ? `${commodityDeclines}/${commodities.length}种期货下跌` : null,
    largestCommodityMove && `${largestCommodityMove.name}日变 ${signedSummary(largestCommodityMove.daily_change_pct, "%")}、近5日 ${signedSummary(largestCommodityMove.weekly_change_pct, "%")}`,
  ]);
  const sentimentSummary = summaryLine(sentiment.map((item) => item.value === null ? null : `${item.indicator_name.replace(/(?:市场)?情绪温度/, "")}${String(item.value).split(" · ")[0]}`));
  const marketSummary = summaryLine([
    turnoverParts[0] && `沪深成交${turnoverParts[0]}亿元`,
    snapshot.capital_flows?.southbound && `南向${signedSummary(snapshot.capital_flows.southbound.net_buy_100m_cny, "亿元")}`,
  ]);
  const globalSummary = summaryLine([
    firstChange(metricValue("M1-C01")) && `标普${firstChange(metricValue("M1-C01"))}`,
    firstChange(metricValue("M1-C03")) && `日经${firstChange(metricValue("M1-C03"))}`,
    firstChange(metricValue("M1-C04")) && `韩国${firstChange(metricValue("M1-C04"))}`,
  ]);
  const macroSummary = summaryLine([
    metricValue("M2-A01/03") !== null && metricValue("M2-A01/03") !== undefined ? `PMI ${String(metricValue("M2-A01/03")).replace(/\s*\/\s*/g, "/")}` : null,
    bondParts[1] && `10年国债${bondParts[1].trim()}`,
  ]);
  const industrySummary = summaryLine([
    industryLeaders.length ? `RPS前列 ${industryLeaders.join("、")}` : null,
    crowdedIndustry && `拥挤度 ${crowdedIndustry}`,
  ]);
  const riskSummary = summaryLine(riskParts.slice(0, 2));
  const statusTone: Tone = marketDataIsStale ? "danger" : snapshot.data_state === "partial" ? "warning" : "neutral";
  const alertTone = triggeredRisks.length ? "danger" : watchingRisks.length ? "watch" : "calm";

  return (
    <main className="sector-dashboard">
      <header className="s-topbar">
        <div className="s-brand"><span>博</span><div><small>宏观与行业数据日报</small><h1>每日资讯博弈</h1></div></div>
        <div className="s-run-meta">
          <span className={`s-status s-status--${statusTone}`}><Dot tone={statusTone} />{marketDataIsStale ? "行情滞后" : snapshot.data_state === "partial" ? "部分覆盖" : "已核验"}</span>
          <span className="s-run-date">日报 {snapshot.report_date}</span><span className="s-run-date">行情数据日 {marketDataDate}</span>
        </div>
      </header>

      <section className={`s-alert s-alert--${alertTone}`} aria-label="今日重点提示">
        <div className="s-alert-level"><span>今日市场判断</span><strong>{marketDataIsStale ? "行情滞后 · 判断受限" : riskLevel}</strong></div>
        <p>{marketDataIsStale ? `A股市场数据实际截至${marketDataDate}，晚于该日的风险与机会判断需等待同日数据更新。` : triggeredRisks.length ? triggeredRisks.slice(0, 2).map((item) => `${item.name}：${item.interpretation}`).join("；") : watchingRisks.length ? `${watchingRisks.slice(0, 3).map((item) => item.name).join("、")}处于观察区，尚未形成已确认风险共振。` : "已覆盖风险项暂无明确触发；观察后续变化。"}</p>
        <small>行情数据日 {marketDataDate} · 截至 {formatDateTime(snapshot.as_of)} 北京时间</small>
      </section>

      <section className="s-decision-grid" aria-label="今日决策摘要">
        <section className="s-decision-panel s-decision-panel--opportunity">
          <div className="s-section-heading"><h2>机会线索</h2><span>1—3个月 · 最多3个行业</span></div>
          {sectorCandidates.length ? <div className="s-candidate-list">{sectorCandidates.map((item) => (
            <article className="s-candidate" key={item.industry_name}>
              <div className="s-candidate-title"><span className="s-candidate-rank">0{item.rank}</span><h3>{item.industry_name}</h3><em>{item.opportunity_type}</em><b>{item.status}</b></div>
              <p className="s-candidate-evidence">{item.evidence.join(" · ")}</p>
              <div className="s-candidate-conditions"><span><strong>确认</strong>{item.confirmation_conditions}</span><span><strong>失效</strong>{item.invalidation_conditions}</span></div>
            </article>
          ))}</div> : <div className="s-no-signal"><strong>暂无符合筛选门槛的行业线索</strong><span>行业行情覆盖不足或强度、拥挤度与波动率未同时达标。</span></div>}
          <p className="s-decision-note">来源：{industry.find((item) => item.indicator_id === "M3-A01/03")?.publisher ?? "行业行情免费源"} · {marketDataDate}。估值与前瞻景气未核验，不构成买入建议。</p>
        </section>
        <section className="s-decision-panel s-decision-panel--risk">
          <div className="s-section-heading"><h2>风险雷达</h2><span>{triggeredRisks.length}项触发 · {watchingRisks.length}项观察</span></div>
          {criticalRisks.length ? <div className="s-risk-list">{criticalRisks.map((risk) => (
            <article className={`s-risk-item s-risk-item--${risk.tone}`} key={`${risk.risk_type}-${risk.name}`}>
              <div><Dot tone={risk.tone} /><strong>{risk.name}</strong><em>{risk.status}</em></div><p>{risk.interpretation}</p>
            </article>
          ))}</div> : <div className="s-no-signal"><strong>暂无明确触发</strong><span>不代表市场无风险；留意缺失数据与新信号。</span></div>}
          <p className="s-decision-note">仅把已触发信号计入风险等级；未确认的共振不作为已发生风险。</p>
        </section>
      </section>

      <section className="s-core-grid" aria-label="核心指标">
        {core.map((item) => <MetricCard metric={item} key={item.indicator_id} />)}
      </section>

      <ForwardFlowSection outlook={snapshot.forward_flows} />

      {snapshot.events.length || headlineNews.length ? <section className="s-section s-next-section">
        <div className="s-section-heading"><h2>接下来关注</h2><span>重要催化与异动</span></div>
        <div className="s-next-grid">
          {snapshot.events.slice(0, 2).map((event) => <article key={`${event.event_at}-${event.event_name}`}><span>事件 · {formatDateTime(event.event_at)}</span><strong>{event.event_name}</strong><small>{event.scenario}</small></article>)}
          {headlineNews.map((item) => <article key={`${item.published_at}-${item.source_url}`}><span>新闻 · {formatDateTime(item.published_at)}</span><strong><a href={item.source_url} target="_blank" rel="noreferrer">{item.headline}</a></strong><small>{item.source_name} · {item.market_impact}</small></article>)}
        </div>
      </section> : null}

      <section className="s-section s-support-section">
        <div className="s-section-heading"><h2>更多数据</h2><span>{summaryLine([snapshot.capital_flows?.etf && `ETF日变 ${signedSummary(snapshot.capital_flows.etf.change_100m_shares, "亿份")}`, commodities.length ? `${commodityDeclines}/${commodities.length}种期货下跌` : null])}</span></div>
        <details className="s-detail"><summary><strong>当期资金流向与行业活跃度</strong><span>{capitalSummary}</span></summary><CapitalFlowSection flows={snapshot.capital_flows} metrics={snapshot.metrics} /></details>
        <details className="s-detail"><summary><strong>重大新闻与航运要道</strong><span>{newsSummary}</span></summary><MajorNewsSection news={majorNews} shipping={shipping} /></details>
        <details className="s-detail"><summary><strong>主要大宗商品</strong><span>{commoditySummary}</span></summary><CommoditySection commodities={commodities} /></details>
        <details className="s-detail"><summary><strong>跨市场情绪</strong><span>{sentimentSummary}</span></summary><section className="s-section s-sentiment-section"><div className="s-sentiment-grid">{sentiment.map((item) => <SentimentCard metric={item} key={item.indicator_id} />)}</div><p className="s-sentiment-note">极度悲观仅提示潜在反转窗口，不构成买入信号；狂热或一致乐观时提高风险提示等级。</p></section></details>
        {snapshot.events.length > 2 ? <details className="s-detail"><summary><strong>未来催化</strong><span>{formatDateTime(snapshot.events[2].event_at)} · {snapshot.events[2].event_name}</span></summary><div className="s-event-grid s-event-grid--detail">{snapshot.events.slice(2).map((event) => <article key={`${event.event_at}-${event.event_name}`}><div><strong>{formatDateTime(event.event_at)}</strong><span>{event.window} · {event.impact}影响</span></div><h3>{event.event_name}</h3><p>{event.industries}</p><small>{event.scenario}</small></article>)}</div></details> : null}
      </section>

      <section className="s-section">
        <div className="s-section-heading"><h2>指标明细</h2><span>{summaryLine([marketSummary.split(" · ")[0], globalSummary.split(" · ")[0], macroSummary.split(" · ")[0]])}</span></div>
        <details className="s-detail"><summary><strong>01 市场环境 · A股与港股通</strong><span>{marketSummary}</span></summary><MetricTable rows={domestic} label="A股与港股通市场环境" /></details>
        <details className="s-detail"><summary><strong>02 海外参考 · 美国与亚洲</strong><span>{globalSummary}</span></summary><MetricTable rows={global} label="海外市场参考" /></details>
        <details className="s-detail"><summary><strong>03 宏观、利率与政策预期</strong><span>{macroSummary}</span></summary><MetricTable rows={macro} label="宏观利率与政策预期" /></details>
        <details className="s-detail"><summary><strong>04 行业强度、成交与拥挤</strong><span>{industrySummary}</span></summary><MetricTable rows={industry} label="行业强度与拥挤" /></details>
        <details className="s-detail"><summary><strong>05 风险压力指标</strong><span>{riskSummary}</span></summary><MetricTable rows={riskMetrics} label="风险压力指标" /></details>
        <details className="s-detail"><summary><strong>06 跨市场情绪 · 逆向风险</strong><span>{sentimentSummary}</span></summary><MetricTable rows={sentiment} label="跨市场情绪" /></details>
      </section>

      <footer className="s-site-footer">
        <span>联系方式</span>
        <a href="mailto:liao497@126.com">liao497@126.com</a>
      </footer>
    </main>
  );
}
