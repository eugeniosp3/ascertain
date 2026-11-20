"""Build both public punch-card views from progress.json; run from any folder."""

import html
import json
import re
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
LABELS = {
    "verified": "Verified in stated scope",
    "partially_verified": "Partially verified; excluded scope open",
    "implemented": "Implemented; acceptance pending",
    "in_progress": "In progress",
    "planned": "Planned",
    "not_selected": "Not selected",
}


def plain(value):
    value = re.sub(r"<code>(.*?)</code>", r"`\1`", value)
    value = re.sub(r"<[^>]+>", "", value)
    return html.unescape(value).replace("|", "\\|")


def evidence_link(path, html_view=False):
    if path.startswith(("http://", "https://")):
        href = path
        label = "Hosted CI run" if "/actions/runs/" in path else path
    else:
        assert (ROOT / path).exists(), f"Missing evidence: {path}"
        href = "../" + path
        label = path
    if html_view:
        return f'<a href="{html.escape(href, quote=True)}">{html.escape(label)}</a>'
    return f"[{label}]({href})"


def core_summary(record):
    checks = record.get("assessment_checks", [])
    assert checks, "Core assessment mapping is required"
    by_part = {}
    for check in checks:
        assert check["status"] in LABELS and check["status"] != "not_selected"
        counts = by_part.setdefault(
            check["part"], {"total": 0, "verified": 0, "partial": 0}
        )
        counts["total"] += 1
        counts["verified"] += check["status"] == "verified"
        counts["partial"] += check["status"] == "partially_verified"
    done = sum(check["status"] == "verified" for check in checks)
    return checks, by_part, done, round(100 * done / len(checks))


def build():
    record = json.loads((HERE / "progress.json").read_text())
    phases = record["phases"]
    items = [item for phase in phases for item in phase["items"]]
    ids = [item["id"] for item in items]
    assert len(ids) == len(set(ids)), "Duplicate item IDs"
    counts = Counter(item["status"] for item in items)
    assert not (set(counts) - set(LABELS)), "Unknown status"
    for item in items:
        assert item["scope"] and item["detail"] and item["evidence"]
        for path in item["evidence"]:
            evidence_link(path)
    checks, by_part, core_done, core_pct = core_summary(record)
    core_partial = sum(check["status"] == "partially_verified" for check in checks)
    core_open = len(checks) - core_done - core_partial
    assert len({check["id"] for check in checks}) == len(checks)
    for check in checks:
        assert all(item_id in ids for item_id in check["items"])
    summary_lines = [
        (
            f"**Core assessment: {core_done}/{len(checks)} checks verified in reviewed scopes ({core_pct}%).** "
            f"{core_partial} partially verified; {core_open} still open."
        ),
        "",
        record["assessment_counting_rule"],
        "",
        "| Assessment section | Verified | Partial | Still open |",
        "| --- | ---: | ---: | ---: |",
        *[
            f"| {part} | {value['verified']}/{value['total']} | {value['partial']} | {value['total'] - value['verified'] - value['partial']} |"
            for part, value in by_part.items()
        ],
        "",
        (
            "The detailed card also tracks recommendations and selected additions; those are separate from the core assessment denominator."
        ),
        "",
        f"**Detailed work: {counts.get('verified', 0)}/{len(items)} items verified in stated scopes.**",
        "",
        *[f"- {update}" for update in record.get("current_updates", [])],
    ]
    md = [
        "# Project punch card",
        "",
        "[Project overview](../README.md) · [Interactive view](holepunch.html) · [Assessment](project.md)",
        "",
        f"Updated {record['updated_at']}. This covers the original assessment and selected additions. A checked box means verified in the scope shown; it does not turn a demo or fixture test into live-application acceptance.",
        "",
        *summary_lines,
        "",
        f"{len(items)} tracked items: "
        + ", ".join(
            f"{counts.get(key, 0)} {label.lower()}" for key, label in LABELS.items()
        )
        + ".",
        "",
        "## Verification record",
        "",
        "| Evidence | Scope and interpretation |",
        "| --- | --- |",
    ]
    for evidence in record["verification_records"]:
        links = " · ".join(evidence_link(p) for p in evidence["paths"])
        md.append(f"| {evidence['label']} | {evidence['detail']} {links} |")
    md += [
        "",
        "## Core assessment checks",
        "",
        "Each row traces directly to the original assessment. The detail-item IDs link the requirement to implementation and evidence below. Optional stretch features do not reduce this core percentage.",
        "",
        "| Check | Original requirement | Status | Evidence / remaining acceptance |",
        "| --- | --- | --- | --- |",
    ]
    for check in checks:
        detail_ids = ", ".join(f"`{item_id}`" for item_id in check["items"])
        md.append(
            f"| {check['id']} · {check['spec']} | {check['title']} | {LABELS[check['status']]} | "
            f"{detail_ids}. {check['acceptance_note']} |"
        )
    md += [
        "",
        "Current integration, theme work and detailed QA remain open where marked. Historical passing results and subsequent failures are retained separately. See [coordination](chatroom/integration-coordination.md) for owners and handoffs.",
        "",
        "## Area checklists",
        "",
        "[Frontend](../frontend/README.md#checklist) · [Backend](../backend/docs/HOLEPUNCH.md) · [Data](../data/docs/HOLEPUNCH.md) · [Infra](../infra/docs/checklist.md)",
        "",
    ]
    ui = []
    for phase in phases:
        md += [f"## {phase['title']}", "", phase["description"], ""]
        rendered = []
        for item in phase["items"]:
            status = LABELS[item["status"]]
            done = item["status"] == "verified"
            links = " · ".join(evidence_link(p) for p in item["evidence"])
            md += [
                f"- [{'x' if done else ' '}] **{item['id']} — {plain(item['title'])}** · {status}.",
                f"  {item['detail']}",
                f"  Scope: {item['scope']}. Requirement: {item['reference']}. Evidence: {links}.",
                "",
            ]
            d = (
                html.escape(item["detail"])
                + "<br><b>"
                + html.escape(status)
                + "</b> · Scope: "
                + html.escape(item["scope"])
                + "<br>Evidence: "
                + " · ".join(evidence_link(p, True) for p in item["evidence"])
            )
            rendered.append(
                {
                    "id": item["id"],
                    "tag": item["tag"],
                    "ref": item["reference"],
                    "part": item["part"],
                    "t": item["title"],
                    "d": d,
                    "done": done,
                    "status": item["status"],
                }
            )
        ui.append(
            {
                "id": phase["id"],
                "title": phase["title"],
                "blurb": phase["description"],
                "gated": False,
                "items": rendered,
            }
        )
    md += [
        "## Updating this record",
        "",
        "Edit [progress.json](progress.json) after reviewing the current implementation and dated evidence, then run:",
        "",
        "```sh",
        "python3 reference/build_progress.py",
        "```",
        "",
        "Both views share the same item IDs, statuses and evidence. The interactive card can retain personal checkbox overrides in a browser; those do not change this committed verification record. Record new failures and retests instead of erasing older evidence.",
        "",
    ]
    (HERE / "PROGRESS.md").write_text("\n".join(md))

    # Keep the root metric generated from the same evidence instead of manually copying counts.
    readme_path = ROOT / "README.md"
    readme = readme_path.read_text()
    root_summary = (
        "<!-- progress-summary:start -->\n## Status\n\n"
        + f"Snapshot: {record['updated_at']}.\n\n"
        + "\n".join(summary_lines)
        + "\n\n[See every assessment check and its evidence](reference/PROGRESS.md#core-assessment-checks).\n"
        + "<!-- progress-summary:end -->"
    )
    if "<!-- progress-summary:start -->" in readme:
        readme = re.sub(
            r"<!-- progress-summary:start -->[\s\S]*?<!-- progress-summary:end -->",
            root_summary,
            readme,
        )
    else:
        readme = readme.replace("## Contents", root_summary + "\n\n## Contents", 1)
    if "- [Status](#status)" not in readme:
        readme = readme.replace(
            "## Contents\n", "## Contents\n\n- [Status](#status)", 1
        )
    readme_path.write_text(readme)

    p = HERE / "holepunch.html"
    page = p.read_text()
    start = page.index("const PHASES = ")
    end = page.index("\n/* ---------- state ---------- */", start)
    page = (
        page[:start]
        + "const PHASES = "
        + json.dumps(ui, ensure_ascii=False, indent=2)
        + ";\n"
        + page[end:]
    )
    page = re.sub(
        r"const TAGS = \{[^\n]+\};",
        'const TAGS = { req:"Required", rec:"Recommended", stretch:"Stretch", gate:"Submission", add:"Selected addition" };',
        page,
    )
    page = page.replace(
        "const DEFAULT_TAGS = { req:true, rec:true, stretch:true, gate:true };",
        "const DEFAULT_TAGS = { req:true, rec:true, stretch:true, gate:true, add:true };",
    )
    page = page.replace(
        'const KEY = "holepunch.v1";', 'const KEY = "holepunch.progress.v2";'
    )
    if '["ADD","Additions","Selected work"]' not in page:
        page = page.replace(
            '["X","Stretch","Pick 1–2"]',
            '["X","Stretch","Selected / optional"],\n  ["ADD","Additions","Selected work"]',
        )
    page = re.sub(
        r'<p class="lede">.*?</p>',
        '<p class="lede">The assessment and selected additions, reconciled with implementation and test evidence. Checkmarks show verification in the stated scope; final live acceptance remains explicit.</p>',
        page,
        count=1,
    )
    snapshot = (
        f'<p id="progress-snapshot">Updated {html.escape(record["updated_at"])} · '
        '<a href="PROGRESS.md">Repository-readable punch card</a> · <a href="../README.md">Project overview</a></p>'
    )
    if 'id="progress-snapshot"' in page:
        page = re.sub(r'<p id="progress-snapshot">.*?</p>', snapshot, page, count=1)
    else:
        page = page.replace(
            '  <div class="stats">', "  " + snapshot + '\n\n  <div class="stats">', 1
        )
    core_html = (
        '<section id="assessment-progress" class="card" aria-label="Core assessment status">'
        "<h2>Core assessment</h2>"
        f"<p><strong>{core_done} / {len(checks)} verified ({core_pct}%)</strong> · "
        f"{core_partial} partial · {core_open} still open</p>"
        f'<div class="bar"><i style="width:{core_pct}%"></i></div>'
        f"<p>{html.escape(record['assessment_counting_rule'])}</p>"
        "<p>Final integrated acceptance is in progress. "
        '<a href="PROGRESS.md#core-assessment-checks">Read the requirement-by-requirement mapping</a>.</p>'
        f"<p><strong>Detailed work: {counts.get('verified', 0)} / {len(items)} verified in stated scopes.</strong></p>"
        "<ul>"
        + "".join(
            f"<li>{html.escape(update)}</li>"
            for update in record.get("current_updates", [])
        )
        + "</ul>"
        "</section>"
    )
    if 'id="assessment-progress"' in page:
        page = re.sub(
            r'<section id="assessment-progress"[\s\S]*?</section>',
            core_html,
            page,
            count=1,
        )
    else:
        page = page.replace(
            '  <div class="stats">', core_html + '\n\n  <div class="stats">', 1
        )
    page = page.replace("Core holes punched", "Tracked work items checked").replace(
        "Stretch · pick 1–2", "Stretch features"
    )
    page = page.replace("Core and selected holes punched", "Tracked work items checked")
    page = page.replace(
        '<span class="star">★</span> marks the two recommended picks. The rest is a menu, not a to-do list.',
        "Statuses distinguish selected work from optional features that were not selected.",
    )
    page = page.replace(
        "<li><b>No <code>git init</code>, commits or GitHub</b> until you say so. Phase 16 is gated.</li>",
        "<li>The public repository is published. Current integration changes retain separate verification evidence.</li>",
    )
    page = page.replace(
        "<li>Required work first. Stretch only after the clean-room Docker test passes.</li>",
        "<li>Check each item’s scope: backend, demo UI, fixtures, compiled stack and live UI are distinct checks.</li>",
    )
    page = page.replace(
        "Seed the 100 invented patients from <code>prior-auth-pack</code>. That clears the minimum and gives real volume for the 100+ check.",
        "Prepare the 100 fictional source patients through DuckDB bronze/silver, then import them with the backend seed command. Test combined live-list behavior separately.",
    )
    page = page.replace(
        "Template by default so it runs with no keys. An LLM is optional, behind the same interface.",
        "A deterministic template is implemented and needs no provider key. An external LLM is not selected.",
    )
    page = page.replace(
        "Claim two: Alembic migrations and API unit tests. Overlaps such as server-side sort/filter get a one-line mention.",
        "The original brief suggests one or two. This project selects additional features; claim only the implemented and verified scope shown for each.",
    )
    page = page.replace(
        "Waits for your explicit go-ahead.",
        "Repository publication is authorized; fresh setup and final integration still have their own evidence.",
    )
    page = page.replace(
        "Punches are saved in this browser only. Items marked done inside this file’s source show as punched by default, so the checklist can be updated as work lands.",
        "Source checkmarks come from progress.json and the documented evidence. Personal checkbox overrides are saved only in this browser and do not change the official verification record.",
    )
    page = page.replace(
        "Built from <code>project.md</code> · 20 Nov 2026",
        "Generated from <code>progress.json</code> with original assessment IDs and selected additions.",
    )
    if 'data-tag="add"' not in page:
        needle = '<button type="button" class="fchip" data-tag="gate" style="--c:var(--gate)">Gate</button>'
        page = page.replace(
            needle,
            needle
            + '\n      <button type="button" class="fchip" data-tag="add" style="--c:var(--rec)">Selected</button>',
        )
    page = (
        page.replace(
            ".tag-req{--c:var(--req)}",
            ".tag-add{--c:var(--rec)} .tag-req{--c:var(--req)}",
        )
        if ".tag-add{" not in page
        else page
    )
    p.write_text(page)
    print(
        json.dumps(
            {
                "items": len(items),
                "phases": len(phases),
                "status_counts": dict(counts),
                "core_verified": core_done,
                "core_total": len(checks),
                "core_percent": core_pct,
                "core_partial": core_partial,
                "core_open": core_open,
                "outputs": ["reference/PROGRESS.md", "reference/holepunch.html"],
            }
        )
    )


if __name__ == "__main__":
    build()
