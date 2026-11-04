//! Self-update from the GitHub releases of AndyD9/Goyav. The endpoint and
//! the update-signing public key live in `tauri.conf.json`; the release
//! workflow (`.github/workflows/release.yml`) publishes signed builds.
//!
//! Release builds check once at startup and stay quiet unless an update
//! exists; Help > Check for Updates also reports "up to date" and errors.

use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

use crate::error::{Error, Result};

pub fn check_on_startup(app: &AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = check(&app, false).await {
            log::warn!("Update check failed: {e}");
        }
    });
}

#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> Result<()> {
    if let Err(e) = check(&app, true).await {
        log::warn!("Update check failed: {e}");
        notify(&app, MessageDialogKind::Error, format!("Could not check for updates.\n\n{e}"));
    }
    Ok(())
}

async fn check(app: &AppHandle, manual: bool) -> Result<()> {
    let updater = app.updater().map_err(|e| Error::Other(e.to_string()))?;
    let Some(update) = updater.check().await.map_err(|e| Error::Other(e.to_string()))? else {
        if manual {
            let version = app.package_info().version.to_string();
            notify(app, MessageDialogKind::Info, format!("Goyav {version} is up to date."));
        }
        return Ok(());
    };

    log::info!("Update available: {} -> {}", update.current_version, update.version);
    let message = format!(
        "Goyav {} is available (you have {}).\n\nInstall it now? Goyav will restart.",
        update.version, update.current_version
    );
    if !ask(app, message).await {
        return Ok(());
    }

    update
        .download_and_install(|_, _| {}, || log::info!("Update downloaded, installing"))
        .await
        .map_err(|e| Error::Other(e.to_string()))?;
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

async fn ask(app: &AppHandle, message: String) -> bool {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .message(message)
        .title("Update Goyav")
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Install and Restart".into(),
            "Later".into(),
        ))
        .show(move |install| {
            let _ = tx.send(install);
        });
    rx.await.unwrap_or(false)
}

fn notify(app: &AppHandle, kind: MessageDialogKind, message: String) {
    app.dialog()
        .message(message)
        .title("Goyav Updates")
        .kind(kind)
        .buttons(MessageDialogButtons::Ok)
        .show(|_| {});
}
