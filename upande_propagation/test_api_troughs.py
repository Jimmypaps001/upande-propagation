"""The trough board behind /propagation_app: Free / Occupied / Out of Service, with the summary."""

from unittest import mock

import frappe
from frappe.tests import IntegrationTestCase

from upande_propagation import api
from upande_propagation.tests_support import skip_erpnext_test_records


class TestTroughBoard(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		skip_erpnext_test_records()
		cls.company = frappe.get_all("Company", pluck="name", limit=1)[0]
		cls.unit = frappe.get_all(
			"Warehouse", filters={"is_group": 0, "company": cls.company}, pluck="name", limit=1)[0]
		frappe.db.set_value("Warehouse", cls.unit, "custom_prop_is_unit", 1)

	def _trough(self, name, plants, status="Available"):
		return frappe.get_doc({
			"doctype": "Propagation Trough", "trough_name": name, "propagation_unit": self.unit,
			"company": self.company, "status": status, "is_active": 1, "plants_per_trough": plants,
		}).insert()

	def test_states_and_summary(self):
		free = self._trough("TB-FREE", 1000)
		held = self._trough("TB-HELD", 2000)
		dead = self._trough("TB-OOS", 500, status="Out of Service")
		setting = frappe._dict(
			name="TS-X", trough=held.name, variety="V", form="Roots", set_date="2026-11-01",
			plants=1800, plants_remaining=1500, freed_on="2026-12-01", propagation_batch=None)
		with mock.patch("upande_propagation.troughs.settings_holding", return_value={held.name: setting}):
			out = api.get_troughs(company=self.company)
		by_name = {t["name"]: t for t in out["troughs"]}
		self.assertEqual(by_name[free.name]["state"], "Free")
		self.assertEqual(by_name[held.name]["state"], "Occupied")
		self.assertEqual(by_name[held.name]["plants"], 1500)
		self.assertEqual(by_name[held.name]["fill_pct"], 75.0)
		self.assertEqual(by_name[dead.name]["state"], "Out of Service")
		self.assertGreaterEqual(out["summary"]["free"], 1)
		self.assertGreaterEqual(out["summary"]["occupied"], 1)
		self.assertGreaterEqual(out["summary"]["out_of_service"], 1)
		self.assertEqual(out["summary"]["troughs"], len(out["troughs"]))

	def test_guest_is_refused(self):
		frappe.set_user("Guest")
		try:
			with self.assertRaises(frappe.PermissionError):
				api.get_troughs()
		finally:
			frappe.set_user("Administrator")
