// French translations for Settings, the account page, signatures, mail
// search, the changelog and the main menu. Keys are the exact English
// strings passed to t().
export const account: Record<string, string> = {
  // Mail search
  "Search mail": "Rechercher dans les mails",
  "Clear search": "Effacer la recherche",
  "Search in": "Rechercher dans",
  "This folder": "Ce dossier",
  "This account": "Ce compte",
  "All accounts": "Tous les comptes",
  "Searching…": "Recherche…",
  "Searching server…": "Recherche sur le serveur…",
  "Also search the server": "Chercher aussi sur le serveur",
  "On the server": "Sur le serveur",
  "{count} result": "{count} résultat",
  "{count} results": "{count} résultats",
  "Showing the {shown} most recent of {total} results":
    "Affichage des {shown} plus récents sur {total} résultats",
  "No messages match “{query}”.": "Aucun message ne correspond à « {query} ».",
  "Only messages already synced to this device are searched.":
    "Seuls les messages déjà synchronisés sur cet appareil sont parcourus.",
  "Has attachments": "Contient des pièces jointes",

  // Mail toolbar
  Compose: "Nouveau message",
  "Compose new email": "Rédiger un nouveau message",
  "Move to Inbox": "Déplacer vers la boîte de réception",
  "Not Spam": "Pas un spam",
  "{count} selected": "{count} sélectionnés",

  // Signatures
  Signatures: "Signatures",
  "Signature {n}": "Signature {n}",
  "New signature": "Nouvelle signature",
  "Import an HTML file…": "Importer un fichier HTML…",
  "Replace from file…": "Remplacer depuis un fichier…",
  "Could not read the file: {error}": "Impossible de lire le fichier : {error}",
  "No signature yet. Create one, or import the HTML file of an existing signature.":
    "Aucune signature pour l'instant. Créez-en une, ou importez le fichier HTML d'une signature existante.",
  Untitled: "Sans titre",
  Name: "Nom",
  Content: "Contenu",
  Preview: "Aperçu",
  "Use by default for new messages": "Utiliser par défaut pour les nouveaux messages",
  "HTML signature — added below the message and sent as HTML.":
    "Signature HTML — ajoutée sous le message et envoyée en HTML.",
  "Plain text, or paste the HTML of a signature file.":
    "Texte brut, ou collez le HTML d'un fichier de signature.",
  "Email Signatures": "Signatures",
  "Create one signature per use (formal, short, replies…). The default one is added to new messages; you can switch in the composer.":
    "Créez une signature par usage (formelle, courte, réponses…). Celle par défaut est ajoutée aux nouveaux messages ; vous pouvez en changer dans l'éditeur.",
  "No signature": "Sans signature",
  "The account was saved, but its signatures could not be saved.":
    "Le compte a été enregistré, mais pas ses signatures.",

  // Account page / form
  Accounts: "Comptes",
  Account: "Compte",
  "Back to accounts": "Retour aux comptes",
  "Account saved": "Compte enregistré",
  "New {type} account": "Nouveau compte {type}",
  Server: "Serveur",
  "Edit Account": "Modifier le compte",
  "Add Account": "Ajouter le compte",
  "Account Type": "Type de compte",
  "Account Name": "Nom du compte",
  "My Calendar": "Mon calendrier",
  "e.g., Personal, Work": "ex. Perso, Travail",
  "Full Name": "Nom complet",
  "e.g., Ada Lovelace": "ex. Ada Lovelace",
  "Shown to recipients as the sender of your messages.":
    "Affiché aux destinataires comme expéditeur de vos messages.",
  "Email Address": "Adresse e-mail",
  Username: "Nom d'utilisateur",
  Password: "Mot de passe",
  "Login name on the DAV server": "Identifiant sur le serveur DAV",
  "Login name for the {server} server.": "Identifiant pour le serveur {server}.",
  "API token": "Jeton d'API",
  "Leave empty to keep current token": "Laisser vide pour conserver le jeton actuel",
  "Leave empty to keep current password": "Laisser vide pour conserver le mot de passe actuel",
  "Paste your Fastmail API token": "Collez votre jeton d'API Fastmail",
  "Generate at Fastmail Settings → Privacy & Security → Manage API tokens. Stored in your OS keyring.":
    "À générer dans Fastmail : Settings → Privacy & Security → Manage API tokens. Stocké dans le trousseau du système.",
  "Passwords are stored securely in your OS keyring":
    "Les mots de passe sont stockés en sécurité dans le trousseau du système",
  "JMAP endpoint": "Point d'accès JMAP",
  "Fastmail's JMAP API. Authentication uses Authorization: Bearer with the API token above.":
    "API JMAP de Fastmail. L'authentification utilise Authorization: Bearer avec le jeton d'API ci-dessus.",
  "Gmail uses IMAP (imap.gmail.com:993) and SMTP (smtp.gmail.com:587) with your Google sign-in, along with Calendar and Contacts. Sign in with Google above.":
    "Gmail utilise IMAP (imap.gmail.com:993) et SMTP (smtp.gmail.com:587) avec votre connexion Google, ainsi que l'Agenda et les Contacts. Connectez-vous avec Google ci-dessus.",
  "Sync calendar": "Synchroniser le calendrier",
  "Sync contacts": "Synchroniser les contacts",
  "Signed in with Microsoft": "Connecté avec Microsoft",
  "Signed in with Google": "Connecté avec Google",
  "Signed in via OIDC": "Connecté via OIDC",
  "Google sign-in failed: {error}": "Échec de la connexion Google : {error}",
  "Microsoft sign-in failed: {error}": "Échec de la connexion Microsoft : {error}",
  "OIDC sign-in failed: {error}": "Échec de la connexion OIDC : {error}",
  "Enter your Nextcloud server URL first": "Saisissez d'abord l'URL de votre serveur Nextcloud",
  "Nextcloud Talk sign-in failed: {error}": "Échec de la connexion Nextcloud Talk : {error}",
  "Enter your Matrix homeserver URL first": "Saisissez d'abord l'URL de votre serveur Matrix",
  "Matrix sign-in failed: {error}": "Échec de la connexion Matrix : {error}",
  "Zoom sign-in failed: {error}": "Échec de la connexion Zoom : {error}",
  "Enter your La Suite Visio instance URL first":
    "Saisissez d'abord l'URL de votre instance La Suite Visio",
  "La Suite Visio sign-in failed: {error}": "Échec de la connexion La Suite Visio : {error}",
  "Signed in again. Select Save to keep account name changes.":
    "Reconnecté. Cliquez sur Enregistrer pour conserver les modifications du nom du compte.",
  "Fastmail accounts require an API token. Generate one at Fastmail Settings → Privacy & Security → Manage API tokens.":
    "Les comptes Fastmail nécessitent un jeton d'API. Générez-en un dans Fastmail : Settings → Privacy & Security → Manage API tokens.",
  "API token cannot be only whitespace. Leave the field blank to keep the existing token, or paste a valid token.":
    "Le jeton d'API ne peut pas contenir que des espaces. Laissez le champ vide pour conserver le jeton existant, ou collez un jeton valide.",
  "Sign in with Google before saving the account.":
    "Connectez-vous avec Google avant d'enregistrer le compte.",

  // Settings
  Appearance: "Apparence",
  "Archived calendars": "Calendriers archivés",
  "What's new": "Nouveautés",
  About: "À propos",
  System: "Système",
  Light: "Clair",
  Dark: "Sombre",
  Cards: "Cartes",
  "Compact table": "Tableau compact",
  Language: "Langue",
  "Language of menus, buttons and messages in Goyav.":
    "Langue des menus, boutons et messages de Goyav.",
  "Edit {name}": "Modifier {name}",
  "Delete {name}": "Supprimer {name}",
  "Open settings for {name}": "Ouvrir les réglages de {name}",
  "Add account": "Ajouter un compte",
  "Connect your first account": "Connectez votre premier compte",
  "Goyav keeps your mail, calendars and contacts on this device. Add an IMAP, JMAP, Gmail or Microsoft 365 account to get started.":
    "Goyav conserve vos mails, calendriers et contacts sur cet appareil. Ajoutez un compte IMAP, JMAP, Gmail ou Microsoft 365 pour commencer.",
  "System follows your macOS appearance.": "« Système » suit l'apparence de macOS.",
  "Message list": "Liste des messages",
  "Cards show the sender and a preview; the table fits more rows.":
    "Les cartes affichent l'expéditeur et un aperçu ; le tableau montre plus de lignes.",
  "Date, time and window options are in Preferences":
    "Les options de date, d'heure et de fenêtre sont dans les Préférences",
  "No archived Graph calendars. Calendars removed from a Microsoft 365 account keep their cached events here, read-only.":
    "Aucun calendrier Graph archivé. Les calendriers retirés d'un compte Microsoft 365 conservent ici leurs événements en cache, en lecture seule.",
  "No archived Graph calendars.": "Aucun calendrier Graph archivé.",
  "Archived Graph calendars": "Calendriers Graph archivés",
  "Cached events and action history are retained read-only.":
    "Les événements en cache et l'historique des actions sont conservés en lecture seule.",
  "Version {version} · A personal mail and calendar client":
    "Version {version} · Un client de messagerie et d'agenda personnel",
  "Built on Chithi. Everything is stored on this device.":
    "Basé sur Chithi. Tout est stocké sur cet appareil.",
  "Default account": "Compte par défaut",
  "12-hour": "12 heures",
  "24-hour": "24 heures",
  "Privacy & storage": "Confidentialité et stockage",
  "Block remote images": "Bloquer les images distantes",
  "Cache size": "Taille du cache",
  Version: "Version",
  "Delete Account": "Supprimer le compte",
  "Are you sure you want to delete this account? This action cannot be undone.":
    "Voulez-vous vraiment supprimer ce compte ? Cette action est irréversible.",
  "Remote Zoom meetings may remain.": "Des réunions Zoom distantes peuvent subsister.",
  "If normal deletion cannot clean up Zoom, you can remove only the local account. Meetings already created in Zoom may remain active and must be removed from Zoom separately.":
    "Si la suppression normale ne peut pas nettoyer Zoom, vous pouvez supprimer uniquement le compte local. Les réunions déjà créées dans Zoom peuvent rester actives et doivent être supprimées depuis Zoom.",
  "I understand that remote Zoom meetings may remain":
    "Je comprends que des réunions Zoom distantes peuvent subsister",
  "Remote resource status could not be checked.":
    "L'état des ressources distantes n'a pas pu être vérifié.",
  "The account configuration could not be loaded. Deleting the local account may leave remote meetings or rooms behind.":
    "La configuration du compte n'a pas pu être chargée. Supprimer le compte local peut laisser des réunions ou salles distantes.",
  "Remote Visio rooms will remain.": "Les salles Visio distantes seront conservées.",
  "Deleting this local account does not delete rooms already created in La Suite Visio. Goyav will forget its associations with those rooms, so remove them from Visio separately if they should no longer be available.":
    "Supprimer ce compte local ne supprime pas les salles déjà créées dans La Suite Visio. Goyav oubliera ses liens avec ces salles : supprimez-les depuis Visio si elles ne doivent plus être disponibles.",
  "Checking…": "Vérification…",
  "Could not delete the account: {error}": "Impossible de supprimer le compte : {error}",
  "Delete locally": "Supprimer localement",

  // Changelog
  "Version {version}": "Version {version}",
  Installed: "Installée",
  New: "Nouveau",
  Improved: "Amélioré",
  Fixed: "Corrigé",
  "What's new in Goyav {version}": "Nouveautés de Goyav {version}",
  "Got it": "Compris",

  // New-mail notifications
  "{count} new message": "{count} nouveau message",
  "{count} new messages": "{count} nouveaux messages",
  "From {senders}": "De {senders}",
  "From {senders} and {count} more": "De {senders} et {count} autres",
  "New mail notifications": "Notifications des nouveaux mails",
  "Show sender, subject and text in notifications":
    "Afficher l'expéditeur, l'objet et le texte dans les notifications",
  "Show the unread count on the app icon":
    "Afficher le nombre de non-lus sur l'icône de l'app",

  // Main menu
  "Preferences…": "Préférences…",
  Quit: "Quitter",
  "Message Pane": "Volet de lecture",
  Right: "À droite",
  Bottom: "En bas",
  Tabs: "Onglets",
  "Message List": "Liste des messages",
  "Compact Table": "Tableau compact",
  "Threaded View": "Vue par conversation",
  "Contact Pane": "Volet des contacts",
  "About Goyav…": "À propos de Goyav…",
  "Check for Updates…": "Rechercher des mises à jour…",

  // Loading feedback
  "Opening account settings…": "Ouverture des réglages du compte…",
  "Loading address books and calendars…": "Chargement des carnets d'adresses et des calendriers…",
};
