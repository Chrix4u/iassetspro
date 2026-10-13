from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(rel: str, old: str, new: str) -> None:
    path = ROOT / rel
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{rel}: expected exactly one match, found {count}: {old[:100]!r}')
    path.write_text(text.replace(old, new, 1))


# Prisma model: acquisition condition is independent from maintenance health.
replace_once(
    'prisma/schema.prisma',
    '  condition         String    @default("new") // new, good, fair, poor, out_of_service\n',
    '  acquisitionCondition String    @default("new") // new, used\n'
    '  condition         String    @default("new") // maintenance health: new, good, fair, poor, out_of_service\n',
)

# Asset Register form state must no longer overwrite maintenance health.
replace_once(
    'src/components/modules/AssetPages.tsx',
    "yearManufactured: '', condition: 'new', status: 'operational'",
    "yearManufactured: '', acquisitionCondition: 'new', status: 'operational'",
)
replace_once(
    'src/components/modules/AssetPages.tsx',
    "yearManufactured: a.yearManufactured?.toString() || '', condition: a.condition || 'new', status: a.status || 'operational'",
    "yearManufactured: a.yearManufactured?.toString() || '', acquisitionCondition: a.acquisitionCondition || 'new', status: a.status || 'operational'",
)

# Header actions: wrap and share the row on compact screens.
replace_once(
    'src/components/modules/AssetPages.tsx',
    "          <div className='flex gap-2'>\n            <Button onClick={openCreate} className='bg-emerald-600 hover:bg-emerald-700 text-white'><Plus className='h-4 w-4 mr-1.5' />Add Asset</Button>\n            <Button onClick={() => setAiGeneratorOpen(true)} variant='outline' className='border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-400 dark:hover:bg-violet-950/30 gap-1.5'><Sparkles className='h-4 w-4' />AI Generate</Button>\n          </div>",
    "          <div className='flex w-full flex-wrap gap-2 sm:w-auto'>\n            <Button onClick={openCreate} className='flex-1 bg-emerald-600 hover:bg-emerald-700 text-white sm:flex-none'><Plus className='h-4 w-4 mr-1.5' />Add Asset</Button>\n            <Button onClick={() => setAiGeneratorOpen(true)} variant='outline' className='flex-1 border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-400 dark:hover:bg-violet-950/30 gap-1.5 sm:flex-none'><Sparkles className='h-4 w-4' />AI Generate</Button>\n          </div>",
)

# Responsive filter grid and explicit health terminology.
replace_once(
    'src/components/modules/AssetPages.tsx',
    '      <div className="filter-row flex flex-wrap gap-3 items-center">\n        <div className="relative min-w-[200px] flex-1 max-w-sm">',
    '      <div className="filter-row grid grid-cols-2 gap-3 lg:grid-cols-[minmax(14rem,1.7fr)_minmax(9rem,.8fr)_minmax(9rem,.8fr)_minmax(9rem,.8fr)_auto] lg:items-center">\n        <div className="relative col-span-2 min-w-0 lg:col-span-1">',
)
replace_once(
    'src/components/modules/AssetPages.tsx',
    '<SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>',
    '<SelectTrigger className="w-full"><SelectValue placeholder="Status" /></SelectTrigger>',
)
replace_once(
    'src/components/modules/AssetPages.tsx',
    '<SelectTrigger className="w-[160px]"><SelectValue placeholder="Condition" /></SelectTrigger>\n          <SelectContent><SelectItem value="all">All Condition</SelectItem><SelectItem value="new">New</SelectItem><SelectItem value="good">Good</SelectItem><SelectItem value="fair">Fair</SelectItem><SelectItem value="poor">Poor</SelectItem></SelectContent>',
    '<SelectTrigger className="w-full"><SelectValue placeholder="Health" /></SelectTrigger>\n          <SelectContent><SelectItem value="all">All Health</SelectItem><SelectItem value="new">New / not yet assessed</SelectItem><SelectItem value="good">Good</SelectItem><SelectItem value="fair">Fair</SelectItem><SelectItem value="poor">Poor</SelectItem><SelectItem value="out_of_service">Out of Service</SelectItem></SelectContent>',
)
replace_once(
    'src/components/modules/AssetPages.tsx',
    '<SelectTrigger className="w-[160px]"><SelectValue placeholder="Criticality" /></SelectTrigger>',
    '<SelectTrigger className="w-full"><SelectValue placeholder="Criticality" /></SelectTrigger>',
)
replace_once(
    'src/components/modules/AssetPages.tsx',
    '        <div className="flex items-center gap-2 ml-auto">\n          <label className="text-xs text-muted-foreground whitespace-nowrap">Show sub-components</label>',
    '        <div className="col-span-2 flex items-center gap-2 lg:col-span-1 lg:ml-auto">\n          <label className="text-xs text-muted-foreground whitespace-nowrap">Show sub-components</label>',
)

# Register table: show acquisition condition separately from health.
replace_once(
    'src/components/modules/AssetPages.tsx',
    '                <TableHead className="hidden xl:table-cell">Condition</TableHead>\n                <TableHead className="w-10">Actions</TableHead>',
    '                <TableHead className="hidden xl:table-cell">Condition</TableHead>\n                <TableHead className="hidden xl:table-cell">Health</TableHead>\n                <TableHead className="w-10">Actions</TableHead>',
)
replace_once(
    'src/components/modules/AssetPages.tsx',
    '<TableRow><TableCell colSpan={8} className="h-48">',
    '<TableRow><TableCell colSpan={9} className="h-48">',
)
replace_once(
    'src/components/modules/AssetPages.tsx',
    '                  <TableCell className="text-xs hidden xl:table-cell capitalize">{a.condition || \'-\'}</TableCell>\n                  <TableCell>',
    '                  <TableCell className="text-xs hidden xl:table-cell capitalize">{a.acquisitionCondition || \'-\'}</TableCell>\n                  <TableCell className="text-xs hidden xl:table-cell capitalize">{a.condition || \'-\'}</TableCell>\n                  <TableCell>',
)

# Add/Edit form: exactly New or Used, bound to acquisitionCondition.
replace_once(
    'src/components/modules/AssetPages.tsx',
    '              <div className="space-y-1.5"><Label>Condition</Label>\n                <Select value={form.condition} onValueChange={v => setForm(f => ({ ...f, condition: v }))}>\n                  <SelectTrigger><SelectValue /></SelectTrigger>\n                  <SelectContent><SelectItem value="new">New</SelectItem><SelectItem value="good">Good</SelectItem><SelectItem value="fair">Fair</SelectItem><SelectItem value="poor">Poor</SelectItem></SelectContent>\n                </Select>\n              </div>',
    '              <div className="space-y-1.5"><Label>Condition</Label>\n                <Select value={form.acquisitionCondition} onValueChange={v => setForm(f => ({ ...f, acquisitionCondition: v }))}>\n                  <SelectTrigger><SelectValue /></SelectTrigger>\n                  <SelectContent><SelectItem value="new">New</SelectItem><SelectItem value="used">Used</SelectItem></SelectContent>\n                </Select>\n              </div>',
)

# Create API: accept/validate acquisition condition without changing health semantics.
replace_once(
    'src/app/api/assets/route.ts',
    '      yearManufactured,\n      condition,\n      status,',
    '      yearManufactured,\n      acquisitionCondition,\n      condition,\n      status,',
)
replace_once(
    'src/app/api/assets/route.ts',
    "    if (!categoryId) {\n      return NextResponse.json({ success: false, error: 'Category is required' }, { status: 400 });\n    }",
    "    if (acquisitionCondition !== undefined && acquisitionCondition !== 'new' && acquisitionCondition !== 'used') {\n      return NextResponse.json({ success: false, error: 'Condition must be New or Used' }, { status: 400 });\n    }\n\n    if (!categoryId) {\n      return NextResponse.json({ success: false, error: 'Category is required' }, { status: 400 });\n    }",
)
replace_once(
    'src/app/api/assets/route.ts',
    "        yearManufactured: yearManufactured ? parseInt(yearManufactured, 10) : null,\n        condition: condition || 'new',",
    "        yearManufactured: yearManufactured ? parseInt(yearManufactured, 10) : null,\n        acquisitionCondition: acquisitionCondition || 'new',\n        condition: condition || 'new',",
)

# Update API: same validation and scalar support; health `condition` remains independently writable.
replace_once(
    'src/app/api/assets/[id]/route.ts',
    "    if (body.assetTag !== undefined) {",
    "    if (body.acquisitionCondition !== undefined && body.acquisitionCondition !== 'new' && body.acquisitionCondition !== 'used') {\n      return NextResponse.json({ success: false, error: 'Condition must be New or Used' }, { status: 400 });\n    }\n\n    if (body.assetTag !== undefined) {",
)
replace_once(
    'src/app/api/assets/[id]/route.ts',
    "      'condition', 'status', 'criticality', 'location',",
    "      'acquisitionCondition', 'condition', 'status', 'criticality', 'location',",
)

print('Asset Register responsive/acquisition-condition patch applied successfully.')
