"""Decision-layer checks that run without live market data or third-party modules."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from signal_engine import screen_sector_candidates, summarize_risks


def sector(name, **overrides):
    row = {
        "name": name, "rps5": 74, "rps20": 88, "rps60": 76,
        "ret5": 3.2, "ret20": 9.0, "ret60": 15.0,
        "amount20x": 1.18, "crowding": 72, "atr14": 2.8,
        "dd20": -7.0, "ma20_gap": 4.0, "from_high20": -4.0,
        "leader3": 45, "share": 2.1,
    }
    row.update(overrides)
    return row


class SectorScreenTests(unittest.TestCase):
    def test_returns_at_most_three_ranked_candidates_with_conditions(self):
        rows = [sector(f"行业{index}", rps20=92 - index, rps60=78 - index) for index in range(5)]
        result = screen_sector_candidates(rows, "2026-10-09", coverage=0.9)
        self.assertEqual(len(result), 3)
        self.assertEqual([item["rank"] for item in result], [1, 2, 3])
        self.assertTrue(all(item["status"] == "待确认" for item in result))
        self.assertTrue(all(item["evidence"] and item["confirmation_conditions"] and item["invalidation_conditions"] for item in result))
        self.assertTrue(all(item["market_data_date"] == "2026-10-09" for item in result))

    def test_filters_crowded_or_volatile_sectors(self):
        rows = [sector("拥挤", crowding=96), sector("高波动", atr14=6.1), sector("有效")]
        result = screen_sector_candidates(rows, "2026-10-09", coverage=0.9)
        self.assertEqual([item["industry_name"] for item in result], ["有效"])

    def test_can_find_rebound_but_does_not_call_it_confirmed(self):
        rows = [sector("反弹", rps20=36, rps60=29, ret20=-12, ret60=-20,
                       ret5=4.5, rps5=78, ma20_gap=-5, from_high20=-14)]
        result = screen_sector_candidates(rows, "2026-10-09", coverage=0.9)
        self.assertEqual(result[0]["opportunity_type"], "超跌修复观察")
        self.assertEqual(result[0]["status"], "待确认")

    def test_suppresses_candidates_when_industry_coverage_is_low(self):
        self.assertEqual(screen_sector_candidates([sector("有效")], "2026-10-09", coverage=0.65), [])


class RiskSummaryTests(unittest.TestCase):
    def test_does_not_claim_market_stress_when_only_macro_is_triggered(self):
        risks = [
            {"risk_type": "vulnerability", "name": "宏观景气", "status": "触发", "tone": "danger", "interpretation": "PMI低于50。"},
            {"risk_type": "stress", "name": "A股内部压力", "status": "未触发", "tone": "positive", "interpretation": "上涨家数较多。"},
            {"risk_type": "stress", "name": "跨资产共振", "status": "未确认", "tone": "warning", "interpretation": "数据不足。"},
        ]
        result = summarize_risks(risks, [])
        self.assertEqual(result["risk_level"], "单组风险观察")
        self.assertIn("PMI低于50", result["top_call"])
        self.assertNotIn("A股内部压力", result["top_call"])

    def test_independent_trigger_groups_escalate_risk(self):
        risks = [
            {"risk_type": "vulnerability", "name": "宏观景气", "status": "触发", "tone": "danger", "interpretation": "PMI低于50。"},
            {"risk_type": "stress", "name": "全球波动", "status": "触发", "tone": "danger", "interpretation": "VIX急升。"},
        ]
        self.assertEqual(summarize_risks(risks, [sector("候选")])["risk_level"], "多组风险共振")


if __name__ == "__main__":
    unittest.main()
