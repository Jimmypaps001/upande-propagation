"""The plan pages' read models, the ownership patch for the adopted doctypes, and the shared bridge."""

import frappe
from frappe.tests import IntegrationTestCase

from upande_propagation import plans_api, shared
from upande_propagation.patches.v1_0 import adopt_summer_flowers_propagation as adopt
from upande_propagation.tests_support import skip_erpnext_test_records


class TestPlansApi(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		skip_erpnext_test_records()
		super().setUpClass()

	def test_plans_total_what_the_rows_say(self):
		out = plans_api.get_propagation_plans()
		self.assertEqual(
			out["totals"]["total_plants_to_stick"], sum(r.total_plants_to_stick or 0 for r in out["plans"]))
		self.assertEqual(sum(s["plans"] for s in out["by_status"]), len(out["plans"]))

	def test_an_unknown_crop_shows_nothing(self):
		self.assertEqual(plans_api.get_propagation_plans(crop="no-such-crop")["plans"], [])
		self.assertEqual(plans_api.get_motherstock(crop="no-such-crop")["plans"], [])
		self.assertEqual(plans_api.get_plan_actuals(crop="no-such-crop")["actuals"], [])
		self.assertEqual(plans_api.get_plant_receipts(crop="no-such-crop")["lines"], [])

	def test_a_plan_opens_with_its_child_tables(self):
		names = frappe.get_all("Summer Flower Propagation Plan", pluck="name", limit=1)
		if not names:
			self.skipTest("no propagation plan on this site")
		out = plans_api.get_propagation_plan(names[0])
		self.assertEqual(out["plan"]["name"], names[0])
		self.assertIn("weeks", out)
		self.assertEqual(
			len(out["weeks"]), frappe.db.count("Summer Flower Propagation Week", {"parent": names[0]}))

	def test_a_motherstock_plan_opens(self):
		names = frappe.get_all("Summer Flower Motherstock Plan", pluck="name", limit=1)
		if not names:
			self.skipTest("no motherstock plan on this site")
		out = plans_api.get_motherstock_plan(names[0])
		self.assertEqual(len(out["schedule"]), frappe.db.count("Summer Flower Motherstock Week", {"parent": names[0]}))

	def test_guest_is_refused(self):
		frappe.set_user("Guest")
		try:
			for fn in (plans_api.get_propagation_plans, plans_api.get_motherstock, plans_api.get_plan_actuals,
			           plans_api.get_plant_receipts):
				with self.assertRaises(frappe.PermissionError):
					fn()
		finally:
			frappe.set_user("Administrator")


class TestAdoptionPatch(IntegrationTestCase):
	def test_it_flips_module_and_custom_without_touching_the_rows(self):
		name = "Summer Flower Propagation Plan"
		count = frappe.db.count(name)
		frappe.db.set_value("DocType", name, {"module": adopt.OLD_MODULE, "custom": 1}, update_modified=False)
		adopt.execute()
		self.assertEqual(frappe.db.get_value("DocType", name, ["module", "custom"]), (adopt.MODULE, 0))
		self.assertEqual(frappe.db.count(name), count)
		adopt.execute()  # idempotent
		self.assertEqual(frappe.db.get_value("DocType", name, "module"), adopt.MODULE)

	def test_another_apps_doctype_is_left_alone(self):
		name = "Summer Flower Propagation Plan"
		frappe.db.set_value("DocType", name, "module", "Upande Production", update_modified=False)
		adopt.execute()
		self.assertEqual(frappe.db.get_value("DocType", name, "module"), "Upande Production")

	def test_every_doctype_it_lists_is_defined_by_this_app(self):
		import os

		root = frappe.get_app_path("upande_propagation", "upande_propagation", "doctype")
		for dt in adopt.DOCTYPES:
			self.assertTrue(os.path.exists(os.path.join(root, frappe.scrub(dt), frappe.scrub(dt) + ".json")), dt)


class TestSharedBridge(IntegrationTestCase):
	def test_a_missing_piece_names_itself_instead_of_breaking_the_import(self):
		lazy = shared.module("no_such_summer_flowers_piece")
		with self.assertRaises(ImportError) as ctx:
			lazy.anything  # noqa: B018
		self.assertIn("no_such_summer_flowers_piece", str(ctx.exception))

	def test_nothing_is_imported_until_it_is_used(self):
		shared.module("no_such_summer_flowers_piece")
		shared.func("no_such_summer_flowers_piece", "f")  # no error: lazy
