export interface Config {
  members: string[];
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
    .split(',')
    .map((m) => m.normalize('NFC').trim())
    .filter(Boolean);
  const passcode = env['FAMILY_PASSCODE'] ?? '';
  const sessionSecret = env['SESSION_SECRET'] ?? '';

  const problems: string[] = [];
  if (members.length < 2) problems.push('FAMILY_MEMBERS doit contenir au moins deux prénoms séparés par des virgules');
  if (new Set(members.map(foldName)).size !== members.length) {
    problems.push('FAMILY_MEMBERS contient des prénoms en double');
  }
  if (!passcode) problems.push('FAMILY_PASSCODE est requis');
  if (sessionSecret.length < 16) problems.push('SESSION_SECRET est requis (au moins 16 caractères)');
  if (problems.length) throw new Error(`Configuration invalide :\n - ${problems.join('\n - ')}`);

  return {
    members,
    passcode,
    sessionSecret,
    databaseUrl: env['TURSO_DATABASE_URL'] || 'file:data/whishper.db',
    databaseAuthToken: env['TURSO_AUTH_TOKEN'] || undefined,
    secureCookies: env['NODE_ENV'] === 'production' || !!env['VERCEL'],
  };
}
