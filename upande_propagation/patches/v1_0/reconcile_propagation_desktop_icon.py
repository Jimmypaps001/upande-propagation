"""Leave one Propagation tile on the desk: the App icon with the animated mark.

Frappe made a Link-type "Propagation" Desktop Icon (app None) from the workspace,
and `create_desktop_icons` adds an App icon from `add_to_apps_screen`. Two tiles
with one name is a mess, so the existing record is converted in place into the App
icon (same name, so nothing that points at it breaks) and any stray second icon for
the app is hidden. Idempotent; also called from install.setup() on every migrate.
"""

import frappe

LABEL = "Propagation"
APP = "upande_propagation"
LOGO = "/assets/upande_propagation/images/propagation_logo.svg"


def execute():
	if not frappe.db.exists("DocType", "Desktop Icon"):
		return
	# The workspace sidebar this tile opens must exist before the icon points at it.
	if not frappe.db.exists("Workspace Sidebar", LABEL):
		return

	values = {
		"icon_type": "App",
		"app": APP,
		"link_type": "Workspace Sidebar",
		"link_to": LABEL,
		"link": None,
		"logo_url": LOGO,
		"hidden": 0,
		"parent_icon": None,
	}
	if frappe.db.exists("Desktop Icon", LABEL):
		icon = frappe.get_doc("Desktop Icon", LABEL)
		icon.update(values)
	else:
		icon = frappe.get_doc(dict(doctype="Desktop Icon", label=LABEL, standard=0, **values))
	icon.flags.ignore_permissions = True
	icon.save()

	# Any other icon claiming to be the Propagation app tile is a duplicate.
	for name in frappe.get_all(
		"Desktop Icon",
		filters={"name": ["!=", LABEL], "icon_type": "App", "app": APP},
		pluck="name",
	):
		frappe.db.set_value("Desktop Icon", name, "hidden", 1)
	frappe.clear_cache()
