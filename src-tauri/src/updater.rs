//! Self-update from the GitHub releases of AndyD9/Goyav. The endpoint and
//! the update-signing public key live in `tauri.conf.json`; the release
//! workflow (`.github/workflows/release.yml`) publishes signed builds.
//!
//! Release builds check at startup and then every few hours. A found update
//! is kept here and announced to the frontend with an `update-available`
//! event; the frontend shows its own notice and calls `install_update`,
//! which reports download progress with `update-progress` events.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::error::{Error, Result};

const RECHECK_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);
const PROGRESS_EVENT_INTERVAL: Duration = Duration::from_millis(100);

/// The update found by the last check, waiting for the user to install it.
#[derive(Default)]
pub struct UpdaterState {
    pending: Mutex<Option<Update>>,
    installing: AtomicBool,
}

impl UpdaterState {
    fn pending(&self) -> std::sync::MutexGuard<'_, Option<Update>> {
        self.pending.lock().unwrap_or_else(|e| e.into_inner())
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    version: String,
    current_version: String,
    /// Release notes (Markdown) published with the release.
    notes: Option<String>,
    /// Publication time, Unix seconds.
    published_at: Option<i64>,
}

impl From<&Update> for UpdateInfo {
    fn from(update: &Update) -> Self {
        Self {
            version: update.version.clone(),
            current_version: update.current_version.clone(),
            notes: update.body.clone().filter(|body| !body.trim().is_empty()),
            published_at: update.date.map(|date| date.unix_timestamp()),
        }
    }
}

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum UpdateCheck {
    UpToDate { version: String },
    Available(UpdateInfo),
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateProgress {
    downloaded: u64,
    total: Option<u64>,
    /// The download finished and the bundle is being replaced.
    installing: bool,
}

pub fn check_on_startup(app: &AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            let installing = app
                .state::<UpdaterState>()
                .installing
                .load(Ordering::SeqCst);
            if !installing {
                if let Err(e) = check(&app).await {
                    log::warn!("Update check failed: {e}");
                }
            }
            tokio::time::sleep(RECHECK_INTERVAL).await;
        }
    });
}

/// Help > Check for Updates. The frontend reports the result.
#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> Result<UpdateCheck> {
    check(&app)
        .await
        .inspect_err(|e| log::warn!("Update check failed: {e}"))
}

/// The update found by an earlier check, if any. Lets the frontend catch up
/// with a startup check that finished before it listened for events.
#[tauri::command]
pub fn get_pending_update(state: tauri::State<'_, UpdaterState>) -> Option<UpdateInfo> {
    state.pending().as_ref().map(UpdateInfo::from)
}

async fn check(app: &AppHandle) -> Result<UpdateCheck> {
    let updater = app.updater().map_err(|e| Error::Other(e.to_string()))?;
    let found = updater
        .check()
        .await
        .map_err(|e| Error::Other(e.to_string()))?;
    let state = app.state::<UpdaterState>();
    let Some(update) = found else {
        *state.pending() = None;
        return Ok(UpdateCheck::UpToDate {
            version: app.package_info().version.to_string(),
        });
    };

    log::info!(
        "Update available: {} -> {}",
        update.current_version,
        update.version
    );
    let info = UpdateInfo::from(&update);
    *state.pending() = Some(update);
    if let Err(e) = app.emit("update-available", &info) {
        log::warn!("Could not announce the update: {e}");
    }
    Ok(UpdateCheck::Available(info))
}

/// Download, verify and install the pending update, then restart.
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<()> {
    let state = app.state::<UpdaterState>();
    if state.installing.swap(true, Ordering::SeqCst) {
        return Err(Error::Other("An update is already being installed".into()));
    }
    let result = download_and_install(&app).await;
    if result.is_err() {
        state.installing.store(false, Ordering::SeqCst);
    }
    result?;

    log::info!("Update installed, restarting");
    // On macOS, relaunch only once this process is gone; otherwise the new
    // instance shows up as a second Dock icon next to the pinned one.
    #[cfg(target_os = "macos")]
    if relaunch_after_exit() {
        app.exit(0);
        return Ok(());
    }
    // Goes through the ExitRequested handler in lib.rs, so account
    // workers stop cleanly before the new version starts.
    app.request_restart();
    Ok(())
}

async fn download_and_install(app: &AppHandle) -> Result<()> {
    let update = app
        .state::<UpdaterState>()
        .pending()
        .clone()
        .ok_or_else(|| Error::Other("No update is available".into()))?;

    let progress_app = app.clone();
    let finished_app = app.clone();
    let mut downloaded: u64 = 0;
    let mut last_event: Option<Instant> = None;
    update
        .download_and_install(
            move |chunk, total| {
                downloaded += chunk as u64;
                let done = total.is_some_and(|total| downloaded >= total);
                if done || last_event.is_none_or(|at| at.elapsed() >= PROGRESS_EVENT_INTERVAL) {
                    last_event = Some(Instant::now());
                    let _ = progress_app.emit(
                        "update-progress",
                        UpdateProgress {
                            downloaded,
                            total,
                            installing: false,
                        },
                    );
                }
            },
            move || {
                log::info!("Update downloaded, installing");
                let _ = finished_app.emit(
                    "update-progress",
                    UpdateProgress {
                        downloaded: 0,
                        total: None,
                        installing: true,
                    },
                );
            },
        )
        .await
        .map_err(|e| Error::Other(e.to_string()))
}

/// Start a detached helper that waits for this process to exit, then opens
/// the app bundle through LaunchServices. Tauri's own restart runs
/// `open -n` while the old instance is still alive, which macOS treats as a
/// separate app instance: the Dock then shows the new version beside the
/// pinned icon. Returns false when the app is not running from a bundle.
#[cfg(target_os = "macos")]
fn relaunch_after_exit() -> bool {
    use std::os::unix::process::CommandExt;
    use std::process::{Command, Stdio};

    let Ok(exe) = std::env::current_exe() else {
        return false;
    };
    // <bundle>.app/Contents/MacOS/<binary>
    let Some(bundle) = exe
        .ancestors()
        .nth(3)
        .filter(|path| path.extension().is_some_and(|ext| ext == "app"))
    else {
        return false;
    };
    let script = r#"while kill -0 "$1" 2>/dev/null; do sleep 0.2; done; exec /usr/bin/open "$2""#;
    match Command::new("/bin/sh")
        .arg("-c")
        .arg(script)
        .arg("goyav-relaunch")
        .arg(std::process::id().to_string())
        .arg(bundle)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .process_group(0)
        .spawn()
    {
        Ok(_) => true,
        Err(e) => {
            log::warn!("Could not schedule the relaunch, using Tauri's restart: {e}");
            false
        }
    }
}
