### Upande Propagation

Rose propagation for Frappe/ERPNext — the nursery pipeline from mother block to
invoice.

Mother Block → Budwood Harvest → Seedling Request → Propagation Batch (stages +
daily logs) → Seedling Dispatch → planted into a Crop Cycle, or sold and invoiced.

### What it covers

- **Mother stock** — mother blocks with cuttings taken and last cutting date
  derived from submitted Budwood Harvests
- **Nursery batches** — a forward-only stage pipeline (Cutting → Sticking →
  Callusing → Rooting → Nursery → Hardening → Ready for Dispatch → Completed)
  with cuttings received, stuck, mortality, survivors, dispatches and costing all
  derived from the source documents
- **Daily logs** — per-day counts that roll up to the batch and advance its stage
- **Demand** — Seedling Requests with fulfilment tracking and a real status
  machine (Draft → Submitted → In Progress → Partially Fulfilled → Fulfilled)
- **Output** — Seedling Dispatch, either internal planting against a Crop Cycle
  or a sale to a customer, with a one-click draft Sales Invoice
- **Reporting** — a Propagation workspace (8 number cards, 6 charts including a
  custom funnel chart source), a Propagation Traceability script report, portal
  pages at `/propagation` and `/propagation/batch/<name>`, and a dashboard Web
  Page at `/propagation-dashboard`

### Requirements

- Frappe **v16** — declared in `[tool.bench.frappe-dependencies]`
- **ERPNext** — the app links to Item, Warehouse, Customer and Sales Invoice
- **upande_agriculture** — Seedling Dispatch links to its Crop Cycle doctype
  (declared as `required_apps` in `hooks.py`)

### Installation

```bash
cd $PATH_TO_YOUR_BENCH
bench get-app https://github.com/Jimmypaps001/upande-propagation --branch james
bench --site $SITE install-app upande_propagation
bench --site $SITE migrate
```

`migrate` seeds the default nursery stage durations, backfills any missing
`harvest_datetime`, recomputes every derived field on existing records, and
installs the dashboard Web Page from `upande_propagation/web_pages/`.

### Configuration

**Propagation Settings** holds the expected days per nursery stage (shown against
actual days on every batch stage row) and, under *Sales Invoice Defaults*, a map
for any field a site makes mandatory on Sales Invoice. A value written as
`{fieldname}` is copied from the dispatch:

| Fieldname              | Value               |
| ---------------------- | ------------------- |
| `custom_farm`          | `{farm}`            |
| `custom_business_unit` | `Roses Propagation` |

### Contributing

This app uses `pre-commit` for code formatting and linting. Please [install pre-commit](https://pre-commit.com/#installation) and enable it for this repository:

```bash
cd apps/upande_propagation
pre-commit install
```

Pre-commit is configured to use the following tools for checking and formatting your code:

- ruff
- eslint
- prettier
- pyupgrade

### License

mit
