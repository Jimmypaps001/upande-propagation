// Copyright (c) 2026, Upande and contributors
// For license information, please see license.txt

frappe.query_reports["Propagation Traceability"] = {
	filters: [
		{
			fieldname: "propagation_batch",
			label: __("Propagation Batch"),
			fieldtype: "Link",
			options: "Propagation Batch",
			get_query: () => ({ filters: { docstatus: 1 } }),
			description: __("Leave blank to trace the most recent active batches"),
		},
		{
			fieldname: "company",
			label: __("Company"),
			fieldtype: "Link",
			options: "Company",
		},
		{
			fieldname: "include_completed",
			label: __("Include Completed Batches"),
			fieldtype: "Check",
			default: 0,
		},
	],

	formatter(value, row, column, data, default_formatter) {
		value = default_formatter(value, row, column, data);
		if (!data) {
			return value;
		}
		// The batch header and the net position line anchor each block.
		if (column.fieldname === "step" && (data.step || "").startsWith("▶")) {
			value = `<span style="font-weight:600">${value}</span>`;
		}
		if (column.fieldname === "step" && (data.step || "").startsWith("=")) {
			value = `<span style="color:var(--text-muted)">${value}</span>`;
		}
		return value;
	},
};
