import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from flow_outlook import domestic_equity_etfs, interpret_windows


class FlowOutlookTests(unittest.TestCase):
    def test_equity_etf_universe_excludes_cross_border_bonds_and_gold(self):
        rows = [
            {"基金代码": "510300", "基金简称": "300ETF", "ETF类型": "跨市"},
            {"基金代码": "588000", "基金简称": "科创50", "ETF类型": "单市"},
            {"基金代码": "511010", "基金简称": "国债ETF", "ETF类型": "单市"},
            {"基金代码": "518880", "基金简称": "黄金ETF", "ETF类型": "单市"},
            {"基金代码": "513100", "基金简称": "纳指ETF", "ETF类型": "跨境"},
        ]
        self.assertEqual([row["基金代码"] for row in domestic_equity_etfs(rows)], ["510300", "588000"])

    def test_long_term_domestic_expansion_can_coexist_with_short_term_outflow_and_external_pressure(self):
        windows = [
            {"days": 5, "equity_etf": {"change_pct": -0.5}, "margin": {"change_pct": 0.3}, "southbound": {"net_buy_100m_cny": 30}, "foreign_conditions": {"dollar_change_pct": 0.8, "real_yield_change_pp": 0.18, "vix_change_points": -2}, "northbound": {"avg_turnover_100m_cny": 1000}},
            {"days": 10, "equity_etf": {"change_pct": 0.6}, "margin": {"change_pct": 0.5}, "southbound": {"net_buy_100m_cny": 55}, "foreign_conditions": {}, "northbound": {"avg_turnover_100m_cny": 1100}},
            {"days": 20, "equity_etf": {"change_pct": 1.5}, "margin": {"change_pct": 1.0}, "southbound": {"net_buy_100m_cny": 100}, "foreign_conditions": {}, "northbound": {"avg_turnover_100m_cny": 1200}},
        ]
        result = interpret_windows(windows)
        self.assertEqual(result["domestic"], "ETF中期增份额、近5日回落")
        self.assertEqual(result["hong_kong"], "近5/10/20日均净买入")
        self.assertEqual(result["foreign_environment"], "外资配置环境偏紧")
        self.assertIn("近5日回落", result["headline"])
        self.assertNotIn("外资净卖出", result["headline"])

    def test_turnover_without_direction_does_not_count_as_foreign_purchase(self):
        windows = [
            {"days": 5, "equity_etf": None, "margin": None, "southbound": None, "foreign_conditions": {}, "northbound": {"avg_turnover_100m_cny": 1400}},
            {"days": 20, "equity_etf": None, "margin": None, "southbound": None, "foreign_conditions": {}, "northbound": {"avg_turnover_100m_cny": 1000}},
        ]
        result = interpret_windows(windows)
        self.assertEqual(result["foreign_environment"], "外资配置环境证据不足")
        self.assertEqual(result["participation"], "沪股通活跃度回升")

    def test_etf_and_financing_pressure_keeps_hong_kong_separate(self):
        windows = [
            {"days": 5, "equity_etf": {"change_pct": -0.65}, "margin": {"change_pct": -0.2}, "southbound": {"net_buy_100m_cny": 118}, "foreign_conditions": {"real_yield_change_pp": 0.22, "vix_change_points": -9.48}, "northbound": {"avg_turnover_100m_cny": 1045}},
            {"days": 10, "equity_etf": {"change_pct": 3.3}, "margin": {"change_pct": -3.5}, "southbound": {"net_buy_100m_cny": 86}, "foreign_conditions": {}, "northbound": {"avg_turnover_100m_cny": 1250}},
            {"days": 20, "equity_etf": {"change_pct": 8.4}, "margin": {"change_pct": -8.1}, "southbound": {"net_buy_100m_cny": -230}, "foreign_conditions": {}, "northbound": {"avg_turnover_100m_cny": 1300}},
        ]
        result = interpret_windows(windows)
        self.assertIn("融资余额5/10/20日均下降", result["domestic"])
        self.assertNotIn("南向", result["domestic"])
        self.assertEqual(result["hong_kong"], "20日净卖出，近5/10日转净买入")
        self.assertEqual(result["foreign_environment"], "实际利率与波动率信号对冲")
        self.assertEqual(result["participation"], "沪股通活跃度降温")
        self.assertIn("短线资金承压", result["headline"])


if __name__ == "__main__":
    unittest.main()
