import { describe, expect, it } from 'vitest';

import { parseDependencies } from './parse-dependencies';

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
