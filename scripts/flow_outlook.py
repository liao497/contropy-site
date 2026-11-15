"""Auditable multi-horizon flow proxies and foreign allocation conditions.

Never convert Stock Connect turnover or macro conditions into a net buy amount.
"""

from __future__ import annotations

from typing import Any


WINDOWS = (5, 10, 20)


def domestic_equity_etfs(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """SSE onshore equity ETF proxy; exchange category alone includes bond/gold ETFs."""
    return [
        row for row in rows
        if str(row.get("ETF类型", "")) in ("单市", "跨市")
        and str(row.get("基金代码", "")).isdigit()
        and not str(row["基金代码"]).startswith(("511", "518"))
        and not any(token in str(row.get("基金简称", "")) for token in ("债", "货币", "现金", "黄金", "白银", "商品", "原油"))
    ]


def interpret_windows(windows: list[dict[str, Any]]) -> dict[str, str]:
    by_days = {row["days"]: row for row in windows}
    five = by_days.get(5, {})
    ten = by_days.get(10, {})
    twenty = by_days.get(20, {})
    five_etf = (five.get("equity_etf") or {}).get("change_pct")
    ten_etf = (ten.get("equity_etf") or {}).get("change_pct")
    twenty_etf = (twenty.get("equity_etf") or {}).get("change_pct")
    margin_changes = [(by_days.get(days, {}).get("margin") or {}).get("change_pct") for days in WINDOWS]
    margin_contracts = all(value is not None and value <= -0.1 for value in margin_changes)
    if any(value is None for value in (five_etf, ten_etf, twenty_etf)):
        domestic = "权益ETF多期证据不足"
    elif twenty_etf >= 0.3 and ten_etf >= 0.2 and five_etf <= -0.2:
        domestic = "ETF中期增份额、近5日回落"
    elif twenty_etf >= 0.3 and five_etf >= 0.2:
        domestic = "权益ETF近5日与20日均增份额"
    elif twenty_etf <= -0.3 and five_etf >= 0.2:
        domestic = "权益ETF中期减份额、短期修复"
    elif twenty_etf <= -0.3 and five_etf <= -0.2:
        domestic = "权益ETF近5日与20日均减份额"
    else:
        domestic = "权益ETF方向分歧"
    if margin_contracts:
        domestic += "；融资余额5/10/20日均下降"

    south_values = [(by_days.get(days, {}).get("southbound") or {}).get("net_buy_100m_cny") for days in WINDOWS]
    if all(value is not None for value in south_values):
        five_south, ten_south, twenty_south = south_values
        if twenty_south < 0 < five_south and ten_south > 0:
            hong_kong = "20日净卖出，近5/10日转净买入"
        elif all(value > 0 for value in south_values):
            hong_kong = "近5/10/20日均净买入"
        elif all(value < 0 for value in south_values):
            hong_kong = "近5/10/20日均净卖出"
        else:
            hong_kong = "近5/10/20日方向分歧"
    else:
        hong_kong = "南向多期成交数据不足"

    conditions = five.get("foreign_conditions") or {}
    pressures = 0
    reliefs = 0
    for name, positive_pressure, negative_relief in (
        ("dollar_change_pct", 0.5, -0.5),
        ("real_yield_change_pp", 0.1, -0.1),
        ("vix_change_points", 3, -3),
    ):
        value = conditions.get(name)
        if value is None:
            continue
        pressures += value >= positive_pressure
        reliefs += value <= negative_relief
    external = "外资配置环境偏紧" if pressures >= 2 else "外资配置环境改善" if reliefs >= 2 else "外资配置环境证据不足" if pressures + reliefs < 2 else "实际利率与波动率信号对冲" if conditions.get("real_yield_change_pp", 0) >= 0.1 and conditions.get("vix_change_points", 0) <= -3 else "外资配置环境分歧"

    five_turn = (five.get("northbound") or {}).get("avg_turnover_100m_cny")
    twenty_turn = (twenty.get("northbound") or {}).get("avg_turnover_100m_cny") or (by_days.get(10, {}).get("northbound") or {}).get("avg_turnover_100m_cny")
    if five_turn is not None and twenty_turn and five_turn >= twenty_turn * 1.1:
        participation = "沪股通活跃度回升"
    elif five_turn is not None and twenty_turn and five_turn <= twenty_turn * 0.9:
        participation = "沪股通活跃度降温"
    else:
        participation = "沪股通活跃度平稳或证据不足"

    if five_etf is not None and five_etf <= -0.2 and margin_contracts:
        headline = f"A股短线资金承压：权益ETF近5日减份额，融资余额5/10/20日均下降；{('20日ETF仍增份额' if twenty_etf is not None and twenty_etf > 0 else '中期ETF未见修复')}。波段等待ETF份额与融资余额同步企稳。"
    elif five_etf is not None and five_etf >= 0.2 and twenty_etf is not None and twenty_etf >= 0.3 and not margin_contracts and external == "外资配置环境改善":
        headline = "A股资金条件改善：权益ETF近5日与20日均增份额，外部配置条件同步改善。"
    elif five_etf is not None and five_etf <= -0.2 and twenty_etf is not None and twenty_etf <= -0.3 and external == "外资配置环境偏紧":
        headline = "A股资金压力较高：权益ETF近5日与20日均减份额，外部配置条件偏紧。"
    else:
        headline = f"A股{domestic}；外部条件：{external}。按5/10/20日证据观察，结合行业强度确认。"
    return {"domestic": domestic, "hong_kong": hong_kong, "foreign_environment": external, "participation": participation, "headline": headline}
