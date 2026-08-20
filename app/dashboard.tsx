"use client";

import { useEffect, useMemo, useState } from "react";
import {
  calendarItems,
  earningsItems,
  forwardSignals,
  initialWatchlist,
  macroSignals,
  marketPulse,
  riskSignals,
  scoringWeights,
  sectors,
  shortOpportunities,
  sourceRegistry,
  swingOpportunities,
  type Opportunity,
  type Tone,
} from "./data";

type WatchItem = (typeof initialWatchlist)[number];

function Mark({ tone }: { tone: Tone }) {
  return <span className={`mark mark--${tone}`} aria-hidden="true" />;
}

function OpportunityRow({ item, index, onSelect }: { item: Opportunity; index: number; onSelect: (item: Opportunity) => void }) {
  return (
    <button className="opportunity-row" type="button" aria-label={`查看 ${item.name} 详情`} onClick={() => onSelect(item)}>
      <span className="opportunity-rank">{String(index + 1).padStart(2, "0")}</span>
      <span className="opportunity-name">
        <strong>{item.name}</strong>
        <small>{item.ticker} · {item.market}</small>
      </span>
      <span className="opportunity-reason">{item.reason}</span>
      <span className="score-pill"><Mark tone={item.tone} />{item.score}</span>
      <span className="row-arrow">↗</span>
    </button>
  );
}

export function InvestmentDashboard() {
  const [horizon, setHorizon] = useState<"short" | "swing">("short");
  const [watchlist, setWatchlist] = useState<WatchItem[]>(initialWatchlist);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [draft, setDraft] = useState({ name: "", ticker: "", market: "A股", theme: "" });
  const opportunities = horizon === "short" ? shortOpportunities : swingOpportunities;
  const strongWatchlist = useMemo(() => watchlist.filter((item) => item.score >= 70), [watchlist]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem("morning-signal-watchlist-v1");
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as WatchItem[];
          if (Array.isArray(parsed)) setWatchlist(parsed);
        } catch {
          // Keep the verified starter list when local data is malformed.
        }
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem("morning-signal-watchlist-v1", JSON.stringify(watchlist));
  }, [hydrated, watchlist]);

  function addWatchItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ticker = draft.ticker.trim().toUpperCase();
    if (!draft.name.trim() || !ticker || watchlist.some((item) => item.ticker === ticker)) return;
    setWatchlist((items) => [...items, {
      name: draft.name.trim(), ticker, market: draft.market, theme: draft.theme.trim() || "自定义", state: "待核验", score: 50,
    }]);
    setDraft({ name: "", ticker: "", market: "A股", theme: "" });
  }

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark">晨</span>
          <div>
            <p>Morning Signal Desk</p>
            <h1>每日资讯博弈</h1>
          </div>
        </div>
        <div className="topbar-meta">
          <span className="status-chip"><span className="live-dot" />本地原型</span>
          <span>北京时间 07:30 · 仅A股交易日</span>
          <button className="icon-button" type="button" aria-label="打开看板设置" onClick={() => setWatchlistOpen(true)}>设置</button>
        </div>
      </header>

      <section className="demo-banner" role="note">
        <span>DEMO</span>
        <p><strong>当前为交互原型。</strong> 页面数值与评分均为演示数据，不是实时行情，也不构成投资建议。</p>
      </section>

      <section className="morning-brief">
        <div className="brief-copy">
          <p className="eyebrow">今日晨间判断 · 示例</p>
          <h2>风险偏好温和修复，优先寻找<br /><em>景气与量价同时确认</em>的方向。</h2>
          <p className="brief-note">不追单一新闻脉冲。机会进入摘要需通过市场环境、行业强度、个股质量和风险门四层检查。</p>
        </div>
        <div className="brief-aside">
          <div className="risk-gauge" aria-label="示例风险温度 43">
            <span className="risk-value">43</span>
            <span className="risk-label">风险温度</span>
          </div>
          <div>
            <span className="kicker">平衡模式</span>
            <p>2 / 6 风险组触发观察<br />未达到红色预警阈值</p>
          </div>
        </div>
      </section>

      <section className="pulse-grid" aria-label="市场脉搏">
        {marketPulse.map((item) => (
          <article className="pulse-card" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small><Mark tone={item.tone} />{item.delta}</small>
          </article>
        ))}
      </section>

      <div className="content-grid">
        <section className="panel panel--sectors">
          <div className="panel-heading">
            <div><p className="eyebrow">Opportunity map</p><h3>今日三条主线</h3></div>
            <button type="button" className="text-button">展开行业雷达</button>
          </div>
          <div className="sector-stack">
            {sectors.map((sector) => (
              <article className="sector-row" key={sector.name}>
                <span className="sector-rank">{sector.rank}</span>
                <div className="sector-main">
                  <div><strong>{sector.name}</strong><span>{sector.signal}</span></div>
                  <p>{sector.note}</p>
                  <div className="meter"><span style={{ width: `${sector.score}%` }} /></div>
                </div>
                <div className="sector-score"><strong>{sector.score}</strong><small>RPS {sector.trend}</small></div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel panel--opportunities">
          <div className="panel-heading panel-heading--tabs">
            <div><p className="eyebrow">Candidate engine</p><h3>机会候选</h3></div>
            <div className="segmented" role="tablist" aria-label="投资期限">
              <button className={horizon === "short" ? "active" : ""} onClick={() => setHorizon("short")} role="tab" aria-selected={horizon === "short"}>短线 1–20日</button>
              <button className={horizon === "swing" ? "active" : ""} onClick={() => setHorizon("swing")} role="tab" aria-selected={horizon === "swing"}>波段 1–3月</button>
            </div>
          </div>
          <div className="opportunity-list">
            {opportunities.map((item, index) => <OpportunityRow key={`${horizon}-${item.ticker}`} item={item} index={index} onSelect={setSelectedOpportunity} />)}
          </div>
          <p className="panel-footnote">自动机会池默认排除 ST / *ST、上市未满60日、非标审计、长期停牌、低流动性与持续亏损公司；观察池不隐藏，只显示风险标签。</p>
        </section>
      </div>

      <section className="watch-strip">
        <div>
          <p className="eyebrow">Watchlist pulse</p>
          <h3>观察池 · {watchlist.length} 只</h3>
        </div>
        <p><strong>{strongWatchlist.length} 只</strong>进入偏强区，<strong>1 只</strong>存在证据覆盖不足。港股通资格将在每日运行时动态核验。</p>
        <button type="button" className="primary-button" onClick={() => setWatchlistOpen(true)}>管理观察池</button>
      </section>

      <section className="research-details" id="research-details">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Expandable research desk</p>
            <h2>研究明细</h2>
          </div>
          <p>摘要只呈现行动相关结论；指标定义、来源、证据质量与失效条件保留在下方。</p>
        </div>

        <details className="detail-panel">
          <summary><span>01</span><strong>宏观、利率与全球映射</strong><small>经济周期 · 流动性 · 美日韩参考</small></summary>
          <div className="detail-body">
            <div className="signal-grid">
              {macroSignals.map((item) => (
                <article className="signal-card" key={item.name}>
                  <div><span>{item.name}</span><Mark tone={item.tone} /></div>
                  <strong>{item.value}</strong>
                  <p>{item.change}</p>
                  <footer>{item.source}<span>{item.tier} · {item.freshness}</span></footer>
                </article>
              ))}
            </div>
            <p className="method-note"><strong>口径：</strong>中国使用 PMI、新订单、工业增加值、社融/M1、地产、出口与资金利率；海外只作映射，重点跟踪美债实际利率、美元、波动率及美日韩科技链。历史复盘必须按 available_at 进行点时连接。</p>
          </div>
        </details>

        <details className="detail-panel">
          <summary><span>02</span><strong>重点风险雷达</strong><small>脆弱性 + 压力信号 · 双重确认</small></summary>
          <div className="detail-body">
            <div className="risk-table" role="table" aria-label="风险指标">
              {riskSignals.map((item) => (
                <div className="risk-row" role="row" key={item.name}>
                  <span>{item.group}</span><strong>{item.name}</strong><p>{item.rule}</p><em className={`tone-text tone-text--${item.tone}`}><Mark tone={item.tone} />{item.status}</em>
                </div>
              ))}
            </div>
            <p className="method-note"><strong>平衡预警：</strong>普通红色风险需至少两个独立类别同时触发或同一信号连续确认；治理、债务、退市和数据身份无法核验等硬门例外，可立即关闭方向性建议。</p>
          </div>
        </details>

        <details className="detail-panel">
          <summary><span>03</span><strong>财报与经营质量</strong><small>重大公司 · 超预期 · 现金含量</small></summary>
          <div className="detail-body">
            <div className="earnings-list">
              {earningsItems.map((item) => (
                <article key={item.company}>
                  <div><span>{item.badge}</span><small>{item.window}</small></div>
                  <h4>{item.company}</h4>
                  <p>{item.headline}</p>
                  <footer>{item.fields}</footer>
                </article>
              ))}
            </div>
            <p className="method-note">核心财务事实只接受交易所公告、定期报告等 E0/E1 证据。没有授权一致预期时，不展示“超预期”结论，只比较同比、环比和公司指引。</p>
          </div>
        </details>

        <details className="detail-panel">
          <summary><span>04</span><strong>前瞻经营信号</strong><small>直接 55% · 间接 25% · 桥接 20%</small></summary>
          <div className="detail-body">
            <div className="forward-table">
              <div className="forward-head"><span>主题</span><span>直接信号</span><span>间接代理</span><span>收入利润桥接</span><span>半衰期</span></div>
              {forwardSignals.map((item) => (
                <div className="forward-row" key={item.theme}><strong>{item.theme}</strong><span>{item.direct}</span><span>{item.indirect}</span><span>{item.bridge}</span><small>{item.halfLife}</small></div>
              ))}
            </div>
            <p className="method-note">只有间接代理时，业务前瞻原始分最高 65、覆盖率最高 40%。三部分均无证据则显示“缺失”，不会以中性分伪装可用。</p>
          </div>
        </details>

        <details className="detail-panel">
          <summary><span>05</span><strong>未来 7 / 30 / 90 日催化日历</strong><small>宏观 · 财报 · 产业 · 公司行动</small></summary>
          <div className="detail-body">
            <div className="calendar-grid">
              {calendarItems.map((item) => (
                <article key={`${item.when}-${item.type}`}>
                  <div><strong>{item.when}</strong><span>{item.type} · 影响{item.impact}</span></div>
                  <h4>{item.event}</h4>
                  <p>{item.action}</p>
                </article>
              ))}
            </div>
            <p className="method-note">这里先展示功能结构；接入数据后仅显示有正式发布日期或可核验议程的事件，并保存时区、初值/修订值和实际可得时间。</p>
          </div>
        </details>

        <details className="detail-panel">
          <summary><span>06</span><strong>机会评分与数据来源</strong><small>短线 / 波段分权 · 证据可审计</small></summary>
          <div className="detail-body methodology-layout">
            <div>
              <h4 className="detail-subtitle">十维评分权重</h4>
              <div className="weight-table">
                <div className="weight-head"><span>维度</span><span>短线</span><span>波段</span></div>
                {scoringWeights.map((item) => <div key={item.dimension}><span>{item.dimension}</span><strong>{item.short}%</strong><strong>{item.swing}%</strong></div>)}
              </div>
            </div>
            <div>
              <h4 className="detail-subtitle">证据来源等级</h4>
              <div className="source-stack">
                {sourceRegistry.map((item) => (
                  <article key={item.tier}><span>{item.tier}</span><div><strong>{item.label}</strong><p>{item.sources}</p><small>{item.use}</small></div></article>
                ))}
              </div>
            </div>
            <p className="method-note methodology-note"><strong>质量收缩：</strong>最终分数按置信度、覆盖率与时效性几何平均向 50 分收缩。当前权重版本为 forward-signals-v2，尚未完成样本外回测，不能解读为历史有效策略。</p>
          </div>
        </details>
      </section>

      <footer className="page-footer">
        <span>每日资讯博弈 V0.1 · 本地功能原型</span>
        <p>免费数据链路待接入：交易所 / 巨潮 / 港交所披露、人民银行、国家统计局、FRED、SEC 与经核验的 AKShare 辅助接口。</p>
      </footer>

      {watchlistOpen && (
        <div className="modal-backdrop" role="presentation">
          <button className="modal-dismiss" type="button" aria-label="关闭观察池设置" onClick={() => setWatchlistOpen(false)} />
          <section className="drawer" role="dialog" aria-modal="true" aria-labelledby="watchlist-title">
            <div className="drawer-heading">
              <div><p className="eyebrow">Local preferences</p><h2 id="watchlist-title">管理观察池</h2></div>
              <button type="button" aria-label="关闭" onClick={() => setWatchlistOpen(false)}>×</button>
            </div>
            <p className="drawer-note">名单保存在当前浏览器。机会池排除规则不会隐藏观察池证券；港股通资格在数据任务运行时动态核验。</p>
            <form className="watch-form" onSubmit={addWatchItem}>
              <label><span>名称</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="公司名称" required /></label>
              <label><span>代码</span><input value={draft.ticker} onChange={(event) => setDraft({ ...draft, ticker: event.target.value })} placeholder="例如 600000.SH" required /></label>
              <label><span>市场</span><select value={draft.market} onChange={(event) => setDraft({ ...draft, market: event.target.value })}><option>A股</option><option>港股通</option></select></label>
              <label><span>主题</span><input value={draft.theme} onChange={(event) => setDraft({ ...draft, theme: event.target.value })} placeholder="AI / 机器人等" /></label>
              <button className="primary-button" type="submit">加入观察池</button>
            </form>
            <div className="watch-list">
              {watchlist.map((item) => (
                <article key={item.ticker}>
                  <div><strong>{item.name}</strong><small>{item.ticker} · {item.market}</small></div>
                  <span>{item.theme}</span><em>{item.state}</em>
                  <button type="button" onClick={() => setWatchlist((items) => items.filter((candidate) => candidate.ticker !== item.ticker))}>移除</button>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      {selectedOpportunity && (
        <div className="modal-backdrop modal-backdrop--center" role="presentation">
          <button className="modal-dismiss" type="button" aria-label="关闭候选详情" onClick={() => setSelectedOpportunity(null)} />
          <section className="opportunity-dialog" role="dialog" aria-modal="true" aria-labelledby="opportunity-title">
            <div className="drawer-heading">
              <div><p className="eyebrow">Demo candidate detail</p><h2 id="opportunity-title">{selectedOpportunity.name}</h2></div>
              <button type="button" aria-label="关闭" onClick={() => setSelectedOpportunity(null)}>×</button>
            </div>
            <div className="candidate-score"><strong>{selectedOpportunity.score}</strong><span>样例综合分<br />{horizon === "short" ? "短线 1–20日" : "波段 1–3月"}</span></div>
            <dl className="candidate-facts"><div><dt>证券</dt><dd>{selectedOpportunity.ticker} · {selectedOpportunity.market}</dd></div><div><dt>主要依据</dt><dd>{selectedOpportunity.reason}</dd></div><div><dt>待验证催化</dt><dd>{selectedOpportunity.catalyst}</dd></div><div><dt>关键风险</dt><dd>{selectedOpportunity.risk}</dd></div></dl>
            <p className="drawer-note">这是交互演示，不含实时行情、正式财报核验或交易建议。生产版只有在数据质量与风险门通过后才会生成方向性标签。</p>
          </section>
        </div>
      )}
    </main>
  );
}
