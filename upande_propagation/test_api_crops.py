"""Crop filtering: records carry their variety as an Item, Production Variety says which crop it belongs to."""

import unittest

import frappe
from frappe.tests import IntegrationTestCase

from upande_propagation import api
from upande_propagation.mobile import api as mobile
from upande_propagation.tests_support import skip_erpnext_test_records


class TestCropFilter(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		skip_erpnext_test_records()

	def test_no_crop_means_all_crops(self):
		self.assertIsNone(api.crop_items(None))
		self.assertIsNone(api.crop_items(""))

	def test_unknown_crop_matches_nothing_rather_than_everything(self):
		self.assertEqual(api.crop_items("no-such-crop"), [""])
		self.assertEqual(api.get_batches(crop="no-such-crop")["batches"], [])
		self.assertEqual(api.get_overview(crop="no-such-crop")["kpis"]["active_batches"], 0)
		self.assertEqual(api.get_requests(crop="no-such-crop")["requests"], [])
		self.assertEqual(api.get_dispatch_book(crop="no-such-crop")["dispatches"], [])
		self.assertEqual(api.get_nursery_logs(crop="no-such-crop")["logs"], [])
		self.assertEqual(api.get_mother_stock(crop="no-such-crop")["blocks"], [])
		self.assertEqual(api.get_flower_trials(crop="no-such-crop"), [])
		self.assertEqual(api.get_troughs(crop="no-such-crop")["settings"], [])
		self.assertEqual(mobile.consignments(crop="no-such-crop"), [])

	def test_a_crop_maps_to_its_varieties_through_production_variety(self):
		row = frappe.get_all("Production Variety", filters={"item": ["is", "set"], "crop": ["is", "set"]},
		                     fields=["item", "crop"], limit=1)
		if not row:
			raise unittest.SkipTest("no Production Variety on this site")
		key = frappe.db.get_value("Production Crop", row[0].crop, "crop_key")
		self.assertIn(row[0].item, api.crop_items(key))
		# the name works as well as the key
		self.assertIn(row[0].item, api.crop_items(row[0].crop))

	def test_get_crops_lists_each_enabled_crop_with_its_varieties(self):
		out = api.get_crops()["crops"]
		for c in out:
			self.assertTrue({"name", "crop_key", "accent_color", "varieties"} <= set(c))
		keys = frappe.get_all("Production Crop", filters={"enabled": 1}, pluck="crop_key")
		self.assertEqual(sorted(c["crop_key"] for c in out), sorted(keys))

	def test_guest_is_refused(self):
		frappe.set_user("Guest")
		try:
			with self.assertRaises(frappe.PermissionError):
				api.get_crops()
		finally:
			frappe.set_user("Administrator")
