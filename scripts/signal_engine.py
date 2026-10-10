"""Transparent, conservative decision signals derived from published market data.

These are observation candidates, not validated investment recommendations.  In
particular, price/turnover cannot stand in for industry earnings or valuation.
"""

from __future__ import annotations

import math
from datetime import date
from typing import Any


def number(row: dict[str, Any], key: str) -> float | None:
    try:
        value = float(row[key])
    except (KeyError, TypeError, ValueError):
        return None
    return value if math.isfinite(value) else None


def screen_sector_candidates(rows: list[dict[str, Any]], market_data_date: str, coverage: float) -> list[dict[str, Any]]:
    """Find up to three swing-trade *leads* with explicit confirmation gates.

    Thresholds are screening heuristics, not back-tested probabilities. Missing
    required fields fail closed; high crowding or ATR suppresses a candidate.
    """
    if not math.isfinite(coverage) or coverage < .7:
        return []
    candidates = []
    for row in rows:
        fields = {key: number(row, key) for key in (
            "rps5", "rps20", "rps60", "ret5", "ret20", "ret60",
            "amount20x", "crowding", "atr14", "ma20_gap", "from_high20",
        )}
        if not row.get("name") or any(value is None for value in fields.values()):
            continue
        v = fields
        assert all(value is not None for value in v.values())
        leader = number(row, "leader3")
        if v["crowding"] >= 90 or v["atr14"] > 5 or (leader is not None and leader >= 75):
            continue
        if v["amount20x"] < .8:
            continue
        trend = (v["rps20"] >= 70 and v["rps60"] >= 60 and v["rps5"] >= 50
                 and v["ret20"] > 0 and v["ret60"] > 0 and v["from_high20"] >= -12
                 and v["ma20_gap"] <= 15)
        rebound = (v["ret20"] <= -8 and v["from_high20"] <= -10
                   and v["ma20_gap"] < 0 and v["ret5"] >= 3 and v["rps5"] >= 65)
        if not (trend or rebound):
            continue
        if trend:
            kind = "强势延续观察"
            score = .42 * v["rps20"] + .25 * v["rps60"] + .18 * v["rps5"] + .15 * min(v["amount20x"] * 60, 100)
            confirmation = "下个交易日仍居RPS20前30%，成交额不低于20日均值，且回撤不扩大。"
            invalidation = "RPS20跌破70、回撤超过12%，或拥挤度升至90以上。"
        else:
            kind = "超跌修复观察"
            score = .5 * v["rps5"] + .25 * min(v["ret5"] * 10, 100) + .25 * (100 - v["crowding"])
            confirmation = "价格重新站上20日均线，RPS5维持65以上且成交额不低于20日均值。"
            invalidation = "反弹失守近期低点、5日收益转负，或ATR升至5%以上。"
        score -= max(0, v["crowding"] - 75) * .3
        candidates.append({
            "industry_name": str(row["name"]), "opportunity_type": kind,
            "adjusted_score": round(score, 1), "status": "待确认",
            "market_data_date": market_data_date,
            "evidence": [f"RPS 5/20/60日 {v['rps5']:.0f}/{v['rps20']:.0f}/{v['rps60']:.0f}",
                         f"20日收益 {v['ret20']:+.1f}% · 成交/20日均值 {v['amount20x']:.2f}倍",
                         f"拥挤度 {v['crowding']:.0f} · ATR {v['atr14']:.1f}%"],
            "confirmation_conditions": confirmation,
            "invalidation_conditions": invalidation,
            "caveat": "仅为行情线索；行业估值及前瞻景气未核验，不构成买入建议。",
        })
    candidates.sort(key=lambda item: (-item["adjusted_score"], item["industry_name"]))
    return [{"rank": rank, **item} for rank, item in enumerate(candidates[:3], 1)]


def crowded_industries(rows: list[dict[str, Any]]) -> list[str]:
    """A high *relative* rank needs independent abnormal volume to be a risk."""
    return [str(row["name"]) for row in rows if row.get("name")
            and (number(row, "share_pct") or 0) >= 90
            and (number(row, "attention_pct") or 0) >= 90
            and (number(row, "amount20x") or 0) >= 1.8]


def shipping_risk(rows: list[dict[str, Any]], report_day: str | None = None) -> dict[str, str] | None:
    """Promote a measured shipping disruption, never a headline alone."""
    ranked = {"risk": 2, "watch": 1}
    eligible = []
    for row in rows:
        kind = row.get("interpretation_type")
        change = number(row, "change_vs_28d_pct")
        if kind not in ranked or change is None or not row.get("route_name") or not row.get("period"):
            continue
        if report_day:
            try:
                age = (date.fromisoformat(report_day) - date.fromisoformat(str(row["period"])[:10])).days
            except ValueError:
                continue
            if age < 0 or age > 7:
                continue
        eligible.append((ranked[kind], row, change))
    if not eligible:
        return None
    _, route, change = max(eligible, key=lambda item: (item[0], -item[2]))
    severe = route["interpretation_type"] == "risk"
    return {
        "risk_type": "stress", "name": "航运要道通行",
        "status": "触发" if severe else "观察", "tone": "danger" if severe else "warning",
        "interpretation": f"{route['route_name']}近7日通行量较28日均值{change:+.1f}%（数据日{route['period']}）；关注油价与航运是否同步反应。",
    }


def summarize_risks(risks: list[dict[str, Any]], candidates: list[dict[str, Any]]) -> dict[str, str]:
    """The headline can only cite triggered risks from independent families."""
    triggered = [item for item in risks if item.get("tone") == "danger" and item.get("status") in ("触发", "显著触发")]
    families = {"全球波动": "global_financial", "信用与金融压力": "global_financial",
                "外部实际利率": "global_financial", "跨资产共振": "global_financial",
                "A股内部压力": "a_share", "宏观景气": "china_macro",
                "行业交易拥挤": "sector_positioning", "跨市场情绪过热": "sentiment",
                "航运要道通行": "shipping"}
    groups = {families.get(item.get("name"), item.get("name")) for item in triggered}
    if len(groups) >= 2:
        level = "多组风险共振"
    elif triggered:
        level = "单组风险观察"
    elif any(item.get("tone") == "warning" and item.get("status") != "未确认" for item in risks):
        level = "风险信号待确认"
    else:
        level = "暂无共振风险"
    if triggered:
        call = "；".join(f"{item['name']}：{item['interpretation']}" for item in triggered[:2])
    else:
        watching = [item["name"] for item in risks if item.get("tone") == "warning" and item.get("status") != "未确认"]
        call = f"{', '.join(watching[:3])}处于观察区，尚未形成已确认风险共振。" if watching else "已覆盖风险项暂无明确触发；仍需关注缺失数据与后续变化。"
    if candidates:
        call += f" 当前有{len(candidates)}个行业行情线索，均待估值与景气验证。"
    return {"risk_level": level, "top_call": call}
