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

  it('ignores stray semicolons at the end of values', () => {
    const cfg = loadConfig({ ...base, FAMILY_MEMBERS: 'Marie,Orélie,François;', MANAGED_MEMBERS: 'Orélie:François;' });
    expect(cfg.members).toEqual(['Marie', 'Orélie', 'François']);
    expect(cfg.managed).toEqual({ Orélie: ['François'] });
  });

  it('parses MANAGED_MEMBERS and rejects bad entries', () => {
    const FAMILY_MEMBERS = 'Marie,François,Orélie';
    expect(loadConfig({ ...base, FAMILY_MEMBERS, MANAGED_MEMBERS: 'orelie:Francois' }).managed).toEqual({ Orélie: ['François'] });
    expect(loadConfig({ ...base, FAMILY_MEMBERS, MANAGED_MEMBERS: 'Orélie:François+marie' }).managed).toEqual({ Orélie: ['François', 'Marie'] });
    expect(loadConfig({ ...base, FAMILY_MEMBERS, MANAGED_MEMBERS: 'Orélie:François+François' }).managed).toEqual({ Orélie: ['François'] });
    expect(loadConfig({ ...base, FAMILY_MEMBERS }).managed).toEqual({});
    expect(() => loadConfig({ ...base, FAMILY_MEMBERS, MANAGED_MEMBERS: 'Orélie:François+Zoé' })).toThrow(/MANAGED_MEMBERS/);
    expect(() => loadConfig({ ...base, FAMILY_MEMBERS, MANAGED_MEMBERS: 'Orélie:François+' })).toThrow(/MANAGED_MEMBERS/);
    expect(() => loadConfig({ ...base, FAMILY_MEMBERS, MANAGED_MEMBERS: 'Orélie:Orélie+Marie' })).toThrow(/MANAGED_MEMBERS/);
    expect(() => loadConfig({ ...base, FAMILY_MEMBERS, MANAGED_MEMBERS: 'Orélie:François,Orélie:Marie' })).toThrow(/MANAGED_MEMBERS/);
    expect(() => loadConfig({ ...base, FAMILY_MEMBERS, MANAGED_MEMBERS: 'Zoé:François' })).toThrow(/MANAGED_MEMBERS/);
    expect(() => loadConfig({ ...base, FAMILY_MEMBERS, MANAGED_MEMBERS: 'Orélie:Orélie' })).toThrow(/MANAGED_MEMBERS/);
    expect(() => loadConfig({ ...base, FAMILY_MEMBERS, MANAGED_MEMBERS: 'Orélie:François+Marie,François:Marie' })).toThrow(/gérée/);
    expect(() => loadConfig({ ...base, FAMILY_MEMBERS, MANAGED_MEMBERS: 'Orélie:François,François:Marie' })).toThrow(/gérée/);
  });
});
