export type Lang = "en" | "fr";
export const LANGS: readonly Lang[] = ["en", "fr"];

export function isLang(value: string): value is Lang {
  return (LANGS as readonly string[]).includes(value);
}

/** Event titles, keyed by Coolify's `event` identifier. */
export const EVENT_TITLES: Record<string, Record<Lang, string>> = {
  deployment_success: { en: "Deployment succeeded", fr: "Déploiement réussi" },
  deployment_failed: { en: "Deployment failed", fr: "Échec du déploiement" },
  status_changed: { en: "Application stopped", fr: "Application arrêtée" },
  restart_limit_reached: { en: "Restart limit reached", fr: "Limite de redémarrages atteinte" },
  container_stopped: { en: "Container stopped", fr: "Conteneur arrêté" },
  container_restarted: { en: "Container restarted automatically", fr: "Conteneur redémarré automatiquement" },
  backup_success: { en: "Database backup succeeded", fr: "Sauvegarde de base de données réussie" },
  backup_success_with_s3_warning: {
    en: "Backup saved locally, S3 upload failed",
    fr: "Sauvegarde locale OK, envoi S3 échoué",
  },
  backup_failed: { en: "Database backup failed", fr: "Échec de la sauvegarde de base de données" },
  backup_missing: { en: "Scheduled database backup missing", fr: "Sauvegarde planifiée manquante" },
  volume_backup_success: { en: "Storage backup succeeded", fr: "Sauvegarde du stockage réussie" },
  volume_backup_failed: { en: "Storage backup failed", fr: "Échec de la sauvegarde du stockage" },
  volume_backup_missing: { en: "Scheduled storage backup missing", fr: "Sauvegarde du stockage manquante" },
  volume_backup_recovery_failed: {
    en: "Storage backup recovery failed",
    fr: "Échec de la restauration après sauvegarde du stockage",
  },
  task_success: { en: "Scheduled task succeeded", fr: "Tâche planifiée réussie" },
  task_failed: { en: "Scheduled task failed", fr: "Échec de la tâche planifiée" },
  docker_cleanup_success: { en: "Docker cleanup done", fr: "Nettoyage Docker effectué" },
  docker_cleanup_failed: { en: "Docker cleanup failed", fr: "Échec du nettoyage Docker" },
  server_reachable: { en: "Server reachable again", fr: "Serveur de nouveau joignable" },
  server_unreachable: { en: "Server unreachable", fr: "Serveur injoignable" },
  high_disk_usage: { en: "High disk usage", fr: "Espace disque critique" },
  server_patch_check: { en: "Server updates available", fr: "Mises à jour serveur disponibles" },
  server_patch_check_error: { en: "Server update check failed", fr: "Échec de la vérification des mises à jour" },
  traefik_version_outdated: { en: "Traefik proxy outdated", fr: "Proxy Traefik obsolète" },
  ssl_certificate_renewal: { en: "SSL certificates renewed", fr: "Certificats SSL renouvelés" },
  api_token_expiring: { en: "API token expiring", fr: "Token API bientôt expiré" },
  server_force_enabled: { en: "Server re-enabled", fr: "Serveur réactivé" },
  server_force_disabled: { en: "Server disabled", fr: "Serveur désactivé" },
  hetzner_deletion_failed: { en: "Hetzner server deletion failed", fr: "Échec de suppression du serveur Hetzner" },
  test: { en: "Test notification", fr: "Notification de test" },
  general: { en: "Coolify notification", fr: "Notification Coolify" },
};

const STRINGS = {
  en: {
    project: "Project",
    pullRequest: "Pull request",
    server: "Server",
    container: "Container",
    database: "Database",
    storage: "Storage",
    frequency: "Frequency",
    task: "Task",
    disk: "Disk usage",
    threshold: "threshold",
    restarts: "Restarts",
    updates: "Updates",
    critical: "critical",
    servers: "Affected servers",
    resources: "Resources",
    token: "Token",
    expires: "Expires",
    error: "Error",
    output: "Output",
    details: "Details",
    openInCoolify: "Open in Coolify",
    openApp: "Open app",
    unknownEvent: "Coolify event",
  },
  fr: {
    project: "Projet",
    pullRequest: "Pull request",
    server: "Serveur",
    container: "Conteneur",
    database: "Base de données",
    storage: "Stockage",
    frequency: "Fréquence",
    task: "Tâche",
    disk: "Utilisation disque",
    threshold: "seuil",
    restarts: "Redémarrages",
    updates: "Mises à jour",
    critical: "critiques",
    servers: "Serveurs concernés",
    resources: "Ressources",
    token: "Token",
    expires: "Expire le",
    error: "Erreur",
    output: "Sortie",
    details: "Détails",
    openInCoolify: "Ouvrir dans Coolify",
    openApp: "Ouvrir l'application",
    unknownEvent: "Événement Coolify",
  },
} satisfies Record<Lang, Record<string, string>>;

export type LabelKey = keyof (typeof STRINGS)["en"];

export function label(lang: Lang, key: LabelKey): string {
  return STRINGS[lang][key];
}

/** Bot replies to commands. Functions receive interpolation values. */
export const REPLIES = {
  en: {
    help: (prefix: string) =>
      [
        "**Coolify notifications for Root**",
        `\`${prefix} setup <relay-url> [relay-key]\`: send Coolify notifications to this channel`,
        `\`${prefix} status\`: show the configuration of this channel`,
        `\`${prefix} test\`: post a sample notification`,
        `\`${prefix} lang <en|fr>\`: change the language of notifications`,
        `\`${prefix} rotate\`: generate a new webhook URL (if the old one leaked)`,
        `\`${prefix} remove\`: stop notifications in this channel`,
        "Guide: https://github.com/OWNER/root-coolify-notifier",
      ].join("\n"),
    notAdmin:
      "Only the bot admins can do that. They are chosen in the bot settings (community settings, Apps).",
    noAdminsConfigured:
      "No bot admin is configured yet. Pick the roles or members allowed to configure the bot in the bot settings (community settings, Apps).",
    unknownCommand: (prefix: string) => `Unknown command. Type \`${prefix} help\`.`,
    missingUrl: (prefix: string) => `Usage: \`${prefix} setup https://relay.example.com [relay-key]\``,
    invalidUrl: "The relay URL must start with https:// (http:// is only allowed for localhost).",
    alreadyConfigured: (prefix: string) =>
      `This channel is already connected. Use \`${prefix} rotate\` for a new URL or \`${prefix} remove\` first.`,
    notConfigured: (prefix: string) => `This channel is not connected. Run \`${prefix} setup <relay-url>\`.`,
    relayError: (reason: string) => `Could not reach the relay: ${reason}`,
    setupDone: (webhookUrl: string) =>
      [
        "✅ **Channel connected.** Last step, in Coolify:",
        "1. Open **Notifications → Webhook**",
        "2. Paste this URL, enable the channel, pick your events and save:",
        `\`${webhookUrl}\``,
        "3. Click **Send Test Notification**: it should appear here within seconds.",
        "⚠️ Anyone who knows this URL can post notifications here. If it leaks, run `/coolify rotate`.",
      ].join("\n"),
    rotated: (webhookUrl: string) =>
      `🔁 New webhook URL generated. Update it in Coolify (**Notifications → Webhook**):\n\`${webhookUrl}\`\nThe previous URL no longer works.`,
    removed: "🛑 Notifications stopped for this channel. You can disable the webhook in Coolify too.",
    langSet: "Language set to English.",
    langUsage: (prefix: string) => `Usage: \`${prefix} lang en\` or \`${prefix} lang fr\``,
    status: (s: { relay: string; webhookUrl: string; state: string; lastEvent: string; lang: string }) =>
      [
        "**Coolify notifications: status**",
        `Relay: ${s.relay}`,
        `Webhook URL: \`${s.webhookUrl}\``,
        `Connection: ${s.state}`,
        `Last notification: ${s.lastEvent}`,
        `Language: ${s.lang}`,
      ].join("\n"),
    stateOk: "🟢 connected",
    stateFailing: (since: string, reason: string) => `🔴 failing since ${since} (${reason})`,
    never: "never",
    relayDown: (reason: string) =>
      `🔴 **Coolify notifications interrupted**: the relay is unreachable (${reason}). Retrying automatically.`,
    relayAuthFailed:
      "🔴 **Coolify notifications interrupted**: the relay rejected this bot (wrong or missing relay key). Run `/coolify setup` again.",
    relayBack: "🟢 Relay reachable again, notifications resumed.",
  },
  fr: {
    help: (prefix: string) =>
      [
        "**Notifications Coolify pour Root**",
        `\`${prefix} setup <url-du-relais> [clé-du-relais]\` : envoyer les notifications Coolify dans ce salon`,
        `\`${prefix} status\` : afficher la configuration du salon`,
        `\`${prefix} test\` : publier une notification d'exemple`,
        `\`${prefix} lang <en|fr>\` : changer la langue des notifications`,
        `\`${prefix} rotate\` : générer une nouvelle URL de webhook (en cas de fuite)`,
        `\`${prefix} remove\` : arrêter les notifications dans ce salon`,
        "Guide : https://github.com/OWNER/root-coolify-notifier",
      ].join("\n"),
    notAdmin:
      "Seuls les administrateurs du bot peuvent faire cela. Ils se choisissent dans les paramètres du bot (paramètres de la communauté, Apps).",
    noAdminsConfigured:
      "Aucun administrateur du bot n'est configuré. Choisissez les rôles ou membres autorisés dans les paramètres du bot (paramètres de la communauté, Apps).",
    unknownCommand: (prefix: string) => `Commande inconnue. Tapez \`${prefix} help\`.`,
    missingUrl: (prefix: string) => `Utilisation : \`${prefix} setup https://relais.exemple.com [clé-du-relais]\``,
    invalidUrl: "L'URL du relais doit commencer par https:// (http:// n'est accepté que pour localhost).",
    alreadyConfigured: (prefix: string) =>
      `Ce salon est déjà connecté. Utilisez \`${prefix} rotate\` pour une nouvelle URL ou \`${prefix} remove\` d'abord.`,
    notConfigured: (prefix: string) => `Ce salon n'est pas connecté. Lancez \`${prefix} setup <url-du-relais>\`.`,
    relayError: (reason: string) => `Impossible de joindre le relais : ${reason}`,
    setupDone: (webhookUrl: string) =>
      [
        "✅ **Salon connecté.** Dernière étape, dans Coolify :",
        "1. Ouvrez **Notifications → Webhook**",
        "2. Collez cette URL, activez le canal, choisissez vos événements et enregistrez :",
        `\`${webhookUrl}\``,
        "3. Cliquez sur **Send Test Notification** : elle doit apparaître ici en quelques secondes.",
        "⚠️ Toute personne qui connaît cette URL peut publier des notifications ici. En cas de fuite, lancez `/coolify rotate`.",
      ].join("\n"),
    rotated: (webhookUrl: string) =>
      `🔁 Nouvelle URL de webhook générée. Mettez-la à jour dans Coolify (**Notifications → Webhook**) :\n\`${webhookUrl}\`\nL'ancienne URL ne fonctionne plus.`,
    removed: "🛑 Notifications arrêtées pour ce salon. Pensez à désactiver le webhook dans Coolify.",
    langSet: "Langue définie sur le français.",
    langUsage: (prefix: string) => `Utilisation : \`${prefix} lang en\` ou \`${prefix} lang fr\``,
    status: (s: { relay: string; webhookUrl: string; state: string; lastEvent: string; lang: string }) =>
      [
        "**Notifications Coolify : état**",
        `Relais : ${s.relay}`,
        `URL du webhook : \`${s.webhookUrl}\``,
        `Connexion : ${s.state}`,
        `Dernière notification : ${s.lastEvent}`,
        `Langue : ${s.lang}`,
      ].join("\n"),
    stateOk: "🟢 connecté",
    stateFailing: (since: string, reason: string) => `🔴 en échec depuis ${since} (${reason})`,
    never: "jamais",
    relayDown: (reason: string) =>
      `🔴 **Notifications Coolify interrompues** : le relais est injoignable (${reason}). Nouvelle tentative automatique.`,
    relayAuthFailed:
      "🔴 **Notifications Coolify interrompues** : le relais refuse ce bot (clé du relais absente ou incorrecte). Relancez `/coolify setup`.",
    relayBack: "🟢 Relais de nouveau joignable, notifications rétablies.",
  },
};

export function t(lang: Lang) {
  return REPLIES[lang];
}
