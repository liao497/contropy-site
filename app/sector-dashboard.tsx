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

function Change({ value }: { value: number }) {
  const tone = value > 0 ? "up" : value < 0 ? "down" : "flat";
  return <span className={`s-change s-change--${tone}`}>{value > 0 ? "+" : ""}{value.toFixed(2)}%</span>;
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

      {snapshot.events.length || headlineNews.length ? <section className="s-section s-next-section">
        <div className="s-section-heading"><h2>接下来关注</h2><span>重要催化与异动</span></div>
        <div className="s-next-grid">
          {snapshot.events.slice(0, 2).map((event) => <article key={`${event.event_at}-${event.event_name}`}><span>事件 · {formatDateTime(event.event_at)}</span><strong>{event.event_name}</strong><small>{event.scenario}</small></article>)}
          {headlineNews.map((item) => <article key={`${item.published_at}-${item.source_url}`}><span>新闻 · {formatDateTime(item.published_at)}</span><strong><a href={item.source_url} target="_blank" rel="noreferrer">{item.headline}</a></strong><small>{item.source_name} · {item.market_impact}</small></article>)}
        </div>
      </section> : null}

      <section className="s-section s-support-section">
        <div className="s-section-heading"><h2>更多数据</h2><span>按需展开 · 完整来源与历史对比</span></div>
        <details className="s-detail"><summary><strong>重大新闻与航运要道</strong><span>{majorNews.length}条新闻 · {shipping.length}条航道</span></summary><MajorNewsSection news={majorNews} shipping={shipping} /></details>
        <details className="s-detail"><summary><strong>主要大宗商品</strong><span>{commodities.length}种期货</span></summary><CommoditySection commodities={commodities} /></details>
        <details className="s-detail"><summary><strong>跨市场情绪</strong><span>狂热为逆向风险</span></summary><section className="s-section s-sentiment-section"><div className="s-sentiment-grid">{sentiment.map((item) => <SentimentCard metric={item} key={item.indicator_id} />)}</div><p className="s-sentiment-note">极度悲观仅提示潜在反转窗口，不构成买入信号；狂热或一致乐观时提高风险提示等级。</p></section></details>
        {snapshot.events.length > 2 ? <details className="s-detail"><summary><strong>未来催化</strong><span>北京时间</span></summary><div className="s-event-grid s-event-grid--detail">{snapshot.events.slice(2).map((event) => <article key={`${event.event_at}-${event.event_name}`}><div><strong>{formatDateTime(event.event_at)}</strong><span>{event.window} · {event.impact}影响</span></div><h3>{event.event_name}</h3><p>{event.industries}</p><small>{event.scenario}</small></article>)}</div></details> : null}
      </section>

      <section className="s-section">
        <div className="s-section-heading"><h2>指标明细</h2><span>风险与观察项整行高亮</span></div>
        <details className="s-detail"><summary><strong>01 市场环境 · A股与港股通</strong><span>{domestic.length}项</span></summary><MetricTable rows={domestic} label="A股与港股通市场环境" /></details>
        <details className="s-detail"><summary><strong>02 海外参考 · 美国与亚洲</strong><span>{global.length}项</span></summary><MetricTable rows={global} label="海外市场参考" /></details>
        <details className="s-detail"><summary><strong>03 宏观、利率与政策预期</strong><span>{macro.length}项</span></summary><MetricTable rows={macro} label="宏观利率与政策预期" /></details>
        <details className="s-detail"><summary><strong>04 行业强度、成交与拥挤</strong><span>{industry.length}项</span></summary><MetricTable rows={industry} label="行业强度与拥挤" /></details>
        <details className="s-detail"><summary><strong>05 风险压力指标</strong><span>{riskMetrics.length}项</span></summary><MetricTable rows={riskMetrics} label="风险压力指标" /></details>
        <details className="s-detail"><summary><strong>06 跨市场情绪 · 逆向风险</strong><span>{sentiment.length}项</span></summary><MetricTable rows={sentiment} label="跨市场情绪" /></details>
      </section>

      <footer className="s-site-footer">
        <span>联系方式</span>
        <a href="mailto:liao497@126.com">liao497@126.com</a>
      </footer>
    </main>
  );
}
