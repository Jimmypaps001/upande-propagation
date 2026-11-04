app_name = "upande_propagation"
app_title = "Upande Propagation"
app_publisher = "Upande"
app_description = "Propagation module for Upande"
app_email = "dev@upande.com"
app_license = "mit"

# Apps
# ------------------

# Seedling Dispatch links to Crop Cycle, which upande_production owns (ported from upande_agriculture).
required_apps = ["upande_production"]

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "upande_propagation",
# 		"logo": "/assets/upande_propagation/logo.png",
# 		"title": "Upande Propagation",
# 		"route": "/upande_propagation",
# 		"has_permission": "upande_propagation.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/upande_propagation/css/upande_propagation.css"
# app_include_js = "/assets/upande_propagation/js/upande_propagation.js"

# include js, css files in header of web template
# web_include_css = "/assets/upande_propagation/css/upande_propagation.css"
# web_include_js = "/assets/upande_propagation/js/upande_propagation.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "upande_propagation/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "upande_propagation/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Portal pages
# ------------

# Old upande_agriculture paths the phones and desk scripts still call. The roses
# app's propagation endpoints keep their request/response shape in mobile/legacy.py.
override_whitelisted_methods = {
	# upande_summer_flowers was split up: its propagation endpoints keep their old paths.
	"upande_summer_flowers.summer_flowers.propagation_solver.options": "upande_propagation.propagation_solver.options",
	"upande_summer_flowers.summer_flowers.propagation_solver.peak_options": "upande_propagation.propagation_solver.peak_options",
	"upande_summer_flowers.summer_flowers.propagation_actuals.accept": "upande_propagation.propagation_actuals.accept",
	"upande_summer_flowers.summer_flowers.trough_actuals.against_plan": "upande_propagation.trough_actuals.against_plan",
	"upande_summer_flowers.summer_flowers.trough_actuals.feed_actuals": "upande_propagation.trough_actuals.feed_actuals",
	"upande_summer_flowers.summer_flowers.plant_receipt.refresh_planting": "upande_propagation.plant_receipt.refresh_planting",
	"upande_summer_flowers.summer_flowers.plant_receipt.revise_to_delivered": "upande_propagation.plant_receipt.revise_to_delivered",
	"upande_summer_flowers.summer_flowers.plant_issue.issue_plants": "upande_propagation.plant_issue.issue_plants",
	"upande_summer_flowers.summer_flowers.plant_issue.dispatch_to_block": "upande_propagation.plant_issue.dispatch_to_block",
	"upande_summer_flowers.summer_flowers.setup.plant_quality.install": "upande_propagation.setup.plant_quality.install",
	"upande_summer_flowers.summer_flowers.doctype.summer_flower_propagation_plan.summer_flower_propagation_plan.build_from_plan": "upande_propagation.upande_propagation.doctype.summer_flower_propagation_plan.summer_flower_propagation_plan.build_from_plan",
	"upande_summer_flowers.summer_flowers.doctype.summer_flower_motherstock_plan.summer_flower_motherstock_plan.for_plan": "upande_propagation.upande_propagation.doctype.summer_flower_motherstock_plan.summer_flower_motherstock_plan.for_plan",
	"upande_summer_flowers.summer_flowers.doctype.summer_flower_motherstock_batch.summer_flower_motherstock_batch.cycle_options": "upande_propagation.upande_propagation.doctype.summer_flower_motherstock_batch.summer_flower_motherstock_batch.cycle_options",
	"upande_agriculture.api.promote_trial_to_cycle": "upande_propagation.api.promote_trial_to_cycle",
	"upande_agriculture.mobile.api.productionCreateSeedlingRequest": "upande_propagation.mobile.legacy.productionCreateSeedlingRequest",
	"upande_agriculture.mobile.api.productionListSeedlingRequests": "upande_propagation.mobile.legacy.productionListSeedlingRequests",
	"upande_agriculture.mobile.api.productionListPropagationBatches": "upande_propagation.mobile.legacy.productionListPropagationBatches",
	"upande_agriculture.mobile.api.productionRecordPropagationLog": "upande_propagation.mobile.legacy.productionRecordPropagationLog",
	"upande_agriculture.mobile.api.productionListGrowerCandidates": "upande_propagation.mobile.legacy.productionListGrowerCandidates",
}

website_route_rules = [
	{"from_route": "/propagation/batch/<path:name>", "to_route": "propagation/batch"},
]

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# automatically load and sync documents of this doctype from downstream apps
# importable_doctypes = [doctype_1]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "upande_propagation.utils.jinja_methods",
# 	"filters": "upande_propagation.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "upande_propagation.install.before_install"
# `bench install-app` marks patches as completed without running them, so the
# site setup those patches do has to be driven from here as well.
# The label print format renders its QR inline, so the method has to be
# reachable from Jinja.
jinja = {"methods": ["upande_propagation.qr.qr_data_uri"]}

after_install = "upande_propagation.install.after_install"
after_migrate = [
	"upande_propagation.install.after_migrate",
	# The plant inspection template and its parameters are records, not schema: this creates what is
	# missing and leaves the thresholds a farm has since corrected.
	"upande_propagation.setup.plant_quality.install",
	# The propagation units' capacity fields are schema; the figures on them are a site's own.
	"upande_propagation.setup.propagation_units.install",
]

# Uninstallation
# ------------

# before_uninstall = "upande_propagation.uninstall.before_uninstall"
# after_uninstall = "upande_propagation.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "upande_propagation.utils.before_app_install"
# after_app_install = "upande_propagation.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "upande_propagation.utils.before_app_uninstall"
# after_app_uninstall = "upande_propagation.utils.after_app_uninstall"

# Build
# ------------------
# To hook into the build process

# after_build = "upande_propagation.build.after_build"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "upande_propagation.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
# 	}
# }

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"upande_propagation.tasks.all"
# 	],
# 	"daily": [
# 		"upande_propagation.tasks.daily"
# 	],
# 	"hourly": [
# 		"upande_propagation.tasks.hourly"
# 	],
# 	"weekly": [
# 		"upande_propagation.tasks.weekly"
# 	],
# 	"monthly": [
# 		"upande_propagation.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "upande_propagation.install.before_tests"

# Extend DocType Class
# ------------------------------
#
# Specify custom mixins to extend the standard doctype controller.
# extend_doctype_class = {
# 	"Task": "upande_propagation.custom.task.CustomTaskMixin"
# }

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "upande_propagation.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "upande_propagation.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["upande_propagation.utils.before_request"]
# after_request = ["upande_propagation.utils.after_request"]

# Job Events
# ----------
# before_job = ["upande_propagation.utils.before_job"]
# after_job = ["upande_propagation.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"upande_propagation.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []

# The desk's apps screen: one Propagation tile with the animated mark
# (a CSS play-once SVG; Frappe opens the tile through the Workspace Sidebar, same tab).
add_to_apps_screen = [
	{
		"name": "upande_propagation",
		"logo": "/assets/upande_propagation/images/propagation_logo.svg",
		"title": "Propagation",
		"route": "/desk/propagation?sidebar=Propagation",
	}
]

# The launcher block on the Propagation workspace, and the portal dashboard page
# (which lives only in the database until it is exported here).
fixtures = [
	{"doctype": "Custom HTML Block", "filters": [["name", "in", ["Propagation Navigation"]]]},
	{"doctype": "Web Page", "filters": [["route", "=", "propagation-dashboard"]]},
	# Our own propagation units are warehouses of this type.
	{"doctype": "Warehouse Type", "filters": [["name", "in", ["Propagation Unit"]]]},
]

# Plant material is bought, so it arrives on a Purchase Order / Receipt / Invoice. These handlers add the
# planting context, the plan comparison and the inspection gate; each returns immediately unless the
# document carries a plant line. A Warehouse of type Propagation Unit is one of our own units.
doc_events = {
	"Warehouse": {"validate": "upande_propagation.setup.propagation_units.mark_unit"},
	"Purchase Order": {"validate": "upande_propagation.plant_receipt.set_line_context"},
	"Purchase Receipt": {
		"validate": "upande_propagation.plant_receipt.set_line_context",
		"on_submit": "upande_propagation.plant_receipt.refresh_plantings",
		"on_cancel": "upande_propagation.plant_receipt.refresh_plantings",
	},
	"Purchase Invoice": {
		"validate": "upande_propagation.plant_receipt.set_line_context",
		# before_submit: a missing inspection has to stop the submission, not be found after the ledger moved.
		"before_submit": "upande_propagation.plant_receipt.require_inspection",
		"on_submit": "upande_propagation.plant_receipt.refresh_plantings",
		"on_cancel": "upande_propagation.plant_receipt.refresh_plantings",
	},
}
