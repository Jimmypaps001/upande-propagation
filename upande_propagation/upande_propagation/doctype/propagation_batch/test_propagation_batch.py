# Copyright (c) 2026, Upande and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, getdate, today

from upande_propagation.upande_propagation.doctype.propagation_batch.propagation_batch import (
	advance_stage,
	complete_batch,
)


class TestPropagationBatch(IntegrationTestCase):
	"""End to end: mother block -> cuttings -> request -> batch -> logs -> dispatch."""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.company = frappe.get_all("Company", pluck="name", limit=1)[0]
		# A sellable, non-asset item: the sale tests raise a Sales Invoice for it.
		cls.item = frappe.get_all(
			"Item",
			filters={"disabled": 0, "is_sales_item": 1, "is_fixed_asset": 0},
			pluck="name",
			limit=1,
		)[0]
		cls.warehouse = frappe.get_all("Warehouse", filters={"is_group": 0}, pluck="name", limit=1)[0]

	# ------------------------------------------------------------------ helpers

	def make_mother_block(self, status="Active"):
		return frappe.get_doc(
			{
				"doctype": "Mother Block",
				"block_name": "Test Block " + frappe.generate_hash(length=8),
				"variety": self.item,
				"status": status,
				"plant_count": 5000,
			}
		).insert()

	def make_request(self, qty=800):
		request = frappe.get_doc(
			{
				"doctype": "Seedling Request",
				"requested_by": "Administrator",
				"request_date": today(),
				"required_by_date": add_days(today(), 120),
				"company": self.company,
				"items": [
					{
						"variety": self.item,
						"qty_requested": qty,
						"propagation_method": "Own-root Cutting",
						"target_greenhouse": self.warehouse,
					}
				],
			}
		).insert()
		request.submit()
		return request

	def make_batch(self, request=None, block=None, planned=1000, submit=True, **kwargs):
		batch = frappe.get_doc(
			{
				"doctype": "Propagation Batch",
				"start_date": today(),
				"variety": self.item,
				"propagation_method": "Own-root Cutting",
				"total_cuttings_planned": planned,
				"company": self.company,
				"propagation_unit": self.warehouse,
				"mother_block": block.name if block else None,
				"seedling_request": request.name if request else None,
				**kwargs,
			}
		).insert()
		if submit:
			batch.submit()
			batch.reload()
		return batch

	def log(self, batch, activity, qty, mortality=0, day_offset=0):
		return frappe.get_doc(
			{
				"doctype": "Daily Propagation Log",
				"log_date": add_days(today(), day_offset),
				"propagation_batch": batch.name,
				"activity_type": activity,
				"qty_done_today": qty,
				"mortality_today": mortality,
			}
		).insert()

	def dispatch(self, batch, qty, request=None, submit=True, **kwargs):
		values = {
			"doctype": "Seedling Dispatch",
			"dispatch_date": today(),
			"purpose": "Internal Planting",
			"propagation_batch": batch.name,
			"seedling_request": request.name if request else None,
			"qty_dispatched": qty,
			"target_greenhouse": self.warehouse,
			"company": self.company,
		}
		values.update(kwargs)
		doc = frappe.get_doc(values).insert()
		if submit:
			doc.submit()
		return doc

	def take_to_hardening(self, batch):
		self.log(batch, "Cutting", 1000)
		self.log(batch, "Sticking", 980, mortality=20)
		self.log(batch, "Hardening Count", 950, mortality=30)
		batch.reload()
		return batch

	# -------------------------------------------------------------------- tests

	def test_naming_is_a_per_week_sequence(self):
		batch = self.make_batch(submit=False)
		iso_year, iso_week, _weekday = getdate(today()).isocalendar()

		self.assertEqual(batch.iso_week, iso_week)
		self.assertEqual(batch.iso_year, iso_year)
		self.assertTrue(batch.name.startswith(f"PB-{iso_year}-W{iso_week:02d}-"))
		self.assertNotIn("/", batch.name)

	def test_batch_title_is_interpolated(self):
		batch = self.make_batch(submit=False)
		self.assertNotIn("{", batch.batch_title)
		self.assertIn(str(batch.iso_week), batch.batch_title)

	def test_grafting_requires_a_rootstock(self):
		with self.assertRaises(frappe.ValidationError):
			self.make_batch(submit=False, propagation_method="Grafting (T-bud)")

	def test_budwood_stamps_time_and_rolls_up_to_the_mother_block(self):
		block = self.make_mother_block()
		harvest = frappe.get_doc(
			{
				"doctype": "Budwood Harvest",
				"mother_block": block.name,
				"item": self.item,
				"number_of_stems": 1200,
			}
		).insert()
		harvest.submit()
		block.reload()

		self.assertTrue(harvest.harvest_datetime)
		self.assertEqual(block.total_cuttings_taken, 1200)
		self.assertEqual(getdate(block.last_cutting_date), getdate(today()))

		harvest.cancel()
		block.reload()
		self.assertEqual(block.total_cuttings_taken, 0)

	def test_retired_block_cannot_be_harvested(self):
		block = self.make_mother_block(status="Retired")
		with self.assertRaises(frappe.ValidationError):
			frappe.get_doc(
				{
					"doctype": "Budwood Harvest",
					"mother_block": block.name,
					"item": self.item,
					"number_of_stems": 10,
				}
			).insert()

	def test_cuttings_are_booked_into_the_batch(self):
		block = self.make_mother_block()
		batch = self.make_batch(block=block)

		harvest = frappe.get_doc(
			{
				"doctype": "Budwood Harvest",
				"mother_block": block.name,
				"item": self.item,
				"number_of_stems": 1200,
				"propagation_batch": batch.name,
			}
		).insert()
		harvest.submit()

		batch.reload()
		self.assertEqual(batch.total_cuttings_received, 1200)

	def test_request_status_follows_the_pipeline(self):
		request = self.make_request(qty=800)
		self.assertEqual(request.status, "Submitted")
		self.assertEqual(request.total_qty_requested, 800)
		self.assertEqual(request.items[0].qty_pending, 800)

		batch = self.make_batch(request=request)
		request.reload()
		self.assertEqual(request.status, "In Progress")

		self.take_to_hardening(batch)
		self.dispatch(batch, 700, request=request)
		request.reload()
		self.assertEqual(request.status, "Partially Fulfilled")
		self.assertEqual(request.items[0].qty_dispatched, 700)
		self.assertEqual(request.items[0].qty_pending, 100)
		self.assertEqual(request.fulfilment_percentage, 87.5)

		last = self.dispatch(batch, 100, request=request)
		request.reload()
		self.assertEqual(request.status, "Fulfilled")

		last.cancel()
		request.reload()
		self.assertEqual(request.status, "Partially Fulfilled")

	def test_zero_quantity_request_row_is_refused(self):
		with self.assertRaises(frappe.ValidationError):
			frappe.get_doc(
				{
					"doctype": "Seedling Request",
					"requested_by": "Administrator",
					"request_date": today(),
					"required_by_date": add_days(today(), 30),
					"company": self.company,
					"items": [{"variety": self.item, "qty_requested": 0}],
				}
			).insert()

	def test_logs_roll_up_and_advance_the_stage(self):
		batch = self.make_batch()
		self.assertEqual(len(batch.stages), 1)
		self.assertEqual(batch.stages[0].stage, "Cutting")

		log = self.log(batch, "Cutting", 1000)
		batch.reload()
		log.reload()
		self.assertEqual(batch.total_cuttings_actual, 1000)
		self.assertEqual(batch.total_survived, 1000)
		self.assertEqual(batch.success_rate, 100.0)
		self.assertEqual(log.cumulative_qty, 1000)
		self.assertEqual(log.surviving_qty, 1000)

		self.log(batch, "Sticking", 980, mortality=20)
		batch.reload()
		self.assertEqual(batch.current_stage, "Sticking")
		self.assertEqual(batch.total_mortality, 20)
		self.assertEqual(batch.total_survived, 980)

		self.log(batch, "Germination Count", 950, mortality=30)
		batch.reload()
		self.assertEqual(batch.current_stage, "Rooting")
		self.assertEqual(batch.total_survived, 950)
		self.assertEqual(batch.available_to_dispatch, 950)

		# every closed stage carries an end date and an exit count
		closed = [row for row in batch.stages if row.end_date]
		self.assertEqual(len(closed), 2)
		self.assertTrue(all(row.qty_exited for row in closed))

	def test_log_survivors_reconcile_with_the_batch(self):
		"""The last log's surviving_qty must equal the batch's total_survived.

		Counting every activity type would tally the same seedlings repeatedly.
		"""
		batch = self.make_batch()
		self.log(batch, "Cutting", 1400)
		self.log(batch, "Sticking", 1350, mortality=50)
		self.log(batch, "Germination Count", 1300, mortality=50)
		batch.reload()

		logs = frappe.get_all(
			"Daily Propagation Log",
			filters={"propagation_batch": batch.name},
			fields=["surviving_qty", "cumulative_qty", "activity_type"],
			order_by="log_date asc, creation asc",
		)
		self.assertEqual(logs[-1].surviving_qty, batch.total_survived)
		self.assertEqual(logs[-1].surviving_qty, 1300)
		# cumulative stays per activity
		self.assertEqual(logs[-1].cumulative_qty, 1300)

	def test_overview_api_matches_the_documents(self):
		from upande_propagation.api import get_overview

		batch = self.make_batch()
		self.take_to_hardening(batch)

		overview = get_overview()
		names = [row["name"] for row in overview["batches"]]
		self.assertIn(batch.name, names)
		self.assertGreaterEqual(overview["kpis"]["in_nursery"], batch.total_survived)
		self.assertEqual(overview["funnel"][0]["label"], "Planned")
		self.assertEqual(len(overview["pipeline"]), 7)
		hardening = next(row for row in overview["pipeline"] if row["stage"] == "Hardening")
		self.assertGreaterEqual(hardening["seedlings"], batch.total_survived)

	def test_batch_detail_api_returns_the_whole_chain(self):
		from upande_propagation.api import get_batch_detail

		request = self.make_request(qty=800)
		block = self.make_mother_block()
		batch = self.make_batch(request=request, block=block)
		self.take_to_hardening(batch)
		self.dispatch(batch, 700, request=request)

		detail = get_batch_detail(batch.name)
		self.assertEqual(detail["batch"].name, batch.name)
		self.assertEqual(detail["mother_block"].name, block.name)
		self.assertEqual(detail["request"].name, request.name)
		self.assertEqual(len(detail["logs"]), 3)
		self.assertEqual(len(detail["dispatches"]), 1)
		self.assertTrue(detail["stages"])
		self.assertEqual(len(detail["funnel"]), 6)

	def test_dashboard_endpoints_return_their_rollups(self):
		from upande_propagation import api

		request = self.make_request(qty=800)
		block = self.make_mother_block()
		batch = self.make_batch(request=request, block=block)
		self.take_to_hardening(batch)
		self.dispatch(batch, 700, request=request)

		batches = api.get_batches()
		self.assertIn(batch.name, [row["name"] for row in batches["batches"]])
		self.assertEqual(len(batches["funnel"]), 6)
		self.assertEqual(len(batches["pipeline"]), 7)

		logs = api.get_nursery_logs()
		self.assertTrue(logs["by_activity"])
		self.assertTrue(logs["by_day"])
		self.assertIn(batch.name, [row["propagation_batch"] for row in logs["by_batch"]])

		book = api.get_dispatch_book()
		purposes = {row["purpose"]: row for row in book["by_purpose"]}
		self.assertIn("Internal Planting", purposes)
		self.assertGreaterEqual(purposes["Internal Planting"]["qty"], 700)

		stock = api.get_mother_stock()
		self.assertIn(block.name, [row["name"] for row in stock["blocks"]])

		open_requests = api.get_requests()
		self.assertIn(request.name, [row["name"] for row in open_requests["requests"]])

	def test_dashboard_web_page_is_published(self):
		route = frappe.db.get_value("Web Page", {"route": "propagation-dashboard"}, "name")
		if not route:
			self.skipTest("dashboard page patch has not run on this site")

		page = frappe.get_doc("Web Page", route)
		self.assertTrue(page.published)
		self.assertEqual(page.content_type, "HTML")
		self.assertIn('class="aph"', page.main_section_html)
		self.assertIn("upande_propagation.api.", page.main_section_html)

	def test_portal_pages_render(self):
		from frappe.website.serve import get_response_content
		from werkzeug.test import EnvironBuilder
		from werkzeug.wrappers import Request

		batch = self.make_batch()
		self.take_to_hardening(batch)

		previous_request = getattr(frappe.local, "request", None)
		try:
			for path in ("propagation", f"propagation/batch/{batch.name}"):
				# dynamic route rules are only evaluated against a real environ
				frappe.local.request = Request(EnvironBuilder(path="/" + path).get_environ())
				frappe.local.form_dict = frappe._dict()
				html = get_response_content(path)

				self.assertNotIn("Page not found", html)
				self.assertIn(batch.name, html)
		finally:
			frappe.local.request = previous_request

	def test_traceability_report_walks_the_whole_chain(self):
		from frappe.desk.query_report import run

		request = self.make_request(qty=800)
		batch = self.make_batch(request=request, block=self.make_mother_block())
		self.take_to_hardening(batch)
		self.dispatch(batch, 700, request=request)

		result = run(
			"Propagation Traceability",
			filters={"propagation_batch": batch.name},
			ignore_prepared_report=True,
		)
		steps = " | ".join(row.get("step", "") for row in result["result"])

		for expected in (
			"Batch",
			"Mother block",
			"Seedling request",
			"Stage",
			"Log",
			"Dispatch",
			"Net position",
		):
			self.assertIn(expected, steps)

	def test_editing_and_deleting_a_log_re_derives_totals(self):
		batch = self.make_batch()
		first = self.log(batch, "Cutting", 1000)
		self.log(batch, "Sticking", 980, mortality=20)

		first.qty_done_today = 900
		first.save()
		batch.reload()
		self.assertEqual(batch.total_cuttings_actual, 900)

		first.delete()
		batch.reload()
		self.assertEqual(batch.total_cuttings_actual, 980)

	def test_empty_and_future_logs_are_refused(self):
		batch = self.make_batch()
		with self.assertRaises(frappe.ValidationError):
			self.log(batch, "Cutting", 0, 0)
		with self.assertRaises(frappe.ValidationError):
			self.log(batch, "Cutting", 10, day_offset=3)

	def test_dispatch_needs_a_hardened_batch_and_respects_availability(self):
		batch = self.make_batch()
		self.log(batch, "Cutting", 1000)
		batch.reload()

		# still at Cutting: too early to send seedlings out
		with self.assertRaises(frappe.ValidationError):
			self.dispatch(batch, 10, submit=False)

		self.take_to_hardening(batch)
		self.assertEqual(batch.current_stage, "Hardening")
		self.assertEqual(batch.available_to_dispatch, 950)

		with self.assertRaises(frappe.ValidationError):
			self.dispatch(batch, 5000, submit=False)

		doc = self.dispatch(batch, 700)
		batch.reload()
		self.assertEqual(batch.total_dispatched, 700)
		self.assertEqual(batch.available_to_dispatch, 250)

		doc.cancel()
		batch.reload()
		self.assertEqual(batch.total_dispatched, 0)
		self.assertEqual(batch.available_to_dispatch, 950)

	def test_internal_dispatch_needs_a_destination(self):
		batch = self.make_batch()
		self.take_to_hardening(batch)

		with self.assertRaises(frappe.ValidationError):
			self.dispatch(batch, 10, submit=False, target_greenhouse=None, target_crop_cycle=None)

	def test_sale_needs_a_customer_and_a_rate(self):
		batch = self.make_batch()
		self.take_to_hardening(batch)

		with self.assertRaises(frappe.ValidationError):
			self.dispatch(batch, 10, submit=False, purpose="Sale", selling_rate=45)

	def test_sale_does_not_fulfil_the_farm_request(self):
		customer = frappe.get_all("Customer", filters={"disabled": 0}, pluck="name", limit=1)
		if not customer:
			self.skipTest("no Customer on this site")

		request = self.make_request(qty=800)
		batch = self.make_batch(request=request)
		self.take_to_hardening(batch)

		sale = self.dispatch(
			batch,
			300,
			purpose="Sale",
			customer=customer[0],
			selling_rate=45,
			target_greenhouse=None,
		)
		request.reload()
		batch.reload()

		# the seedlings left the batch, but the farm's own request is untouched
		self.assertIsNone(sale.seedling_request)
		self.assertIsNone(sale.target_crop_cycle)
		self.assertEqual(sale.amount, 13500)
		self.assertEqual(batch.total_dispatched, 300)
		self.assertEqual(request.total_qty_dispatched, 0)
		self.assertEqual(request.status, "In Progress")

	def test_sale_can_be_invoiced_once(self):
		from upande_propagation.upande_propagation.doctype.seedling_dispatch.seedling_dispatch import (
			make_sales_invoice,
		)

		customer = frappe.get_all("Customer", filters={"disabled": 0}, pluck="name", limit=1)
		if not customer:
			self.skipTest("no Customer on this site")

		batch = self.make_batch()
		self.take_to_hardening(batch)
		sale = self.dispatch(
			batch, 300, purpose="Sale", customer=customer[0], selling_rate=45, target_greenhouse=None
		)

		invoice_name = make_sales_invoice(sale.name)
		invoice = frappe.get_doc("Sales Invoice", invoice_name)
		sale.reload()

		self.assertEqual(sale.sales_invoice, invoice_name)
		self.assertEqual(invoice.docstatus, 0)
		self.assertEqual(invoice.customer, customer[0])
		self.assertEqual(invoice.items[0].item_code, self.item)
		self.assertEqual(invoice.items[0].qty, 300)
		self.assertEqual(invoice.grand_total, 13500)

		# a second attempt must not raise a duplicate invoice
		with self.assertRaises(frappe.ValidationError):
			make_sales_invoice(sale.name)

	def test_internal_dispatch_cannot_be_invoiced(self):
		from upande_propagation.upande_propagation.doctype.seedling_dispatch.seedling_dispatch import (
			make_sales_invoice,
		)

		batch = self.make_batch()
		self.take_to_hardening(batch)
		internal = self.dispatch(batch, 100)

		with self.assertRaises(frappe.ValidationError):
			make_sales_invoice(internal.name)

	def test_costing_is_derived(self):
		batch = self.make_batch(material_cost=4000, royalty_cost=1500, labour_cost=2500)
		self.log(batch, "Cutting", 1000, mortality=50)
		batch.reload()

		self.assertEqual(batch.total_cost, 8000)
		self.assertEqual(batch.total_survived, 950)
		self.assertEqual(batch.cost_per_surviving_seedling, 8.42)

	def test_stage_durations_come_from_settings(self):
		expected = frappe.db.get_value(
			"Propagation Stage Duration",
			{"parent": "Propagation Settings", "stage": "Cutting"},
			"expected_days",
		)
		if not expected:
			self.skipTest("Propagation Settings has no stage durations configured")

		batch = self.make_batch()
		self.assertEqual(batch.stages[0].expected_days, expected)

	def test_completion_closes_the_batch(self):
		batch = self.make_batch()
		self.take_to_hardening(batch)

		advance_stage(batch.name)
		batch.reload()
		self.assertEqual(batch.current_stage, "Ready for Dispatch")

		complete_batch(batch.name)
		batch.reload()
		self.assertEqual(batch.current_stage, "Completed")
		self.assertTrue(all(row.end_date for row in batch.stages))

		with self.assertRaises(frappe.ValidationError):
			self.log(batch, "Nursery Count", 10)

	def test_batch_with_logs_cannot_be_cancelled(self):
		batch = self.make_batch()
		self.log(batch, "Cutting", 100)

		with self.assertRaises(frappe.ValidationError):
			frappe.get_doc("Propagation Batch", batch.name).cancel()

		# the guard runs before the docstatus is written
		self.assertEqual(frappe.db.get_value("Propagation Batch", batch.name, "docstatus"), 1)
