import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';

const source=(path:string)=>readFileSync(path,'utf8');
const prod=source('prisma/seed.ts');
const fixture=source('scripts/seed-repairs-uat-rbac.ts');
const uatActors=source('scripts/seed-repairs-uat.ts');
const workflow=source('.github/workflows/ci.yml');
const provision=source('scripts/smart-anatomy/provision-reliability-role.ts');

function bundle(text:string,slug:string){
  const marker='  '+slug+': [';
  const begin=text.indexOf(marker);
  if(begin<0)throw Error('Missing canonical role '+slug);
  const end=text.indexOf('\n  ],',begin);
  if(end<0)throw Error('Unterminated role '+slug);
  return text.slice(begin,end);
}

describe('production-safe independently authorized Smart Anatomy engineering roles',()=>{
  it('seeds a dedicated reliability engineer with managing rights and plant-safe viewing',()=>{
    expect(prod).toContain("slug: 'reliability_engineer'");
    for(const text of [prod,fixture]){
      const engineer=bundle(text,'reliability_engineer');
      expect(engineer).toContain("'digital_twin.manage'");
      expect(engineer).toContain("'digital_twin.view'");
      expect(engineer).toContain("'assets.view_all'");
      expect(engineer).not.toContain("'roles.manage'");
      expect(engineer).not.toContain("'users.manage'");
      expect(engineer).not.toContain("'system_settings.manage'");
    }
  });
  it('keeps planner, supervisor, technician and manager as geometry viewers only',()=>{
    for(const slug of [
      'maintenance_manager','maintenance_planner',
      'maintenance_supervisor','maintenance_technician',
    ]){
      const main=bundle(prod,slug);
      expect(main).toContain("'digital_twin.view'");
      expect(main).not.toContain("'digital_twin.manage'");
      if(slug!=='maintenance_manager'){
        const uat=bundle(fixture,slug);
        expect(uat).toContain("'digital_twin.view'");
        expect(uat).not.toContain("'digital_twin.manage'");
      }
    }
  });
  it('reproduces the real maker-checker permission scheme in isolated UAT',()=>{
    expect(uatActors).toContain("username: 'uat_reliability_a'");
    expect(uatActors).toContain("username: 'uat_reliability_b'");
    expect(uatActors).toContain("roleSlugs: ['reliability_engineer']");
    expect(fixture).toContain("['reliability_engineer', 'digital_twin.manage']");
    expect(source('e2e/repairs/helpers/api.ts')).toContain("engineer_a: 'uat_reliability_a'");
    expect(source('e2e/repairs/helpers/api.ts')).toContain("engineer_b: 'uat_reliability_b'");
  });
  it('uses only ephemeral owner-only CI private storage, never a public folder or production database',()=>{
    expect(workflow).toContain('root="$RUNNER_TEMP/iassetspro-private-cad-uat"');
    expect(workflow).toContain('chmod 0700 "$root"');
    expect(workflow).toContain('node scripts/smart-anatomy/check-private-cad-storage.mjs');
    expect(workflow).toContain('DATABASE_URL: postgresql://repairs_uat');
    expect(source('e2e/repairs/scenario-ao-private-site-scan-lifecycle.spec.ts'))
      .toContain("process.env.DATABASE_URL||'').includes('repairs_uat')");
  });
  it('requires an explicit --apply and never touches credentials or creates users',()=>{
    expect(provision).toContain("if(!process.argv.includes('--apply'))");
    expect(provision).toContain('db.$transaction(async tx=>');
    expect(provision).toContain('where:{slug:\'reliability_engineer\'}');
    expect(provision).not.toContain('user.create(');
    expect(provision).not.toContain('userRole.create(');
    expect(provision).not.toContain('passwordHash');
  });
});
