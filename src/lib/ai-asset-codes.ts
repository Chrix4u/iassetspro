/**
 * Deterministic user-configurable root code for an unverified AI asset draft.
 * OEM manufacturer part numbers are independent from these internal IDs.
 */
export function normalizeAiMachineCode(input: unknown, defaultCode: string): string {
  if (input === undefined || input === null || input === '') return defaultCode;
  if (typeof input !== 'string') throw new Error('Machine code must be text');
  const code = input.trim().toUpperCase();
  if (code.length < 3 || code.length > 40 ||
      !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(code)) {
    throw new Error('Machine code must be 3–40 letters, numbers or dash-separated groups');
  }
  return code;
}

function segment(prefix: 'A' | 'C' | 'P', zeroBasedIndex: number): string {
  if (!Number.isInteger(zeroBasedIndex) || zeroBasedIndex < 0 || zeroBasedIndex >= 1000) {
    throw new Error('AI draft hierarchy index out of bounds');
  }
  return prefix + String(zeroBasedIndex + 1).padStart(2, '0');
}

/** Codes reflect only the levels actually generated, never a fabricated subassembly. */
export function aiAssemblyCode(machineCode: string, assemblyIndex: number): string {
  return machineCode + '-' + segment('A', assemblyIndex);
}
export function aiComponentCode(machineCode: string, assemblyIndex: number, componentIndex: number): string {
  return aiAssemblyCode(machineCode, assemblyIndex) + '-' + segment('C', componentIndex);
}
export function aiPartCode(machineCode: string, assemblyIndex: number, componentIndex: number, partIndex: number): string {
  return aiComponentCode(machineCode, assemblyIndex, componentIndex) + '-' + segment('P', partIndex);
}
