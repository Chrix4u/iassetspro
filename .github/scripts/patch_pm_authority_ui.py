from pathlib import Path

path = Path('src/components/modules/MaintenancePages.tsx')
text = path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global text
    if new in text:
        print(f'{label}: already applied')
        return
    if old not in text:
        raise SystemExit(f'{label}: expected anchor not found')
    text = text.replace(old, new, 1)
    print(f'{label}: applied')


# Apply the main authority changes when running against an unpatched checkout.
if "editItem && (!Array.isArray(editItem.scheduledTasks) || editItem.scheduledTasks.length === 0)" in text:
    replace_once(
        """  const isLegacyScheduleEdit = Boolean(
    editItem && (!Array.isArray(editItem.scheduledTasks) || editItem.scheduledTasks.length === 0),
  );
""",
        """  const isLegacyScheduleEdit = Boolean(
    editItem && editItem.recurrenceAuthority !== 'task',
  );
""",
        'edit mode authority',
    )

if "if (Array.isArray(schedule.scheduledTasks) && schedule.scheduledTasks.length > 0)" in text:
    replace_once(
        """  const scheduleDueDates = (schedule: any) => {
    if (Array.isArray(schedule.scheduledTasks) && schedule.scheduledTasks.length > 0) {
      return schedule.scheduledTasks.map((task: any) => task.nextDueDate).filter(Boolean);
    }
    return isAutoCalculableFrequency(schedule.frequencyType) && schedule.nextDueDate ? [schedule.nextDueDate] : [];
  };
""",
        """  const scheduleDueDates = (schedule: any) => {
    if (schedule.recurrenceAuthority === 'task') {
      return Array.isArray(schedule.scheduledTasks)
        ? schedule.scheduledTasks.map((task: any) => task.nextDueDate).filter(Boolean)
        : [];
    }
    return isAutoCalculableFrequency(schedule.frequencyType) && schedule.nextDueDate ? [schedule.nextDueDate] : [];
  };
""",
        'due-date authority',
    )

if "{Array.isArray(s.scheduledTasks) && s.scheduledTasks.length > 0" in text:
    replace_once(
        """                      {Array.isArray(s.scheduledTasks) && s.scheduledTasks.length > 0
                        ? `Task-level · ${s.scheduledTasks.length} task${s.scheduledTasks.length === 1 ? '' : 's'}`
                        : freqLabel(s.frequencyType, s.frequencyValue, s.frequencyUnit, s.meterName)}
""",
        """                      {s.recurrenceAuthority === 'task'
                        ? `Task-level · ${s.scheduledTasks?.length ?? 0} task${s.scheduledTasks?.length === 1 ? '' : 's'}`
                        : freqLabel(s.frequencyType, s.frequencyValue, s.frequencyUnit, s.meterName)}
""",
        'table planning model authority',
    )

text = text.replace(
    "{due ? formatDate(due) : (s.scheduledTasks?.length ? 'Per task / signal' : '—')}",
    "{due ? formatDate(due) : (s.recurrenceAuthority === 'task' ? 'Per task / signal' : '—')}",
)

text = text.replace(
    """              <div className="rounded-xl border bg-muted/20 p-3 md:col-span-2 xl:col-span-12">
                <p className="text-sm font-semibold">Task-level automation is staged safely</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Task-level schedules keep recurrence on each Task Library record. Legacy automatic generation stays disabled until the dedicated TBM/UBM/CBM task engines are released.</p>
              </div>
""",
    """              <div className="rounded-xl border bg-muted/20 p-3 md:col-span-2 xl:col-span-12">
                <p className="text-sm font-semibold">Task-level automation</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Automatic work-order generation evaluates each Scheduled Task independently using TBM/UBM/CBM due logic; recurrence advances only after verified planner closeout.</p>
              </div>
""",
)

# View/detail authority conversion.
text = text.replace("viewItem.scheduledTasks?.length ?", "viewItem.recurrenceAuthority === 'task' ?")
text = text.replace(
    "`Task-level · ${viewItem.scheduledTasks.length} independent task${viewItem.scheduledTasks.length === 1 ? '' : 's'}`",
    "`Task-level · ${viewItem.scheduledTasks?.length ?? 0} independent task${viewItem.scheduledTasks?.length === 1 ? '' : 's'}`",
)
text = text.replace(
    "{viewItem.scheduledTasks?.length ?? viewItem.template?.tasks?.length ?? 0} task{(viewItem.scheduledTasks?.length ?? viewItem.template?.tasks?.length) === 1 ? '' : 's'}",
    "{viewItem.recurrenceAuthority === 'task' ? (viewItem.scheduledTasks?.length ?? 0) : (viewItem.template?.tasks?.length ?? 0)} task{(viewItem.recurrenceAuthority === 'task' ? (viewItem.scheduledTasks?.length ?? 0) : (viewItem.template?.tasks?.length ?? 0)) === 1 ? '' : 's'}",
)
# Repair the malformed expression produced by the first patch attempt, if present.
text = text.replace(
    "{viewItem.recurrenceAuthority === 'task' ?? viewItem.template?.tasks?.length ?? 0} task{(viewItem.recurrenceAuthority === 'task' ?? viewItem.template?.tasks?.length) === 1 ? '' : 's'}",
    "{viewItem.recurrenceAuthority === 'task' ? (viewItem.scheduledTasks?.length ?? 0) : (viewItem.template?.tasks?.length ?? 0)} task{(viewItem.recurrenceAuthority === 'task' ? (viewItem.scheduledTasks?.length ?? 0) : (viewItem.template?.tasks?.length ?? 0)) === 1 ? '' : 's'}",
)
text = text.replace(
    "{viewItem.recurrenceAuthority === 'task' ? 'Staged · task engines pending' : (viewItem.autoGenerateWO ? 'Enabled' : 'Disabled')}",
    "{viewItem.recurrenceAuthority === 'task' ? (viewItem.autoGenerateWO ? 'Enabled · task due engine' : 'Disabled') : (viewItem.autoGenerateWO ? 'Enabled' : 'Disabled')}",
)
text = text.replace(
    "{viewItem.scheduledTasks.map((task: any) => {",
    "{(viewItem.scheduledTasks || []).map((task: any) => {",
)

# Safety assertions for this patcher itself.
for forbidden in (
    "editItem && (!Array.isArray(editItem.scheduledTasks) || editItem.scheduledTasks.length === 0)",
    "if (Array.isArray(schedule.scheduledTasks) && schedule.scheduledTasks.length > 0)",
    "viewItem.scheduledTasks?.length ?",
    "viewItem.recurrenceAuthority === 'task' ??",
    "Staged · task engines pending",
    "Legacy automatic generation stays disabled until the dedicated TBM/UBM/CBM task engines are released.",
):
    if forbidden in text:
        raise SystemExit(f'forbidden stale UI authority expression remains: {forbidden}')

for required in (
    "editItem && editItem.recurrenceAuthority !== 'task'",
    "schedule.recurrenceAuthority === 'task'",
    "s.recurrenceAuthority === 'task'",
    "viewItem.recurrenceAuthority === 'task'",
    "TBM/UBM/CBM due logic",
):
    if required not in text:
        raise SystemExit(f'required authority expression missing: {required}')

path.write_text(text)
print('PM authority-aware UI patch complete')
