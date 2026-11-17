export interface Config {
  members: string[];
  passcode: string;
  sessionSecret: string;
  databaseUrl: string;
  databaseAuthToken?: string;
  secureCookies: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const members = (env['FAMILY_MEMBERS'] ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  const passcode = env['FAMILY_PASSCODE'] ?? '';
  const sessionSecret = env['SESSION_SECRET'] ?? '';

  const problems: string[] = [];
  if (members.length < 2) problems.push('FAMILY_MEMBERS must list at least two comma-separated names');
  if (new Set(members.map((m) => m.toLowerCase())).size !== members.length) {
    problems.push('FAMILY_MEMBERS contains duplicate names');
  }
  if (!passcode) problems.push('FAMILY_PASSCODE is required');
  if (sessionSecret.length < 16) problems.push('SESSION_SECRET is required (at least 16 characters)');
  if (problems.length) throw new Error(`Invalid configuration:\n - ${problems.join('\n - ')}`);

  return {
    members,
    passcode,
    sessionSecret,
    databaseUrl: env['TURSO_DATABASE_URL'] || 'file:data/whishper.db',
    databaseAuthToken: env['TURSO_AUTH_TOKEN'] || undefined,
    secureCookies: env['NODE_ENV'] === 'production' || !!env['VERCEL'],
  };
}
