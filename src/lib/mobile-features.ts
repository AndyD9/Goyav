/**
 * Mobile features that are not implemented yet. Goyav only ships macOS
 * builds; the mobile UI is kept as is but must not offer actions that do
 * nothing.
 *
 * Compose: components/mobile/ComposeSheet.vue is a placeholder with a
 * disabled Send button, so the compose button and the reply/forward dock
 * are hidden until it can actually send.
 */
export const MOBILE_COMPOSE_AVAILABLE = false;
