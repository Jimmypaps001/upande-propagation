import frappe

# Working nursery durations for own-root rose cuttings; tune per farm in
# Propagation Settings.
DEFAULT_DURATIONS = [
	("Cutting", 1),
	("Sticking", 2),
	("Callusing", 21),
	("Rooting", 28),
	("Nursery", 30),
	("Hardening", 14),
	("Ready for Dispatch", 7),
]


def execute():
	settings = frappe.get_single("Propagation Settings")
	if settings.stage_durations:
		return

	for stage, days in DEFAULT_DURATIONS:
		settings.append("stage_durations", {"stage": stage, "expected_days": days})

	settings.flags.ignore_permissions = True
	settings.save()
