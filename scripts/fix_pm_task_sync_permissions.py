from pathlib import Path

route = Path('src/app/api/admin/sync-permissions/route.ts')
text = route.read_text()
needle = "  pm_schedules: ['view', 'create', 'update', 'delete', 'activate', 'run'],\n"
entry = "  pm_tasks: ['view', 'create', 'update', 'delete', 'import'],\n"
if entry not in text:
    if needle not in text:
        raise SystemExit('pm_schedules permission definition anchor not found')
    text = text.replace(needle, needle + entry, 1)
route.write_text(text)

test = Path('src/__tests__/pm/pm-task-library-schema-contract.test.ts')
t = test.read_text()
old = "  it('mirrors task permissions into runtime sync', () => { const s = read('src/app/api/admin/sync-permissions/route.ts'); for (const p of ['pm_tasks.view','pm_tasks.create','pm_tasks.update','pm_tasks.delete','pm_tasks.import']) expect(s).toContain(`'${p}'`); });"
new = "  it('mirrors task permissions into runtime sync', () => { const s = read('src/app/api/admin/sync-permissions/route.ts'); expect(s).toContain(\"pm_tasks: ['view', 'create', 'update', 'delete', 'import']\"); for (const p of ['pm_tasks.view','pm_tasks.create','pm_tasks.update','pm_tasks.delete','pm_tasks.import']) expect(s).toContain(`'${p}'`); });"
if old not in t:
    raise SystemExit('runtime sync contract anchor not found')
test.write_text(t.replace(old, new, 1))
