// Copyright (c) 2026, Upande and contributors
// For license information, please see license.txt

frappe.ui.form.on("Seedling Request", {
	refresh(frm) {
		if (frm.doc.docstatus === 1) {
			frm.dashboard.add_indicator(
				__("{0} of {1} delivered", [frm.doc.total_qty_dispatched, frm.doc.total_qty_requested]),
				frm.doc.status === "Fulfilled" ? "green" : "orange"
			);
		}

		if (frm.doc.docstatus === 1 && frm.doc.status !== "Fulfilled") {
			frm.add_custom_button(__("Propagation Batch"), () => frm.trigger("make_batch"), __("Create"));
		}
	},

	make_batch(frm) {
		const pending = (frm.doc.items || []).filter((row) => row.qty_pending > 0);
		if (!pending.length) {
			frappe.msgprint(__("Every requested variety has already been propagated in full."));
			return;
		}

		frappe.prompt(
			[
				{
					fieldname: "variety",
					label: __("Variety"),
					fieldtype: "Select",
					options: pending.map((row) => row.variety).join("\n"),
					default: pending[0].variety,
					reqd: 1,
				},
			],
			(values) => {
				const row = pending.find((item) => item.variety === values.variety);
				frappe.new_doc("Propagation Batch", {
					seedling_request: frm.doc.name,
					variety: row.variety,
					propagation_method: row.propagation_method || "Own-root Cutting",
					total_cuttings_planned: row.qty_pending,
					propagation_unit: row.target_greenhouse,
					company: frm.doc.company,
					start_date: frappe.datetime.get_today(),
				});
			},
			__("Propagate Which Variety?"),
			__("Create")
		);
	},
});
