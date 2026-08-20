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

type Snapshot = {
  report_date: string;
  as_of: string;
  data_state: "demo" | "partial" | "verified";
  metrics: Metric[];
  opportunities: Array<{ rank: number; industry_name: string; adjusted_score: number; thesis: string }>;
  risks: Risk[];
  events: Event[];
  data_gaps: Array<{ indicator_id: string; reason: string }>;
  run: { top_call: string; risk_level: string; coverage_note: string };
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

export function SectorDashboard() {
  const domestic = snapshot.metrics.filter((item) => /^M1-[AB]/.test(item.indicator_id));
  const global = snapshot.metrics.filter((item) => item.indicator_id.startsWith("M1-C"));
  const macro = snapshot.metrics.filter((item) => item.indicator_id.startsWith("M2-"));
  const industry = snapshot.metrics.filter((item) => item.indicator_id.startsWith("M3-"));
  const riskMetrics = snapshot.metrics.filter((item) => item.indicator_id.startsWith("M6-B"));
  const sentiment = snapshot.metrics.filter((item) => item.indicator_id.startsWith("M6-C"));
  const coreIds = ["M1-A01/02", "M1-A03/04", "M1-A05/06/07", "M1-B01/02", "M2-A01/03"];
  const core = coreIds.map((id) => snapshot.metrics.find((item) => item.indicator_id === id)).filter((item): item is Metric => Boolean(item));
  const criticalRisks = snapshot.risks.filter((risk) => risk.tone === "danger" || risk.tone === "warning");

  return (
    <main className="sector-dashboard">
      <header className="s-topbar">
        <div className="s-brand"><span>博</span><div><small>宏观与行业数据日报</small><h1>每日资讯博弈</h1></div></div>
        <div className="s-run-meta">
          <span className="s-status"><Dot tone="warning" />{snapshot.data_state === "partial" ? "部分覆盖" : "已核验"}</span>
          <span>{snapshot.report_date}</span><span>截至 {formatDateTime(snapshot.as_of)} 北京时间</span>
        </div>
      </header>

      <section className="s-alert" aria-label="今日重点提示">
        <div className="s-alert-level"><span>重点提示</span><strong>{snapshot.run.risk_level}</strong></div>
        <p>{snapshot.run.top_call}</p><small>{snapshot.run.coverage_note}</small>
      </section>

      <section className="s-core-grid" aria-label="核心指标">
        {core.map((item) => <MetricCard metric={item} key={item.indicator_id} />)}
      </section>

      <section className="s-section s-sentiment-section">
        <div className="s-section-heading"><h2>跨市场情绪</h2><span>0 悲观 · 50 中性 · 100 乐观｜狂热为逆向风险</span></div>
        <div className="s-sentiment-grid">{sentiment.map((item) => <SentimentCard metric={item} key={item.indicator_id} />)}</div>
        <p className="s-sentiment-note">极度悲观仅提示潜在反转窗口，不构成买入信号；狂热或一致乐观时提高风险提示等级。</p>
      </section>

      <section className="s-section">
        <div className="s-section-heading"><h2>重点风险</h2><span>{criticalRisks.length} 项需关注</span></div>
        <div className="s-risk-grid">
          {criticalRisks.map((risk) => (
            <article className={`s-risk-item s-risk-item--${risk.tone}`} key={`${risk.risk_type}-${risk.name}`}>
              <div><Dot tone={risk.tone} /><strong>{risk.name}</strong><em>{risk.status}</em></div><p>{risk.interpretation}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="s-section">
        <div className="s-section-heading"><h2>波段行业机会 Top 3</h2><span>1—3个月</span></div>
        {snapshot.opportunities.length ? (
          <div className="s-opportunity-grid">
            {snapshot.opportunities.map((item) => <article key={item.industry_name}><span>0{item.rank}</span><h3>{item.industry_name}</h3><strong>{item.adjusted_score}</strong><p>{item.thesis}</p></article>)}
          </div>
        ) : <div className="s-no-signal"><strong>本期不生成机会</strong><span>{snapshot.data_gaps.find((gap) => gap.indicator_id === "M7-*")?.reason ?? "机会输入未达到发布门槛，不以旧数据或代理值补齐。"}</span></div>}
      </section>

      <section className="s-section">
        <div className="s-section-heading"><h2>指标明细</h2><span>风险与观察项整行高亮</span></div>
        <details className="s-detail" open><summary><strong>01 市场环境 · A股与港股通</strong><span>{domestic.length}项</span></summary><MetricTable rows={domestic} label="A股与港股通市场环境" /></details>
        <details className="s-detail" open><summary><strong>02 海外参考 · 美国与亚洲</strong><span>{global.length}项</span></summary><MetricTable rows={global} label="海外市场参考" /></details>
        <details className="s-detail" open><summary><strong>03 宏观、利率与政策预期</strong><span>{macro.length}项</span></summary><MetricTable rows={macro} label="宏观利率与政策预期" /></details>
        <details className="s-detail" open><summary><strong>04 行业强度、成交与拥挤</strong><span>{industry.length}项</span></summary><MetricTable rows={industry} label="行业强度与拥挤" /></details>
        <details className="s-detail" open><summary><strong>05 风险压力指标</strong><span>{riskMetrics.length}项</span></summary><MetricTable rows={riskMetrics} label="风险压力指标" /></details>
        <details className="s-detail" open><summary><strong>06 跨市场情绪 · 逆向风险</strong><span>{sentiment.length}项</span></summary><MetricTable rows={sentiment} label="跨市场情绪" /></details>
      </section>

      <section className="s-section">
        <div className="s-section-heading"><h2>未来催化</h2><span>北京时间</span></div>
        <div className="s-event-grid">
          {snapshot.events.map((event) => (
            <article key={`${event.event_at}-${event.event_name}`}>
              <div><strong>{formatDateTime(event.event_at)}</strong><span>{event.window} · {event.impact}影响</span></div>
              <h3>{event.event_name}</h3><p>{event.industries}</p><small>{event.scenario}</small>
            </article>
          ))}
        </div>
      </section>

      <footer className="s-site-footer">
        <span>联系方式</span>
        <a href="mailto:liao497@126.com">liao497@126.com</a>
      </footer>
    </main>
  );
}
