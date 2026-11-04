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
	for doctype in ERPNEXT_MASTERS + extra + tuple(_module_less_doctypes()):
		frappe.local.test_objects.setdefault(doctype, [])
	tolerate_unadopted_modules()
	avoid_name_clashes()
	module_app = frappe.local.module_app
	for doctype, module in frappe.get_all("DocType", fields=["name", "module"], as_list=True):
		if module_app.get(frappe.scrub(module)) in ("erpnext", "hrms"):
			frappe.local.test_objects.setdefault(doctype, [])


def _module_less_doctypes():
	"""DocTypes whose module has no Module Def or one no installed app owns (the Summer Flowers mirror doctypes not yet adopted)."""
	known = frappe.local.module_app
	return [d for d, m in frappe.get_all("DocType", fields=["name", "module"], as_list=True) if frappe.scrub(m) not in known]


def tolerate_unadopted_modules():
	"""Let the test-record walk step over doctypes whose module has no Module Def.

	On a site holding the Summer Flowers mirror, doctypes the other apps have not adopted yet still say
	module "Summer Flowers", which nothing defines, and the walk through a doctype's links dies on the first
	one it meets. They need no test records of ours, so they are treated as having no test module.
	"""
	from frappe.tests.utils import generators

	original = generators.get_modules
	if getattr(original, "_tolerant", False):
		return

	def get_modules(doctype):
		try:
			return original(doctype)
		except frappe.DoesNotExistError:
			return frappe.db.get_value("DocType", doctype, "module"), None

	get_modules._tolerant = True
	generators.get_modules = get_modules


def avoid_name_clashes():
	"""Move the naming series past the records a live site already holds.

	A site that carries real data has records named DPL-2026-00001 and so on, while the tests start a series
	from a counter that knows nothing of them, and every insert collides. This reads the highest number in use
	under each series of this app's doctypes and counts the series up to it (inside the test's transaction, so
	it is rolled back with it).
	"""
	import re

	from frappe.model.naming import make_autoname

	for doctype in frappe.get_all("DocType", filters={"module": "Upande Propagation", "istable": 0, "issingle": 0}, pluck="name"):
		meta = frappe.get_meta(doctype)
		if not meta.has_field("naming_series"):
			continue
		for option in (meta.get_field("naming_series").options or "").split("\n"):
			option = option.strip()
			if not option or "." not in option:
				continue
			prefix = re.sub(r"\.#+$", "", option)
			parts = re.split(r"\.", prefix)
			if "YYYY" not in option and "#" not in option:
				continue
			highest = 0
			for name in frappe.get_all(doctype, filters={"name": ("like", re.sub(r"\.[A-Za-z#]+\.?", "%", option).rstrip("#") + "%")}, pluck="name", limit=5000):
				m = re.search(r"(\d+)$", name)
				if m:
					highest = max(highest, int(m.group(1)))
			for _ in range(min(highest, 5000)):
				make_autoname(option)
			del parts


