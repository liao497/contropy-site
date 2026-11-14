import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from flow_outlook import classify_outlook, parse_ishares_shares, prior_fund_observations


class FlowOutlookTests(unittest.TestCase):
    def test_issuer_share_extraction_requires_dated_positive_count(self):
        html = '<span data-id="keyFundFacts-sharesOutstanding-data">5,150,000</span><span data-id="keyFundFacts-sharesOutstanding-asOf">as of<!-- --> <!-- -->Nov 13, 2026</span>'
        self.assertEqual(parse_ishares_shares(html), ("2026-11-13", 5150000))
        self.assertIsNone(parse_ishares_shares(html.replace("5,150,000", "0")))

    def test_previous_fund_observation_must_be_earlier_not_a_revision(self):
        snapshots = [
            {"report_date": "2026-11-14", "forward_flows": {"foreign_etfs": [{"ticker": "CNYA", "period": "2026-11-13", "shares": 105}]}},
            {"report_date": "2026-11-13", "forward_flows": {"foreign_etfs": [{"ticker": "CNYA", "period": "2026-11-12", "shares": 100}]}},
        ]
        self.assertEqual(prior_fund_observations(snapshots, "2026-11-13")["CNYA"]["shares"], 100)

    def test_conflicting_or_missing_foreign_funds_do_not_create_joint_buy_signal(self):
        domestic = {"etf": {"period": "2026-11-13", "change_pct": 0.8}, "margin": {"period": "2026-11-12", "balance_change_100m_cny": 6}, "southbound": {"period": "2026-11-13", "net_buy_100m_cny": 20}}
        one_fund = [{"ticker": "CNYA", "change_pct": 0.6, "period": "2026-11-13"}]
        self.assertEqual(classify_outlook(domestic, one_fund, "2026-11-14")["joint"], "待确认")
        mixed = one_fund + [{"ticker": "FXI", "change_pct": -0.9, "period": "2026-11-13"}]
        self.assertEqual(classify_outlook(domestic, mixed, "2026-11-14")["foreign"], "分歧")
        self.assertEqual(classify_outlook(domestic, mixed, "2026-11-14")["joint"], "待确认")

    def test_correlated_fresh_evidence_can_support_but_not_predict(self):
        domestic = {"etf": {"period": "2026-11-13", "change_pct": 0.8}, "margin": {"period": "2026-11-12", "balance_change_100m_cny": 6}, "southbound": None}
        funds = [{"ticker": "CNYA", "change_pct": 0.6, "period": "2026-11-13"}, {"ticker": "FXI", "change_pct": 0.4, "period": "2026-11-13"}]
        self.assertEqual(classify_outlook(domestic, funds, "2026-11-14")["joint"], "双向支持")
        self.assertEqual(classify_outlook(domestic, funds, "2026-11-20")["foreign"], "待确认")
        self.assertEqual(classify_outlook(domestic, funds, "2026-11-20")["domestic"], "待确认")
        offshore_only = [{"ticker": "MCHI", "change_pct": 0.6, "period": "2026-11-13"}, {"ticker": "FXI", "change_pct": 0.4, "period": "2026-11-13"}]
        self.assertEqual(classify_outlook(domestic, offshore_only, "2026-11-14")["foreign"], "待确认")


if __name__ == "__main__":
    unittest.main()
