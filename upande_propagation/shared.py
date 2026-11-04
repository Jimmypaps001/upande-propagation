"""Where the code propagation borrows from the other apps comes from.

The Summer Flowers planner was one app; it is now split. Propagation owns the propagation plan, the
motherstock plan, the actuals and the plant receipt, but they run on pieces that are not propagation's:
the lifecycle simulation, the sourcing and TC-supply maths, the root line, the crop protocol logic, the
ISO-week helpers and the Summer Flower Settings readers. Dependency runs one way (core <- production <-
planning / propagation), so those live in upande_production and are imported from there, never the reverse.

This module is the one place that names where. Everything here is lazy: nothing is imported until a
function is called, so a site migrating (which loads every doctype controller) never trips over a piece
the production port has not landed yet. A piece that cannot be found raises ImportError naming it.

	shared.module("lifecycle_sim")          -> a lazy module (attribute access loads it)
	shared.func("planning", "iso_monday")   -> a lazy function
"""

import importlib

# Candidate homes, in order. upande_production.summer_flowers is the agreed package for the ported modules.
HOMES = (
	"upande_production.summer_flowers",
	"upande_production",
	# Temporary: sourcing / lifecycle_sim / tc_supply / planning_api were assigned to planning in the
	# split spec. Propagation may not depend on its sibling for good; these two go once the shared
	# pieces are settled in production.
	"upande_crop_material_planning.summer_flowers",
	"upande_crop_material_planning",
)


def _load(name):
	last = None
	for home in HOMES:
		path = f"{home}.{name}"
		try:
			return importlib.import_module(path)
		except ModuleNotFoundError as exc:
			# Only "this module is not there" is tolerated; a missing import inside it is a real error.
			if exc.name and not path.startswith(exc.name) and exc.name != path:
				raise
			last = exc
	raise ImportError(
		f"upande_propagation needs the Summer Flowers module '{name}' from upande_production "
		f"(looked in {', '.join(HOMES)}). It has not been ported there yet."
	) from last


class _Lazy:
	def __init__(self, name):
		self._name = name
		self._mod = None

	def __getattr__(self, attr):
		if attr.startswith("__"):
			raise AttributeError(attr)
		if self._mod is None:
			self._mod = _load(self._name)
		return getattr(self._mod, attr)

	def __repr__(self):
		return f"<lazy {self._name}>"


def module(name):
	return _Lazy(name)


def func(name, attr):
	mod = _Lazy(name)

	def call(*args, **kwargs):
		return getattr(mod, attr)(*args, **kwargs)

	call.__name__ = attr
	return call
