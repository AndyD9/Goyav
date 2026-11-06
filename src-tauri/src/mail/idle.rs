//! IMAP IDLE loop for push-like email notifications.
//!
//! Maintains a persistent IMAP connection on INBOX and enters IDLE mode.
//! When the server signals new mail, triggers a sync of the inbox folder.
//! Handles network disconnects with exponential backoff and auto-reconnect.

use std::sync::Arc;
use std::time::Duration;

use crate::mail::imap::{ImapConfig, ImapConnection};
use crate::state::IdleControl;

/// IDLE timeout — re-enter IDLE every 25 minutes (well under the
/// 29-minute RFC 2177 limit and typical server timeouts).
const IDLE_TIMEOUT: Duration = Duration::from_secs(25 * 60);

/// Initial delay before reconnecting after an error.
const INITIAL_RECONNECT_DELAY: Duration = Duration::from_secs(5);

/// Maximum backoff delay (5 minutes).
const MAX_RECONNECT_DELAY: Duration = Duration::from_secs(5 * 60);

/// Callback events emitted by the IDLE loop.
pub enum IdleEvent<'a> {
    /// New mail arrived — trigger a sync.
    NewMail(&'a str),
    /// Connection lost — network may be down.
    Disconnected(&'a str),
    /// Successfully reconnected after a disconnect.
    Reconnected(&'a str),
}

/// Reloads an account's IMAP config before a reconnect. OAuth access tokens
/// expire after about an hour, so a config captured when the loop started
/// cannot authenticate any reconnect made after that.
pub type IdleConfigRefresher = Box<dyn Fn() -> crate::error::Result<ImapConfig> + Send>;

/// Run the IDLE loop for one IMAP account's INBOX.
/// This function blocks indefinitely — run it in a dedicated thread.
/// Set `stop` to true to gracefully exit the loop.
pub fn run_idle_loop(
    mut config: ImapConfig,
    refresh_config: IdleConfigRefresher,
    account_id: String,
    control: Arc<IdleControl>,
    on_event: Box<dyn Fn(IdleEvent<'_>) + Send>,
) {
    log::info!("IDLE loop starting for account {}", account_id);

    let mut backoff = INITIAL_RECONNECT_DELAY;
    let mut was_disconnected = false;
    let mut first_attempt = true;

    while !control.should_stop() {
        // The initial config is fresh; every reconnect reloads credentials.
        if !std::mem::take(&mut first_attempt) {
            match refresh_config() {
                Ok(fresh) => config = fresh,
                Err(e) => log::warn!(
                    "IDLE: could not refresh credentials for {}: {}; reusing previous ones",
                    account_id,
                    e
                ),
            }
        }

        // Connect
        let mut conn = match ImapConnection::connect_for_idle(&config, control.clone()) {
            Ok(c) => c,
            Err(e) => {
                if !was_disconnected && !control.should_stop() {
                    log::error!(
                        "IDLE: connection failed for {} ({}): {}",
                        account_id,
                        config.username,
                        e
                    );
                    on_event(IdleEvent::Disconnected(&account_id));
                    was_disconnected = true;
                }
                if control.should_stop() {
                    break;
                }
                // Exponential backoff with jitter
                log::debug!(
                    "IDLE: retrying in {}s for {}",
                    backoff.as_secs(),
                    account_id
                );
                sleep_interruptible(&control, backoff);
                backoff = (backoff * 2).min(MAX_RECONNECT_DELAY);
                continue;
            }
        };

        if control.should_stop() {
            break;
        }

        // Select INBOX
        if let Err(e) = conn.select_folder("INBOX") {
            log::warn!(
                "IDLE: failed to select INBOX for {} ({}): {}, will retry",
                account_id,
                config.username,
                e
            );
            sleep_interruptible(&control, backoff);
            backoff = (backoff * 2).min(MAX_RECONNECT_DELAY);
            continue;
        }

        // Reset backoff on successful connection
        backoff = INITIAL_RECONNECT_DELAY;

        if control.should_stop() {
            break;
        } else if was_disconnected {
            log::info!("IDLE: reconnected for account {}", account_id);
            on_event(IdleEvent::Reconnected(&account_id));
            // Trigger sync on reconnect — emails may have arrived while disconnected
            on_event(IdleEvent::NewMail(&account_id));
            was_disconnected = false;
        } else {
            log::info!(
                "IDLE: connected and selected INBOX for account {}",
                account_id
            );
        }

        // IDLE loop — stay on this connection until it breaks
        loop {
            if control.should_stop() {
                break;
            }

            match conn.idle_wait(IDLE_TIMEOUT) {
                Ok(had_notification) => {
                    if had_notification && !control.should_stop() {
                        log::info!("IDLE: new mail for account {}, triggering sync", account_id);
                        on_event(IdleEvent::NewMail(&account_id));
                    }
                    // If timeout (no notification), just re-enter IDLE
                }
                Err(e) => {
                    if control.should_stop() {
                        break;
                    }
                    log::warn!("IDLE: error for {}: {}, reconnecting...", account_id, e);
                    on_event(IdleEvent::Disconnected(&account_id));
                    was_disconnected = true;
                    break; // Break inner loop to reconnect
                }
            }
        }

        // Clean up connection
        conn.logout();

        if !control.should_stop() {
            sleep_interruptible(&control, Duration::from_secs(2));
        }
    }

    log::info!("IDLE loop stopped for account {}", account_id);
}

/// Sleep for `duration` but check `stop` flag every second so we can
/// exit quickly when the app is shutting down.
fn sleep_interruptible(control: &IdleControl, duration: Duration) {
    let steps = duration.as_secs();
    for _ in 0..steps {
        if control.should_stop() {
            return;
        }
        std::thread::sleep(Duration::from_secs(1));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn unreachable_config(password: &str) -> ImapConfig {
        // Bind then drop a listener so the port is known to refuse connections.
        let port = std::net::TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap()
            .port();
        ImapConfig {
            host: "127.0.0.1".into(),
            port,
            username: "user@example.test".into(),
            password: password.into(),
            use_tls: true,
            use_xoauth2: true,
        }
    }

    #[test]
    fn reconnect_reloads_credentials_instead_of_reusing_the_initial_token() {
        let control = Arc::new(IdleControl::new());
        let refreshes = Arc::new(AtomicUsize::new(0));

        let refresher_control = control.clone();
        let refresher_count = refreshes.clone();
        let refresher: IdleConfigRefresher = Box::new(move || {
            refresher_count.fetch_add(1, Ordering::SeqCst);
            // One reload is enough to prove reconnects don't reuse the
            // config captured at startup.
            refresher_control.request_stop();
            Ok(unreachable_config("fresh-token"))
        });

        run_idle_loop(
            unreachable_config("expired-token"),
            refresher,
            "account".into(),
            control,
            Box::new(|_| {}),
        );

        assert_eq!(refreshes.load(Ordering::SeqCst), 1);
    }
}
