"""Capital-flow proxies must keep units, dates and unmatched ETFs explicit."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from capital_flow import compute_etf_share_flow, rank_sector_activity


class EtfShareFlowTests(unittest.TestCase):
    def test_only_compares_the_same_etfs_and_keeps_share_units(self):
        previous = [
            {"基金代码": "510300", "基金简称": "沪深300ETF", "基金份额": 10_000_000_000},
            {"基金代码": "588000", "基金简称": "科创50ETF", "基金份额": 10_000_000_000},
        ]
        latest = [
            {"基金代码": "510300", "基金简称": "沪深300ETF", "基金份额": 12_000_000_000},
            {"基金代码": "588000", "基金简称": "科创50ETF", "基金份额": 9_000_000_000},
            {"基金代码": "588999", "基金简称": "新上市ETF", "基金份额": 1_000_000_000},
        ]
        result = compute_etf_share_flow(latest, previous, "2026-11-13", "2026-11-12")
        self.assertEqual(result["change_100m_shares"], 10.0)
        self.assertEqual(result["change_pct"], 5.0)
        self.assertEqual(result["matched_count"], 2)
        self.assertEqual(result["excluded_new_count"], 1)
        self.assertEqual(result["top_increase"][0]["code"], "510300")
        self.assertEqual(result["top_decrease"][0]["change_100m_shares"], -10.0)

    def test_rejects_low_match_coverage_and_duplicate_codes(self):
        old = [{"基金代码": "510300", "基金简称": "ETF", "基金份额": 100_000_000}]
        fresh = old + [{"基金代码": "588999", "基金简称": "新ETF", "基金份额": 900_000_000}]
        self.assertIsNone(compute_etf_share_flow(fresh, old, "2026-11-13", "2026-11-12"))
        with self.assertRaisesRegex(ValueError, "duplicate ETF code"):
            compute_etf_share_flow(old + old, old, "2026-11-13", "2026-11-12")

    def test_rejects_non_positive_or_reversed_periods(self):
        rows = [{"基金代码": "510300", "基金简称": "ETF", "基金份额": 0}]
        self.assertIsNone(compute_etf_share_flow(rows, rows, "2026-11-13", "2026-11-12"))
        with self.assertRaisesRegex(ValueError, "previous period"):
            compute_etf_share_flow(rows, rows, "2026-11-12", "2026-11-13")


class SectorActivityTests(unittest.TestCase):
    def test_ranks_turnover_share_migration_not_net_inflow(self):
        rows = [
            {"name": "半导体", "share": 12.0, "previous_share": 10.0, "share_delta_pp": 2.0, "amount20x": 1.4},
            {"name": "机器人", "share": 4.0, "previous_share": 3.5, "share_delta_pp": 0.5, "amount20x": 1.2},
            {"name": "新能源", "share": 3.0, "previous_share": 4.0, "share_delta_pp": -1.0, "amount20x": 0.9},
            {"name": "消费", "share": 5.0, "previous_share": 5.0, "share_delta_pp": 0.0, "amount20x": 1.0},
        ]
        result = rank_sector_activity(rows, limit=2)
        self.assertEqual([row["name"] for row in result["increasing"]], ["半导体", "机器人"])
        self.assertEqual([row["name"] for row in result["decreasing"]], ["新能源"])
        self.assertEqual(result["increasing"][0]["change_pp"], 2.0)
        self.assertNotIn("net_inflow", result["increasing"][0])

    def test_skips_rows_without_comparable_previous_share(self):
        self.assertEqual(rank_sector_activity([{"name": "未知", "share": 2.0, "amount20x": 1.2}]), {"increasing": [], "decreasing": []})


if __name__ == "__main__":
    unittest.main()
