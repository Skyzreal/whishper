export interface Release {
  /** Shown as « v1.2 ». */
  version: string;
  /** YYYY-MM-DD */
  date: string;
  title: string;
  /** Only things the family can see or do. No fixes, no technical details. */
  notes: string[];
}

/**
 * Les nouveautés de Whishper, de la plus récente à la plus ancienne.
 * Pour publier une version : ajoute un bloc EN HAUT de la liste (voir « Publier des notes de version » dans le README).
 */
export const RELEASES: readonly Release[] = [
  {
    version: '1.4',
    date: '2026-11-23',
    title: 'Les photos arrivent !',
    notes: [
      'Tu peux maintenant ajouter une photo à ton idée : depuis ta galerie, avec l\'appareil photo du téléphone, ou en glissant une image sur l\'ordinateur.',
      'Une photo suffit : pas besoin de titre ni de lien. L\'idée s\'appelle alors « Idée cadeau ».',
      'Tu peux changer ou retirer la photo en tout temps avec « Modifier ».',
      'Une page « Nouveautés » pour voir ce qui change dans Whishper.',
    ],
  },
  {
    version: '1.3',
    date: '2026-11-18',
    title: 'Modifier et coups de cœur',
    notes: [
      'Tu peux modifier une idée après l\'avoir ajoutée (titre, lien, prix, précisions).',
      'Marque une idée comme coup de cœur ⭐ : elle monte en haut de ta liste, avec une étoile.',
      'La guirlande du haut est plus grosse, et ses lumières s\'allument et s\'éteignent par couleur.',
    ],
  },
  {
    version: '1.2',
    date: '2026-11-17',
    title: 'Whishper se met à Noël',
    notes: [
      'Nouveau look de Noël : rouge, vert et or, guirlande, neige sur la page de connexion.',
      'Un logo et une icône à Whishper, pour l\'écran d\'accueil de ton téléphone.',
      'Sur téléphone : barre d\'onglets en bas et bouton « + » en boule de Noël pour ajouter une idée.',
      'Titres centrés et navigation mieux alignée, sur mobile comme sur ordinateur.',
    ],
  },
  {
    version: '1.1',
    date: '2026-11-17',
    title: 'Plus de façons d\'offrir',
    notes: [
      'Certains cadeaux peuvent être offerts par plusieurs personnes (une carte-cadeau, par exemple). Ceux qui le prennent se voient entre eux.',
      'Un parent peut gérer la liste d\'un enfant qui n\'a pas de compte.',
      'Mot de passe oublié ? Tu peux en choisir un nouveau depuis la page de connexion, avec le code de la famille.',
    ],
  },
  {
    version: '1.0',
    date: '2026-11-17',
    title: 'Le premier Whishper',
    notes: [
      'Chaque personne a sa liste de souhaits, avec son nom et son propre mot de passe.',
      'Ajoute une idée avec un lien (le titre, l\'image et le prix se remplissent tout seuls) ou écris simplement ce que tu veux, comme « Carte-cadeau ».',
      'Réserve un cadeau en cliquant sur « Je m\'en occupe » : personne d\'autre ne le prendra, et la personne ne saura jamais que c\'est toi.',
      '« Mes réservations » rassemble ce que tu as promis d\'acheter. Si quelqu\'un retire une idée de sa liste, tu la vois quand même, avec « Retiré de sa liste ».',
      'Tout est en français, et ça se lit bien sur téléphone.',
    ],
  },
];

export const LATEST_VERSION = RELEASES[0].version;

export function formatReleaseDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' });
}
