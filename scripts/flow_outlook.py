"""Conservative, source-attributed domestic and foreign flow observations.

Fund shares are a creation/redemption proxy for a small ETF sample; Stock
Connect turnover and macro conditions are never labelled net purchases.
"""

from __future__ import annotations

from datetime import date, datetime
from html import unescape
import re
from typing import Any


ISHARES_FUNDS = {
    "CNYA": ("A股", "https://www.ishares.com/us/products/273318/ishares-msci-china-a-etf"),
    "MCHI": ("中国股票", "https://www.ishares.com/us/products/239619/ishares-msci-china-etf"),
    "FXI": ("中国大盘/港股", "https://www.ishares.com/us/products/239726/ishares-china-largecap-etf"),
}


def parse_ishares_shares(html: str) -> tuple[str, int] | None:
    count = re.search(r'data-id="keyFundFacts-sharesOutstanding-data"[^>]*>\s*([\d,]+)', html)
    as_of = re.search(r'data-id="keyFundFacts-sharesOutstanding-asOf".{0,180}?([A-Z][a-z]{2} \d{1,2}, \d{4})', html, re.S)
    if not count or not as_of:
        return None
    try:
        shares = int(unescape(count.group(1)).replace(",", ""))
        period = datetime.strptime(as_of.group(1), "%b %d, %Y").date().isoformat()
        return (period, shares) if shares > 0 else None
    except ValueError:
        return None


def prior_fund_observations(snapshots: list[dict[str, Any]], current_period: str) -> dict[str, dict[str, Any]]:
    previous: dict[str, dict[str, Any]] = {}
    for snapshot in sorted(snapshots, key=lambda item: item.get("as_of", ""), reverse=True):
        for fund in snapshot.get("forward_flows", {}).get("foreign_etfs", []):
            ticker = fund.get("ticker")
            if ticker in ISHARES_FUNDS and ticker not in previous and fund.get("period", "") < current_period and isinstance(fund.get("shares"), int) and fund["shares"] > 0:
                previous[ticker] = fund
    return previous


def classify_outlook(domestic: dict[str, Any], funds: list[dict[str, Any]], report_day: str) -> dict[str, str]:
    """Require at least two aligned observations per side; never emit a probability."""
    def recent(record: dict[str, Any] | None) -> bool:
        try:
            return bool(record and 0 <= (date.fromisoformat(report_day) - date.fromisoformat(record["period"])).days <= 4)
        except (KeyError, TypeError, ValueError):
            return False

    votes: list[int] = []
    etf = domestic.get("etf")
    margin = domestic.get("margin")
    southbound = domestic.get("southbound")
    if recent(etf) and abs(etf.get("change_pct", 0)) >= 0.2:
        votes.append(1 if etf["change_pct"] > 0 else -1)
    if recent(margin) and abs(margin.get("balance_change_100m_cny", 0)) >= 1:
        votes.append(1 if margin["balance_change_100m_cny"] > 0 else -1)
    if recent(southbound) and abs(southbound.get("net_buy_100m_cny", 0)) >= 10:
        votes.append(1 if southbound["net_buy_100m_cny"] > 0 else -1)
    local = "偏积极" if votes.count(1) >= 2 and votes.count(-1) == 0 else "偏谨慎" if votes.count(-1) >= 2 and votes.count(1) == 0 else "待确认"

    foreign_votes: list[tuple[str, int]] = []
    for fund in funds:
        try:
            age = (date.fromisoformat(report_day) - date.fromisoformat(fund["period"])).days
            change = fund.get("change_pct")
            if change is not None and 0 <= age <= 4 and abs(change) >= 0.1:
                foreign_votes.append((fund["ticker"], 1 if change > 0 else -1))
        except (KeyError, TypeError, ValueError):
            continue
    directions = [direction for _, direction in foreign_votes]
    covers_a_and_broader_china = any(ticker == "CNYA" for ticker, _ in foreign_votes) and any(ticker in ("MCHI", "FXI") for ticker, _ in foreign_votes)
    external = "样本扩张" if covers_a_and_broader_china and directions.count(1) >= 2 and directions.count(-1) == 0 else "样本收缩" if covers_a_and_broader_china and directions.count(-1) >= 2 and directions.count(1) == 0 else "分歧" if 1 in directions and -1 in directions else "待确认"
    joint = "双向支持" if local == "偏积极" and external == "样本扩张" else "双向承压" if local == "偏谨慎" and external == "样本收缩" else "待确认"
    return {"domestic": local, "foreign": external, "joint": joint}
