# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt

from unittest.mock import MagicMock, patch

import frappe
from frappe.tests import IntegrationTestCase

from upande_propagation import api
from upande_propagation.patches.v1_0 import move_agriculture_ownership as own


class TestFlowerTrial(IntegrationTestCase):
	def test_promote_refuses_a_trial_not_approved(self):
		trial = MagicMock(**{"get.return_value": "Continue Trial"})
		with patch.object(frappe, "get_doc", return_value=trial):
			with self.assertRaises(frappe.ValidationError):
				api.promote_trial_to_cycle("T-1", "GH-1", "2030-01-01")

	def test_promote_builds_the_cycle_from_the_trial(self):
		values = {"recommendation": "Approve for Production", "variety_yield": "Item-X", "breeder": "Sup"}
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
