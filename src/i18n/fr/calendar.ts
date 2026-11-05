// French translations for the calendar area. Keys are the exact English
// strings passed to t().
export const calendar: Record<string, string> = {
  // Views and toolbar
  Event: "Événement",
  Today: "Aujourd'hui",
  Previous: "Précédent",
  Next: "Suivant",
  "New event": "Nouvel événement",
  Day: "Jour",
  Week: "Semaine",
  Month: "Mois",
  "No events": "Aucun événement",
  "All day": "Toute la journée",
  "all-day": "toute la journée",
  "(No title)": "(Sans titre)",
  "+{count} more": "+{count} de plus",
  "Resize all-day events": "Redimensionner les événements sur la journée",
  Sun: "Dim",
  Mon: "Lun",
  Tue: "Mar",
  Wed: "Mer",
  Thu: "Jeu",
  Fri: "Ven",
  Sat: "Sam",
  "Refreshing calendar…": "Actualisation du calendrier…",
  "Loading {month}…": "Chargement de {month}…",
  "Verifying…": "Vérification…",
  "Verify with provider": "Vérifier auprès du fournisseur",
  "{count} recurring series need a provider refresh. Cached dates may be outdated or missing. Sync calendars to verify them.":
    "{count} série(s) récurrente(s) nécessitent une actualisation par le fournisseur. Les dates en cache peuvent être obsolètes ou manquantes. Synchronisez les calendriers pour les vérifier.",
  "{count} recurring event(s) could not be placed. Some recurring dates may be incomplete until verified.":
    "{count} événement(s) récurrent(s) n'ont pas pu être placés. Certaines dates récurrentes peuvent être incomplètes tant qu'elles ne sont pas vérifiées.",
  "Graph is throttling verification. Try again after {time}.":
    "Graph limite le rythme des vérifications. Réessayez après {time}.",
  "Calendar sync could not display every remote resource: {error}":
    "La synchronisation du calendrier n'a pas pu afficher toutes les ressources distantes : {error}",
  "Calendar incomplete: {count} issue(s). Show details":
    "Calendrier incomplet : {count} problème(s). Afficher les détails",
  "{account}: the visible range exceeds the display limit; some events are not shown.":
    "{account} : la plage visible dépasse la limite d'affichage ; certains événements ne sont pas affichés.",
  "{account}: event {id} could not be displayed: {message}":
    "{account} : l'événement {id} n'a pas pu être affiché : {message}",

  // Toasts
  "This event has attendees. Send an update notification?":
    "Cet événement a des participants. Envoyer une notification de mise à jour ?",
  "Update sent to attendees": "Mise à jour envoyée aux participants",
  "Failed to send updates. Please try again. {message}":
    "Échec de l'envoi des mises à jour. Veuillez réessayer. {message}",
  "Moving event...": "Déplacement de l'événement…",
  "Previous recurring action completed": "L'action récurrente précédente est terminée",
  "Event rescheduled": "Événement reprogrammé",
  "Failed to reschedule: {message}": "Échec de la reprogrammation : {message}",
  "Moving to calendar...": "Déplacement vers le calendrier…",
  "Event moved to calendar": "Événement déplacé vers le calendrier",
  "Failed to move event: {message}": "Échec du déplacement de l'événement : {message}",

  // Archived Graph calendars
  "{count} Graph calendar(s) no longer reported by the provider were archived. Their cached events and action history are preserved read-only, not shown in the live calendar.":
    "{count} calendrier(s) Graph n'étant plus signalés par le fournisseur ont été archivés. Leurs événements en cache et leur historique d'actions sont conservés en lecture seule et n'apparaissent plus dans le calendrier actif.",
  "Acknowledging…": "Confirmation…",
  Acknowledge: "Confirmer",
  Acknowledged: "Confirmé",
  "Archived calendar summary": "Résumé des calendriers archivés",
  "{events} cached event(s), {addresses} replay address(es)":
    "{events} événement(s) en cache, {addresses} adresse(s) de relecture",

  // Sidebar
  Calendars: "Calendriers",
  "No calendars": "Aucun calendrier",
  "Sync this calendar": "Synchroniser ce calendrier",
  "Rename…": "Renommer…",
  "Change color…": "Changer la couleur…",
  Unsubscribe: "Se désabonner",
  "Rename Calendar": "Renommer le calendrier",
  "Renaming will update the calendar on the server.":
    "Le renommage mettra à jour le calendrier sur le serveur.",
  "Calendar name": "Nom du calendrier",
  "Renaming…": "Renommage…",
  "Change color": "Changer la couleur",
  'Pick a color for "{name}". CalDAV / JMAP store the exact hex you pick. Microsoft 365 and Google use a fixed palette, so the picked color is approximated and may not match this swatch one-for-one. System calendars (Birthdays, Holidays, etc.) on Microsoft are read-only — the change is kept locally if the server rejects it.':
    "Choisissez une couleur pour « {name} ». CalDAV / JMAP enregistrent exactement le code hexadécimal choisi. Microsoft 365 et Google utilisent une palette fixe : la couleur choisie est donc approchée et peut ne pas correspondre exactement à cet échantillon. Les calendriers système de Microsoft (Anniversaires, Jours fériés, etc.) sont en lecture seule — la modification est conservée localement si le serveur la refuse.",
  Blue: "Bleu",
  Green: "Vert",
  Purple: "Violet",
  Red: "Rouge",
  Orange: "Orange",
  Cyan: "Cyan",
  Grey: "Gris",
  Salmon: "Saumon",
  Yellow: "Jaune",
  Teal: "Sarcelle",
  "Saving…": "Enregistrement…",
  "Color must be a hex value like #4285f4 or #4285f4ff.":
    "La couleur doit être une valeur hexadécimale comme #4285f4 ou #4285f4ff.",
  "Color updated": "Couleur mise à jour",
  'Renamed to "{name}"': "Renommé en « {name} »",
  'Unsubscribe from "{name}"? Local events will be removed.':
    "Se désabonner de « {name} » ? Les événements locaux seront supprimés.",
  'Unsubscribed from "{name}"': "Désabonné de « {name} »",
  "Failed to unsubscribe: {message}": "Échec du désabonnement : {message}",

  // Event form
  "New Event": "Nouvel événement",
  "Title *": "Titre *",
  "Event title": "Titre de l'événement",
  Calendar: "Calendrier",
  "All day event": "Événement sur la journée",
  Start: "Début",
  End: "Fin",
  Location: "Lieu",
  "Add location": "Ajouter un lieu",
  "Loading rooms...": "Chargement des salles…",
  "Creating…": "Création…",
  "Add {label}": "Ajouter {label}",
  Repeat: "Répétition",
  Attendees: "Participants",
  "Checking availability…": "Vérification des disponibilités…",
  "Find a time": "Trouver un créneau",
  "Scheduling assistant": "Assistant de planification",
  "Could not load availability: {error}": "Impossible de charger les disponibilités : {error}",
  "Availability unknown for {participants}. Suggestions only reflect calendars shown by the provider.":
    "Disponibilité inconnue pour {participants}. Les suggestions ne reflètent que les calendriers visibles par le fournisseur.",
  "No conflict-free working-hour slots found in the next two weeks.":
    "Aucun créneau sans conflit en heures de travail trouvé dans les deux prochaines semaines.",
  Description: "Description",
  "Add description": "Ajouter une description",
  Create: "Créer",
  "Could not create meeting: {message}": "Impossible de créer la réunion : {message}",
  "Checking room availability...": "Vérification de la disponibilité de la salle…",
  "Available for the selected time": "Disponible au créneau sélectionné",
  "Busy {start} - {end}": "Occupée {start} - {end}",
  "Availability unknown": "Disponibilité inconnue",
  "Title is required": "Le titre est obligatoire",
  "Select a calendar": "Sélectionnez un calendrier",
  "End time must be after start time": "L'heure de fin doit être postérieure à l'heure de début",

  // Event detail
  "Unknown calendar": "Calendrier inconnu",
  "No response": "Aucune réponse",
  Accepted: "Accepté",
  Maybe: "Peut-être",
  Declined: "Refusé",
  "to {time}": "jusqu'à {time}",
  "Organizer: {email}": "Organisateur : {email}",
  accepted: "accepté",
  declined: "refusé",
  tentative: "peut-être",
  "needs-action": "en attente",
  "Edit scope": "Portée de la modification",
  "This occurrence": "Cette occurrence",
  "Entire series": "Toute la série",
  "Start date": "Date de début",
  "Start time": "Heure de début",
  "End date": "Date de fin",
  "End time": "Heure de fin",
  "Recurring deletion remains unavailable. Choose whether an edit applies to this occurrence or the entire series.":
    "La suppression d'événements récurrents reste indisponible. Choisissez si la modification s'applique à cette occurrence ou à toute la série.",
  "Recurring deletion remains unavailable. Only the entire series can be edited.":
    "La suppression d'événements récurrents reste indisponible. Seule la série entière peut être modifiée.",
  "attendee notification": "la notification des participants",
  deletion: "la suppression",
  "Could not verify the event for {purpose}. Please try again. {cause}":
    "Impossible de vérifier l'événement pour {purpose}. Veuillez réessayer. {cause}",
  "This occurrence cannot be edited.": "Cette occurrence ne peut pas être modifiée.",
  "Moving a recurring occurrence is not supported yet.":
    "Le déplacement d'une occurrence récurrente n'est pas encore pris en charge.",
  "The destination calendar is unavailable.": "Le calendrier de destination est indisponible.",
  "Notify Attendees": "Notifier les participants",
  "Send Update": "Envoyer la mise à jour",
  "Don't Notify": "Ne pas notifier",
  "Delete this event with attendees? Chithi does not send manual cancellation notifications. Your calendar provider may notify attendees automatically.":
    "Supprimer cet événement avec des participants ? Goyav n'envoie pas de notifications d'annulation manuelles. Votre fournisseur de calendrier peut avertir automatiquement les participants.",
  "Delete Event": "Supprimer l'événement",

  // Recurrence
  "day(s)": "jour(s)",
  "week(s)": "semaine(s)",
  "month(s)": "mois",
  "year(s)": "an(s)",
  Never: "Jamais",
  "After N times": "Après N occurrences",
  "On date": "À une date",
  Every: "Tous les",
  Ends: "Fin",
  Daily: "Quotidien",
  Weekly: "Hebdomadaire",
  Monthly: "Mensuel",
  Yearly: "Annuel",
  "Every {n} days": "Tous les {n} jours",
  "Every {n} weeks": "Toutes les {n} semaines",
  "Every {n} months": "Tous les {n} mois",
  "Every {n} years": "Tous les {n} ans",
  "{recurrence} on {days}": "{recurrence} le {days}",
  "{recurrence}, {count} times": "{recurrence}, {count} fois",
  "{recurrence}, until {date}": "{recurrence}, jusqu'au {date}",

  // Recurring action confirmations
  "Moving this recurring meeting creates a replacement meeting identity in the destination calendar. Move the entire series?":
    "Le déplacement de cette réunion récurrente crée une nouvelle identité de réunion dans le calendrier de destination. Déplacer toute la série ?",
  "Move the entire recurring series to the destination calendar?":
    "Déplacer toute la série récurrente vers le calendrier de destination ?",
  "Move Recurring Meeting": "Déplacer la réunion récurrente",
  "Move Series": "Déplacer la série",
  "This recurrence change removes existing exceptions. Continue?":
    "Ce changement de répétition supprime les exceptions existantes. Continuer ?",
  "Reset Recurring Exceptions": "Réinitialiser les exceptions de répétition",
  "Reset Exceptions": "Réinitialiser les exceptions",
  "Reschedule the entire recurring series?": "Reprogrammer toute la série récurrente ?",
  "Reschedule Recurring Event": "Reprogrammer l'événement récurrent",
  "Apply this new time to only this occurrence or to the entire series?":
    "Appliquer ce nouvel horaire uniquement à cette occurrence ou à toute la série ?",
  "This Occurrence": "Cette occurrence",
  "Entire Series": "Toute la série",

  // Calendar import
  "Import calendar events": "Importer des événements de calendrier",
  "Calendar attachment": "Pièce jointe de calendrier",
  "Reading calendar attachment…": "Lecture de la pièce jointe de calendrier…",
  "Recurring series with {count} exception": "Série récurrente avec {count} exception",
  "Recurring series with {count} exceptions": "Série récurrente avec {count} exceptions",
  "{method} messages cannot be imported.": "Les messages {method} ne peuvent pas être importés.",
  "Imported events are personal copies. Importing does not RSVP or notify the organizer and attendees.":
    "Les événements importés sont des copies personnelles. L'importation n'envoie aucune réponse et ne notifie ni l'organisateur ni les participants.",
  "Destination calendar": "Calendrier de destination",
  "Choose a calendar": "Choisissez un calendrier",
  "No subscribed calendar is available.": "Aucun calendrier auquel vous êtes abonné n'est disponible.",
  "Download instead": "Télécharger à la place",
  "Importing…": "Importation…",
  "Import {count} event": "Importer {count} événement",
  "Import {count} events": "Importer {count} événements",

  // Attendee editor
  "Add attendee email or name...": "Ajouter l'e-mail ou le nom d'un participant…",

  // Invite card
  "Organized by {name}": "Organisé par {name}",
  "Attendees:": "Participants :",
  "You accepted this invite.": "Vous avez accepté cette invitation.",
  "You tentatively accepted this invite.": "Vous avez accepté provisoirement cette invitation.",
  "You declined this invite.": "Vous avez refusé cette invitation.",

  // Invites view
  All: "Toutes",
  "Needs action": "À traiter",
  "Date (soonest first)": "Date (la plus proche d'abord)",
  "Date (latest first)": "Date (la plus lointaine d'abord)",
  "Recently received": "Reçues récemment",
  "Unknown account": "Compte inconnu",
  "Managed manually": "Géré manuellement",
  "Not replied": "Sans réponse",
  Invites: "Invitations",
  "Filter invites by reply status": "Filtrer les invitations par statut de réponse",
  Sort: "Trier",
  "Loading invites…": "Chargement des invitations…",
  "No invites to show.": "Aucune invitation à afficher.",
  Repeats: "Répétition",
  Accept: "Accepter",
  Decline: "Refuser",
  "Mark as handled without sending a response": "Marquer comme traitée sans envoyer de réponse",
  "Mark managed": "Marquer comme gérée",

  // Calendar store errors
  "Calendar occurrence has an invalid original position.":
    "L'occurrence du calendrier a une position d'origine invalide.",
  "Graph calendar sync is waiting for its Retry-After cooldown.":
    "La synchronisation du calendrier Graph attend la fin de son délai Retry-After.",
  "Could not check archived Graph calendars. Please retry.":
    "Impossible de vérifier les calendriers Graph archivés. Veuillez réessayer.",
  "Could not load calendars. Please retry.":
    "Impossible de charger les calendriers. Veuillez réessayer.",
  "Could not acknowledge every archived calendar. Please retry.":
    "Impossible de confirmer tous les calendriers archivés. Veuillez réessayer.",
  "Calendar occurrence has no matching local master event.":
    "L'occurrence du calendrier n'a pas d'événement maître local correspondant.",
  "Calendar occurrence projection contains duplicate IDs.":
    "La projection des occurrences du calendrier contient des identifiants en double.",
  "Calendar display range changed during the read. Please retry.":
    "La plage d'affichage du calendrier a changé pendant la lecture. Veuillez réessayer.",
  "Could not load calendar dates. Please retry.":
    "Impossible de charger les dates du calendrier. Veuillez réessayer.",
  "Calendar data changed while refreshing. Please try again.":
    "Les données du calendrier ont changé pendant l'actualisation. Veuillez réessayer.",
  "The refreshed calendar event has an unexpected ID.":
    "L'événement actualisé a un identifiant inattendu.",
  "Multiple unfinished calendar actions own this event. Resolve them before editing it again.":
    "Plusieurs actions de calendrier inachevées concernent cet événement. Résolvez-les avant de le modifier à nouveau.",
  "The unfinished calendar action requires confirmation before recovery.":
    "L'action de calendrier inachevée nécessite une confirmation avant sa reprise.",
  "The unfinished occurrence edit still needs reconciliation.":
    "La modification d'occurrence inachevée nécessite encore une réconciliation.",
  "The selected event is not an occurrence.": "L'événement sélectionné n'est pas une occurrence.",
  "The selected occurrence has no trusted original position. Refresh and try again.":
    "L'occurrence sélectionnée n'a pas de position d'origine fiable. Actualisez et réessayez.",
  "This occurrence edit requires unsupported confirmation.":
    "Cette modification d'occurrence nécessite une confirmation non prise en charge.",
  "The occurrence edit needs reconciliation before it can be shown.":
    "La modification d'occurrence doit être réconciliée avant de pouvoir être affichée.",
  "The selected event has no editable series.": "L'événement sélectionné n'a pas de série modifiable.",
  "The recurring event identity changed. Refresh and try again.":
    "L'identité de l'événement récurrent a changé. Actualisez et réessayez.",
  "Multiple unfinished calendar actions own this series. Resolve them before editing it again.":
    "Plusieurs actions de calendrier inachevées concernent cette série. Résolvez-les avant de la modifier à nouveau.",
  "The unfinished recurring action still needs reconciliation.":
    "L'action récurrente inachevée nécessite encore une réconciliation.",
  "The recurring event action still needs reconciliation.":
    "L'action sur l'événement récurrent nécessite encore une réconciliation.",

  // iTIP responses and cancellations in the reader (applied on confirmation)
  "Response to “{title}”": "Réponse à « {title} »",
  "Update calendar": "Mettre à jour le calendrier",
  "“{title}” was cancelled by the organizer": "« {title} » a été annulé par l'organisateur",
  "Remove from calendar": "Retirer du calendrier",
  "Calendar updated with this response.": "Calendrier mis à jour avec cette réponse.",
  "Not applied: the sender is not an attendee of an event you organize.":
    "Non appliqué : l'expéditeur n'est pas participant d'un événement que vous organisez.",
  "Event removed from your calendar.": "Événement retiré de votre calendrier.",
  "Not applied: the sender is not the organizer of a matching event in your calendar.":
    "Non appliqué : l'expéditeur n'est pas l'organisateur d'un événement correspondant de votre calendrier.",
  "Could not apply: {error}": "Impossible d'appliquer : {error}",

  // Loading feedback
  "Sending update to attendees…": "Envoi de la mise à jour aux participants…",
  'Unsubscribing from "{name}"…': "Désabonnement de « {name} »…",
};
