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


replace_once(
    "src/services/pm/__tests__/pmScheduledTaskGeneration.service.test.ts",
    "  autoGenerateWO: false,\n  isActive: true,\n",
    "  autoGenerateWO: false,\n  recurrenceAuthority: 'task',\n  isActive: true,\n",
    "task generation fixture authority",
)
replace_once(
    "src/services/pm/__tests__/pmScheduledTaskGeneration.service.test.ts",
    "        isActive: true,\n        autoGenerateWO: true,\n",
    "        isActive: true,\n        recurrenceAuthority: 'task',\n        autoGenerateWO: true,\n",
    "task generation discovery assertion",
)
replace_once(
    "src/__tests__/pm/component-targeted-pm-generation.test.ts",
    "      isActive: true,\n      autoGenerateWO: true,\n      frequencyType: 'weekly',\n",
    "      isActive: true,\n      recurrenceAuthority: 'legacy_header',\n      autoGenerateWO: true,\n      frequencyType: 'weekly',\n",
    "legacy component generation fixture authority",
)
replace_once(
    "src/__tests__/pm/pm-scheduled-task-api-contract.test.ts",
    "  departmentId: null, templateId: null, autoGenerateWO: false, leadDays: 0, isActive: true, createdById: 'planner-1',\n",
    "  departmentId: null, templateId: null, autoGenerateWO: false, recurrenceAuthority: 'task', leadDays: 0, isActive: true, createdById: 'planner-1',\n",
    "scheduled-task API default fixture authority",
)
replace_once(
    "src/__tests__/pm/pm-scheduled-task-api-contract.test.ts",
    "      autoGenerateWO: true, frequencyType: 'time_day', frequencyValue: 1, frequencyUnit: 'days', nextDueDate: null, leadDays: 0,\n",
    "      autoGenerateWO: true, recurrenceAuthority: 'task', frequencyType: 'time_day', frequencyValue: 1, frequencyUnit: 'days', nextDueDate: null, leadDays: 0,\n",
    "task-level create authority assertion",
)
replace_once(
    "src/__tests__/pm/pm-scheduled-task-api-contract.test.ts",
    "    expect(mocks.tx.pmSchedule.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ autoGenerateWO: true }) }));\n",
    "    expect(mocks.tx.pmSchedule.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ autoGenerateWO: true, recurrenceAuthority: 'legacy_header' }) }));\n",
    "legacy create authority assertion",
)

print("PM authority test fixtures updated")
