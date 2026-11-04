// What changed in each Goyav release, newest first. Shown in Settings →
// What's new, and once after an update. Add an entry with every release
// and keep the version in step with package.json / tauri.conf.json.
import { locale } from "@/i18n";

export type ChangeKind = "new" | "improved" | "fixed";

export interface ChangelogChange {
  kind: ChangeKind;
  en: string;
  fr: string;
}

export interface ChangelogRelease {
  version: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  changes: ChangelogChange[];
}

export const CHANGELOG: readonly ChangelogRelease[] = [
  {
    version: "0.2.0",
    date: "2026-11-04",
    changes: [
      {
        kind: "new",
        en: "Search your mail from the toolbar (⌘F / Ctrl+F) across the open folder, every folder of the account, or every account, with matches highlighted.",
        fr: "Recherche dans les mails depuis la barre d'outils (⌘F / Ctrl+F) : dossier ouvert, tous les dossiers du compte ou tous les comptes, avec surlignage des résultats.",
      },
      {
        kind: "new",
        en: "Several signatures per account: pick one when writing, set a default, and import HTML signature files.",
        fr: "Plusieurs signatures par compte : choix au moment de l'écriture, signature par défaut et import de fichiers HTML.",
      },
      {
        kind: "improved",
        en: "Account settings open as a full page with tabs (General, Server, Signatures, Sync, OpenPGP) instead of a dialog.",
        fr: "Les réglages d'un compte s'ouvrent dans une vraie page à onglets (Général, Serveur, Signatures, Synchronisation, OpenPGP) au lieu d'une fenêtre modale.",
      },
      {
        kind: "new",
        en: "French interface. Choose the language in Settings → Appearance.",
        fr: "Interface en français. Le choix de la langue se fait dans Réglages → Apparence.",
      },
      {
        kind: "new",
        en: "This list of changes, also shown once after each update.",
        fr: "Cette liste des nouveautés, aussi affichée une fois après chaque mise à jour.",
      },
    ],
  },
  {
    version: "0.1.0",
    date: "2026-11-04",
    changes: [
      {
        kind: "new",
        en: "Goyav checks GitHub releases and updates itself.",
        fr: "Goyav vérifie les versions publiées sur GitHub et se met à jour tout seul.",
      },
      {
        kind: "new",
        en: "HTML account signatures, previewed in the composer and sent as HTML.",
        fr: "Signatures HTML, prévisualisées dans l'éditeur et envoyées en HTML.",
      },
      {
        kind: "new",
        en: "Gmail mail runs over Google sign-in (OAuth).",
        fr: "Le courrier Gmail passe par la connexion Google (OAuth).",
      },
      {
        kind: "improved",
        en: "New Goyav look: light and dark themes, panels, card rows and a new icon.",
        fr: "Nouvelle apparence Goyav : thèmes clair et sombre, panneaux, lignes en cartes et nouvelle icône.",
      },
      {
        kind: "improved",
        en: "Desktop Settings redesigned as two panels.",
        fr: "Réglages du bureau repensés en deux panneaux.",
      },
      {
        kind: "fixed",
        en: "The week view all-day row is capped and can be resized.",
        fr: "La ligne « toute la journée » de la vue semaine est limitée en hauteur et redimensionnable.",
      },
    ],
  },
];

export function changeText(change: ChangelogChange): string {
  return locale.value === "fr" ? change.fr : change.en;
}

const LAST_SEEN_KEY = "goyav-last-seen-version";

/**
 * Releases newer than the version the user last ran, when that differs from
 * `current`. A first run records the version and shows nothing.
 */
export function unseenReleases(current: string): ChangelogRelease[] {
  let lastSeen: string | null = null;
  try {
    lastSeen = localStorage.getItem(LAST_SEEN_KEY);
  } catch {
    return [];
  }
  if (lastSeen === current) return [];
  if (lastSeen === null) {
    markVersionSeen(current);
    return [];
  }
  return CHANGELOG.filter(
    (release) =>
      compareVersions(release.version, lastSeen as string) > 0 &&
      compareVersions(release.version, current) <= 0,
  );
}

export function markVersionSeen(version: string) {
  try {
    localStorage.setItem(LAST_SEEN_KEY, version);
  } catch {
    // Without storage the dialog may show again next launch; harmless.
  }
}

/** Numeric dotted-version comparison: <0, 0 or >0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
