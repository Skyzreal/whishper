export interface Config {
  members: string[];
  /** Members without an account (e.g. a child), mapped to the members who manage their list. */
  managed: Record<string, string[]>;
  passcode: string;
  sessionSecret: string;
  databaseUrl: string;
  databaseAuthToken?: string;
  secureCookies: boolean;
}

/** Case- and accent-insensitive form of a name, so "stephanie" matches "Stéphanie". */
export function foldName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .normalize('NFC')
    .trim()
    .toLowerCase();
}

export function findMember(members: string[], name: unknown): string | undefined {
  if (typeof name !== 'string') return undefined;
  const wanted = foldName(name);
  return wanted ? members.find((m) => foldName(m) === wanted) : undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const members = (env['FAMILY_MEMBERS'] ?? '')
    .split(/[,;]/)
    .map((m) => m.normalize('NFC').trim())
    .filter(Boolean);
  const managed: Record<string, string[]> = {};
  const managedProblems: string[] = [];
  for (const entry of (env['MANAGED_MEMBERS'] ?? '').split(/[,;]/).map((e) => e.trim()).filter(Boolean)) {
    const [childRaw, guardiansRaw, ...extra] = entry.split(':');
    const child = findMember(members, childRaw);
    const guardians = (guardiansRaw ?? '').split('+').map((g) => findMember(members, g));
    const valid = guardians.filter((g): g is string => !!g);
    if (!child || extra.length || valid.length !== guardians.length || valid.includes(child) || child in managed) {
      managedProblems.push(`MANAGED_MEMBERS : « ${entry} » est invalide (format attendu : Enfant:Parent ou Enfant:Parent1+Parent2, tous dans FAMILY_MEMBERS)`);
    } else {
      managed[child] = [...new Set(valid)];
    }
  }
  if (Object.values(managed).some((gs) => gs.some((g) => g in managed))) {
    managedProblems.push('MANAGED_MEMBERS : une personne qui gère une liste ne peut pas avoir elle-même sa liste gérée');
  }
  const passcode = env['FAMILY_PASSCODE'] ?? '';
  const sessionSecret = env['SESSION_SECRET'] ?? '';

  const problems: string[] = [];
  if (members.length < 2) problems.push('FAMILY_MEMBERS doit contenir au moins deux prénoms séparés par des virgules');
  if (new Set(members.map(foldName)).size !== members.length) {
    problems.push('FAMILY_MEMBERS contient des prénoms en double');
  }
  problems.push(...managedProblems);
  if (!passcode) problems.push('FAMILY_PASSCODE est requis');
  if (sessionSecret.length < 16) problems.push('SESSION_SECRET est requis (au moins 16 caractères)');
  if (problems.length) throw new Error(`Configuration invalide :\n - ${problems.join('\n - ')}`);

  return {
    members,
    managed,
    passcode,
    sessionSecret,
    databaseUrl: env['TURSO_DATABASE_URL'] || 'file:data/whishper.db',
    databaseAuthToken: env['TURSO_AUTH_TOKEN'] || undefined,
    secureCookies: env['NODE_ENV'] === 'production' || !!env['VERCEL'],
  };
}
