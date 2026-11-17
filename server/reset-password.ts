import { findMember, loadConfig } from './config';
import { openDb } from './db';

// Usage: npm run reset-password -- "Jade"
// Removes someone's password so they can choose a new one with the family passcode.
try {
  process.loadEnvFile('.env');
} catch {
  /* rely on the real environment */
}

async function main() {
  const config = loadConfig();
  const member = findMember(config.members, process.argv.slice(2).join(' '));
  if (!member) {
    console.error(`Prénom inconnu. Choisis parmi : ${config.members.join(', ')}`);
    process.exit(1);
  }
  const db = await openDb(config.databaseUrl, config.databaseAuthToken);
  const res = await db.execute({ sql: 'DELETE FROM credentials WHERE name = ?', args: [member] });
  console.log(
    res.rowsAffected
      ? `Mot de passe de ${member} réinitialisé : la personne peut en créer un nouveau à la connexion.`
      : `${member} n'avait pas de mot de passe.`,
  );
  db.close();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
