# Copyright (c) 2026, Upande and Contributors
# See license.txt

"""The surface the Upande Propagation app calls for batches.

	bench --site <site> run-tests --module \\
		upande_propagation.mobile.test_api

The app ships separately from the server, so these names are a contract. What
is worth testing here is not that the endpoints return something -- it is the
two things this module works out that nothing else did: how full a unit is, and
when a batch should reach the farm.
"""

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, getdate, today

from upande_propagation.mobile import api


class TestMobileApi(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.company = frappe.get_all("Company", pluck="name", limit=1)[0]
		cls.item = frappe.get_all(
			"Item", filters={"disabled": 0, "is_sales_item": 1, "is_fixed_asset": 0},
			pluck="name", limit=1)[0]
		cls.unit = frappe.get_all(
			"Warehouse", filters={"is_group": 0, "company": cls.company},
			pluck="name", limit=1)[0]

	def setUp(self):
		frappe.db.set_value("Warehouse", self.unit, {
			"custom_prop_is_unit": 1,
			"custom_prop_capacity_plants": 10000,
			"custom_prop_bench_sqm": 500,
		}, update_modified=False)

	def _batch(self, stage="Callusing", started_days_ago=10, actual=2000, stick=False):
		started = add_days(today(), -started_days_ago)
		doc = frappe.get_doc({
			"doctype": "Propagation Batch", "variety": self.item,
			"propagation_method": "Own-root Cutting", "current_stage": stage,
			"start_date": started, "propagation_unit": self.unit,
			"company": self.company,
			"total_cuttings_planned": actual, "total_cuttings_actual": actual,
			"stages": [{"stage": stage, "start_date": started, "qty_entered": actual}],
		})
		doc.flags.ignore_permissions = True
		doc.insert()
		doc.submit()
		if stick:
			# Plants exist once the sticking is LOGGED: the rollup takes
			# `cuttings or stuck or received` off the logs, never off the figure
			# typed on the batch. A batch nobody has logged holds nothing, and the
			# unit view has to agree with the dashboard about that.
			api.add_log(propagation_batch=doc.name, activity_type="Sticking",
			            qty_done_today=actual)
			doc.reload()
		return doc

	# ------------------------------------------------------------------ units
	def test_a_unit_carries_its_own_spec(self):
		names = [u["name"] for u in api.propagation_units()]
		self.assertIn(self.unit, names)
		row = [u for u in api.propagation_units() if u["name"] == self.unit][0]
		self.assertEqual(row["capacity_plants"], 10000)

	def test_utilisation_is_measured_against_capacity(self):
		"""Measured as a delta: the unit holds real batches besides this one."""
		before = api.unit_overview(unit=self.unit)["space"]
		self._batch(actual=2500, stick=True)
		after = api.unit_overview(unit=self.unit)["space"]

		self.assertEqual(after["capacity_plants"], 10000)
		self.assertEqual(after["on_hand"] - before["on_hand"], 2500)
		self.assertEqual(after["free"], 10000 - after["on_hand"])
		self.assertEqual(after["utilisation_pct"],
		                 round(after["on_hand"] * 100.0 / 10000, 1))


	def test_without_a_capacity_there_is_no_utilisation(self):
		"""Not 0%. An empty bar would be read as an empty unit."""
		frappe.db.set_value("Warehouse", self.unit,
		                    "custom_prop_capacity_plants", 0, update_modified=False)
		before = api.unit_overview(unit=self.unit)["space"]["on_hand"]
		self._batch(actual=2500, stick=True)
		space = api.unit_overview(unit=self.unit)["space"]

		self.assertIsNone(space["utilisation_pct"])
		self.assertIsNone(space["free"])
		self.assertEqual(space["on_hand"] - before, 2500)


	def test_the_unit_says_which_varieties_are_on_it(self):
		self._batch(actual=1500, stick=True)
		varieties = api.unit_overview(unit=self.unit)["varieties"]
		self.assertTrue(any(v["variety"] == self.item for v in varieties))

	# -------------------------------------------------------- delivery date
	def test_delivery_counts_from_where_the_batch_is(self):
		"""Callusing 21 days, 10 gone: 11 left, then 28+30+14+7."""
		batch = self._batch(stage="Callusing", started_days_ago=10)
		out = api.batch_detail(batch.name)["expected_delivery"]
		self.assertEqual(out["days_out"], 90)
		self.assertEqual(getdate(out["date"]), getdate(add_days(today(), 90)))

	def test_a_batch_overdue_in_its_stage_says_so(self):
		batch = self._batch(stage="Callusing", started_days_ago=30)
		out = api.batch_detail(batch.name)["expected_delivery"]
		self.assertEqual(out["overdue_in_stage"], 9)
		# Nothing is left of the stage it has overrun, so only what follows counts.
		self.assertEqual(out["days_out"], 79)

	def test_a_batch_ready_for_dispatch_is_due_today(self):
		batch = self._batch(stage="Ready for Dispatch")
		out = api.batch_detail(batch.name)["expected_delivery"]
		self.assertEqual(out["days_out"], 0)

	# -------------------------------------------------------------- scanning
	def test_scanning_a_label_finds_the_batch(self):
		batch = self._batch()
		got = api.scan(batch.name)
		self.assertEqual(got["kind"], "batch")
		self.assertEqual(got["name"], batch.name)

	def test_scanning_a_variety_lists_its_batches(self):
		batch = self._batch()
		got = api.scan(self.item)
		self.assertEqual(got["kind"], "variety")
		self.assertIn(batch.name, [b["name"] for b in got["batches"]])

	def test_an_unreadable_code_is_not_guessed_at(self):
		self.assertEqual(api.scan("NO-SUCH-THING-12345")["kind"], "unknown")

	# ------------------------------------------------------------------ logs
	def test_a_scouting_round_records_what_was_seen(self):
		"""A log with no work done and nothing dead -- which validate_counts
		used to refuse, forcing the finding to be typed in as mortality."""
		batch = self._batch()
		disease = frappe.get_doc({"doctype": "Disease",
								  "common_name": "Test mildew"}).insert()
		api.add_log(propagation_batch=batch.name,
					activity_type="Disease / Scouting", disease=disease.name,
					severity="Medium", affected_qty=240,
					treatment_applied="Copper", observations="West bench")
		rows = api.disease_log(batch=batch.name)
		self.assertEqual(len(rows), 1)
		self.assertEqual(rows[0]["disease"], disease.name)
		self.assertEqual(rows[0]["affected_qty"], 240)

	def test_affected_plants_are_not_counted_as_deaths(self):
		batch = self._batch(actual=2000, stick=True)
		disease = frappe.get_doc({"doctype": "Disease",
								  "common_name": "Test botrytis"}).insert()
		api.add_log(propagation_batch=batch.name,
					activity_type="Disease / Scouting", disease=disease.name,
					severity="High", affected_qty=500)
		batch.reload()
		self.assertEqual(batch.total_mortality, 0)

	def test_a_scouting_round_must_say_which_disease(self):
		batch = self._batch()
		with self.assertRaises(frappe.ValidationError):
			api.add_log(propagation_batch=batch.name,
						activity_type="Disease / Scouting", affected_qty=10)

	def test_a_log_against_no_such_batch_is_refused(self):
		with self.assertRaises(frappe.ValidationError):
			api.add_log(propagation_batch="PB-NOPE-0001",
						activity_type="Nursery Count", qty_done_today=10)

	def test_a_batch_with_no_logs_holds_nothing(self):
		"""The rollup counts what was logged, not what was typed on the batch.

		So a batch nobody has logged adds nothing to the unit, and the dashboard
		says the same -- the two must not disagree about an empty bench.
		"""
		before = api.unit_overview(unit=self.unit)["space"]["on_hand"]
		self._batch(actual=2500, stick=False)
		after = api.unit_overview(unit=self.unit)["space"]["on_hand"]
		self.assertEqual(after - before, 0)
