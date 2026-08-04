// Copyright (c) 2026, Upande and contributors
// For license information, please see license.txt

frappe.ui.form.on("Daily Propagation Log", {
	setup(frm) {
		frm.set_query("propagation_batch", () => ({
			filters: { docstatus: 1, current_stage: ["!=", "Completed"] },
		}));
	},

	refresh(frm) {
		if (!frm.doc.propagation_batch) {
			return;
		}
		frm.add_custom_button(__("Open Batch"), () => {
			frappe.set_route("Form", "Propagation Batch", frm.doc.propagation_batch);
		});
	},

	propagation_batch(frm) {
		if (!frm.doc.propagation_batch) {
			return;
		}
		frappe.db.get_value(
			"Propagation Batch",
			frm.doc.propagation_batch,
			["current_stage", "total_survived"],
			(value) => {
				if (value) {
					frm.dashboard.clear_headline();
					frm.dashboard.set_headline(
						__("Batch is at {0} with {1} surviving", [
							__(value.current_stage),
							value.total_survived,
						])
					);
				}
			}
		);
	},
});
