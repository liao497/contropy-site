"""Comparable ETF share changes and sector trading-activity migration.

Neither measure is a claim about secondary-market net cash inflow.
"""

from __future__ import annotations

from datetime import date
from math import isfinite
from typing import Any


def _etf_map(rows: list[dict[str, Any]]) -> dict[str, tuple[str, float]]:
    result: dict[str, tuple[str, float]] = {}
    for row in rows:
        code = str(row.get("基金代码", "")).strip()
        if not code:
            continue
        if code in result:
            raise ValueError(f"duplicate ETF code: {code}")
        try:
            shares = float(row["基金份额"])
        except (KeyError, TypeError, ValueError):
            continue
        if isfinite(shares) and shares > 0:
            result[code] = (str(row.get("基金简称", code)).strip() or code, shares)
    return result


def compute_etf_share_flow(
    latest_rows: list[dict[str, Any]],
    previous_rows: list[dict[str, Any]],
    period: str,
    previous_period: str,
    min_coverage: float = 0.9,
) -> dict[str, Any] | None:
    """Compare only identical SSE ETF codes; AKShare returns shares, not 10k shares."""
    if date.fromisoformat(previous_period) >= date.fromisoformat(period):
        raise ValueError("previous period must be before current period")
    latest = _etf_map(latest_rows)
    previous = _etf_map(previous_rows)
    common = latest.keys() & previous.keys()
    if not common:
        return None
    latest_total = sum(shares for _, shares in latest.values())
    comparable_latest = sum(latest[code][1] for code in common)
    comparable_previous = sum(previous[code][1] for code in common)
    coverage = comparable_latest / latest_total if latest_total > 0 else 0
    if comparable_previous <= 0 or coverage < min_coverage:
        return None

    changes = [
        {"code": code, "name": latest[code][0], "change_100m_shares": round((latest[code][1] - previous[code][1]) / 1e8, 2)}
        for code in common
    ]
    increasing = sorted((item for item in changes if item["change_100m_shares"] > 0), key=lambda item: (-item["change_100m_shares"], item["code"]))
    decreasing = sorted((item for item in changes if item["change_100m_shares"] < 0), key=lambda item: (item["change_100m_shares"], item["code"]))
    return {
        "period": period,
        "previous_period": previous_period,
        "change_100m_shares": round((comparable_latest - comparable_previous) / 1e8, 2),
        "change_pct": round((comparable_latest / comparable_previous - 1) * 100, 2),
        "matched_count": len(common),
        "excluded_new_count": len(latest) - len(common),
        "coverage": round(coverage, 3),
        "top_increase": increasing[:3],
        "top_decrease": decreasing[:3],
    }


def rank_sector_activity(rows: list[dict[str, Any]], limit: int = 3) -> dict[str, list[dict[str, Any]]]:
    """Rank changes in turnover share, a trading-attention proxy, never net flow."""
    comparable: list[dict[str, Any]] = []
    for row in rows:
        try:
            share = float(row["share"])
            previous = float(row["previous_share"])
            amount20x = float(row["amount20x"])
        except (KeyError, TypeError, ValueError):
            continue
        if not all(isfinite(value) for value in (share, previous, amount20x)) or min(share, previous, amount20x) < 0:
            continue
        change = round(share - previous, 2)
        if change == 0:
            continue
        comparable.append({
            "name": str(row["name"]),
            "share_pct": round(share, 2),
            "previous_share_pct": round(previous, 2),
            "change_pp": change,
            "amount20x": round(amount20x, 2),
        })
    return {
        "increasing": sorted((item for item in comparable if item["change_pp"] > 0), key=lambda item: (-item["change_pp"], item["name"]))[:limit],
        "decreasing": sorted((item for item in comparable if item["change_pp"] < 0), key=lambda item: (item["change_pp"], item["name"]))[:limit],
    }
