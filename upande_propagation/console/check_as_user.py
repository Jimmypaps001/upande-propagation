# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt
"""Every read the handset makes, run as the person holding it.

	bench --site <site> execute \\
		upande_propagation.console.check_as_user.main --kwargs "{'user': 'a@b.com'}"

check_mobile_surface proves the names exist and are whitelisted. This proves
they answer for somebody who is not Administrator, which is a different
question and the one that actually bites: a unit manager has Agriculture User,
not System Manager, and an endpoint that reads a doctype their role cannot see
returns a PermissionError on the handset and a blank screen to them.

Everything here is a read. Nothing is written and nothing is rolled back,
because there is nothing to roll back.
"""

import frappe
from frappe import _

PROP = "upande_propagation.mobile.api"
SF = "upande_summer_flowers.mobile.api"

PASS, FAIL = [], []


def _try(label, dotted, **kwargs):
	try:
		fn = frappe.get_attr(dotted)
		if fn not in frappe.whitelisted:
			FAIL.append((label, "not whitelisted"))
			return None
		out = fn(**kwargs)
		PASS.append((label, _shape(out)))
		return out
	except Exception as e:
		FAIL.append((label, "%s: %s" % (type(e).__name__,
		                               frappe.utils.strip_html_tags(str(e))[:140])))
		return None


def _shape(out):
	if isinstance(out, list):
		return "%d row(s)" % len(out)
	if isinstance(out, dict):
		return ", ".join(sorted(out.keys())[:6])
	return str(out)[:60]


def main(user=None):
	user = user or frappe.db.get_value(
		"Has Role", {"role": "Agriculture User", "parenttype": "User"}, "parent")
	if not user:
		user = "Administrator"
	frappe.set_user(user)
	roles = sorted(frappe.get_roles(user))
	print("as %s" % user)
	print("roles: %s" % ", ".join(roles[:12]))
	print()

	_try("varieties", PROP + ".varieties", limit=3)
	_try("suppliers", PROP + ".suppliers", limit=3)
	_try("warehouses", PROP + ".warehouses", limit=3)
	_try("next_consignment_code", PROP + ".next_consignment_code")
	_try("consignments", PROP + ".consignments", limit=5)
	_try("propagation_units", PROP + ".propagation_units")
	_try("unit_overview", PROP + ".unit_overview")
	_try("dispatch_targets", PROP + ".dispatch_targets")
	_try("reports", PROP + ".reports")
	_try("diseases", PROP + ".diseases")
	_try("disease_log", PROP + ".disease_log", limit=3)

	rows = _try("batches", PROP + ".batches", limit=3) or []
	if rows:
		batch = rows[0]["name"]
		print("  (batch under test: %s)" % batch)
		_try("batch_detail", PROP + ".batch_detail", batch=batch)
		_try("batch_activities", PROP + ".batch_activities", batch=batch)
		_try("stage_plan", PROP + ".stage_plan", batch=batch)
		_try("scan", PROP + ".scan", code=batch)
	else:
		print("  (no batch on this site; batch calls not exercised)")

	cons = _try("consignment list for detail", PROP + ".consignments", limit=1) or []
	if cons:
		_try("consignment_detail", PROP + ".consignment_detail",
		     consignment=cons[0]["name"])
	else:
		print("  (no consignment on this site; consignment_detail not exercised)")

	_try("production_plans", SF + ".production_plans")
	_try("propagation_plans", SF + ".propagation_plans")
	_try("tc_suppliers", SF + ".tc_suppliers")
	_try("open_plant_orders", SF + ".open_plant_orders")
	vs = _try("propagation_varieties", SF + ".propagation_varieties") or []
	if vs:
		print("  (variety under test: %s)" % vs[0]["variety"])
		_try("propagation_schedule", SF + ".propagation_schedule",
		     variety=vs[0]["variety"])
		_try("propagation_detail", SF + ".propagation_detail",
		     variety=vs[0]["variety"])
		_try("protocol_detail", SF + ".protocol_detail", variety=vs[0]["variety"])

	for label, detail in PASS:
		print("  ok   %-30s %s" % (label, detail))
	for label, detail in FAIL:
		print("  FAIL %-30s %s" % (label, detail))
	print("\n%d passed, %d failed" % (len(PASS), len(FAIL)))
	frappe.set_user("Administrator")
	return not FAIL
