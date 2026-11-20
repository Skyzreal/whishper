/** Jour de l'échange de cadeaux (mois 1-12, jour). Change ces valeurs pour viser une autre date. */
export const EXCHANGE_DATE = { month: 12, day: 25 };

export type Countdown =
  | { today: true }
  | { today: false; days: number; hours: number; minutes: number; seconds: number };

const DAY = 86_400_000;

/** Compte à rebours jusqu'à minuit (heure locale) de la prochaine occurrence de la date. */
export function countdownTo(now: Date, target = EXCHANGE_DATE): Countdown {
  let start = new Date(now.getFullYear(), target.month - 1, target.day);
  if (now.getTime() >= start.getTime() && now.getTime() < new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1).getTime()) {
    return { today: true };
  }
  if (now.getTime() >= start.getTime()) start = new Date(now.getFullYear() + 1, target.month - 1, target.day);
  const left = Math.max(0, start.getTime() - now.getTime());
  return {
    today: false,
    days: Math.floor(left / DAY),
    hours: Math.floor((left % DAY) / 3_600_000),
    minutes: Math.floor((left % 3_600_000) / 60_000),
    seconds: Math.floor((left % 60_000) / 1000),
  };
}
