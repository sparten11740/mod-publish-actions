import { describe, expect, it } from 'vitest';

import { parseList } from './parse-list';

describe('parseList', () => {
  it('splits on commas and new lines', () => {
    expect(parseList('1.21.1, 1.21\n26.1.2')).toEqual(['1.21.1', '1.21', '26.1.2']);
  });

  it('keeps spaces inside an entry', () => {
    expect(parseList('Java 21')).toEqual(['Java 21']);
  });

  it('drops empty entries', () => {
    expect(parseList('\n  neoforge ,,\n')).toEqual(['neoforge']);
  });

  it('returns an empty list for an empty value', () => {
    expect(parseList('')).toEqual([]);
  });
});
