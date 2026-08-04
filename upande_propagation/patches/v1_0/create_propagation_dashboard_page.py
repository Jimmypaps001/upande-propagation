import frappe

ROUTE = "propagation-dashboard"
TITLE = "Propagation Dashboard"
SOURCE = ("upande_propagation", "web_pages", "propagation_dashboard.html")


def execute():
	"""Create or refresh the Propagation Dashboard Web Page from the app source.

	The markup lives in the repo so the page is reviewable and redeployable; this
	patch pushes it into the Web Page record the site actually serves.
	"""
	with open(frappe.get_app_path(*SOURCE)) as f:
		html = f.read()

	values = {
		"title": TITLE,
		"route": ROUTE,
		"published": 1,
		"content_type": "HTML",
		"main_section_html": html,
		"full_width": 1,
		"show_title": 0,
		"show_sidebar": 0,
		"insert_style": 0,
		"dynamic_route": 0,
		"enable_comments": 0,
	}

	name = frappe.db.get_value("Web Page", {"route": ROUTE})
	if name:
		page = frappe.get_doc("Web Page", name)
		page.update(values)
	else:
		page = frappe.get_doc(dict(doctype="Web Page", **values))

	page.flags.ignore_permissions = True
	page.save()
