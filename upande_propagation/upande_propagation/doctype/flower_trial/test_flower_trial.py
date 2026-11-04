# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt

from unittest.mock import MagicMock, patch

import frappe
from frappe.tests import IntegrationTestCase

from upande_propagation.tests_support import skip_erpnext_test_records

from upande_propagation import api
from upande_propagation.patches.v1_0 import move_agriculture_ownership as own



class TestFlowerTrial(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		skip_erpnext_test_records()
		super().setUpClass()

	def test_promote_refuses_a_trial_not_approved(self):
		trial = MagicMock(**{"get.return_value": "Continue Trial"})
		with patch.object(frappe, "get_doc", return_value=trial):
			with self.assertRaises(frappe.ValidationError):
				api.promote_trial_to_cycle("T-1", "GH-1", "2030-01-01")

	def test_promote_refuses_a_trial_with_no_variety(self):
		values = {"recommendation": "Approve for Production"}
		trial = MagicMock(**{"get.side_effect": lambda k, d=None: values.get(k, d)})
		with patch.object(frappe, "get_doc", return_value=trial):
			with self.assertRaises(frappe.ValidationError):
				api.promote_trial_to_cycle("T-1", "GH-1", "2030-01-01")

	def test_promote_builds_the_cycle_from_the_trial(self):
		values = {"recommendation": "Approve for Production", "breeder": "Sup",
			"bed_range": [{"variety": "Item-X"}]}
		trial = MagicMock(**{"get.side_effect": lambda k, d=None: values.get(k, d)})
		made = {}

		def fake_get_doc(arg, *a):
			if isinstance(arg, dict):
				made.update(arg)
				return MagicMock(**{"insert.return_value": frappe._dict(name="CC-1")})
			return trial

		with patch.object(frappe, "get_doc", side_effect=fake_get_doc), \
			patch.object(frappe.db, "get_value", return_value="PROTO-1"):
			out = api.promote_trial_to_cycle("T-1", "GH-1", "2030-01-01")
		self.assertEqual(out, {"crop_cycle": "CC-1", "greenhouse": "GH-1"})
		self.assertEqual(made["doctype"], "Crop Cycle")
		self.assertEqual(made["variety"], "Item-X")
		self.assertEqual(made["crop_protocol"], "PROTO-1")
		self.assertEqual(made["notes"], "From Flower Trial T-1")

	def test_ownership_patch_moves_only_matching_rows(self):
		modules = {
			"Flower Trial": "Upande Agriculture",
			"Crop Type": "Upande Propagation",
			"Agriculture Settings": "Upande Propagation",
			"FT Harvest Grade": "Somewhere Else",
		}
		sets = []
		with patch.object(frappe.db, "get_value", side_effect=lambda dt, n, f: modules.get(n)), \
			patch.object(frappe.db, "set_value", side_effect=lambda dt, n, f, v, **k: sets.append((n, v))), \
			patch.object(frappe.db, "exists", return_value=True):
			own.execute()
		self.assertEqual(
			sorted(sets),
			[("Agriculture Settings", "Crop Production"), ("Crop Type", "Crop Production"),
			 ("Flower Trial", "Upande Propagation")],
		)

	def test_ownership_patch_waits_for_the_production_module(self):
		modules = {"Crop Type": "Upande Propagation"}
		sets = []
		with patch.object(frappe.db, "get_value", side_effect=lambda dt, n, f: modules.get(n)), \
			patch.object(frappe.db, "set_value", side_effect=lambda *a, **k: sets.append(a)), \
			patch.object(frappe.db, "exists", return_value=False):
			own.execute()
		self.assertEqual(sets, [])

	def test_ownership_patch_is_a_noop_on_a_fresh_site(self):
		with patch.object(frappe.db, "get_value", return_value=None), \
			patch.object(frappe.db, "set_value") as sv, \
			patch.object(frappe.db, "exists", return_value=True):
			own.execute()
		sv.assert_not_called()


class TestPromoteTrialAgainstCropCycle(IntegrationTestCase):
	"""The real thing: promoting a trial leaves a Crop Cycle row in production's doctype."""

	@classmethod
	def setUpClass(cls):
		skip_erpnext_test_records()
		super().setUpClass()

	def test_promote_creates_a_crop_cycle(self):
		from upande_production.tests import default_uom, make_warehouse

		greenhouse = make_warehouse("PROP TRIAL GH 1")
		item = "PROP-TRIAL-VARIETY"
		if not frappe.db.exists("Item", item):
			frappe.get_doc({
				"doctype": "Item", "item_code": item, "item_name": item,
				"item_group": "All Item Groups", "stock_uom": default_uom(),
			}).insert(ignore_permissions=True, ignore_mandatory=True)
		protocol = frappe.get_doc({
			"doctype": "Crop Protocol", "protocol_name": "PROP-TRIAL-PROTO", "variety_item": item,
			"weeks_to_first_bending": 5, "weeks_to_second_bending": 5, "weeks_between_cuts": 7,
			"stems_per_plant_first_harvest": 0.7, "stems_per_cut": 1.5,
			"max_stems_per_plant_per_cut": 1.61, "productive_life_weeks": 260,
		}).insert(ignore_permissions=True, ignore_mandatory=True)
		trial = frappe.get_doc({
			"doctype": "Flower Trial", "trial_name": "PROP-TRIAL-1", "greenhouse": greenhouse,
			"recommendation": "Approve for Production",
			"bed_range": [{"variety": item, "from_bed": 1, "to_bed": 10, "bed_length": 30, "bed_width": 1}],
		}).insert(ignore_permissions=True, ignore_mandatory=True)

		out = api.promote_trial_to_cycle(trial.name, greenhouse, "2030-01-01")

		cycle = frappe.get_doc("Crop Cycle", out["crop_cycle"])
		self.assertEqual(cycle.greenhouse, greenhouse)
		self.assertEqual(cycle.variety, item)
		self.assertEqual(cycle.crop_protocol, protocol.name)
		self.assertEqual(cycle.status, "Active")
		self.assertIn("PROP-TRIAL-1", cycle.notes)
