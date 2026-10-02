import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

describe('GTP commissioning script source contracts', () => {
  it('keeps the Stenter 6 work-order mapping rules as valid source text', () => {
    const script = fs.readFileSync('scripts/commission-gtp-stenter6-work-order-components.ts', 'utf8');

    // Regression for escaped newlines accidentally committed as literal source text.
    expect(script).not.toContain('},\\n {key:');
    expect(script).toContain("{key:'yard',code:'INS-YARD',re:/yards? counter/i},\n {key:'pin-roller'");
    expect(script).toContain("{key:'electrical',code:'PRT-ELEC-CABLE',re:/electrical cables?/i},\n {key:'infeed-light'");
  });

  it('parses every GTP commissioner and verifier with TypeScript', () => {
    const scripts = fs.readdirSync('scripts')
      .filter((name) =>
        /^(commission|verify)-gtp-.*\.ts$/.test(name)
      )
      .sort();

    expect(scripts.length).toBeGreaterThan(0);

    const failures: string[] = [];
    for (const name of scripts) {
      const source = fs.readFileSync(path.join('scripts', name), 'utf8');
      const result = ts.transpileModule(source, {
        fileName: name,
        reportDiagnostics: true,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.CommonJS,
        },
      });

      const errors = (result.diagnostics ?? []).filter(
        (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
      );
      if (errors.length > 0) {
        const messages = errors.map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
        );
        failures.push(`${name}: ${messages.join(' | ')}`);
      }
    }

    expect(failures).toEqual([]);
  });
});
