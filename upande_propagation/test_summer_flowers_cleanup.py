"""The stale-propagation-plan cleanup never guesses between approved production plans and never writes on a dry run."""

import frappe
from frappe.tests import IntegrationTestCase

from upande_propagation import summer_flowers_cleanup as cleanup


class TestSummerFlowersCleanup(IntegrationTestCase):
	def test_dry_run_changes_nothing_and_partitions_every_plan(self):
		n = frappe.db.count("Summer Flower Propagation Plan")
		if not n:
			self.skipTest("no propagation plans on this site")
		before = frappe.get_all("Summer Flower Propagation Plan", fields=["name", "modified", "production_plan"], order_by="name")
		r = cleanup.rebuild_stale_propagation_plans(apply=False)
		self.assertEqual(before, frappe.get_all("Summer Flower Propagation Plan", fields=["name", "modified", "production_plan"], order_by="name"))
		seen = set(r["stale"]) | set(r["current"]) | set(r["needs_decision"]) | set(r["skipped"])
		self.assertEqual(len(seen), n)
		# an ambiguous plan is always reported for a human, never rebuilt
		for name, v in r["needs_decision"].items():
			self.assertGreater(len(v["approved_plans"]), 1)
			self.assertNotIn(name, r["stale"])

	def test_apply_on_a_clean_site_creates_nothing(self):
		n = frappe.db.count("Summer Flower Propagation Plan")
		cleanup.rebuild_stale_propagation_plans(apply=True)
		self.assertEqual(n, frappe.db.count("Summer Flower Propagation Plan"))
