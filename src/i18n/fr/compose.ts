// French translations for the compose area. Keys are the exact English
// strings passed to t().
export const compose: Record<string, string> = {
  // Toolbar and fields
  Sign: "Signer",
  Encrypt: "Chiffrer",
  Markdown: "Markdown",
  Spelling: "Orthographe",
  Attach: "Joindre",
  Cc: "Cc",
  Bcc: "Cci",
  Recent: "Récents",
  "Sign with OpenPGP": "Signer avec OpenPGP",
  "Encrypt with OpenPGP": "Chiffrer avec OpenPGP",
  "Missing keys: {emails}": "Clés manquantes : {emails}",
  "Compose in Markdown — sends both plain text and rendered HTML": "Rédiger en Markdown — envoie à la fois le texte brut et le HTML généré",
  "Markdown mode — sent as plain text and rendered HTML.": "Mode Markdown — envoyé en texte brut et en HTML généré.",
  "Loading draft…": "Chargement du brouillon…",
  "Encrypted draft — re-attach card or unlock key to continue editing.": "Brouillon chiffré — reconnectez la carte ou déverrouillez la clé pour continuer la modification.",
  "Draft saved in plaintext — encrypted drafts need an OpenPGP key for this account, and aren't supported on Microsoft accounts yet.": "Brouillon enregistré en clair — les brouillons chiffrés nécessitent une clé OpenPGP pour ce compte et ne sont pas encore pris en charge sur les comptes Microsoft.",
  "{count} attachment": "{count} pièce jointe",
  "{count} attachments": "{count} pièces jointes",

  // Errors and dialogs
  "Failed to load accounts: {error}": "Échec du chargement des comptes : {error}",
  "No accounts found. Please add an account first.": "Aucun compte trouvé. Ajoutez d'abord un compte.",
  "Selected contact does not contain a single email address. Correct the contact or enter an address manually.": "Le contact sélectionné ne contient pas une adresse e-mail unique. Corrigez le contact ou saisissez l'adresse manuellement.",
  "You have unsaved changes. Save this message as a draft?": "Vous avez des modifications non enregistrées. Enregistrer ce message comme brouillon ?",
  "Unsaved Changes": "Modifications non enregistrées",
  "Save Draft": "Enregistrer le brouillon",
  "Discard your changes and close without saving?": "Abandonner vos modifications et fermer sans enregistrer ?",
  "Discard Changes": "Abandonner les modifications",
  "Could not show the save prompt. Use the Save button or try closing again.": "Impossible d'afficher la demande d'enregistrement. Utilisez le bouton Enregistrer ou essayez de fermer à nouveau.",
  "Invalid email address.": "Adresse e-mail invalide.",
  "Draft save failed: {error}": "Échec de l'enregistrement du brouillon : {error}",
  "{field} recipient {index}: {message}": "Destinataire {index} ({field}) : {message}",
  "Sender, recipients, or encryption setting changed. Review them and send again.": "L'expéditeur, les destinataires ou le réglage de chiffrement ont changé. Vérifiez-les et envoyez à nouveau.",
  "No account selected": "Aucun compte sélectionné",
  "At least one recipient is required": "Au moins un destinataire est requis",
  "Your message mentions an attachment, but no files are attached. Send anyway?": "Votre message mentionne une pièce jointe, mais aucun fichier n'est joint. Envoyer quand même ?",
  "No Attachments": "Aucune pièce jointe",
  "Send Anyway": "Envoyer quand même",
  "Could not show the attachment warning. Please attach files or remove the mention and try again.": "Impossible d'afficher l'avertissement de pièce jointe. Joignez des fichiers ou retirez la mention, puis réessayez.",
  "Could not verify recipient encryption keys. Please try again.": "Impossible de vérifier les clés de chiffrement des destinataires. Veuillez réessayer.",
  "Cannot encrypt — no public key in keystore for: {emails}. Fetch keys via WKD or import them, then try again.": "Chiffrement impossible — aucune clé publique dans le trousseau pour : {emails}. Récupérez les clés via WKD ou importez-les, puis réessayez.",

  // Calendar mutation reasons
  "Editing, deleting, or moving recurring events is not supported in Goyav.": "La modification, la suppression et le déplacement d'événements récurrents ne sont pas pris en charge dans Goyav.",
  "Editing one occurrence of a meeting with attendees is not supported yet.": "La modification d'une occurrence d'une réunion avec des participants n'est pas encore prise en charge.",
  "Recurrence information is unavailable. Refresh this event before editing.": "Les informations de récurrence sont indisponibles. Actualisez cet événement avant de le modifier.",

  // About dialog and signature preview
  "A personal mail and calendar client.": "Un client de messagerie et de calendrier personnel.",
  Source: "Source",
  License: "Licence",
  "Signature preview": "Aperçu de la signature",
};
