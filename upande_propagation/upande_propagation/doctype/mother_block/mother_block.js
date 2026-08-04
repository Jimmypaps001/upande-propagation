// Copyright (c) 2026, Upande and contributors
// For license information, please see license.txt

frappe.ui.form.on("Mother Block", {
	refresh(frm) {
		if (frm.is_new()) {
			return;
		}

		frm.add_custom_button(__("Recalculate Cuttings"), () => {
			frappe.call({
				method: "upande_propagation.upande_propagation.doctype.mother_block.mother_block.recalculate",
				args: { mother_block: frm.doc.name },
				freeze: true,
				callback: () => frm.reload_doc(),
			});
		});

		frm.add_custom_button(__("Budwood Harvest"), () => {
			frappe.new_doc("Budwood Harvest", {
				mother_block: frm.doc.name,
				item: frm.doc.variety,
			});
		}, __("Create"));
	},
});
