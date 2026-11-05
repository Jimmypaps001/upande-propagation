# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt

"""Bring Summer Flower Propagation Plans back in line with the production plan they should follow.

A propagation plan stores figures (plants to stick, cuttings, mother plants, TC to order) worked out from one
production plan and one protocol at the time it was built. Where the production plan for that variety, farm and
season has since been replaced by a newer approved one, or the protocol has moved, the stored figures are stale.

Which production plan a propagation plan should follow is the single approved plan for its variety, farm and
season. Where there are two or more approved plans for the same variety, farm and season that is a business
decision, not something to guess: those propagation plans are listed as needing a human and are left alone.

	bench --site <site> execute upande_propagation.summer_flowers_cleanup.rebuild_stale_propagation_plans
	bench --site <site> execute upande_propagation.summer_flowers_cleanup.rebuild_stale_propagation_plans --kwargs "{'apply': True}"

Apply uses the doctype's own rebuild (set the production plan, save), keeps the status, and never touches a submitted plan.
"""

import frappe

PROP = "Summer Flower Propagation Plan"
PLAN = "Summer Flower Production Plan"


def approved_duplicates():
	"""{(variety, farm, season): [approved production plan names]} for every key with more than one."""
	groups = {}
	for p in frappe.get_all(PLAN, filters={"docstatus": 1, "status": "Approved"},
	                        fields=["name", "variety", "farm", "season_start_year"], order_by="creation"):
		groups.setdefault((p.variety, p.farm, p.season_start_year), []).append(p.name)
	return {k: v for k, v in groups.items() if len(v) > 1}


def _recompute(name, target):
	"""The tracked figures this propagation plan would have if built from `target`; nothing is written."""
	frappe.db.savepoint("sf_prop_recompute")
	try:
		d = frappe.get_doc(PROP, name)
		d.production_plan = target
		d.flags.ignore_permissions = True
		d.validate()
		return d.snapshot(), d
	finally:
		frappe.db.rollback(save_point="sf_prop_recompute")


def _changed(stored, new):
	out = {}
	for k, v in new.items():
		a, b = stored.get(k), v
		if (a or 0) == (b or 0) and str(a or "") == str(b or ""):
			continue
		if str(a or "") != str(b or "") and not (a in (None, "", 0) and b in (None, "", 0)):
			out[k] = (a, b)
	return out


def _rebuild_in_place(name, target):
	"""The rebuild branch of build_from_plan, aimed at this exact plan.

	build_from_plan finds "the" plan by variety, season and unit; a plan with no unit stored as NULL is not found by
	its `propagation_unit = ""` filter, so it would create a second plan instead of rebuilding this one. Aiming at
	the name avoids that. It is the same rebuild: point the plan at the production plan and save (validate rebuilds
	the requirement, motherstock, uplifts and totals), record what moved, keep the status.
	"""
	d = frappe.get_doc(PROP, name)
	if d.docstatus:
		frappe.throw("submitted")
	status = d.status
	before = d.snapshot()
	was = d.production_plan
	d.production_plan = target
	d.flags.ignore_permissions = True
	d.save()
	changes = d.describe_changes(before)
	if was != target:
		changes.insert(0, "Built from %s instead of %s" % (target, was))
	d.db_set("last_change_summary", "\n".join(changes) or None, update_modified=False)
	if d.status != status:
		d.db_set("status", status, update_modified=False)
	return changes


def rebuild_stale_propagation_plans(apply=False):
	"""Return {"stale", "current", "needs_decision", "skipped", "duplicates", "rebuilt", "applied"}.

	stale: {propagation plan: {"from": production plan now, "to": production plan it should follow, "diff": {field: (stored, recomputed)}}}
	needs_decision: propagation plans whose variety/farm/season has several approved production plans
	duplicates: [(variety, farm, season, [approved production plans])]  - the business decision, whether or not a propagation plan exists
	"""
	dups = approved_duplicates()
	approved = {}
	for p in frappe.get_all(PLAN, filters={"docstatus": 1, "status": "Approved"},
	                        fields=["name", "variety", "farm", "season_start_year"], order_by="creation"):
		approved.setdefault((p.variety, p.farm, p.season_start_year), []).append(p.name)

	res = {"stale": {}, "current": [], "needs_decision": {}, "skipped": {}, "rebuilt": {}, "applied": bool(apply)}
	for r in frappe.get_all(PROP, fields=["name", "production_plan", "status", "docstatus", "propagation_unit"], order_by="name"):
		cur = frappe.db.get_value(PLAN, r.production_plan, ["variety", "farm", "season_start_year"], as_dict=True)
		if not cur:
			res["skipped"][r.name] = "production plan %s not found" % r.production_plan
			continue
		cands = approved.get((cur.variety, cur.farm, cur.season_start_year), [])
		if len(cands) > 1:
			res["needs_decision"][r.name] = {"built_from": r.production_plan, "approved_plans": cands}
			continue
		if not cands:
			res["skipped"][r.name] = "no approved production plan for %s / %s / %s (built from %s)" % (
				cur.variety, cur.farm, cur.season_start_year, r.production_plan)
			continue
		if r.docstatus:
			res["skipped"][r.name] = "submitted"
			continue
		target = cands[0]
		stored = frappe.get_doc(PROP, r.name).snapshot()
		new, _d = _recompute(r.name, target)
		diff = _changed(stored, new)
		if target != r.production_plan or diff:
			res["stale"][r.name] = {"from": r.production_plan, "to": target, "diff": diff, "status": r.status}
		else:
			res["current"].append(r.name)

	res["duplicates"] = [(k[0], k[1], k[2], v) for k, v in sorted(dups.items(), key=lambda kv: tuple(map(str, kv[0])))]

	if apply:
		frappe.flags.in_patch = False
		for name, s in res["stale"].items():
			try:
				res["rebuilt"][name] = _rebuild_in_place(name, s["to"])
			except Exception as e:
				frappe.db.rollback()
				res["skipped"][name] = "rebuild failed: %s" % str(e)[:200]
		frappe.db.commit()
	return res
