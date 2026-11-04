# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt

"""Keep ERPNext's bootstrap test data out of this app's tests.

IntegrationTestCase walks every doctype a test's doctype links to and loads that
doctype's test records. ERPNext's records (Price List 'Standard Buying' in INR,
test warehouses with no Farm) clash with the site's own data, so the walk dies
before any test runs. Marking those doctypes as already loaded skips them; the
tests build the few records they need themselves.
"""

import frappe

ERPNEXT_MASTERS = (
	"Item", "Item Group", "Warehouse", "Supplier", "Customer", "Company", "Employee",
	"Price List", "UOM", "Cost Center", "Account", "Location", "Farm", "User",
	"Project", "Sales Invoice", "Purchase Order", "Currency", "Brand", "Territory",
	"Customer Group", "Supplier Group", "Mother Block",
	"Summer Flower Propagation Plan",  # linked by Plant Consignment; lives in an app not installed here
)


def skip_erpnext_test_records(*extra):
	"""Mark every doctype owned by ERPNext/HRMS (plus `extra`) as already loaded."""
	for doctype in ERPNEXT_MASTERS + extra:
		frappe.local.test_objects.setdefault(doctype, [])
	module_app = frappe.local.module_app
	for doctype, module in frappe.get_all("DocType", fields=["name", "module"], as_list=True):
		if module_app.get(frappe.scrub(module)) in ("erpnext", "hrms"):
			frappe.local.test_objects.setdefault(doctype, [])
