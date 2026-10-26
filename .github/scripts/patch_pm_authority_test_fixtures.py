from pathlib import Path


def replace_once(path_str: str, old: str, new: str, label: str) -> None:
    path = Path(path_str)
    text = path.read_text()
    if new in text:
        print(f"{label}: already applied")
        return
    if old not in text:
        raise SystemExit(f"{label}: expected anchor not found")
    path.write_text(text.replace(old, new, 1))
    print(f"{label}: applied")


def dedupe_once(path_str: str, duplicated: str, canonical: str, label: str) -> None:
    path = Path(path_str)
    text = path.read_text()
    if duplicated not in text:
        print(f"{label}: no duplicate present")
        return
    path.write_text(text.replace(duplicated, canonical, 1))
    print(f"{label}: duplicate removed")


replace_once(
    "src/services/pm/__tests__/pmScheduledTaskGeneration.service.test.ts",
    "  autoGenerateWO: false,\n  isActive: true,\n",
    "  autoGenerateWO: false,\n  recurrenceAuthority: 'task',\n  isActive: true,\n",
    "task generator fixture authority",
)

replace_once(
    "src/__tests__/pm/component-targeted-pm-generation.test.ts",
    "      autoGenerateWO: true,\n      frequencyType: 'weekly',\n",
    "      autoGenerateWO: true,\n      recurrenceAuthority: 'legacy_header',\n      frequencyType: 'weekly',\n",
    "legacy component fixture authority",
)

dedupe_once(
    "src/__tests__/pm/component-targeted-pm-generation.test.ts",
    "      isActive: true,\n      recurrenceAuthority: 'legacy_header',\n      autoGenerateWO: true,\n      recurrenceAuthority: 'legacy_header',\n",
    "      isActive: true,\n      autoGenerateWO: true,\n      recurrenceAuthority: 'legacy_header',\n",
    "legacy component fixture authority",
)

replace_once(
    "src/__tests__/pm/pm-scheduled-task-api-contract.test.ts",
    "  departmentId: null, templateId: null, autoGenerateWO: false, leadDays: 0, isActive: true, createdById: 'planner-1',\n",
    "  departmentId: null, templateId: null, autoGenerateWO: false, recurrenceAuthority: 'task', leadDays: 0, isActive: true, createdById: 'planner-1',\n",
    "task-level API fixture default authority",
)

replace_once(
    "src/__tests__/pm/pm-scheduled-task-api-contract.test.ts",
    "    const existing = schedule({ tasks: [] });\n",
    "    const existing = schedule({ recurrenceAuthority: 'legacy_header', tasks: [] });\n",
    "legacy-to-task transition fixture authority",
)

print("PM authority test fixture patch complete")
