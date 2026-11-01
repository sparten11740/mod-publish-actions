import { describe, expect, it } from 'vitest';

import { parseChoice, parseDependencies, parseList } from './parse';

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

describe('parseChoice', () => {
  it('returns a value that is one of the choices', () => {
    expect(parseChoice('release-type', 'beta', ['alpha', 'beta'])).toBe('beta');
  });

  it('names the input and the choices when the value is not one of them', () => {
    expect(() => parseChoice('release-type', 'stable', ['alpha', 'beta'])).toThrow('release-type must be one of alpha, beta, got "stable"');
  });
});

describe('parseDependencies', () => {
  it('reads a project and type from each entry', () => {
    expect(parseDependencies('fabric-api:required\nsable:optional')).toEqual([
      { project: 'fabric-api', type: 'required' },
      { project: 'sable', type: 'optional' },
    ]);
  });

  it('returns an empty list for an empty value', () => {
    expect(parseDependencies('')).toEqual([]);
  });

  it('rejects an entry without a type', () => {
    expect(() => parseDependencies('fabric-api')).toThrow('must look like project:type');
  });

  it('rejects an entry without a project', () => {
    expect(() => parseDependencies(':required')).toThrow('must look like project:type');
  });

  it('rejects an unknown type', () => {
    expect(() => parseDependencies('fabric-api:needed')).toThrow('dependency type must be one of');
  });
});
