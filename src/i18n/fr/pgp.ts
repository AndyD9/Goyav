// French translations for the pgp area. Keys are the exact English
// strings passed to t().
export const pgp: Record<string, string> = {
  // Dialogs
  "Enter the passphrase.": "Saisissez la phrase secrète.",
  "Unlock OpenPGP key": "Déverrouiller la clé OpenPGP",
  Passphrase: "Phrase secrète",
  Unlock: "Déverrouiller",
  "PIN must be at least 4 digits.": "Le code PIN doit comporter au moins 4 chiffres.",
  "Smartcard PIN": "Code PIN de la carte à puce",
  "User PIN": "Code PIN utilisateur",
  Continue: "Continuer",

  // Account advanced settings
  "Advanced settings": "Réglages avancés",
  "Attach my public key when adding an OpenPGP digital signature":
    "Joindre ma clé publique lors de l'ajout d'une signature numérique OpenPGP",
  "Send OpenPGP public key(s) in the email headers for compatibility with Autocrypt":
    "Envoyer la ou les clés publiques OpenPGP dans les en-têtes du message pour la compatibilité avec Autocrypt",
  "Encrypt the subject of OpenPGP messages": "Chiffrer l'objet des messages OpenPGP",
  "Store draft messages in encrypted format": "Enregistrer les brouillons au format chiffré",

  // View: formatting
  "0 (locked)": "0 (verrouillé)",
  "(no UID)": "(sans UID)",
  "in keystore + smartcard ({idents})": "dans le trousseau + carte à puce ({idents})",
  "in keystore": "dans le trousseau",
  "on smartcard ({idents})": "sur la carte à puce ({idents})",
  "absent (public only)": "absente (clé publique uniquement)",

  // View: messages
  "Paste an armored PGP key first.": "Collez d'abord une clé PGP au format ASCII.",
  "Enter an email address to look up.": "Saisissez l'adresse e-mail à rechercher.",
  "No new links. Either no cards are connected or all on-card keys are already linked.":
    "Aucun nouveau lien. Soit aucune carte n'est connectée, soit toutes les clés présentes sur les cartes sont déjà liées.",
  "Linked {keys} key(s) across {cards} card(s) ({slots}).":
    "{keys} clé(s) liée(s) sur {cards} carte(s) ({slots}).",
  "{count} slot": "{count} emplacement",
  "{count} slots": "{count} emplacements",
  "Public key copied to clipboard.": "Clé publique copiée dans le presse-papiers.",

  // View: left pane
  "Search UID or fingerprint…": "Rechercher un UID ou une empreinte…",
  Import: "Importer",
  "Fetch via WKD": "Récupérer via WKD",
  "Sync cards": "Synchroniser les cartes",
  "Secret key present": "Clé privée présente",
  "On card: {idents}": "Sur la carte : {idents}",
  card: "carte",
  Revoked: "Révoquée",
  "No keys yet. Use Import, Fetch via WKD, or generate one in tumpa-cli / tumpa desktop — they share this same keystore at {path}.":
    "Aucune clé pour l'instant. Utilisez Importer, Récupérer via WKD, ou générez-en une dans tumpa-cli / tumpa desktop : ils partagent le même trousseau, situé dans {path}.",
  Smartcards: "Cartes à puce",
  "(none connected)": "(aucune connectée)",
  "Resize key list": "Redimensionner la liste des clés",

  // View: card detail
  Smartcard: "Carte à puce",
  "Reading card…": "Lecture de la carte…",
  Card: "Carte",
  Cardholder: "Titulaire",
  Manufacturer: "Fabricant",
  Serial: "Numéro de série",
  "Public key URL": "URL de la clé publique",
  "On-card key slots": "Emplacements de clés de la carte",
  Slot: "Emplacement",
  Fingerprint: "Empreinte",
  Signature: "Signature",
  Encryption: "Chiffrement",
  Authentication: "Authentification",
  empty: "vide",
  Counters: "Compteurs",
  "Signatures made": "Signatures effectuées",
  "User PIN retries left": "Essais restants du code PIN utilisateur",
  "Reset code retries left": "Essais restants du code de réinitialisation",
  "Admin PIN retries left": "Essais restants du code PIN administrateur",

  // View: key detail
  "Select a key or smartcard on the left to see its details.":
    "Sélectionnez une clé ou une carte à puce à gauche pour afficher ses détails.",
  "Copy public key": "Copier la clé publique",
  "User IDs": "Identifiants utilisateur",
  Subkeys: "Sous-clés",
  Type: "Type",
  Algorithm: "Algorithme",
  Bits: "Bits",
  "Smartcard links": "Liens de carte à puce",
  Status: "Statut",
  Created: "Créée le",
  Expires: "Expire",
  "Secret key": "Clé privée",

  // View: modals
  "Import key": "Importer une clé",
  "Import OpenPGP key": "Importer une clé OpenPGP",
  "Paste an armored key (begins with {marker}) or pick a file.":
    "Collez une clé au format ASCII (commençant par {marker}) ou choisissez un fichier.",
  "Pick file…": "Choisir un fichier…",
  "Fetch public key via WKD": "Récupérer une clé publique via WKD",
  "Looks up the key on the address's domain (Web Key Directory).":
    "Recherche la clé sur le domaine de l'adresse (Web Key Directory).",
  Fetch: "Récupérer",
  "Confirm delete": "Confirmer la suppression",
  "Delete key?": "Supprimer la clé ?",
  "This removes the key from the shared keystore. If the secret key is only stored here (not on a smartcard or backed up), it will be lost.":
    "Cette action retire la clé du trousseau partagé. Si la clé privée n'est stockée qu'ici (ni sur une carte à puce, ni sauvegardée), elle sera perdue.",
};
