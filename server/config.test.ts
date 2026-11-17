import { describe, expect, it } from 'vitest';
import { findMember, foldName, loadConfig } from './config';

const base = { FAMILY_PASSCODE: 'x', SESSION_SECRET: 'a-long-enough-secret' };

describe('config names', () => {
  it('normalizes accented names to NFC', () => {
    const cfg = loadConfig({ ...base, FAMILY_MEMBERS: 'Ste\u0301phanie, Michaël ,François' });
    expect(cfg.members).toEqual(['Stéphanie', 'Michaël', 'François']);
  });

  it('folds accents and case for matching', () => {
    expect(foldName('Orélie')).toBe('orelie');
    expect(findMember(['Mélanie', 'Marie'], 'MELANIE')).toBe('Mélanie');
    expect(findMember(['Mélanie', 'Marie'], 'Mélanie')).toBe('Mélanie');
    expect(findMember(['Mélanie', 'Marie'], 'Mallory')).toBeUndefined();
    expect(findMember(['Mélanie'], 42)).toBeUndefined();
  });

  it('rejects names that only differ by accents', () => {
    expect(() => loadConfig({ ...base, FAMILY_MEMBERS: 'Stéphanie,Stephanie' })).toThrow(/double/);
  });

  it('accepts the nine family names', () => {
    const names = 'Stéphanie,Michaël,Nathaniel,Jade,Marie,Stéphane,Orélie,François,Mélanie';
    expect(loadConfig({ ...base, FAMILY_MEMBERS: names }).members).toHaveLength(9);
  });
});
