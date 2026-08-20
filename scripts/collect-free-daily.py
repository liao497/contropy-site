#!/usr/bin/env python3
"""Collect a fail-closed daily snapshot from free public data sources."""

from __future__ import annotations

import argparse
import io
import json
import math
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable
from zoneinfo import ZoneInfo

import akshare as ak
import pandas as pd
import requests


SHANGHAI = ZoneInfo("Asia/Shanghai")
FRED_CSV = "https://fred.stlouisfed.org/graph/fredgraph.csv"
_requests_get = requests.get


def _timed_get(*args: Any, **kwargs: Any) -> requests.Response:
    requested_timeout = kwargs.get("timeout", 12)
    kwargs["timeout"] = min(float(requested_timeout), 12)
    return _requests_get(*args, **kwargs)


# AKShare's public-source wrappers do not consistently set a timeout. Without
# this guard a single free endpoint can block the scheduled morning run.
requests.get = _timed_get


def clean(value: Any) -> Any:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    if isinstance(value, (pd.Timestamp, datetime, date)):
        return value.isoformat()
    if hasattr(value, "item"):
        return value.item()
    return value


def iso_at(day: date, hour: int = 15, minute: int = 0) -> str:
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=SHANGHAI).isoformat()


def metric(
    indicator_id: str,
    name: str,
    module: str,
    frequency: str,
    value: Any,
    unit: str | None,
    period: str,
    previous_value: Any,
    previous_period: str | None,
    yoy_value: Any,
    yoy_period: str | None,
    retrieved_at: str,
    source_tier: str,
    publisher: str,
    canonical_url: str,
    field_name: str,
    confidence: float,
    coverage: float,
    freshness: float,
    interpretation_type: str = "none",
    interpretation: str | None = None,
    transform_formula: str | None = None,
    published_at: str | None = None,
    available_at: str | None = None,
) -> dict[str, Any]:
    return {
        "indicator_id": indicator_id,
        "indicator_name": name,
        "module": module,
        "frequency": frequency,
        "value": clean(value),
        "unit": unit,
        "period": period,
        "previous_value": clean(previous_value),
        "previous_period": previous_period,
        "yoy_value": clean(yoy_value),
        "yoy_period": yoy_period,
        "published_at": published_at,
        "available_at": available_at,
        "retrieved_at": retrieved_at,
        "source_tier": source_tier,
        "publisher": publisher,
        "canonical_url": canonical_url,
        "field_name": field_name,
        "confidence": confidence,
        "coverage": coverage,
        "freshness": freshness,
        "interpretation_type": interpretation_type,
        "interpretation": interpretation,
        "transform_formula": transform_formula,
        "revision_id": "r1",
    }


def safe_call(label: str, fn: Callable[[], Any], gaps: list[dict[str, str]]) -> Any:
    try:
        return fn()
    except Exception as exc:  # source failures must become visible gaps
        gaps.append({"indicator_id": label, "reason": f"免费源采集失败：{type(exc).__name__}: {exc}"})
        return None


def market_activity(report_day: date, retrieved_at: str, metrics: list[dict[str, Any]], gaps: list[dict[str, str]]) -> None:
    frame = safe_call("M1-A01/04", ak.stock_market_activity_legu, gaps)
    if frame is None or frame.empty:
        return
    values = dict(zip(frame["item"], frame["value"], strict=False))
    period = str(values.get("统计日期", report_day.isoformat()))
    up, down = int(float(values["上涨"])), int(float(values["下跌"]))
    limit_up, limit_down = int(float(values["涨停"])), int(float(values["跌停"]))
    stress = down >= 4000 or limit_down >= 100 or down / max(up, 1) >= 5
    metrics.append(metric(
        "M1-A01/02", "A股上涨 / 下跌家数", "市场环境", "daily",
        f"{up:,} / {down:,}", "家", period, None, None, None, None, retrieved_at,
        "E3", "乐咕乐股（AKShare采集）", "https://legulegu.com/stockdata/market-activity",
        "上涨,下跌", .72, .92, 1.0, "risk" if stress else "none",
        "下跌家数显著占优，市场广度出现单日极端压力。" if stress else None,
        "原始市场活动计数", available_at=iso_at(report_day, 15, 5),
    ))
    metrics.append(metric(
        "M1-A03/04", "A股涨停 / 跌停家数", "市场环境", "daily",
        f"{limit_up:,} / {limit_down:,}", "家", period, None, None, None, None, retrieved_at,
        "E3", "乐咕乐股（AKShare采集）", "https://legulegu.com/stockdata/market-activity",
        "涨停,跌停", .72, .92, 1.0, "risk" if limit_down >= 100 else "watch" if limit_down >= 40 else "none",
        "跌停家数超过100，内部压力显著；需后续交易日确认是否延续。" if limit_down >= 100 else None,
        "原始市场活动计数", available_at=iso_at(report_day, 15, 5),
    ))


def exchange_turnover(day: date) -> float:
    key = day.strftime("%Y%m%d")
    sse = ak.stock_sse_deal_daily(date=key)
    sse_value = float(sse.loc[sse["单日情况"] == "成交金额", "股票"].iloc[0])
    szse = ak.stock_szse_summary(date=key)
    szse_value = float(szse.loc[szse["证券类别"] == "股票", "成交金额"].iloc[0]) / 1e8
    return sse_value + szse_value


def turnover_history(report_day: date, count: int = 20) -> list[tuple[date, float]]:
    calendar = ak.tool_trade_date_hist_sina()
    trade_days = [item for item in calendar["trade_date"].tolist() if item <= report_day]
    candidates = list(reversed(trade_days[-count:]))
    if len(candidates) < count:
        raise RuntimeError(f"交易日历仅返回{len(candidates)}日")
    rows: list[tuple[date, float]] = []
    for cursor in candidates:
        last_error: Exception | None = None
        for attempt in range(2):
            try:
                rows.append((cursor, exchange_turnover(cursor)))
                last_error = None
                break
            except Exception as exc:
                last_error = exc
                if attempt == 0:
                    time.sleep(.2)
        if last_error is not None:
            raise RuntimeError(f"交易日{cursor}成交额缺失：{last_error}")
    return rows


def add_turnover(report_day: date, retrieved_at: str, metrics: list[dict[str, Any]], gaps: list[dict[str, str]]) -> list[tuple[date, float]]:
    history = safe_call("M1-A05/07", lambda: turnover_history(report_day), gaps)
    if not history:
        return []
    latest_day, latest = history[0]
    previous_day, previous = history[1]
    mean5 = sum(v for _, v in history[:5]) / min(5, len(history))
    mean20 = sum(v for _, v in history[:20]) / min(20, len(history))
    metrics.append(metric(
        "M1-A05/06/07", "沪深股票成交额", "市场环境", "daily",
        f"{latest:,.0f}；5日{latest/mean5:.2f}×；20日{latest/mean20:.2f}×", "亿元",
        latest_day.isoformat(), f"{previous:,.0f}亿元", previous_day.isoformat(), None, None, retrieved_at,
        "E1", "上海证券交易所 / 深圳证券交易所",
        "https://www.sse.com.cn/market/stockdata/overview/day/; https://www.szse.cn/market/overview/index.html",
        "股票成交金额", .96, .94, 1.0, "watch" if latest / mean20 >= 1.25 else "none",
        "成交额明显高于20日均值，需结合价格方向判断放量性质。" if latest / mean20 >= 1.25 else None,
        "上交所股票成交金额(亿元)+深交所股票成交金额(元)/1e8；暂不含北交所",
        published_at=iso_at(latest_day, 17), available_at=iso_at(latest_day, 17),
    ))
    return history


def add_margin(report_day: date, turnover: list[tuple[date, float]], retrieved_at: str, metrics: list[dict[str, Any]], gaps: list[dict[str, str]]) -> None:
    rows = []
    cursor = report_day
    while len(rows) < 2 and cursor >= report_day - timedelta(days=7):
        key = cursor.strftime("%Y%m%d")
        try:
            sse = ak.stock_margin_sse(start_date=key, end_date=key).iloc[0]
            szse = ak.stock_margin_szse(date=key).iloc[0]
            balance = float(sse["融资余额"]) / 1e8 + float(szse["融资余额"])
            buy = float(sse["融资买入额"]) / 1e8 + float(szse["融资买入额"])
            rows.append((cursor, balance, buy))
        except Exception:
            pass
        cursor -= timedelta(days=1)
    if len(rows) < 2:
        gaps.append({"indicator_id": "M1-A15/16", "reason": "沪深两融数据尚未齐备或免费接口为空"})
        return
    latest_day, latest_balance, latest_buy = rows[0]
    previous_day, previous_balance, previous_buy = rows[1]
    turnover_map = {d: v for d, v in turnover}
    ratio = latest_buy / turnover_map[latest_day] * 100 if latest_day in turnover_map else None
    previous_ratio = previous_buy / turnover_map[previous_day] * 100 if previous_day in turnover_map else None
    interval_label = "日变动" if (latest_day - previous_day).days <= 3 else "较上一可得期"
    value = f"余额{latest_balance:,.0f}亿元；{interval_label}{latest_balance-previous_balance:+.0f}亿元"
    if ratio is not None:
        value += f"；融资买入占比{ratio:.2f}%"
    previous_value = f"余额{previous_balance:,.0f}亿元"
    if previous_ratio is not None:
        previous_value += f"；买入占比{previous_ratio:.2f}%"
    metrics.append(metric(
        "M1-A15/16", "沪深融资活动", "市场环境", "daily", value, None, latest_day.isoformat(),
        previous_value, previous_day.isoformat(), None, None, retrieved_at, "E1",
        "上海证券交易所 / 深圳证券交易所",
        "https://www.sse.com.cn/market/othersdata/margin/; https://www.szse.cn/disclosure/margin/index.html",
        "融资余额,融资买入额", .95, .93, .85, "none", None,
        "沪深融资余额求和；沪深融资买入额/当日沪深股票成交额", published_at=iso_at(latest_day, 18), available_at=iso_at(latest_day, 18),
    ))


def add_etf(report_day: date, retrieved_at: str, metrics: list[dict[str, Any]], gaps: list[dict[str, str]]) -> None:
    rows = []
    cursor = report_day
    while len(rows) < 2 and cursor >= report_day - timedelta(days=7):
        key = cursor.strftime("%Y%m%d")
        try:
            frame = ak.fund_etf_scale_sse(date=key)
            shares = float(pd.to_numeric(frame["基金份额"], errors="coerce").sum()) / 1e8
            rows.append((cursor, shares, len(frame)))
        except Exception:
            pass
        cursor -= timedelta(days=1)
    if len(rows) < 2:
        gaps.append({"indicator_id": "M1-A17/18", "reason": "ETF历史份额免费源覆盖不足"})
        return
    latest_day, latest, latest_count = rows[0]
    previous_day, previous, _ = rows[1]
    metrics.append(metric(
        "M1-A17/18", "上交所ETF总份额（日变化）", "市场环境", "daily",
        f"{latest:,.0f}亿份；{(latest/previous-1)*100:+.2f}%", None, latest_day.isoformat(),
        f"{previous:,.0f}亿份", previous_day.isoformat(), None, None, retrieved_at, "E1", "上海证券交易所",
        "https://www.sse.com.cn/market/funddata/volumn/etfvolumn/", "基金份额", .94, .65, .85,
        "watch" if abs(latest / previous - 1) >= .01 else "none",
        "仅覆盖上交所ETF，不能代表全市场ETF份额。" if abs(latest / previous - 1) >= .01 else None,
        f"{latest_count}只上交所ETF基金份额求和/1e8", published_at=iso_at(latest_day, 18), available_at=iso_at(latest_day, 18),
    ))


def add_southbound(report_day: date, retrieved_at: str, metrics: list[dict[str, Any]], gaps: list[dict[str, str]]) -> None:
    frame = safe_call("M1-B01/02", lambda: ak.stock_hsgt_hist_em(symbol="南向资金"), gaps)
    if frame is None or frame.empty:
        return
    frame = frame[pd.to_datetime(frame["日期"]).dt.date <= report_day]
    frame = frame.dropna(subset=["当日成交净买额"])
    latest, previous = frame.iloc[-1], frame.iloc[-2]
    streak = 0
    for value in reversed(frame["当日成交净买额"].tolist()):
        if value > 0:
            streak += 1
        else:
            break
    net = float(latest["当日成交净买额"])
    metrics.append(metric(
        "M1-B01/02", "南向资金成交净买额 / 连续净买入", "市场环境", "daily",
        f"{net:+.2f}亿元；连续净买入{streak}日", None, str(latest["日期"]),
        f"{float(previous['当日成交净买额']):+.2f}亿元", str(previous["日期"]), None, None, retrieved_at,
        "E3", "东方财富（AKShare采集）", "https://data.eastmoney.com/hsgt/index.html",
        "NET_DEAL_AMT", .78, .98, 1.0, "risk" if net <= -100 else "opportunity" if streak >= 5 else "none",
        "南向资金单日净卖出超过100亿元。" if net <= -100 else None,
        "港股通沪+港股通深成交净买额；接口换算为亿元", available_at=iso_at(latest["日期"], 16, 20),
    ))


def fred_series(series: str) -> pd.DataFrame:
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            response = requests.get(FRED_CSV, params={"id": series}, timeout=20)
            response.raise_for_status()
            frame = pd.read_csv(io.StringIO(response.text))
            frame.columns = ["date", "value"]
            frame["date"] = pd.to_datetime(frame["date"])
            frame["value"] = pd.to_numeric(frame["value"], errors="coerce")
            return frame.dropna(subset=["value"])
        except Exception as exc:
            last_error = exc
            if attempt < 2:
                time.sleep(.4 * (attempt + 1))
    raise RuntimeError(f"FRED {series} failed after 3 attempts: {last_error}")


def observation(frame: pd.DataFrame) -> tuple[pd.Series, pd.Series, float | None]:
    latest, previous = frame.iloc[-1], frame.iloc[-2]
    target = latest["date"] - pd.DateOffset(years=1)
    historic = frame[frame["date"] <= target]
    yoy = float(historic.iloc[-1]["value"]) if not historic.empty else None
    return latest, previous, yoy


def pct_change(latest: float, previous: float) -> float:
    return (latest / previous - 1) * 100


def trailing_return(frame: pd.DataFrame, days: int, offset: int = 0) -> float:
    end = len(frame) - 1 - offset
    start = end - days
    if start < 0:
        raise ValueError(f"need {days + offset + 1} rows, only {len(frame)}")
    return pct_change(float(frame.iloc[end]["close"]), float(frame.iloc[start]["close"]))


def realized_volatility(frame: pd.DataFrame, days: int = 20) -> float:
    returns = pd.to_numeric(frame["close"], errors="coerce").pct_change().dropna().tail(days)
    return float(returns.std(ddof=1) * math.sqrt(252) * 100)


def atr_percent(frame: pd.DataFrame, days: int = 14) -> float:
    previous_close = pd.to_numeric(frame["close"], errors="coerce").shift(1)
    high = pd.to_numeric(frame["high"], errors="coerce")
    low = pd.to_numeric(frame["low"], errors="coerce")
    true_range = pd.concat([high - low, (high - previous_close).abs(), (low - previous_close).abs()], axis=1).max(axis=1)
    return float(true_range.tail(days).mean() / float(frame.iloc[-1]["close"]) * 100)


def max_drawdown(frame: pd.DataFrame, days: int) -> float:
    close = pd.to_numeric(frame["close"], errors="coerce").tail(days)
    drawdown = close / close.cummax() - 1
    return float(drawdown.min() * 100)


def filter_to_report_day(frame: pd.DataFrame, report_day: date, column: str = "date") -> pd.DataFrame:
    result = frame.copy()
    result[column] = pd.to_datetime(result[column])
    return result[result[column].dt.date <= report_day].sort_values(column).reset_index(drop=True)


def add_a_share_style_risk(
    report_day: date,
    retrieved_at: str,
    metrics: list[dict[str, Any]],
    gaps: list[dict[str, str]],
) -> dict[str, pd.DataFrame]:
    symbols = {
        "沪深300": "sh000300", "中证1000": "sh000852", "创业板指": "sz399006",
        "科创50": "sh000688", "北证50": "bj899050", "国证成长": "sz399370", "国证价值": "sz399371",
    }
    frames: dict[str, pd.DataFrame] = {}
    for name, symbol in symbols.items():
        frame = safe_call(f"M1-INDEX-{symbol}", lambda s=symbol: ak.stock_zh_index_daily(symbol=s), gaps)
        if frame is not None and not frame.empty:
            frame = frame.rename(columns={"日期": "date", "开盘": "open", "最高": "high", "最低": "low", "收盘": "close"})
            frame = filter_to_report_day(frame, report_day)
            if len(frame) >= 62:
                frames[name] = frame
    if not all(name in frames for name in ["沪深300", "中证1000", "国证成长", "国证价值"]):
        gaps.append({"indicator_id": "M1-A08/09", "reason": "风格指数历史不足62个有效交易日"})
    else:
        large, small = frames["沪深300"], frames["中证1000"]
        large5, large20 = trailing_return(large, 5), trailing_return(large, 20)
        small5, small20 = trailing_return(small, 5), trailing_return(small, 20)
        prev_spread = trailing_return(large, 20, 1) - trailing_return(small, 20, 1)
        metrics.append(metric(
            "M1-A08", "大盘 / 小盘相对强弱", "市场环境", "daily",
            f"沪深300-中证1000：5日{large5-small5:+.2f}pct；20日{large20-small20:+.2f}pct", None,
            str(large.iloc[-1]["date"].date()), f"20日{prev_spread:+.2f}pct", str(large.iloc[-2]["date"].date()),
            None, None, retrieved_at, "E3", "新浪财经指数行情（AKShare采集）",
            "https://finance.sina.com.cn/realstock/company/sh000300/nc.shtml; https://finance.sina.com.cn/realstock/company/sh000852/nc.shtml",
            "close", .78, 1.0, 1.0, "watch" if abs(large20-small20) >= 8 else "none",
            "大盘与小盘20日相对收益分化超过8个百分点。" if abs(large20-small20) >= 8 else None,
            "沪深300区间收益-中证1000区间收益；5/20交易日", available_at=iso_at(report_day, 15, 5),
        ))
        growth, value = frames["国证成长"], frames["国证价值"]
        g5, g20 = trailing_return(growth, 5), trailing_return(growth, 20)
        v5, v20 = trailing_return(value, 5), trailing_return(value, 20)
        metrics.append(metric(
            "M1-A09", "价值 / 成长相对强弱", "市场环境", "daily",
            f"国证价值-成长：5日{v5-g5:+.2f}pct；20日{v20-g20:+.2f}pct", None,
            str(value.iloc[-1]["date"].date()), f"20日{trailing_return(value,20,1)-trailing_return(growth,20,1):+.2f}pct",
            str(value.iloc[-2]["date"].date()), None, None, retrieved_at, "E3", "国证指数 / 新浪财经（AKShare采集）",
            "https://www.cnindex.com.cn/zh_indices/cni/style/index.html", "399370,399371 close", .82, 1.0, 1.0,
            "watch" if abs(v20-g20) >= 8 else "none", "价值与成长20日分化超过8个百分点。" if abs(v20-g20) >= 8 else None,
            "国证价值区间收益-国证成长区间收益；5/20交易日", available_at=iso_at(report_day, 15, 5),
        ))
    risk_names = [name for name in ["沪深300", "中证1000", "创业板指", "科创50", "北证50"] if name in frames]
    if len(risk_names) == 5:
        vols = {name: realized_volatility(frames[name]) for name in risk_names}
        atrs = {name: atr_percent(frames[name]) for name in risk_names}
        dd20 = {name: max_drawdown(frames[name], 20) for name in risk_names}
        dd60 = {name: max_drawdown(frames[name], 60) for name in risk_names}
        metrics.append(metric(
            "M1-A12", "主要指数20日实现波动率", "市场环境", "daily",
            "；".join(f"{name}{vols[name]:.1f}%" for name in risk_names), "%年化", report_day.isoformat(),
            None, None, None, None, retrieved_at, "E3", "新浪财经指数行情（AKShare采集）",
            "https://finance.sina.com.cn/stock/", "close", .78, 1.0, 1.0,
            "risk" if max(vols.values()) >= 45 else "watch" if max(vols.values()) >= 35 else "none",
            f"{max(vols, key=vols.get)}20日实现波动率达到{max(vols.values()):.1f}%。" if max(vols.values()) >= 35 else None,
            "日收益标准差×sqrt(252)", available_at=iso_at(report_day, 15, 5),
        ))
        metrics.append(metric(
            "M1-A13", "主要指数ATR(14)", "市场环境", "daily", "；".join(f"{name}{atrs[name]:.2f}%" for name in risk_names),
            "%价格", report_day.isoformat(), None, None, None, None, retrieved_at, "E3", "新浪财经指数行情（AKShare采集）",
            "https://finance.sina.com.cn/stock/", "open,high,low,close", .78, 1.0, 1.0,
            "risk" if max(atrs.values()) >= 5 else "watch" if max(atrs.values()) >= 3.5 else "none",
            f"{max(atrs, key=atrs.get)}ATR升至{max(atrs.values()):.2f}%，单日波动压力偏高。" if max(atrs.values()) >= 3.5 else None,
            "14日真实波幅均值/最新收盘", available_at=iso_at(report_day, 15, 5),
        ))
        metrics.append(metric(
            "M1-A14", "主要指数20 / 60日最大回撤", "市场环境", "daily",
            "；".join(f"{name}{dd20[name]:.1f}%/{dd60[name]:.1f}%" for name in risk_names), "%", report_day.isoformat(),
            None, None, None, None, retrieved_at, "E3", "新浪财经指数行情（AKShare采集）",
            "https://finance.sina.com.cn/stock/", "close", .78, 1.0, 1.0,
            "risk" if min(dd20.values()) <= -15 else "watch" if min(dd20.values()) <= -10 else "none",
            f"{min(dd20, key=dd20.get)}20日最大回撤{min(dd20.values()):.1f}%。" if min(dd20.values()) <= -10 else None,
            "窗口内收盘价/此前峰值-1；20/60交易日", available_at=iso_at(report_day, 15, 5),
        ))
    else:
        gaps.append({"indicator_id": "M1-A12/14", "reason": f"五类指数仅获得{len(risk_names)}类有效历史"})
    return frames


def add_a_share_concentration(
    report_day: date,
    retrieved_at: str,
    metrics: list[dict[str, Any]],
    gaps: list[dict[str, str]],
) -> pd.DataFrame | None:
    frame = safe_call("M1-A10/11", ak.stock_zh_a_spot_tx, gaps)
    if frame is None or frame.empty:
        return None
    turnover = pd.to_numeric(frame["turnover"], errors="coerce").dropna()
    total = float(turnover.sum())
    top50, top100 = float(turnover.nlargest(50).sum() / total * 100), float(turnover.nlargest(100).sum() / total * 100)
    metrics.append(metric(
        "M1-A10/11", "A股成交额集中度（前50 / 前100）", "市场环境", "daily",
        f"{top50:.2f}% / {top100:.2f}%", "%", report_day.isoformat(), None, None, None, None, retrieved_at,
        "E3", "腾讯证券全市场行情（AKShare采集）", "https://gu.qq.com/", "turnover", .76, .98, 1.0,
        "watch" if top50 >= 28 or top100 >= 40 else "none",
        "成交明显向少数股票集中；历史分位仍需累积本地日档后启用。" if top50 >= 28 or top100 >= 40 else None,
        "当日成交额降序前50/100之和÷有效A股成交额总和；含沪深京可得证券", available_at=iso_at(report_day, 15, 10),
    ))
    return frame


def add_global(report_day: date, retrieved_at: str, metrics: list[dict[str, Any]], gaps: list[dict[str, str]]) -> dict[str, pd.DataFrame]:
    frames: dict[str, pd.DataFrame] = {}
    for series in [
        "SP500", "NASDAQCOM", "NASDAQSOX", "NASDAQNQROBO", "NIKKEI225", "NASDAQNQKR", "NASDAQNQKR10",
        "NASDAQNQEURO50", "VIXCLS", "DGS2", "DGS10", "DFII10", "DTWEXBGS", "DEXCHUS", "DCOILWTICO",
        "BAMLHE00EHYIOAS", "BAMLH0A0HYM2", "NFCI", "STLFSI4",
    ]:
        frame = safe_call(f"M1-{series}", lambda s=series: fred_series(s), gaps)
        if frame is not None and not frame.empty:
            filtered = frame[frame["date"].dt.date <= report_day].reset_index(drop=True)
            if not filtered.empty:
                frames[series] = filtered
    if "SP500" in frames and "NASDAQCOM" in frames:
        sp, sp_prev, sp_yoy = observation(frames["SP500"])
        nq, nq_prev, nq_yoy = observation(frames["NASDAQCOM"])
        sp_ret, nq_ret = pct_change(sp["value"], sp_prev["value"]), pct_change(nq["value"], nq_prev["value"])
        metrics.append(metric(
            "M1-C01", "美国宽基（上一交易日）", "市场环境", "daily",
            f"标普{sp['value']:,.2f}（{sp_ret:+.2f}%）；纳指{nq['value']:,.2f}（{nq_ret:+.2f}%）", None, sp["date"].date().isoformat(),
            f"标普{sp_prev['value']:,.2f}；纳指{nq_prev['value']:,.2f}", sp_prev["date"].date().isoformat(),
            f"标普{pct_change(sp['value'], sp_yoy):+.1f}%；纳指{pct_change(nq['value'], nq_yoy):+.1f}%" if sp_yoy and nq_yoy else None,
            (sp["date"] - pd.DateOffset(years=1)).date().isoformat(), retrieved_at, "E1", "Federal Reserve Bank of St. Louis (FRED)",
            "https://fred.stlouisfed.org/series/SP500; https://fred.stlouisfed.org/series/NASDAQCOM",
            "SP500,NASDAQCOM", .94, .90, .92, "risk" if sp_ret <= -2 and nq_ret <= -2 else "none", None,
            "相邻有效交易日收盘价涨跌幅；同比为较一年前最近有效日", available_at=sp["date"].isoformat(),
        ))
    if "NASDAQSOX" in frames and "NASDAQNQROBO" in frames:
        sox, soxp, soxy = observation(frames["NASDAQSOX"])
        robo, robop, roboy = observation(frames["NASDAQNQROBO"])
        sox5 = pct_change(float(sox["value"]), float(frames["NASDAQSOX"].iloc[-6]["value"]))
        robo5 = pct_change(float(robo["value"]), float(frames["NASDAQNQROBO"].iloc[-6]["value"]))
        metrics.append(metric(
            "M1-C02", "美国科技链（半导体 / 机器人）", "市场环境", "daily",
            f"费城半导体{sox['value']:,.2f}（日{pct_change(sox['value'],soxp['value']):+.2f}% / 5日{sox5:+.2f}%）；机器人{robo['value']:,.2f}（日{pct_change(robo['value'],robop['value']):+.2f}% / 5日{robo5:+.2f}%）",
            None, sox["date"].date().isoformat(), f"费城半导体{soxp['value']:,.2f}；机器人{robop['value']:,.2f}",
            soxp["date"].date().isoformat(),
            f"费城半导体{pct_change(sox['value'],soxy):+.1f}%；机器人{pct_change(robo['value'],roboy):+.1f}%" if soxy and roboy else None,
            (sox["date"] - pd.DateOffset(years=1)).date().isoformat(), retrieved_at, "E1", "Nasdaq / FRED",
            "https://fred.stlouisfed.org/series/NASDAQSOX; https://fred.stlouisfed.org/series/NASDAQNQROBO",
            "NASDAQSOX,NASDAQNQROBO", .93, .40, .92, "risk" if sox5 <= -10 else "opportunity" if sox5 >= 8 else "none",
            "海外半导体5日快速回撤，关注对A股科技链风险偏好的映射。" if sox5 <= -10 else "海外半导体5日动量较强，需结合国内行业RPS确认。" if sox5 >= 8 else None,
            "相邻有效日与5个有效交易日前收益；机器人指数为Nasdaq CTA AI & Robotics代理", available_at=sox["date"].isoformat(),
        ))
    if "NIKKEI225" in frames:
        latest, previous, yoy = observation(frames["NIKKEI225"])
        daily = pct_change(latest["value"], previous["value"])
        metrics.append(metric(
            "M1-C03", "日本日经225", "市场环境", "daily", f"{latest['value']:,.2f}；{daily:+.2f}%", None,
            latest["date"].date().isoformat(), f"{previous['value']:,.2f}", previous["date"].date().isoformat(),
            f"{pct_change(latest['value'], yoy):+.1f}%" if yoy else None, (latest["date"] - pd.DateOffset(years=1)).date().isoformat(),
            retrieved_at, "E1", "Federal Reserve Bank of St. Louis (FRED)", "https://fred.stlouisfed.org/series/NIKKEI225",
            "NIKKEI225", .92, 1.0, 1.0, "risk" if daily <= -3 else "watch" if daily <= -2 else "none",
            "日经225单日跌幅超过2%，作为亚洲风险偏好观察项。" if daily <= -2 else None,
            "相邻有效交易日收盘价涨跌幅", available_at=latest["date"].isoformat(),
        ))
    if "NASDAQNQKR" in frames and "NASDAQNQKR10" in frames:
        kr, krp, kry = observation(frames["NASDAQNQKR"])
        tech, techp, techy = observation(frames["NASDAQNQKR10"])
        metrics.append(metric(
            "M1-C04", "韩国市场 / 韩国科技链（代理）", "市场环境", "daily",
            f"韩国指数{kr['value']:,.2f}（{pct_change(kr['value'],krp['value']):+.2f}%）；韩国科技{tech['value']:,.2f}（{pct_change(tech['value'],techp['value']):+.2f}%）",
            None, kr["date"].date().isoformat(), f"韩国指数{krp['value']:,.2f}；韩国科技{techp['value']:,.2f}",
            krp["date"].date().isoformat(),
            f"韩国指数{pct_change(kr['value'],kry):+.1f}%；韩国科技{pct_change(tech['value'],techy):+.1f}%" if kry and techy else None,
            (kr["date"] - pd.DateOffset(years=1)).date().isoformat(), retrieved_at, "E1", "Nasdaq / FRED",
            "https://fred.stlouisfed.org/series/NASDAQNQKR; https://fred.stlouisfed.org/series/NASDAQNQKR10",
            "NASDAQNQKR,NASDAQNQKR10", .90, .55, .92, "none", None,
            "韩国综合与科技参考指数；不是KOSPI官方收盘，待接入需密钥的KRX OPEN API后替换", available_at=kr["date"].isoformat(),
        ))
    if "VIXCLS" in frames:
        latest, previous, yoy = observation(frames["VIXCLS"])
        vix = float(latest["value"])
        metrics.append(metric(
            "M1-C05", "VIX", "市场环境", "daily", vix, "点", latest["date"].date().isoformat(),
            float(previous["value"]), previous["date"].date().isoformat(), f"{float(latest['value'])-float(yoy):+.2f}点 / {pct_change(float(latest['value']), float(yoy)):+.1f}%" if yoy else None,
            (latest["date"] - pd.DateOffset(years=1)).date().isoformat(), retrieved_at, "E1", "Federal Reserve Bank of St. Louis (FRED)",
            "https://fred.stlouisfed.org/series/VIXCLS", "VIXCLS", .96, 1.0, .85,
            "risk" if vix >= 30 else "watch" if vix >= 22 else "none",
            "VIX进入高波动区间。" if vix >= 30 else "VIX进入观察区间。" if vix >= 22 else None,
            "CBOE VIX日收盘，经FRED分发", available_at=latest["date"].isoformat(),
        ))
    if all(series in frames for series in ["DGS2", "DGS10", "DFII10"]):
        y2, y2p, _ = observation(frames["DGS2"])
        y10, y10p, _ = observation(frames["DGS10"])
        real, realp, _ = observation(frames["DFII10"])
        metrics.append(metric(
            "M1-C06", "美国2Y / 10Y / 10Y实际利率", "市场环境", "daily",
            f"{y2['value']:.2f}% / {y10['value']:.2f}% / {real['value']:.2f}%", None, y10["date"].date().isoformat(),
            f"{y2p['value']:.2f}% / {y10p['value']:.2f}% / {realp['value']:.2f}%", y10p["date"].date().isoformat(),
            None, None, retrieved_at, "E1", "U.S. Treasury / Federal Reserve Bank of St. Louis (FRED)",
            "https://fred.stlouisfed.org/series/DGS2; https://fred.stlouisfed.org/series/DGS10; https://fred.stlouisfed.org/series/DFII10",
            "DGS2,DGS10,DFII10", .96, 1.0, .85, "watch" if real["value"] >= 2.25 else "none",
            "美国10年实际利率偏高，对长久期成长估值形成压力。" if real["value"] >= 2.25 else None,
            "美国财政部常期限收益率与TIPS实际收益率", available_at=y10["date"].isoformat(),
        ))
    if "DTWEXBGS" in frames and "DEXCHUS" in frames:
        usd, usdp, usdy = observation(frames["DTWEXBGS"])
        cny, cnyp, cnyy = observation(frames["DEXCHUS"])
        metrics.append(metric(
            "M1-C07", "美元广义指数 / 美元兑人民币", "市场环境", "daily",
            f"{usd['value']:.2f} / {cny['value']:.4f}", None, usd["date"].date().isoformat(),
            f"{usdp['value']:.2f} / {cnyp['value']:.4f}", usdp["date"].date().isoformat(),
            f"{pct_change(usd['value'], usdy):+.1f}% / {pct_change(cny['value'], cnyy):+.1f}%" if usdy and cnyy else None,
            (usd["date"] - pd.DateOffset(years=1)).date().isoformat(), retrieved_at, "E1", "Federal Reserve Board / FRED",
            "https://fred.stlouisfed.org/series/DTWEXBGS; https://fred.stlouisfed.org/series/DEXCHUS", "DTWEXBGS,DEXCHUS",
            .93, .95, .75, "none", None, "FRED日度观测", available_at=usd["date"].isoformat(),
        ))
    if "DCOILWTICO" in frames:
        latest, previous, yoy = observation(frames["DCOILWTICO"])
        metrics.append(metric(
            "M1-C08", "WTI现货", "市场环境", "daily", f"${latest['value']:.2f}；{pct_change(latest['value'], previous['value']):+.2f}%", "美元/桶",
            latest["date"].date().isoformat(), f"${previous['value']:.2f}", previous["date"].date().isoformat(),
            f"{pct_change(latest['value'], yoy):+.1f}%" if yoy else None, (latest["date"] - pd.DateOffset(years=1)).date().isoformat(),
            retrieved_at, "E1", "U.S. Energy Information Administration / FRED", "https://fred.stlouisfed.org/series/DCOILWTICO",
            "DCOILWTICO", .94, .35, .55, "watch", "油价免费源更新滞后，仅作背景参考。",
            "相邻有效日涨跌幅", available_at=latest["date"].isoformat(),
        ))
    return frames


def ths_industry_history(name: str, report_day: date) -> pd.DataFrame:
    start = (report_day - timedelta(days=150)).strftime("%Y%m%d")
    frame = ak.stock_board_industry_index_ths(symbol=name, start_date=start, end_date=report_day.strftime("%Y%m%d"))
    frame = frame.rename(columns={"日期": "date", "开盘价": "open", "最高价": "high", "最低价": "low", "收盘价": "close", "成交额": "amount"})
    return filter_to_report_day(frame, report_day)


def ths_leader_concentration(code: str, industry_amount: float) -> float | None:
    url = f"https://d.10jqka.com.cn/v2/blockrank/{code}/19/d1000.js"
    response = requests.get(url, headers={"Referer": "https://q.10jqka.com.cn/", "User-Agent": "Mozilla/5.0"}, timeout=12)
    response.raise_for_status()
    payload = json.loads(response.text[response.text.find("(") + 1:response.text.rfind(")")])
    amounts = sorted((float(item.get("19", 0)) for item in payload.get("items", [])), reverse=True)
    if industry_amount <= 0 or len(amounts) < 3:
        return None
    return sum(amounts[:3]) / industry_amount * 100


def add_industry_metrics(
    report_day: date,
    retrieved_at: str,
    market_turnover: list[tuple[date, float]],
    metrics: list[dict[str, Any]],
    gaps: list[dict[str, str]],
) -> list[dict[str, Any]]:
    names = safe_call("M3-UNIVERSE", ak.stock_board_industry_name_ths, gaps)
    if names is None or names.empty:
        return []
    histories: dict[str, pd.DataFrame] = {}
    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = {executor.submit(ths_industry_history, str(row["name"]), report_day): str(row["name"]) for _, row in names.iterrows()}
        for future in as_completed(futures):
            name = futures[future]
            try:
                frame = future.result()
                if len(frame) >= 61:
                    histories[name] = frame
            except Exception:
                continue
    if len(histories) < 63:
        gaps.append({"indicator_id": "M3-*", "reason": f"行业历史仅覆盖{len(histories)}/{len(names)}，低于70%发布门槛"})
        return []
    latest_turnover_yuan = market_turnover[0][1] * 1e8 if market_turnover else sum(float(f.iloc[-1]["amount"]) for f in histories.values())
    rows: list[dict[str, Any]] = []
    for name, frame in histories.items():
        current_amount = float(frame.iloc[-1]["amount"])
        mean5 = float(pd.to_numeric(frame["amount"], errors="coerce").tail(5).mean())
        mean20 = float(pd.to_numeric(frame["amount"], errors="coerce").tail(20).mean())
        rows.append({
            "name": name, "ret5": trailing_return(frame, 5), "ret20": trailing_return(frame, 20), "ret60": trailing_return(frame, 60),
            "share": current_amount / latest_turnover_yuan * 100, "amount5x": current_amount / mean5, "amount20x": current_amount / mean20,
            "vol20": realized_volatility(frame), "atr14": atr_percent(frame), "dd20": max_drawdown(frame, 20), "dd60": max_drawdown(frame, 60),
            "amount": current_amount,
        })
    industry = pd.DataFrame(rows)
    for period in [5, 20, 60]:
        industry[f"rps{period}"] = industry[f"ret{period}"].rank(pct=True) * 100
    industry["share_pct"] = industry["share"].rank(pct=True) * 100
    industry["attention_pct"] = industry["amount20x"].rank(pct=True) * 100
    industry["crowding"] = .55 * industry["share_pct"] + .45 * industry["attention_pct"]

    code_map = {str(row["name"]): str(row["code"]) for _, row in names.iterrows()}
    leader: dict[str, float] = {}
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {
            executor.submit(ths_leader_concentration, code_map[row["name"]], float(row["amount"])): row["name"]
            for row in rows if row["name"] in code_map
        }
        for future in as_completed(futures):
            try:
                value = future.result()
                if value is not None and 0 <= value <= 100:
                    leader[futures[future]] = value
            except Exception:
                continue
    # The public quote bridge rate-limits short bursts. Retry missing rows once
    # at low concurrency so a transient 403/timeout does not become a false gap.
    for row in rows:
        name = row["name"]
        if name in leader or name not in code_map:
            continue
        try:
            time.sleep(.04)
            value = ths_leader_concentration(code_map[name], float(row["amount"]))
            if value is not None and 0 <= value <= 100:
                leader[name] = value
        except Exception:
            continue
    industry["leader3"] = industry["name"].map(leader)

    def top_text(column: str, count: int = 8, suffix: str = "") -> str:
        selected = industry.nlargest(count, column)
        return "；".join(f"{row['name']} {row[column]:.1f}{suffix}" for _, row in selected.iterrows())

    top_rps = industry.nlargest(5, "rps20")
    rps_value = "；".join(f"{row['name']} RPS20 {row['rps20']:.0f}（5/60日{row['rps5']:.0f}/{row['rps60']:.0f}）" for _, row in top_rps.iterrows())
    metrics.append(metric(
        "M3-A01/03", f"行业RPS排名（{len(industry)}行业）", "行业主题与海外映射", "daily", rps_value, None,
        report_day.isoformat(), None, None, None, None, retrieved_at, "E3", "同花顺行业指数（AKShare采集）",
        "https://q.10jqka.com.cn/thshy/", "行业指数close", .74, len(industry)/len(names), 1.0, "opportunity", "仅作为波段强度候选，需与前瞻景气和拥挤度交叉确认。",
        "行业5/20/60日收益的横截面百分位", available_at=iso_at(report_day, 15, 10),
    ))
    metrics.append(metric(
        "M3-A06/07", "行业成交占比与活跃度", "行业主题与海外映射", "daily",
        "；".join(f"{row['name']} 占比{row['share']:.2f}%（较20日{row['amount20x']:.2f}×）" for _, row in industry.nlargest(8,"share").iterrows()),
        None, report_day.isoformat(), None, None, None, None, retrieved_at, "E3", "同花顺行业指数 / 沪深交易所成交额",
        "https://q.10jqka.com.cn/thshy/", "行业成交额,全市场成交额", .75, len(industry)/len(names), 1.0, "none", None,
        "行业当日成交额/沪深股票成交额；变化项为行业自身成交额/20日均值，尚非严格成交占比历史变化", available_at=iso_at(report_day, 17),
    ))
    metrics.append(metric(
        "M3-A08/09", "行业波动率 / ATR", "行业主题与海外映射", "daily",
        "波动率Top：" + top_text("vol20", 5, "%") + "｜ATR Top：" + top_text("atr14", 5, "%"), None,
        report_day.isoformat(), None, None, None, None, retrieved_at, "E3", "同花顺行业指数（AKShare采集）",
        "https://q.10jqka.com.cn/thshy/", "行业OHLC", .74, len(industry)/len(names), 1.0,
        "risk" if float(industry["atr14"].max()) >= 6 else "watch", "高波动行业在机会评分中应降低仓位或等待波动收敛。",
        "20日收益标准差年化；ATR14/收盘价", available_at=iso_at(report_day, 15, 10),
    ))
    metrics.append(metric(
        "M3-A10", "行业成交拥挤度", "行业主题与海外映射", "daily", top_text("crowding", 8), None,
        report_day.isoformat(), None, None, None, None, retrieved_at, "E3", "同花顺行业指数 / 沪深交易所成交额",
        "https://q.10jqka.com.cn/thshy/", "成交占比,成交额/20日均值", .70, len(industry)/len(names), 1.0,
        "watch" if float(industry["crowding"].max()) >= 95 else "none", "顶部行业成交占比和放量程度同时处于横截面高位；本地历史尚短，暂不称历史极端。",
        "55%成交占比横截面分位+45%成交额/20日均值横截面分位", available_at=iso_at(report_day, 17),
    ))
    leader_valid = industry.dropna(subset=["leader3"])
    if len(leader_valid) >= len(industry) * .7:
        metrics.append(metric(
            "M3-A11", "行业龙头成交集中度（前3）", "行业主题与海外映射", "daily", top_text("leader3", 8, "%"), None,
            report_day.isoformat(), None, None, None, None, retrieved_at, "E3", "同花顺行业成分行情",
            "https://q.10jqka.com.cn/thshy/", "成分股成交额", .69, len(leader_valid)/len(industry), 1.0,
            "watch" if float(leader_valid["leader3"].max()) >= 65 else "none", "部分行业由少数龙头贡献大部分成交，追涨时注意单点脆弱性。" if float(leader_valid["leader3"].max()) >= 65 else None,
            "行业内成交额前3股票之和/行业指数成分成交额", available_at=iso_at(report_day, 15, 10),
        ))
    else:
        gaps.append({"indicator_id": "M3-A11", "reason": f"行业龙头集中度仅覆盖{len(leader_valid)}/{len(industry)}"})
    return industry.to_dict("records")


def clamp(value: float, low: float = 0, high: float = 100) -> float:
    return max(low, min(high, value))


def sentiment_label(score: float) -> tuple[str, str, str | None]:
    if score >= 85:
        return "狂热/一致乐观", "risk", "情绪和风险定价进入过热区，逆向风险上升。"
    if score >= 70:
        return "偏乐观", "watch", "风险偏好偏高，若继续上升需防范拥挤。"
    if score <= 15:
        return "极度悲观", "watch", "情绪接近恐慌区，仅作反转观察，不等于买点。"
    if score <= 30:
        return "偏悲观", "watch", "风险偏好偏弱，需等待价格和广度止跌确认。"
    return "中性", "none", None


def parse_numbers(value: Any) -> list[float]:
    return [float(item.replace(",", "")) for item in re.findall(r"[-+]?\d[\d,]*(?:\.\d+)?", str(value))]


def cboe_equity_put_call(report_day: date) -> list[tuple[date, float]]:
    observations: list[tuple[date, float]] = []
    cursor = report_day - timedelta(days=1)
    while len(observations) < 2 and cursor >= report_day - timedelta(days=4):
        if cursor.weekday() < 5:
            url = f"https://www.cboe.com/us/options/market_statistics/daily/?dt={cursor.isoformat()}"
            last_error: Exception | None = None
            for attempt in range(1):
                try:
                    response = requests.get(url, timeout=6)
                    response.raise_for_status()
                    match = re.search(r'EQUITY PUT/CALL RATIO\\?"?,\\?"?value\\?"?:\\?"?([0-9.]+)', response.text)
                    if match:
                        observations.append((cursor, float(match.group(1))))
                        last_error = None
                        break
                    last_error = RuntimeError("页面未包含股票期权Put/Call")
                except Exception as exc:
                    last_error = exc
            if last_error is not None and len(observations) == 0:
                pass
        cursor -= timedelta(days=1)
    if len(observations) < 2:
        raise RuntimeError(f"Cboe仅获得{len(observations)}个有效观测")
    return observations


def add_sentiment(
    report_day: date,
    retrieved_at: str,
    frames: dict[str, pd.DataFrame],
    metrics: list[dict[str, Any]],
    gaps: list[dict[str, str]],
) -> None:
    by_id = {item["indicator_id"]: item for item in metrics}

    # A股：广度和涨跌停占主要权重，量能和融资活跃度用于识别一致性与杠杆过热。
    breadth = parse_numbers(by_id.get("M1-A01/02", {}).get("value"))
    limits = parse_numbers(by_id.get("M1-A03/04", {}).get("value"))
    turnover = parse_numbers(by_id.get("M1-A05/06/07", {}).get("value"))
    margin = parse_numbers(by_id.get("M1-A15/16", {}).get("value"))
    if len(breadth) >= 2 and len(limits) >= 2 and len(turnover) >= 3 and len(margin) >= 3:
        breadth_score = breadth[0] / max(breadth[0] + breadth[1], 1) * 100
        limit_score = limits[0] / max(limits[0] + limits[1], 1) * 100
        turnover_score = clamp(50 + (turnover[-1] - 1) * 100)
        margin_score = clamp(50 + (margin[-1] - 10) * 10)
        score = .50 * breadth_score + .30 * limit_score + .10 * turnover_score + .10 * margin_score
        label, kind, note = sentiment_label(score)
        metrics.append(metric(
            "M6-C01", "A股情绪温度", "跨市场情绪", "daily", f"{score:.0f}/100 · {label}", None,
            report_day.isoformat(), None, None, None, None, retrieved_at, "E3", "交易所数据与市场活动派生",
            "local://sentiment/a-share", "上涨占比,涨跌停比,成交额/20日均值,融资买入占比", .82, .88, 1.0,
            kind, note, "50%上涨占比+30%涨跌停结构+10%量能+10%融资活跃度；threshold-v1",
            available_at=retrieved_at,
        ))
        metrics[-1]["component_summary"] = (
            f"上涨占比{breadth_score:.1f}% · 涨跌停{limits[0]:.0f}/{limits[1]:.0f} · "
            f"量能{turnover[-1]:.2f}×20日均值 · 融资买入占比{margin[-1]:.2f}%"
        )
    else:
        gaps.append({"indicator_id": "M6-C01", "reason": "A股情绪四项基础指标未齐备"})

    # 美股：低VIX、低股票期权Put/Call和强动量共同代表乐观；必须共振才进入狂热区。
    cboe = safe_call("M6-C02-PUT_CALL", lambda: cboe_equity_put_call(report_day), gaps)
    needed = all(key in frames for key in ["SP500", "NASDAQCOM", "VIXCLS"])
    if cboe and needed:
        sp, nq, vix_frame = frames["SP500"], frames["NASDAQCOM"], frames["VIXCLS"]
        sp_ret = pct_change(sp.iloc[-1]["value"], sp.iloc[-2]["value"])
        nq_ret = pct_change(nq.iloc[-1]["value"], nq.iloc[-2]["value"])
        prev_sp_ret = pct_change(sp.iloc[-2]["value"], sp.iloc[-3]["value"])
        prev_nq_ret = pct_change(nq.iloc[-2]["value"], nq.iloc[-3]["value"])

        def us_score(vix_value: float, pc_value: float, momentum: float) -> float:
            vix_score = clamp(100 - (vix_value - 12) * (50 / 8)) if vix_value <= 20 else clamp(50 - (vix_value - 20) * (50 / 15))
            pc_score = clamp(100 - (pc_value - .45) * (50 / .35)) if pc_value <= .80 else clamp(50 - (pc_value - .80) * (50 / .30))
            momentum_score = clamp(50 + momentum * (50 / 3))
            return .40 * vix_score + .40 * pc_score + .20 * momentum_score

        latest_vix, previous_vix = float(vix_frame.iloc[-1]["value"]), float(vix_frame.iloc[-2]["value"])
        score = us_score(latest_vix, cboe[0][1], (sp_ret + nq_ret) / 2)
        previous_score = us_score(previous_vix, cboe[1][1], (prev_sp_ret + prev_nq_ret) / 2)
        label, kind, note = sentiment_label(score)
        metrics.append(metric(
            "M6-C02", "美股情绪温度", "跨市场情绪", "daily", f"{score:.0f}/100 · {label}", None,
            cboe[0][0].isoformat(), f"{previous_score:.0f}/100", cboe[1][0].isoformat(), None, None, retrieved_at,
            "E1", "Cboe / FRED", "https://www.cboe.com/us/options/market_statistics/daily/; https://fred.stlouisfed.org/series/VIXCLS",
            "VIX,Equity Put/Call,SP500/NASDAQCOM动量", .94, .94, .92, kind, note,
            "40%VIX逆向分+40%股票期权Put/Call逆向分+20%标普/纳指日动量；threshold-v1",
            available_at=retrieved_at,
        ))
        metrics[-1]["component_summary"] = (
            f"VIX {latest_vix:.2f} · 股票期权Put/Call {cboe[0][1]:.2f} · "
            f"标普/纳指日动量 {sp_ret:+.2f}%/{nq_ret:+.2f}%"
        )
    elif needed:
        # Explicit degraded model: keep the region visible, lower coverage and
        # preserve the Put/Call gap instead of carrying an old value forward.
        sp, nq, vix_frame = frames["SP500"], frames["NASDAQCOM"], frames["VIXCLS"]
        latest_vix, previous_vix = float(vix_frame.iloc[-1]["value"]), float(vix_frame.iloc[-2]["value"])
        momentum = (pct_change(sp.iloc[-1]["value"], sp.iloc[-2]["value"]) + pct_change(nq.iloc[-1]["value"], nq.iloc[-2]["value"])) / 2
        previous_momentum = (pct_change(sp.iloc[-2]["value"], sp.iloc[-3]["value"]) + pct_change(nq.iloc[-2]["value"], nq.iloc[-3]["value"])) / 2
        vix_component = clamp(100 - (latest_vix - 12) * (50 / 8)) if latest_vix <= 20 else clamp(50 - (latest_vix - 20) * (50 / 15))
        previous_vix_component = clamp(100 - (previous_vix - 12) * (50 / 8)) if previous_vix <= 20 else clamp(50 - (previous_vix - 20) * (50 / 15))
        score = .70 * vix_component + .30 * clamp(50 + momentum * (50 / 3))
        previous_score = .70 * previous_vix_component + .30 * clamp(50 + previous_momentum * (50 / 3))
        label, kind, note = sentiment_label(score)
        degraded_note = "Cboe Put/Call本次超时，当前为VIX与宽基动量降级模型；不与完整版历史分数直接比较。"
        metrics.append(metric(
            "M6-C02", "美股情绪温度（降级）", "跨市场情绪", "daily", f"{score:.0f}/100 · {label}", None,
            vix_frame.iloc[-1]["date"].date().isoformat(), f"{previous_score:.0f}/100", vix_frame.iloc[-2]["date"].date().isoformat(),
            None, None, retrieved_at, "E1", "Cboe VIX / FRED宽基", "https://fred.stlouisfed.org/series/VIXCLS; https://fred.stlouisfed.org/series/SP500",
            "VIX,SP500/NASDAQCOM动量", .88, .60, .92, kind if kind != "none" else "watch", f"{note + ' ' if note else ''}{degraded_note}",
            "70%VIX逆向分+30%标普/纳指日动量；degraded-v1", available_at=retrieved_at,
        ))
        metrics[-1]["component_summary"] = f"VIX {latest_vix:.2f} · 标普/纳指平均日动量 {momentum:+.2f}% · Put/Call缺失"
    else:
        gaps.append({"indicator_id": "M6-C02", "reason": "美股VIX或宽基动量未齐备"})

    # 亚洲：日经动量与港股通南向成交净买额，当前为简化免费版。
    south = parse_numbers(by_id.get("M1-B01/02", {}).get("value"))
    south_prev = parse_numbers(by_id.get("M1-B01/02", {}).get("previous_value"))
    if "NIKKEI225" in frames and south and south_prev:
        nikkei = frames["NIKKEI225"]
        nikkei_ret = pct_change(nikkei.iloc[-1]["value"], nikkei.iloc[-2]["value"])
        prev_nikkei_ret = pct_change(nikkei.iloc[-2]["value"], nikkei.iloc[-3]["value"])

        def asia_score(momentum: float, southbound: float) -> float:
            return .60 * clamp(50 + momentum * (50 / 3)) + .40 * clamp(50 + southbound / 2)

        score = asia_score(nikkei_ret, south[0])
        previous_score = asia_score(prev_nikkei_ret, south_prev[0])
        label, kind, note = sentiment_label(score)
        metrics.append(metric(
            "M6-C03", "亚洲市场情绪温度", "跨市场情绪", "daily", f"{score:.0f}/100 · {label}", None,
            report_day.isoformat(), f"{previous_score:.0f}/100", str(by_id["M1-B01/02"]["previous_period"]), None, None,
            retrieved_at, "E3", "FRED / 东方财富互联互通汇编", "https://fred.stlouisfed.org/series/NIKKEI225; https://data.eastmoney.com/hsgt/index.html",
            "NIKKEI225日动量,南向成交净买额", .83, .58, .95, kind, note,
            "60%日经日动量+40%南向成交净买额标准分；韩国与VHSI缺失；threshold-v1", available_at=retrieved_at,
        ))
        metrics[-1]["component_summary"] = f"日经225日动量 {nikkei_ret:+.2f}% · 南向成交净买额 {south[0]:+.2f}亿元"
    else:
        gaps.append({"indicator_id": "M6-C03", "reason": "亚洲情绪的日经或南向资金数据未齐备"})

    # 欧洲：信用利差衡量风险补偿，Euro 50动量提供股票市场确认。
    if "BAMLHE00EHYIOAS" in frames and "NASDAQNQEURO50" in frames:
        euro = frames["BAMLHE00EHYIOAS"]
        equity = frames["NASDAQNQEURO50"]
        latest, previous = euro.iloc[-1], euro.iloc[-2]
        equity_latest, equity_previous, equity_before = equity.iloc[-1], equity.iloc[-2], equity.iloc[-3]
        equity_return = pct_change(equity_latest["value"], equity_previous["value"])
        previous_equity_return = pct_change(equity_previous["value"], equity_before["value"])
        credit_score = 100 - float((euro["value"] <= latest["value"]).mean() * 100)
        previous_credit_score = 100 - float((euro.iloc[:-1]["value"] <= previous["value"]).mean() * 100)
        score = .80 * credit_score + .20 * clamp(50 + equity_return * (50 / 3))
        previous_score = .80 * previous_credit_score + .20 * clamp(50 + previous_equity_return * (50 / 3))
        year_ago = euro[euro["date"] <= latest["date"] - pd.DateOffset(years=1)]
        yoy_value = None
        yoy_period = None
        if not year_ago.empty:
            comparable = year_ago.iloc[-1]
            yoy_value = f"{(float(latest['value']) - float(comparable['value'])) * 100:+.0f}bp"
            yoy_period = comparable["date"].date().isoformat()
        label, kind, note = sentiment_label(score)
        metrics.append(metric(
            "M6-C04", "欧洲市场情绪温度", "跨市场情绪", "daily", f"{score:.0f}/100 · {label}", None,
            latest["date"].date().isoformat(), f"{previous_score:.0f}/100", previous["date"].date().isoformat(),
            yoy_value, yoy_period, retrieved_at, "E1", "ICE BofA / FRED",
            "https://fred.stlouisfed.org/series/BAMLHE00EHYIOAS; https://fred.stlouisfed.org/series/NASDAQNQEURO50",
            "Euro HY OAS历史分位,NASDAQNQEURO50动量", .92, .78, .88,
            kind, note, "80%欧元高收益债OAS三年历史分位逆向分+20%NASDAQ Euro 50日动量；低利差=高乐观；threshold-v1", available_at=latest["date"].isoformat(),
        ))
        metrics[-1]["component_summary"] = (
            f"欧元高收益债利差 {latest['value']:.2f}% · 三年低位{100-credit_score:.1f}%分位 · "
            f"NASDAQ Euro 50日动量 {equity_return:+.2f}%"
        )
    else:
        gaps.append({"indicator_id": "M6-C04", "reason": "欧洲VSTOXX接口不稳定，且欧元高收益债利差或Euro 50动量缺失"})


def add_macro(retrieved_at: str, metrics: list[dict[str, Any]], gaps: list[dict[str, str]]) -> None:
    pmi = safe_call("M2-A01/03", ak.macro_china_pmi, gaps)
    if pmi is not None and len(pmi) >= 2:
        latest, previous = pmi.iloc[0], pmi.iloc[1]
        manufacturing = float(latest["制造业-指数"])
        non_manufacturing = float(latest["非制造业-指数"])
        month_match = re.fullmatch(r"(\d{4})年(\d{2})月份", str(latest["月份"]))
        pmi_published_at = None
        if month_match:
            year, month = map(int, month_match.groups())
            next_month = date(year + (month == 12), 1 if month == 12 else month + 1, 1)
            pmi_published_at = iso_at(next_month - timedelta(days=1), 9, 30)
        metrics.append(metric(
            "M2-A01/03", "制造业 / 非制造业PMI", "宏观、利率与政策预期", "monthly",
            f"{manufacturing:.1f} / {non_manufacturing:.1f}", "%", str(latest["月份"]),
            f"{float(previous['制造业-指数']):.1f} / {float(previous['非制造业-指数']):.1f}", str(previous["月份"]),
            f"{manufacturing-float(previous['制造业-指数']):+.1f} / {non_manufacturing-float(previous['非制造业-指数']):+.1f}pct（环比）", None,
            retrieved_at, "E1", "国家统计局", "https://www.stats.gov.cn/sj/zxfbhjd/202607/t20260731_1964252.html",
            "制造业-指数,非制造业-指数", .99, 1.0, .92,
            "risk" if manufacturing < 50 and non_manufacturing < 50 else "watch" if manufacturing < 50 else "none",
            "制造业和非制造业PMI均低于50，景气同步回落。" if manufacturing < 50 and non_manufacturing < 50 else None,
            "官方指数；变化为较上月百分点", published_at=pmi_published_at,
        ))
    money = safe_call("M2-B01/02", ak.macro_china_money_supply, gaps)
    if money is not None and len(money) >= 2:
        latest, previous = money.iloc[0], money.iloc[1]
        m1, m2 = float(latest["货币(M1)-同比增长"]), float(latest["货币和准货币(M2)-同比增长"])
        prev_m1, prev_m2 = float(previous["货币(M1)-同比增长"]), float(previous["货币和准货币(M2)-同比增长"])
        metrics.append(metric(
            "M2-B01/02", "M1 / M2同比与剪刀差", "宏观、利率与政策预期", "monthly",
            f"M1 {m1:.1f}%；M2 {m2:.1f}%；差{m1-m2:+.1f}pct", None, str(latest["月份"]),
            f"M1 {prev_m1:.1f}%；M2 {prev_m2:.1f}%；差{prev_m1-prev_m2:+.1f}pct", str(previous["月份"]),
            f"M1 {m1:+.1f}%；M2 {m2:+.1f}%（官方同比）", str(latest["月份"]), retrieved_at,
            "E3", "东方财富经济数据库（人民银行口径汇编）", "https://data.eastmoney.com/cjsj/hbgyl.html",
            "CURRENCY_SAME,BASIC_CURRENCY_SAME", .78, .90, .88, "watch" if m1 - m2 <= -3 else "none",
            "M1增速低于M2，资金活化程度仍需观察；该项待人民银行原页二次核验。" if m1 - m2 <= -3 else None,
            "M1同比-M2同比", available_at=retrieved_at,
        ))
    rates = safe_call("M2-B10", lambda: ak.bond_zh_us_rate(start_date=(datetime.now(SHANGHAI).date() - timedelta(days=10)).strftime("%Y%m%d")), gaps)
    if rates is not None and len(rates) >= 2:
        china = rates.dropna(subset=["中国国债收益率2年", "中国国债收益率10年"])
        latest, previous = china.iloc[-1], china.iloc[-2]
        metrics.append(metric(
            "M2-B10", "中国国债2Y / 10Y / 曲线", "宏观、利率与政策预期", "daily",
            f"{latest['中国国债收益率2年']:.4f}% / {latest['中国国债收益率10年']:.4f}% / {(latest['中国国债收益率10年']-latest['中国国债收益率2年'])*100:+.1f}bp",
            None, str(latest["日期"]),
            f"{previous['中国国债收益率2年']:.4f}% / {previous['中国国债收益率10年']:.4f}%", str(previous["日期"]),
            None, None, retrieved_at, "E3", "东方财富经济数据库（AKShare采集）", "https://data.eastmoney.com/cjsj/zmgzsyl.html",
            "中国国债收益率2年,中国国债收益率10年", .82, .94, 1.0, "none", None,
            "10Y-2Y，以基点表示", available_at=retrieved_at,
        ))
    cpi = safe_call("M2-A08-CPI", ak.macro_china_cpi, gaps)
    ppi = safe_call("M2-A08-PPI", ak.macro_china_ppi, gaps)
    if cpi is not None and ppi is not None and len(cpi) >= 2 and len(ppi) >= 2:
        c0, c1, p0, p1 = cpi.iloc[0], cpi.iloc[1], ppi.iloc[0], ppi.iloc[1]
        cpi_yoy, ppi_yoy = float(c0["全国-同比增长"]), float(p0["当月同比增长"])
        metrics.append(metric(
            "M2-A08", "CPI / PPI同比", "宏观、利率与政策预期", "monthly",
            f"CPI {cpi_yoy:+.1f}%；PPI {ppi_yoy:+.1f}%", None, str(c0["月份"]),
            f"CPI {float(c1['全国-同比增长']):+.1f}%；PPI {float(p1['当月同比增长']):+.1f}%", str(c1["月份"]),
            f"CPI {cpi_yoy:+.1f}%；PPI {ppi_yoy:+.1f}%（官方同比口径）", str(c0["月份"]), retrieved_at,
            "E3", "东方财富经济数据库（国家统计局口径汇编）", "https://data.eastmoney.com/cjsj/cpi.html; https://data.eastmoney.com/cjsj/ppi.html",
            "NATIONAL_SAME,BASE_SAME", .79, .75, .90, "watch" if cpi_yoy >= 3 or ppi_yoy <= -3 else "none",
            "通胀读数进入观察区，需回到国家统计局原始发布复核分项。" if cpi_yoy >= 3 or ppi_yoy <= -3 else None,
            "官方口径经第三方结构化传输", available_at=retrieved_at,
        ))
    industrial = safe_call("M2-A04", lambda: ak.macro_china_nbs_nation(kind="月度数据", path="工业>规上工业增加值增长速度", period="LAST3"), gaps)
    investment = safe_call("M2-A05", lambda: ak.macro_china_nbs_nation(kind="月度数据", path="固定资产投资 (不含农户)>固定资产投资概况", period="LAST3"), gaps)
    retail = safe_call("M2-A06", lambda: ak.macro_china_nbs_nation(kind="月度数据", path="国内贸易>社会消费品零售总额", period="LAST3"), gaps)
    if industrial is not None and investment is not None and retail is not None and not industrial.empty and not investment.empty and not retail.empty:
        period, previous_period = industrial.columns[0], industrial.columns[1]
        industrial_yoy = float(industrial.loc["规上工业增加值_同比增长(%)", period])
        investment_yoy = float(investment.loc["固定资产投资额累计增长(%)", period])
        retail_yoy = float(retail.loc["社会消费品零售总额_同比增长(%)", period])
        metrics.append(metric(
            "M2-A04/06", "工业增加值 / 固定资产投资 / 社会消费品零售", "宏观、利率与政策预期", "monthly",
            f"工业{industrial_yoy:+.1f}%；投资累计{investment_yoy:+.1f}%；社零{retail_yoy:+.1f}%", None, str(period),
            f"工业{float(industrial.loc['规上工业增加值_同比增长(%)', previous_period]):+.1f}%；投资累计{float(investment.loc['固定资产投资额累计增长(%)', previous_period]):+.1f}%；社零{float(retail.loc['社会消费品零售总额_同比增长(%)', previous_period]):+.1f}%",
            str(previous_period), f"工业{industrial_yoy:+.1f}%；投资{investment_yoy:+.1f}%；社零{retail_yoy:+.1f}%（官方同比）", str(period), retrieved_at,
            "E1", "国家统计局", "https://data.stats.gov.cn/dg/website/page.html#/pc/national/monthData",
            "规上工业增加值同比,固定资产投资累计同比,社会消费品零售总额同比", .98, 1.0, .92,
            "risk" if investment_yoy < 0 and retail_yoy < 0 else "watch" if investment_yoy < 0 else "none",
            "固定资产投资累计同比为负，关注投资拖累能否收窄。" if investment_yoy < 0 else None,
            "国家统计局月度数据接口；投资为不含农户累计同比", available_at=retrieved_at,
        ))
    lpr = safe_call("M2-B07", ak.macro_china_lpr, gaps)
    if lpr is not None:
        valid = lpr.dropna(subset=["LPR1Y", "LPR5Y"]).sort_values("TRADE_DATE")
        if len(valid) >= 2:
            latest, previous = valid.iloc[-1], valid.iloc[-2]
            metrics.append(metric(
                "M2-B07", "LPR 1年 / 5年", "宏观、利率与政策预期", "monthly",
                f"{latest['LPR1Y']:.2f}% / {latest['LPR5Y']:.2f}%", None, str(latest["TRADE_DATE"]),
                f"{previous['LPR1Y']:.2f}% / {previous['LPR5Y']:.2f}%", str(previous["TRADE_DATE"]), None, None,
                retrieved_at, "E3", "全国银行间同业拆借中心口径 / 东方财富传输", "https://www.chinamoney.com.cn/chinese/bklpr/",
                "LPR1Y,LPR5Y", .84, .35, .82, "none", None, "LPR发布值；第三方接口传输", available_at=retrieved_at,
            ))
    shibor = safe_call("M2-B09", ak.macro_china_shibor_all, gaps)
    if shibor is not None and len(shibor) >= 2:
        valid = shibor.copy()
        valid["日期"] = pd.to_datetime(valid["日期"])
        valid = valid.sort_values("日期").dropna(subset=["O/N-定价", "1W-定价", "3M-定价"])
        latest, previous = valid.iloc[-1], valid.iloc[-2]
        metrics.append(metric(
            "M2-B09", "Shibor 隔夜 / 1周 / 3个月", "宏观、利率与政策预期", "daily",
            f"{latest['O/N-定价']:.3f}% / {latest['1W-定价']:.3f}% / {latest['3M-定价']:.3f}%", None,
            latest["日期"].date().isoformat(), f"{previous['O/N-定价']:.3f}% / {previous['1W-定价']:.3f}% / {previous['3M-定价']:.3f}%",
            previous["日期"].date().isoformat(), None, None, retrieved_at, "E3", "Shibor口径 / 金十结构化传输",
            "https://www.shibor.org/; https://datacenter.jin10.com/reportType/dc_shibor", "O/N,1W,3M", .78, .75, 1.0,
            "watch" if abs(float(latest["O/N-涨跌幅"])) >= 20 else "none", "隔夜Shibor单日变动较大，关注资金面持续性。" if abs(float(latest["O/N-涨跌幅"])) >= 20 else None,
            "Shibor发布值；第三方结构化传输", available_at=retrieved_at,
        ))
    unemployment = safe_call("M2-A-UNEMPLOYMENT", ak.macro_china_urban_unemployment, gaps)
    if unemployment is not None and not unemployment.empty:
        total = unemployment[unemployment["item"] == "全国城镇调查失业率"].copy()
        total["date"] = total["date"].astype(str)
        total = total.sort_values("date")
        if len(total) >= 2:
            latest, previous = total.iloc[-1], total.iloc[-2]
            metrics.append(metric(
                "M2-A12", "全国城镇调查失业率", "宏观、利率与政策预期", "monthly", float(latest["value"]), "%",
                str(latest["date"]), float(previous["value"]), str(previous["date"]), None, None, retrieved_at,
                "E1", "国家统计局", "https://data.stats.gov.cn/dg/website/page.html#/pc/national/monthData", "全国城镇调查失业率",
                .98, 1.0, .92, "watch" if float(latest["value"]) >= 5.5 else "none", "就业压力进入观察区。" if float(latest["value"]) >= 5.5 else None,
                "国家统计局月度数据接口", available_at=retrieved_at,
            ))


def add_financial_stress(
    retrieved_at: str,
    frames: dict[str, pd.DataFrame],
    metrics: list[dict[str, Any]],
    gaps: list[dict[str, str]],
) -> None:
    needed = ["BAMLH0A0HYM2", "NFCI", "STLFSI4"]
    if not all(name in frames for name in needed):
        gaps.append({"indicator_id": "M6-B02", "reason": "美国高收益债利差、NFCI或STLFSI缺失"})
        return
    hy, nfci, stl = (frames[name] for name in needed)
    h0, h1, hy_yoy = observation(hy)
    n0, n1, _ = observation(nfci)
    s0, s1, _ = observation(stl)
    stressed = float(h0["value"]) >= 5 or float(n0["value"]) >= .25 or float(s0["value"]) >= 1
    watch = float(h0["value"]) >= 4 or float(n0["value"]) >= 0 or float(s0["value"]) >= 0
    metrics.append(metric(
        "M6-B02", "美国信用与金融压力", "重点风险", "daily/weekly",
        f"高收益债OAS {h0['value']:.2f}%；NFCI {n0['value']:+.3f}；STLFSI4 {s0['value']:+.3f}", None,
        h0["date"].date().isoformat(), f"OAS {h1['value']:.2f}%；NFCI {n1['value']:+.3f}；STLFSI4 {s1['value']:+.3f}",
        h1["date"].date().isoformat(), f"OAS {float(h0['value'])-float(hy_yoy):+.2f}pct" if hy_yoy else None,
        (h0["date"] - pd.DateOffset(years=1)).date().isoformat(), retrieved_at, "E1", "ICE BofA / Chicago Fed / St. Louis Fed（FRED）",
        "https://fred.stlouisfed.org/series/BAMLH0A0HYM2; https://fred.stlouisfed.org/series/NFCI; https://fred.stlouisfed.org/series/STLFSI4",
        "BAMLH0A0HYM2,NFCI,STLFSI4", .96, 1.0, .88, "risk" if stressed else "watch" if watch else "none",
        "信用利差或金融压力指数进入压力区。" if stressed else "金融条件接近观察阈值。" if watch else None,
        "硬阈值v1：OAS>=5%、NFCI>=0.25或STLFSI4>=1触发；周频指标不前填成日频", available_at=retrieved_at,
    ))


def make_events(report_day: date) -> list[dict[str, Any]]:
    events = [
        {
            "event_at": "2026-08-20T02:00:00+08:00", "window": "未来7日", "event_type": "海外政策",
            "event_name": "美联储公布7月FOMC会议纪要", "impact": "高",
            "industries": "成长 / 科技 / 港股", "scenario": "重点观察通胀、加息分歧与实际利率路径表述",
            "source": "https://www.federalreserve.gov/monetarypolicy.htm",
        },
        {
            "event_at": "2026-08-20T09:00:00+08:00", "window": "未来7日", "event_type": "中国利率",
            "event_name": "8月LPR公布", "impact": "高", "industries": "全市场 / 地产链 / 银行",
            "scenario": "若调整，关注地产链与高股息资产的估值反馈",
            "source": "https://www.chinamoney.com.cn/chinese/bklpr/",
        },
        {
            "event_at": "2026-08-31T09:30:00+08:00", "window": "未来30日", "event_type": "中国宏观",
            "event_name": "8月官方PMI", "impact": "高", "industries": "全市场 / 顺周期 / 装备制造",
            "scenario": "关注制造业与新订单能否重返50以上",
            "source": "https://www.stats.gov.cn/sj/",
        },
        {
            "event_at": "2026-09-17T02:00:00+08:00", "window": "未来30日", "event_type": "海外政策",
            "event_name": "9月FOMC利率决议与经济预测", "impact": "高", "industries": "成长 / 科技 / 港股",
            "scenario": "点阵图与实际利率方向影响全球成长估值",
            "source": "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
        },
    ]
    cutoff = datetime.combine(report_day, datetime.min.time(), SHANGHAI)
    horizon = cutoff + timedelta(days=90)
    return [event for event in events if cutoff <= datetime.fromisoformat(event["event_at"]) <= horizon]


def completed_market_day(report_day: date, now: datetime | None = None) -> date:
    current = now or datetime.now(SHANGHAI)
    calendar = ak.tool_trade_date_hist_sina()
    trade_days = sorted(item for item in calendar["trade_date"].tolist() if item <= report_day)
    if report_day == current.date() and current.hour < 18:
        trade_days = [item for item in trade_days if item < report_day]
    if not trade_days:
        raise RuntimeError(f"{report_day}之前没有可用交易日")
    return trade_days[-1]


def is_a_share_trade_day(report_day: date) -> bool:
    calendar = ak.tool_trade_date_hist_sina()
    return report_day in set(calendar["trade_date"].tolist())


def build_snapshot(report_day: date, revision: str = "r1", market_day: date | None = None) -> dict[str, Any]:
    now = datetime.now(SHANGHAI)
    market_day = market_day or completed_market_day(report_day, now)
    retrieved_at = now.isoformat(timespec="seconds")
    metrics: list[dict[str, Any]] = []
    gaps: list[dict[str, str]] = []

    market_activity(market_day, retrieved_at, metrics, gaps)
    turnover = add_turnover(market_day, retrieved_at, metrics, gaps)
    add_a_share_style_risk(market_day, retrieved_at, metrics, gaps)
    add_a_share_concentration(market_day, retrieved_at, metrics, gaps)
    add_margin(market_day, turnover, retrieved_at, metrics, gaps)
    add_etf(market_day, retrieved_at, metrics, gaps)
    add_southbound(market_day, retrieved_at, metrics, gaps)
    global_frames = add_global(report_day, retrieved_at, metrics, gaps)
    add_macro(retrieved_at, metrics, gaps)
    add_financial_stress(retrieved_at, global_frames, metrics, gaps)
    industry_rows = add_industry_metrics(market_day, retrieved_at, turnover, metrics, gaps)
    add_sentiment(market_day, retrieved_at, global_frames, metrics, gaps)
    for item in metrics:
        item["revision_id"] = revision

    gaps.extend([
        {"indicator_id": "M2-C02", "reason": "CME FedWatch网页可免费查看，但官方API为付费；暂不以未授权抓取替代政策概率"},
        {"indicator_id": "M3-B", "reason": "海外板块至A股行业映射规则待回测，已发布海外科技链与国内行业RPS但不自动拼成信号"},
        {"indicator_id": "M4-*", "reason": "重点行业前瞻源尚未达到可复现标准"},
        {"indicator_id": "M7-*", "reason": "行业行情覆盖已达标，但前瞻景气与估值输入覆盖不足70%，今日不生成波段行业Top 3"},
    ])

    by_id = {item["indicator_id"]: item for item in metrics}
    pmi = by_id.get("M2-A01/03")
    real_rate = by_id.get("M1-C06")
    breadth = by_id.get("M1-A01/02")
    limits = by_id.get("M1-A03/04")
    vix = by_id.get("M1-C05")
    credit_stress = by_id.get("M6-B02")
    industry_crowding = by_id.get("M3-A10")
    pmi_risk = pmi is not None and pmi["interpretation_type"] == "risk"
    internal_risk = any(item and item["interpretation_type"] == "risk" for item in [breadth, limits])
    hot_sentiments = [item for item in metrics if item["indicator_id"].startswith("M6-C") and item["interpretation_type"] == "risk"]
    sentiment_summary = "；".join(f"{item['indicator_name']}{item['value']}" for item in hot_sentiments)

    risks = [
        {"risk_type": "vulnerability", "name": "宏观景气", "status": "触发" if pmi_risk else "未触发" if pmi else "数据缺失", "interpretation": pmi["interpretation"] if pmi and pmi["interpretation"] else f"PMI最新值：{pmi['value']}" if pmi else "PMI免费源不可用。", "tone": "danger" if pmi_risk else "positive" if pmi else "neutral"},
        {"risk_type": "vulnerability", "name": "外部实际利率", "status": "观察" if real_rate and real_rate["interpretation_type"] == "watch" else "未触发" if real_rate else "数据缺失", "interpretation": real_rate["interpretation"] if real_rate and real_rate["interpretation"] else f"最新值：{real_rate['value']}" if real_rate else "美债实际利率免费源不可用。", "tone": "warning" if real_rate and real_rate["interpretation_type"] == "watch" else "positive" if real_rate else "neutral"},
        {"risk_type": "vulnerability", "name": "行业拥挤与估值", "status": "观察" if industry_crowding else "数据缺失", "interpretation": industry_crowding["interpretation"] if industry_crowding and industry_crowding["interpretation"] else "行业成交拥挤度已覆盖；历史估值分位仍待累积或授权源。" if industry_crowding else "行业行情覆盖不足，不能判定安全。", "tone": "warning" if industry_crowding and industry_crowding["interpretation_type"] == "watch" else "neutral"},
        {"risk_type": "vulnerability", "name": "跨市场情绪过热", "status": "触发" if hot_sentiments else "未触发", "interpretation": f"{sentiment_summary}；一致乐观属于逆向风险，不等于立即见顶。" if hot_sentiments else "已覆盖的区域情绪未进入狂热区。", "tone": "danger" if hot_sentiments else "positive"},
        {"risk_type": "stress", "name": "A股内部压力", "status": "显著触发" if internal_risk else "未触发" if breadth and limits else "数据缺失", "interpretation": f"涨跌家数{breadth['value']}，涨跌停{limits['value']}；尚缺连续日确认。" if breadth and limits else "A股内部压力指标覆盖不足。", "tone": "danger" if internal_risk else "positive" if breadth and limits else "neutral"},
        {"risk_type": "stress", "name": "全球波动", "status": "触发" if vix and vix["interpretation_type"] == "risk" else "观察" if vix and vix["interpretation_type"] == "watch" else "未触发" if vix else "数据缺失", "interpretation": vix["interpretation"] if vix and vix["interpretation"] else f"VIX最新{vix['value']}，低于压力阈值。" if vix else "VIX免费源不可用。", "tone": "danger" if vix and vix["interpretation_type"] == "risk" else "warning" if vix and vix["interpretation_type"] == "watch" else "positive" if vix else "neutral"},
        {"risk_type": "stress", "name": "信用与金融压力", "status": "触发" if credit_stress and credit_stress["interpretation_type"] == "risk" else "观察" if credit_stress and credit_stress["interpretation_type"] == "watch" else "未触发" if credit_stress else "数据缺失", "interpretation": credit_stress["interpretation"] if credit_stress and credit_stress["interpretation"] else f"最新值：{credit_stress['value']}" if credit_stress else "信用与金融压力数据不足。", "tone": "danger" if credit_stress and credit_stress["interpretation_type"] == "risk" else "warning" if credit_stress and credit_stress["interpretation_type"] == "watch" else "positive" if credit_stress else "neutral"},
        {"risk_type": "stress", "name": "跨资产共振", "status": "未确认", "interpretation": "已补充信用压力，但人民币、商品与全球股票的同日共振模型仍待本地历史累积。", "tone": "warning"},
    ]

    return {
        "schema_version": "snapshot-v1.0.0",
        "indicator_version": "indicator-v1.0.0",
        "model_version": "sector-swing-v1.0.0",
        "report_date": report_day.isoformat(),
        "as_of": retrieved_at,
        "timezone": "Asia/Shanghai",
        "data_state": "partial",
        "metrics": metrics,
        "opportunities": [],
        "risks": risks,
        "events": make_events(report_day),
        "data_gaps": gaps,
        "run": {
            "run_id": f"free-source-test-{report_day.isoformat()}-{revision}",
            "revision_id": revision,
            "market_data_date": market_day.isoformat(),
            "collector": "scripts/collect-free-daily.py",
            "top_call": "A股内部压力单组显著触发，PMI同步跌破50；欧洲信用利差处于三年极低分位，情绪一致乐观需防逆向风险；行业强度与拥挤度已覆盖，但前瞻景气不足，暂不输出波段Top 3。" if hot_sentiments else "A股内部压力单组显著触发，PMI同步跌破50；行业强度与拥挤度已覆盖，但前瞻景气不足，暂不输出波段Top 3。",
            "risk_level": "高风险观察",
            "coverage_note": f"已发布{len(metrics)}项真实指标；行业历史覆盖{len(industry_rows)}类；缺失项显式留空。",
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", default=datetime.now(SHANGHAI).date().isoformat())
    parser.add_argument("--output", default="data/current-snapshot.json")
    parser.add_argument("--revision", default="r1")
    parser.add_argument("--market-date", help="已完成的A股交易日；默认按北京时间自动判断")
    parser.add_argument("--trading-days-only", action="store_true", help="报告日不是A股交易日时正常退出且不改写文件")
    args = parser.parse_args()
    report_day = date.fromisoformat(args.date)
    if args.trading_days_only and not is_a_share_trade_day(report_day):
        print(f"{report_day}: 非A股交易日，跳过更新")
        return
    market_day = date.fromisoformat(args.market_date) if args.market_date else completed_market_day(report_day)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    snapshot = build_snapshot(report_day, args.revision, market_day)
    output.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{output}: {len(snapshot['metrics'])} metrics, {len(snapshot['data_gaps'])} gaps")


if __name__ == "__main__":
    main()
