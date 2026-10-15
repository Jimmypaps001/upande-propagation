# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt
"""Every name the Upande Propagation app calls on this app's mobile module.

	bench --site <site> execute \\
		upande_propagation.console.check_mobile_surface.main

The handset ships separately from the server and cannot be made to follow a
refactor, so the names in upande_propagation.mobile.api are a contract. This is
what notices when one is renamed, moved or quietly dropped -- which from the
phone looks like a blank screen and nothing in the log.

It also checks the delegation lines up. A wrapper whose arguments have drifted
from the function behind it fails at call time, on a handset, with a TypeError
nobody is there to read.
"""

import inspect

import frappe

from upande_propagation.mobile import api as mobile

EXPECTED = (
	# the unit
	"propagation_units",
	"unit_overview",
	"batches",
	"batch_detail",
	"scan",
	# logs
	"diseases",
	"disease_log",
	"add_log",
	# the protocol
	"batch_activities",
	"stage_plan",
	# pickers
	"varieties",
	"suppliers",
	"warehouses",
	"next_consignment_code",
	# arrivals
	"consignments",
	"consignment_detail",
	"new_consignment",
	"check_consignment",
	# the work
	"create_batch",
	"move_batches",
	"record_mortality",
	# dispatch
	"dispatch_targets",
	"dispatch_batch",
	# reports
	"reports",
)

# A mobile name and the function it is a face for. Checked argument by argument,
# because two signatures that have drifted apart still import perfectly.
DELEGATES = {
	"varieties": "upande_propagation.operations.varieties",
	"suppliers": "upande_propagation.operations.suppliers",
	"warehouses": "upande_propagation.operations.warehouses",
	"consignments": "upande_propagation.operations.consignments",
	"consignment_detail": "upande_propagation.operations.consignment_detail",
	"new_consignment": "upande_propagation.operations.new_consignment",
	"create_batch": "upande_propagation.operations.create_batch",
	"move_batches": "upande_propagation.operations.move_batches",
	"record_mortality": "upande_propagation.operations.record_mortality",
	"dispatch_targets": "upande_propagation.operations.dispatch_targets",
	"dispatch_batch": "upande_propagation.operations.dispatch_batch",
	"reports": "upande_propagation.operations.reports",
	"batch_activities": "upande_propagation.protocol_rules.batch_activities",
	"stage_plan": "upande_propagation.protocol_rules.stage_plan",
}

PASS, FAIL = [], []


def _ok(label, cond, detail=""):
	(PASS if cond else FAIL).append((label, detail))


def _resolve(dotted):
	module, _dot, name = dotted.rpartition(".")
	return getattr(frappe.get_module(module), name)


def main():
	module_path = "upande_propagation.mobile.api"

	for name in EXPECTED:
		fn = getattr(mobile, name, None)
		if not fn:
			_ok("%s exists" % name, False, "missing from " + module_path)
			continue
		_ok("%s exists" % name, True)
		_ok("%s is whitelisted" % name, fn in frappe.whitelisted,
			"" if fn in frappe.whitelisted else "not reachable over HTTP")

	for name, dotted in DELEGATES.items():
		wrapper = getattr(mobile, name, None)
		if not wrapper:
			continue
		inner = _resolve(dotted)
		wrapped = set(inspect.signature(wrapper).parameters)
		inner_args = set(inspect.signature(inner).parameters)
		extra = wrapped - inner_args
		_ok("%s passes nothing %s will not take" % (name, dotted.rpartition(".")[2]),
			not extra, ", ".join(sorted(extra)))

		# The reverse is not an error -- a mobile call may deliberately not offer
		# every argument -- but one it cannot reach at all is worth naming.
		missing = {
			a for a in inner_args - wrapped
			if inspect.signature(inner).parameters[a].default is inspect.Parameter.empty
		}
		_ok("%s supplies everything %s requires"
			% (name, dotted.rpartition(".")[2]), not missing,
			", ".join(sorted(missing)))

	# The inner operations are reached through the mobile module and nowhere
	# else. Two whitelisted names for one function is two things to keep in step.
	ops = frappe.get_module("upande_propagation.operations")
	for inner_name in ("create_batch", "move_batches", "dispatch_batch",
	                   "new_consignment", "reports"):
		_ok("operations.%s is not exposed twice" % inner_name,
			getattr(ops, inner_name) not in frappe.whitelisted)

	# ------------------------------------------------------- company scoping
	# One phone sits in one unit; a unit is a Warehouse; a Warehouse belongs to
	# one company. Every list the app shows must be inside that company, or an
	# operator is offered something the server will refuse -- which is how
	# PC-2026-42-05 came to be Held against `A1 - KL`, a Kaitet Ltd. warehouse
	# picked by a Kaitet Group unit.
	units = frappe.get_all("Warehouse", filters={"custom_prop_is_unit": 1, "disabled": 0},
	                       fields=["name", "company"])
	_ok("there is a propagation unit to scope by", bool(units), str(len(units)))

	site_wide = frappe.get_all("Warehouse", filters={"is_group": 0, "disabled": 0},
	                           pluck="company")
	_ok("this site really is multi-company (so scoping matters)",
	    len(set(site_wide)) > 1, "%d companies" % len(set(site_wide)))

	for u in units:
		rows = ops.warehouses(unit=u.name, limit=1000)
		got = {r["company"] for r in rows}
		_ok("warehouses for %s are its company only" % u.name,
		    got <= {u.company}, ", ".join(sorted(got - {u.company})) or "clean")
		_ok("warehouses for %s are not the whole site" % u.name,
		    len(rows) < len(site_wide), "%d of %d" % (len(rows), len(site_wide)))

		d = ops.dispatch_targets(unit=u.name)
		fc = {f["company"] for f in d["farms"]}
		gc = {g["company"] for g in d["greenhouses"]}
		_ok("dispatch farms for %s are its company only" % u.name, fc <= {u.company},
		    ", ".join(sorted(fc - {u.company})) or "clean")
		_ok("dispatch greenhouses for %s are its company only" % u.name,
		    gc <= {u.company}, ", ".join(sorted(gc - {u.company})) or "clean")

		seen = {frappe.db.get_value("Plant Consignment", r["name"], "company")
		        for r in ops.consignments(unit=u.name, limit=500)}
		_ok("arrivals for %s are its company only" % u.name, seen <= {u.company},
		    ", ".join(sorted(x for x in seen - {u.company} if x)) or "clean")

	# The company must come from the unit, not from whoever is logged in.
	_ok("company_of prefers the unit over the user default",
	    all(ops.company_of(u.name) == u.company for u in units))

	# And the off-save write path must be guarded, because db_set walks past
	# validate() and validate() does not run again after submit.
	pc = frappe.get_module(
		"upande_propagation.upande_propagation.doctype.plant_consignment.plant_consignment")
	_ok("accept() has a company guard to call", hasattr(pc, "_check_company"))
	held = frappe.get_all("Plant Consignment",
	                      filters={"docstatus": 1}, fields=["name", "company"], limit=1)
	if held:
		doc = frappe.get_doc("Plant Consignment", held[0]["name"])
		wrong = frappe.get_all(
			"Warehouse", filters={"is_group": 0, "disabled": 0,
			                      "company": ["!=", doc.company]}, limit=1)
		if wrong:
			_ok("a wrong-company warehouse is named and refused",
			    bool(doc.warehouse_company_error("rejected_warehouse", wrong[0].name)))
			right = frappe.get_all(
				"Warehouse", filters={"is_group": 0, "disabled": 0,
				                      "company": doc.company}, limit=1)
			if right:
				_ok("a right-company warehouse is allowed",
				    doc.warehouse_company_error("rejected_warehouse", right[0].name) is None)

	for name, detail in PASS:
		print("  ok   %s%s" % (name, (" -- " + detail) if detail else ""))
	for name, detail in FAIL:
		print("  FAIL %s%s" % (name, (" -- " + detail) if detail else ""))
	print("\n%d passed, %d failed" % (len(PASS), len(FAIL)))
	return not FAIL
