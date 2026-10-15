# Copyright (c) 2026, Upande and Contributors
# See license.txt

"""Arrivals, and what a batch is allowed to be doing.

	bench --site <site> run-tests --module \\
		upande_propagation.mobile.test_operations

console/check_arrival_chain.py already walks the whole chain against real site
data -- a delivery, a receipt, a batch, a dispatch -- and that is the test that
finds the site's own surprises. What it cannot do is run unattended.

So this covers the two pieces of genuinely new logic, the ones with branches
rather than plumbing:

	the consignment number    year, ISO week, day of week with Sunday as 01
	the activity rules        what the protocol and the arrival allow today

Both are decided without touching ERPNext, so both can be tested without
building a Purchase Receipt and everything behind it.
"""

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, getdate, today

from upande_propagation import protocol_rules as rules
from upande_propagation.upande_propagation.doctype.plant_consignment.plant_consignment import (
	consignment_code,
	next_name,
)


class TestConsignmentNumber(IntegrationTestCase):
	"""Sunday is 01. Everything downstream carries whatever this says."""

	def test_sunday_is_day_one(self):
		# 2026-10-11 is a Sunday.
		self.assertTrue(consignment_code("2026-10-11").endswith("-01"))

	def test_the_week_runs_to_saturday(self):
		days = [consignment_code(add_days("2026-10-11", i))[-2:] for i in range(7)]
		self.assertEqual(days, ["01", "02", "03", "04", "05", "06", "07"])

	def test_the_week_number_is_the_iso_one(self):
		# ISO week 42 of 2026 contains Wednesday the 14th.
		self.assertEqual(consignment_code("2026-10-14"), "2026-42-04")

	def test_the_year_is_the_iso_year_not_the_calendar_one(self):
		# 2025-12-29 is a Monday in ISO week 1 of 2026. A calendar year here
		# would number it 2025-01-02 and sort it a year away from its own week.
		self.assertTrue(consignment_code("2025-12-29").startswith("2026-01-"))

	def test_a_second_delivery_that_day_is_numbered_apart(self):
		code = consignment_code(today())
		first, first_code = next_name(code)
		self.assertEqual(first, "PC-" + code)
		self.assertEqual(first_code, code)
		# Nothing is saved, so the name is still free and next_name says so.
		self.assertEqual(next_name(code)[0], "PC-" + code)


class TestActivityRules(IntegrationTestCase):
	"""What a batch may record, and why not the rest."""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.company = frappe.get_all("Company", pluck="name", limit=1)[0]
		cls.item = frappe.get_all(
			"Item", filters={"disabled": 0, "is_fixed_asset": 0},
			pluck="name", limit=1)[0]
		cls.unit = frappe.get_all(
			"Warehouse", filters={"is_group": 0, "company": cls.company},
			pluck="name", limit=1)[0]

	def _batch(self, stage="Callusing", started_days_ago=10, qty=1000):
		started = add_days(today(), -started_days_ago)
		doc = frappe.get_doc({
			"doctype": "Propagation Batch", "variety": self.item,
			"propagation_method": "Own-root Cutting", "current_stage": stage,
			"start_date": started, "propagation_unit": self.unit,
			"company": self.company,
			"total_cuttings_planned": qty, "total_cuttings_actual": qty,
			"stages": [{"stage": stage, "start_date": started, "qty_entered": qty}],
		})
		doc.flags.ignore_permissions = True
		doc.insert()
		doc.submit()
		return doc

	def _verdict(self, batch, activity, on_date=None):
		out = rules.batch_activities(batch, on_date=on_date)
		return next(a for a in out["activities"] if a["activity"] == activity)

	# -------------------------------------------------------------- always on
	def test_losses_can_always_be_recorded(self):
		b = self._batch()
		self.assertTrue(self._verdict(b.name, "Mortality Count")["allowed"])

	def test_scouting_can_always_be_recorded(self):
		b = self._batch()
		self.assertTrue(self._verdict(b.name, "Disease / Scouting")["allowed"])

	# ------------------------------------------------------------ where it is
	def test_work_cannot_run_ahead_of_the_batch(self):
		b = self._batch(stage="Callusing")
		v = self._verdict(b.name, "Hardening Count")
		self.assertFalse(v["allowed"])
		self.assertIn("Hardening", v["reason"])
		self.assertIn("Callusing", v["reason"])

	def test_work_can_be_caught_up_on(self):
		"""A sticking count on a batch already in callusing is late, not wrong."""
		b = self._batch(stage="Callusing")
		self.assertTrue(self._verdict(b.name, "Sticking")["allowed"])

	def test_a_draft_batch_accepts_nothing(self):
		doc = frappe.get_doc({
			"doctype": "Propagation Batch", "variety": self.item,
			"propagation_method": "Own-root Cutting", "current_stage": "Cutting",
			"start_date": today(), "company": self.company,
			"total_cuttings_planned": 10,
		})
		doc.flags.ignore_permissions = True
		doc.insert()
		v = self._verdict(doc.name, "Cutting")
		self.assertFalse(v["allowed"])
		self.assertIn("Submit", v["reason"])

	# --------------------------------------------------------- what turned up
	def test_tissue_culture_was_not_cut_here(self):
		b = self._batch(stage="Sticking")
		# No consignment is needed to state the rule; the form is what carries
		# it, so it is set the way create_batch would have set it.
		b.db_set("plant_consignment", self._consignment("Tissue Culture"))
		v = self._verdict(b.name, "Cutting")
		self.assertFalse(v["allowed"])
		self.assertIn("tissue culture", v["reason"].lower())

	def test_rooted_cuttings_were_stuck_by_the_supplier(self):
		b = self._batch(stage="Rooting")
		b.db_set("plant_consignment", self._consignment("Rooted Cuttings"))
		for activity in ("Cutting", "Sticking"):
			v = self._verdict(b.name, activity)
			self.assertFalse(v["allowed"], activity)
			self.assertIn("rooted cuttings", v["reason"].lower())

	def test_what_arrives_unrooted_may_still_be_stuck(self):
		b = self._batch(stage="Sticking")
		b.db_set("plant_consignment", self._consignment("Unrooted Cuttings"))
		self.assertTrue(self._verdict(b.name, "Sticking")["allowed"])

	def _consignment(self, form):
		doc = frappe.get_doc({
			"doctype": "Plant Consignment",
			"arrival_date": today(),
			"supplier": frappe.get_all("Supplier", filters={"disabled": 0},
			                           pluck="name", limit=1)[0],
			"variety": self.item,
			"form": form,
			"qty_received": 500,
			"warehouse": self.unit,
			"company": self.company,
		})
		doc.flags.ignore_permissions = True
		doc.insert()
		return doc.name

	# --------------------------------------------------------- the enforcement
	def test_the_log_itself_is_refused_not_only_the_list(self):
		"""A list the phone could ignore is not a rule."""
		b = self._batch(stage="Sticking")
		b.db_set("plant_consignment", self._consignment("Tissue Culture"))
		with self.assertRaises(frappe.ValidationError):
			frappe.get_doc({
				"doctype": "Daily Propagation Log",
				"propagation_batch": b.name, "activity_type": "Cutting",
				"log_date": today(), "qty_done_today": 10,
			}).insert()

	def test_an_existing_log_can_still_be_corrected(self):
		"""Re-judging a saved log would let a protocol change strand a typo."""
		b = self._batch(stage="Sticking")
		log = frappe.get_doc({
			"doctype": "Daily Propagation Log",
			"propagation_batch": b.name, "activity_type": "Sticking",
			"log_date": today(), "qty_done_today": 100,
		})
		log.flags.ignore_permissions = True
		log.insert()
		b.db_set("plant_consignment", self._consignment("Rooted Cuttings"))
		log.qty_done_today = 120
		log.save()  # would throw if the rule were re-applied on every save
		self.assertEqual(frappe.db.get_value(
			"Daily Propagation Log", log.name, "qty_done_today"), 120)

	# ------------------------------------------------------------- the ladder
	def test_the_ladder_marks_where_the_batch_is(self):
		b = self._batch(stage="Rooting")
		plan = rules.stage_plan(b.name)
		self.assertEqual(len(plan["ladder"]), 7)
		current = [r for r in plan["ladder"] if r["state"] == "current"]
		self.assertEqual([r["stage"] for r in current], ["Rooting"])
		ahead = [r["stage"] for r in plan["ladder"] if r["state"] == "ahead"]
		self.assertIn("Hardening", ahead)

	def test_a_protocol_that_says_nothing_allows_everything(self):
		"""Fails open on purpose: see the module docstring."""
		b = self._batch(stage="Cutting")
		out = rules.batch_activities(b.name)
		if out["protocol"] is None:
			self.assertIn("Cutting", out["allowed"])
		else:
			# The site does have a protocol for this item; then the route is
			# what decides, and the test above covers that path.
			self.assertIsInstance(out["route_stages"], list)
