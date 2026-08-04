frappe.provide("frappe.dashboards.chart_sources");

frappe.dashboards.chart_sources["Propagation Funnel"] = {
	method: "upande_propagation.upande_propagation.dashboard_chart_source.propagation_funnel.propagation_funnel.get",
	filters: [
		{
			fieldname: "propagation_batch",
			label: __("Propagation Batch"),
			fieldtype: "Link",
			options: "Propagation Batch",
			description: __("Leave blank to total every submitted batch"),
		},
		{
			fieldname: "company",
			label: __("Company"),
			fieldtype: "Link",
			options: "Company",
		},
	],
};
