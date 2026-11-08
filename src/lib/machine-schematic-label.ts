/** Wrap every word, including long equipment codes, without inserting ellipses. */
export function wrapSchematicLabel(value: string, maxChars: number): string[] {
  const chunks = value.trim().split(/\s+/).flatMap((word) => {
    const pieces: string[] = [];
    for (let i = 0; i < word.length; i += maxChars) pieces.push(word.slice(i, i + maxChars));
    return pieces;
  });
  const lines: string[] = [];
  for (const chunk of chunks) {
    const previous = lines[lines.length - 1];
    if (previous && previous.length + chunk.length + 1 <= maxChars) {
      lines[lines.length - 1] = previous + ' ' + chunk;
    } else {
      lines.push(chunk);
    }
  }
  return lines.length ? lines : ['—'];
}
