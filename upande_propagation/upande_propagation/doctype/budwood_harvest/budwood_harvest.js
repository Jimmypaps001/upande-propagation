// Copyright (c) 2026, Upande and contributors
// For license information, please see license.txt

frappe.ui.form.on("Budwood Harvest", {
	setup(frm) {
		frm.set_query("mother_block", () => {
			const filters = { status: "Active" };
			if (frm.doc.item) {
				filters.variety = frm.doc.item;
			}
			return { filters };
		});

		frm.set_query("propagation_batch", () => {
			const filters = { docstatus: 1, current_stage: ["!=", "Completed"] };
			if (frm.doc.item) {
				filters.variety = frm.doc.item;
			}
			return { filters };
		});
	},
});
