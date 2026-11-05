# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt

"""Re-home the Summer Flowers purchasing custom fields to this app.

The plant-material handlers (plant_receipt, plant_issue) use Custom Fields on Material Request (+Item), Purchase
Order (+Item), Purchase Receipt Item, Purchase Invoice Item and Seedling Request that upande_summer_flowers shipped
with module "Summer Flowers". This app now ships them (upande_propagation/custom/*.json); this flips the module on
the rows already on a site so removing upande_summer_flowers does not delete them. Nothing is created or dropped.
"""

import frappe

MODULE = "Upande Propagation"
OLD_MODULE = "Summer Flowers"

FIELDS = {
	"Material Request": ("custom_sf_area_ha", "custom_sf_block", "custom_sf_cb", "custom_sf_crop_cycle",
	                     "custom_sf_period_to", "custom_sf_procurement_plan", "custom_sf_section"),
	"Material Request Item": ("custom_sf_applications", "custom_sf_qty_in_stock", "custom_sf_qty_required",
	                          "custom_sf_rate_per_ha"),
	"Purchase Invoice Item": ("custom_block", "custom_days_before_planting", "custom_planned_plants",
	                          "custom_plant_variance", "custom_planting_calendar", "custom_rejection_reason"),
	"Purchase Order": ("custom_sf_procurement_plan",),
	"Purchase Order Item": ("custom_block", "custom_planned_plants", "custom_planting_calendar"),
	"Purchase Receipt Item": ("custom_block", "custom_days_before_planting", "custom_planned_plants",
	                          "custom_plant_variance", "custom_planting_calendar"),
	"Seedling Request": ("custom_plants_required", "custom_propagation_plan", "custom_sticking_week"),
}


def execute():
	for dt, names in FIELDS.items():
		for fieldname in names:
			name = frappe.db.get_value("Custom Field", {"dt": dt, "fieldname": fieldname, "module": OLD_MODULE})
			if name:
				frappe.db.set_value("Custom Field", name, "module", MODULE, update_modified=False)
