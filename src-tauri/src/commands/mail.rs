use tauri::{AppHandle, Manager, State};

use crate::commands::sync_cmd::{resume_imap_idle_for_account, suspend_imap_idle_for_operation};
use crate::db;
use crate::db::messages::{MessageSummary, ThreadedPage};
use crate::error::{Error, Result};
use crate::event::tauri::{emit_folders_changed, emit_messages_changed};
use crate::mail::parser;
use crate::message::{BodyLocation, SearchHit, SearchQuery};
use crate::state::AppState;

/// Check if an IP address is in a private/reserved range (SSRF protection).
/// IPv4-mapped/compatible IPv6 addresses are classified as their IPv4 form.
fn is_private_ip(ip: &std::net::IpAddr) -> bool {
    match ip.to_canonical() {
        std::net::IpAddr::V4(v4) => {
            let [a, b, ..] = v4.octets();
            v4.is_loopback()            // 127.0.0.0/8
            || v4.is_private()          // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
            || v4.is_link_local()       // 169.254.0.0/16
            || v4.is_broadcast()        // 255.255.255.255
            || v4.is_multicast()        // 224.0.0.0/4
            || a == 0                   // 0.0.0.0/8
            || a >= 240                 // 240.0.0.0/4 reserved
            || (a == 100 && (64..=127).contains(&b)) // 100.64.0.0/10 (CGNAT)
            || (a == 198 && (b & 0xfe) == 18) // 198.18.0.0/15 (benchmarking)
        }
        std::net::IpAddr::V6(v6) => {
            let s = v6.segments();
            v6.is_loopback()            // ::1
            || v6.is_unspecified()      // ::
            || v6.is_multicast()        // ff00::/8
            || s[0] & 0xfe00 == 0xfc00  // ULA fc00::/7
            || s[0] & 0xffc0 == 0xfe80  // link-local fe80::/10
            || s[0] == 0x2002           // 6to4 (embeds an IPv4 address)
            || (s[0] == 0x64 && s[1] == 0xff9b) // NAT64 64:ff9b::/96
            || v6.to_ipv4().is_some() // ::a.b.c.d (IPv4-compatible)
        }
    }
}

const MAX_REMOTE_IMAGE_BYTES: usize = 5 * 1024 * 1024;

/// A remote image URL may only be fetched over https from a public host.
/// Checked for the initial URL and again for every redirect hop.
fn remote_image_url_allowed(url: &reqwest::Url) -> bool {
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
        return false;
    }
    match url.host() {
        Some(url::Host::Ipv4(ip)) => !is_private_ip(&ip.into()),
        Some(url::Host::Ipv6(ip)) => !is_private_ip(&ip.into()),
        Some(url::Host::Domain(domain)) => {
            let domain = domain.trim_end_matches('.').to_ascii_lowercase();
            !(domain == "localhost"
                || domain.ends_with(".localhost")
                || domain.ends_with(".local")
                || domain.ends_with(".internal"))
        }
        None => false,
    }
}

/// Bare image MIME types accepted into a data: URI.
fn allowed_image_content_type(header: &str) -> Option<&'static str> {
    let essence = header.split(';').next()?.trim().to_ascii_lowercase();
    [
        "image/png",
        "image/jpeg",
        "image/gif",
        "image/webp",
        "image/avif",
        "image/bmp",
        "image/x-icon",
        "image/vnd.microsoft.icon",
    ]
    .into_iter()
    .find(|allowed| *allowed == essence)
}

/// DNS resolver for remote images that drops private/reserved addresses, so
/// the address actually connected to is the one validated (no DNS-rebinding
/// window between a pre-check and the connection).
struct PublicOnlyResolver;

impl reqwest::dns::Resolve for PublicOnlyResolver {
    fn resolve(&self, name: reqwest::dns::Name) -> reqwest::dns::Resolving {
        Box::pin(async move {
            let addrs: Vec<std::net::SocketAddr> = tokio::net::lookup_host((name.as_str(), 0))
                .await?
                .filter(|addr| !is_private_ip(&addr.ip()))
                .collect();
            if addrs.is_empty() {
                return Err("remote image host resolves only to private addresses".into());
            }
            Ok(Box::new(addrs.into_iter()) as reqwest::dns::Addrs)
        })
    }
}

/// HTTP client for fetching remote images on behalf of email content:
/// https only, public addresses only (checked at connect time), and every
/// redirect re-validated, capped at 5 hops.
fn remote_image_client() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .https_only(true)
        .dns_resolver(std::sync::Arc::new(PublicOnlyResolver))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 5 || !remote_image_url_allowed(attempt.url()) {
                attempt.stop()
            } else {
                attempt.follow()
            }
        }))
        .build()
        .map_err(|e| Error::Other(format!("HTTP client error: {}", e)))
}

#[tauri::command]
pub async fn list_folders(
    state: State<'_, AppState>,
    account_id: String,
) -> Result<Vec<db::folders::Folder>> {
    log::debug!("Listing folders for account {}", account_id);
    let conn = state.db.reader();
    let flat_folders = db::folders::list_folders(&conn, &account_id)?;
    log::debug!(
        "Found {} folders for account {}",
        flat_folders.len(),
        account_id
    );
    let tree = db::folders::build_folder_tree(flat_folders);
    Ok(tree)
}

#[tauri::command]
pub async fn get_messages(
    state: State<'_, AppState>,
    account_id: String,
    folder_path: String,
    page: u32,
    per_page: u32,
    sort_column: Option<String>,
    sort_asc: Option<bool>,
    filter: Option<db::messages::QuickFilter>,
) -> Result<db::messages::MessagePage> {
    let col = sort_column.as_deref().unwrap_or("date");
    let asc = sort_asc.unwrap_or(false);
    let qf = filter.unwrap_or_default();
    log::debug!(
        "Getting messages: account={} folder={} page={} per_page={} sort={}:{}",
        account_id,
        folder_path,
        page,
        per_page,
        col,
        if asc { "asc" } else { "desc" }
    );
    let conn = state.db.reader();
    let result = db::messages::get_messages(
        &conn,
        &account_id,
        &folder_path,
        page,
        per_page,
        col,
        asc,
        &qf,
    )?;
    log::debug!(
        "Returned {} messages (total={}) for folder {}",
        result.messages.len(),
        result.total,
        folder_path
    );
    Ok(result)
}

/// Search the local message cache across every folder. `account_ids` limits
/// the search to those accounts; `None` searches every account with mail.
#[tauri::command]
pub async fn search_messages_local(
    state: State<'_, AppState>,
    account_ids: Option<Vec<String>>,
    filter: db::messages::QuickFilter,
    limit: Option<u32>,
) -> Result<db::messages::LocalSearchPage> {
    let conn = state.db.reader();
    let ids = match account_ids {
        Some(ids) => ids,
        None => db::accounts::list_accounts(&conn)?
            .into_iter()
            .filter(|a| !a.mail_protocol.is_empty())
            .map(|a| a.id)
            .collect(),
    };
    let limit = limit.unwrap_or(200).clamp(1, 1000);
    db::messages::search_local_messages(&conn, &ids, &filter, limit)
}

/// Run a server-side search across all folders of an account.
/// Provider credentials and wire behavior stay behind [`MailBackend`].
#[tauri::command]
pub async fn search_messages_server(
    app: AppHandle,
    state: State<'_, AppState>,
    account_id: String,
    query: SearchQuery,
) -> Result<Vec<SearchHit>> {
    log::info!(
        "Server search: account={} fields={:?} text_len={}",
        account_id,
        query.fields,
        query.text.len(),
    );

    let account = {
        let conn = state.db.reader();
        db::accounts::get_account_full(&conn, &account_id)?
    };
    let mail_config = account.mail_config();

    let backend = crate::backend::mail::for_account(&mail_config).ok_or_else(|| {
        Error::Other(format!(
            "Account {} has no enabled mail service for server search",
            account_id
        ))
    })?;
    let ctx = crate::backend::mail::MailSyncCtx {
        events: crate::event::tauri::shared_sink(app.clone()),
        db: state.db.clone(),
        data_dir: state.data_dir.clone(),
        providers: state.providers.clone(),
    };

    let suspended_idle = if backend.suspends_idle_for_ops(&mail_config) {
        Some(suspend_imap_idle_for_operation(&app, &state, &account).await?)
    } else {
        None
    };

    let hits = if let Some(suspended_idle) = suspended_idle {
        let search_account = mail_config.clone();
        let resume_account = account.clone();
        let resume_app = app.clone();
        let task = spawn_with_imap_idle_resume(
            account_id.clone(),
            "server search",
            async move { backend.search_messages(&ctx, &search_account, &query).await },
            async move {
                let state = resume_app.state::<AppState>();
                resume_imap_idle_for_account(
                    &resume_app,
                    &state,
                    &resume_account,
                    Some(suspended_idle),
                )
                .await
            },
        );
        task.await
            .map_err(|e| Error::Other(format!("Server search task panicked: {}", e)))??
    } else {
        backend.search_messages(&ctx, &mail_config, &query).await?
    };

    log::info!("Server search returned {} hits", hits.len());
    Ok(hits)
}

/// Insert (or upsert) a server-search hit into the local messages table so
/// the existing `get_message_body` flow can fetch and render it. Returns the
/// synthetic database id, which the frontend then passes to `loadMessage`.
///
/// We don't have the full envelope (size, to/cc, encryption flags) from the
/// search response, so we fill in reasonable defaults — the next sync of
/// that folder will reconcile them.
#[tauri::command]
pub async fn import_search_hit(
    state: State<'_, AppState>,
    account_id: String,
    hit: SearchHit,
) -> Result<String> {
    if hit.account_id != account_id {
        return Err(Error::Other(format!(
            "search hit account_id mismatch: command got {:?}, hit was tagged {:?}",
            account_id, hit.account_id
        )));
    }

    let account = {
        let conn = state.db.reader();
        db::accounts::get_account_full(&conn, &account_id)?
    };

    let mail_config = account.mail_config();
    let backend = crate::backend::mail::for_account(&mail_config).ok_or_else(|| {
        Error::Other(format!(
            "Account {} has no enabled mail service to import search hits",
            account_id
        ))
    })?;
    let crate::backend::mail::SearchHitIdentity {
        id,
        uid,
        body_location: maildir_path,
    } = backend.search_hit_identity(&account_id, &hit)?;

    let date_str = if hit.date > 0 {
        chrono::DateTime::<chrono::Utc>::from_timestamp(hit.date, 0)
            .map(|dt| dt.to_rfc3339())
            .unwrap_or_default()
    } else {
        chrono::Utc::now().to_rfc3339()
    };

    let new_msg = db::messages::NewMessage {
        id: id.clone(),
        account_id: account_id.clone(),
        folder_path: hit.folder_path,
        uid,
        message_id: hit.message_id,
        in_reply_to: None,
        thread_id: None,
        subject: if hit.subject.is_empty() {
            None
        } else {
            Some(hit.subject)
        },
        from_name: hit.from_name,
        from_email: hit.from_email.unwrap_or_else(|| "unknown".to_string()),
        to_addresses: "[]".to_string(),
        cc_addresses: "[]".to_string(),
        date: date_str,
        size: 0,
        has_attachments: false,
        is_encrypted: false,
        is_signed: false,
        flags: "[]".to_string(),
        maildir_path,
        snippet: hit.snippet,
    };

    {
        let conn = state.db.writer().await;
        db::messages::insert_message(&conn, &new_msg)?;
    }

    Ok(id)
}

/// Ensure the raw RFC822 body for `message_id` is on disk and return the
/// relative maildir path that resolves under `state.data_dir`. If the body
/// hasn't been downloaded yet, dispatches through the account's mail backend.
async fn ensure_message_body_on_disk(
    app: &tauri::AppHandle,
    state: &State<'_, AppState>,
    account_id: &str,
    message_id: &str,
    maildir_path: &str,
    flags_json: &str,
) -> Result<String> {
    let body_location = BodyLocation::from_persisted(maildir_path);
    if let Some(local_path) = body_location.local_path() {
        return Ok(local_path.to_string());
    }

    let (account, folder_path, uid) = {
        let conn = state.db.reader();
        let account = db::accounts::get_account_full(&conn, account_id)?;
        let (fp, u) = db::messages::get_folder_and_uid(&conn, message_id)?;
        (account, fp, u)
    };
    let mail_config = account.mail_config();

    let flags = serde_json::from_str(flags_json).unwrap_or_default();
    let request = crate::backend::mail::BodyFetchRequest::from_db_row(
        &mail_config,
        message_id,
        &folder_path,
        uid,
        flags,
        body_location,
    )?;
    let backend = crate::backend::mail::for_account(&mail_config).ok_or_else(|| {
        Error::Other(format!(
            "Account {} has no enabled mail service for body fetch",
            account_id
        ))
    })?;
    let ctx = crate::backend::mail::MailSyncCtx {
        events: crate::event::tauri::shared_sink(app.clone()),
        db: state.db.clone(),
        data_dir: state.data_dir.clone(),
        providers: state.providers.clone(),
    };

    let suspended_idle = if backend.suspends_idle_for_ops(&mail_config) {
        Some(suspend_imap_idle_for_operation(app, state, &account).await?)
    } else {
        None
    };

    if let Some(suspended_idle) = suspended_idle {
        let fetch_account = mail_config.clone();
        let resume_account = account;
        let resume_app = app.clone();
        let task = spawn_with_imap_idle_resume(
            account_id.to_string(),
            "body fetch",
            fetch_body_and_record_path(backend, ctx, fetch_account, request),
            async move {
                let state = resume_app.state::<AppState>();
                resume_imap_idle_for_account(
                    &resume_app,
                    &state,
                    &resume_account,
                    Some(suspended_idle),
                )
                .await
            },
        );
        task.await
            .map_err(|e| Error::Other(format!("Body fetch owner task panicked: {}", e)))?
    } else {
        fetch_body_and_record_path(backend, ctx, mail_config, request).await
    }
}

async fn fetch_body_and_record_path(
    backend: &'static dyn crate::backend::mail::MailBackend,
    ctx: crate::backend::mail::MailSyncCtx,
    account: crate::account::MailAccountConfig,
    request: crate::backend::mail::BodyFetchRequest,
) -> Result<String> {
    log::info!(
        "Body not on disk for {}, fetching via {}",
        request.message_id,
        backend.protocol()
    );
    let relative_path = backend.fetch_body_to_disk(&ctx, &account, &request).await?;
    let conn = ctx.db.writer().await;
    db::messages::update_maildir_path(&conn, &request.message_id, &relative_path)?;
    Ok(relative_path)
}

fn spawn_with_imap_idle_resume<T, F, R>(
    account_id: String,
    operation: &'static str,
    operation_future: F,
    resume: R,
) -> tokio::task::JoinHandle<Result<T>>
where
    T: Send + 'static,
    F: std::future::Future<Output = Result<T>> + Send + 'static,
    R: std::future::Future<Output = Result<()>> + Send + 'static,
{
    tokio::spawn(async move {
        let operation_result = match tokio::spawn(operation_future).await {
            Ok(result) => result,
            Err(error) => Err(Error::Other(format!(
                "{} task failed: {}",
                operation, error
            ))),
        };
        let resume_result = resume.await;
        finish_with_imap_idle_resume(&account_id, operation, operation_result, resume_result)
    })
}

fn finish_with_imap_idle_resume<T>(
    account_id: &str,
    operation: &str,
    operation_result: Result<T>,
    resume_result: Result<()>,
) -> Result<T> {
    match (operation_result, resume_result) {
        (Ok(value), Ok(())) => Ok(value),
        (Ok(_), Err(resume_error)) => Err(resume_error),
        (Err(operation_error), Ok(())) => Err(operation_error),
        (Err(operation_error), Err(resume_error)) => {
            log::error!(
                "Failed to resume IMAP IDLE after {} error for account {}: {}",
                operation,
                account_id,
                resume_error
            );
            Err(operation_error)
        }
    }
}

#[tauri::command]
pub async fn get_message_body(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    account_id: String,
    message_id: String,
) -> Result<crate::message::MessageBody> {
    log::debug!("Loading message body: {}", message_id);

    let (maildir_path, from_email, to_json, cc_json, flags_json, is_encrypted, is_signed) = {
        let conn = state.db.reader();
        db::messages::get_message_metadata(&conn, &account_id, &message_id)?
    };

    let actual_maildir_path = ensure_message_body_on_disk(
        &app,
        &state,
        &account_id,
        &message_id,
        &maildir_path,
        &flags_json,
    )
    .await?;

    // Read and parse the message from disk
    let full_path = crate::path_validation::resolve_under(&state.data_dir, &actual_maildir_path)?;
    log::debug!("Reading message from {}", full_path.display());
    let raw = std::fs::read(&full_path).map_err(|e| {
        log::error!("Failed to read message file {}: {}", full_path.display(), e);
        Error::Other(format!(
            "Failed to read message file {}: {}",
            full_path.display(),
            e
        ))
    })?;

    parser::parse_message_body(
        &message_id,
        &raw,
        &from_email,
        &to_json,
        &cc_json,
        &flags_json,
        is_encrypted,
        is_signed,
    )
    .ok_or_else(|| {
        log::error!("Failed to parse message body for {}", message_id);
        Error::MailParse("Failed to parse message".to_string())
    })
}

/// Re-parse the message body allowing <img> tags, then download each image
/// and embed as base64 data URIs so the sandboxed iframe needs no network access.
/// Returns just the HTML string. Per-message, not persisted.
#[tauri::command]
pub async fn get_message_html_with_images(
    state: State<'_, AppState>,
    account_id: String,
    message_id: String,
) -> Result<String> {
    let maildir_path = {
        let conn = state.db.reader();
        let (mp, _, _, _, _, _, _) =
            db::messages::get_message_metadata(&conn, &account_id, &message_id)?;
        mp
    };

    if BodyLocation::from_persisted(&maildir_path).needs_fetch() {
        return Err(Error::Other(
            "Remote images not supported for messages without local body".to_string(),
        ));
    }

    let full_path = crate::path_validation::resolve_under(&state.data_dir, &maildir_path)?;
    let raw = std::fs::read(&full_path)
        .map_err(|e| Error::Other(format!("Failed to read message file: {}", e)))?;

    let html = parser::parse_html_with_images(&raw)
        .ok_or_else(|| Error::MailParse("Failed to parse message HTML".to_string()))?;

    inline_remote_images(&html).await
}

/// Inline the HTML signature's remote images for the settings and compose
/// previews, which render in the same network-less sandbox as mail.
#[tauri::command]
pub async fn get_signature_preview_html(html: String) -> Result<String> {
    inline_remote_images(&html).await
}

/// Download each `https://` image `src` and swap it for a base64 data URI.
async fn inline_remote_images(html: &str) -> Result<String> {
    // Find all img src URLs and download them, replacing with data URIs.
    // This keeps the iframe sandbox at allow-scripts only (no allow-same-origin).
    let re = regex::Regex::new(r#"src="(https://[^"]+)""#)
        .map_err(|e| Error::Other(format!("Regex error: {}", e)))?;

    let client = remote_image_client()?;

    // Collect all unique URLs
    let urls: Vec<String> = re
        .captures_iter(html)
        .filter_map(|cap| cap.get(1).map(|m| m.as_str().to_string()))
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();

    // Download images in parallel (max 20 to avoid abuse)
    use base64::Engine;
    let mut url_to_data: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    let futures: Vec<_> = urls
        .iter()
        .take(20)
        .map(|url| {
            let client = client.clone();
            let url = url.clone();
            async move {
                // Fail closed: unparsable URLs, non-https schemes and blocked
                // hosts are never fetched. The client re-checks every redirect
                // hop and the resolved address at connect time.
                let parsed = reqwest::Url::parse(&url).ok()?;
                if !remote_image_url_allowed(&parsed) {
                    log::debug!("Image proxy: blocked {}", parsed.host_str().unwrap_or(""));
                    return None;
                }

                let mut resp = client.get(parsed).send().await.ok()?;
                if !resp.status().is_success() {
                    return None;
                }
                // The Content-Type is copied into the data: URI, so only a
                // fixed allowlist of bare image types is accepted (no
                // parameters, no quotes or markup from the image host).
                let content_type = resp
                    .headers()
                    .get(reqwest::header::CONTENT_TYPE)
                    .and_then(|v| v.to_str().ok())
                    .and_then(allowed_image_content_type)?;
                if resp
                    .content_length()
                    .is_some_and(|len| len > MAX_REMOTE_IMAGE_BYTES as u64)
                {
                    return None;
                }
                // Enforce the size cap while streaming (gzip/deflate bodies
                // are decompressed before reaching us).
                let mut bytes = Vec::new();
                while let Some(chunk) = resp.chunk().await.ok()? {
                    if bytes.len() + chunk.len() > MAX_REMOTE_IMAGE_BYTES {
                        return None;
                    }
                    bytes.extend_from_slice(&chunk);
                }
                let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                Some((url, format!("data:{};base64,{}", content_type, b64)))
            }
        })
        .collect();

    let results = futures::future::join_all(futures).await;
    for result in results.into_iter().flatten() {
        url_to_data.insert(result.0, result.1);
    }

    // Replace URLs with data URIs in the HTML
    let result = re.replace_all(html, |caps: &regex::Captures| {
        let url = caps.get(1).unwrap().as_str();
        if let Some(data_uri) = url_to_data.get(url) {
            format!("src=\"{}\"", data_uri)
        } else {
            caps[0].to_string()
        }
    });

    Ok(result.into_owned())
}

#[tauri::command]
pub async fn get_threaded_messages(
    state: State<'_, AppState>,
    account_id: String,
    folder_path: String,
    page: u32,
    per_page: u32,
    sort_column: Option<String>,
    sort_asc: Option<bool>,
    filter: Option<db::messages::QuickFilter>,
) -> Result<ThreadedPage> {
    let col = sort_column.as_deref().unwrap_or("date");
    let asc = sort_asc.unwrap_or(false);
    let qf = filter.unwrap_or_default();
    log::debug!(
        "Getting threaded messages: account={} folder={} page={} per_page={} sort={}:{}",
        account_id,
        folder_path,
        page,
        per_page,
        col,
        if asc { "asc" } else { "desc" }
    );
    let conn = state.db.reader();
    let result = db::messages::get_threaded_messages(
        &conn,
        &account_id,
        &folder_path,
        page,
        per_page,
        col,
        asc,
        &qf,
    )?;
    log::debug!(
        "Returned {} threads (total_threads={}, total_messages={}) for folder {}",
        result.threads.len(),
        result.total_threads,
        result.total_messages,
        folder_path
    );
    Ok(result)
}

#[tauri::command]
pub async fn get_thread_messages(
    state: State<'_, AppState>,
    account_id: String,
    folder_path: String,
    thread_id: String,
) -> Result<Vec<MessageSummary>> {
    log::debug!(
        "Getting thread messages: account={} folder={} thread={}",
        account_id,
        folder_path,
        thread_id
    );
    let conn = state.db.reader();
    let messages = db::messages::get_thread_messages(&conn, &account_id, &folder_path, &thread_id)?;
    log::debug!(
        "Returned {} messages for thread {}",
        messages.len(),
        thread_id
    );
    Ok(messages)
}

#[tauri::command]
pub async fn unthread_message(state: State<'_, AppState>, message_id: String) -> Result<()> {
    log::info!("Unthreading message: {}", message_id);
    let conn = state.db.writer().await;
    db::messages::unthread_message(&conn, &message_id)?;
    Ok(())
}

/// The mail backend that owns folder operations for `account`, with the
/// context it needs.
fn folder_backend(
    app: &AppHandle,
    state: &AppState,
    account: &db::accounts::AccountFull,
    action: &str,
) -> Result<(
    &'static dyn crate::backend::mail::MailBackend,
    crate::backend::mail::MailSyncCtx,
    crate::account::MailAccountConfig,
)> {
    let mail_config = account.mail_config();
    let backend = crate::backend::mail::for_account(&mail_config).ok_or_else(|| {
        Error::Other(format!(
            "Account {} has no enabled mail service to {}",
            account.id, action
        ))
    })?;
    let ctx = crate::backend::mail::MailSyncCtx {
        events: crate::event::tauri::shared_sink(app.clone()),
        db: state.db.clone(),
        data_dir: state.data_dir.clone(),
        providers: state.providers.clone(),
    };
    Ok((backend, ctx, mail_config))
}

/// Create a new folder on the mail server and register it locally.
#[tauri::command]
pub async fn create_folder(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    account_id: String,
    folder_path: String,
) -> Result<()> {
    log::info!(
        "Creating folder '{}' for account {}",
        folder_path,
        account_id
    );

    let account = {
        let conn = state.db.reader();
        db::accounts::get_account_full(&conn, &account_id)?
    };
    let (backend, ctx, mail_config) = folder_backend(&app, &state, &account, "create folders")?;
    backend
        .create_folder(&ctx, &mail_config, &folder_path)
        .await
        .map_err(|e| {
            log::error!(
                "Failed to create folder '{}' for account {}: {}",
                folder_path,
                account_id,
                e
            );
            e
        })?;

    // Don't insert into local DB here — the next sync will discover the folder
    // with the correct server-side path/ID and register it properly.

    log::info!(
        "Folder '{}' created on server, will appear after sync",
        folder_path
    );
    emit_folders_changed(&app, &account_id);
    Ok(())
}

/// System folder types that must never be deleted.
const PROTECTED_FOLDER_TYPES: &[&str] = &["inbox", "sent", "drafts", "trash", "junk", "archive"];

/// Delete a folder on the mail server and remove it from local DB.
/// Refuses to delete system folders (inbox, sent, drafts, trash, junk, archive).
#[tauri::command]
pub async fn delete_folder(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    account_id: String,
    folder_path: String,
) -> Result<()> {
    log::info!(
        "Deleting folder '{}' for account {}",
        folder_path,
        account_id
    );

    // Verify the folder exists in the local DB and is not a system folder
    let account = {
        let conn = state.db.reader();

        // Check that the folder belongs to this account
        let folder_type: Option<String> = conn
            .query_row(
                "SELECT folder_type FROM folders WHERE account_id = ?1 AND path = ?2",
                rusqlite::params![account_id, folder_path],
                |row| row.get(0),
            )
            .map_err(|_| {
                Error::Other(format!(
                    "Folder '{}' not found for account {}",
                    folder_path, account_id
                ))
            })?;

        // Reject deletion of system folders
        if let Some(ref ft) = folder_type {
            if PROTECTED_FOLDER_TYPES.contains(&ft.as_str()) {
                log::warn!(
                    "Refusing to delete system folder '{}' (type={}) for account {}",
                    folder_path,
                    ft,
                    account_id
                );
                return Err(Error::Other(format!(
                    "Cannot delete system folder '{}' ({})",
                    folder_path, ft
                )));
            }
        }

        db::accounts::get_account_full(&conn, &account_id)?
    };

    let (backend, ctx, mail_config) = folder_backend(&app, &state, &account, "delete folders")?;
    backend
        .delete_folder(&ctx, &mail_config, &folder_path)
        .await
        .map_err(|e| {
            log::error!(
                "Failed to delete folder '{}' for account {}: {}",
                folder_path,
                account_id,
                e
            );
            e
        })?;

    // Remove from local DB
    {
        let conn = state.db.writer().await;
        db::folders::delete_folder(&conn, &account_id, &folder_path)?;
    }

    log::info!(
        "Folder '{}' deleted for account {}",
        folder_path,
        account_id
    );
    emit_folders_changed(&app, &account_id);
    emit_messages_changed(&app, &account_id);
    Ok(())
}

/// Read one attachment by the same stable index exposed in `MessageBody`.
/// Keeping extraction here gives save and typed attachment handlers identical
/// path validation and MIME traversal semantics.
pub(crate) fn read_attachment_contents(
    state: &AppState,
    account_id: &str,
    message_id: &str,
    attachment_index: u32,
) -> Result<Vec<u8>> {
    let maildir_path = {
        let conn = state.db.reader();
        let (mp, _, _, _, _, _, _) =
            db::messages::get_message_metadata(&conn, account_id, message_id)?;
        mp
    };

    if BodyLocation::from_persisted(&maildir_path).needs_fetch() {
        return Err(Error::Other(
            "Attachment save not supported for messages without local body".to_string(),
        ));
    }

    // Extract attachment bytes first, before showing dialog
    let full_path = crate::path_validation::resolve_under(&state.data_dir, &maildir_path)?;
    let raw = std::fs::read(&full_path)
        .map_err(|e| Error::Other(format!("Failed to read message file: {}", e)))?;

    let parsed = mail_parser::MessageParser::default()
        .parse(&raw)
        .ok_or_else(|| Error::MailParse("Failed to parse message".to_string()))?;

    let attachment = parsed
        .attachments()
        .nth(attachment_index as usize)
        .ok_or_else(|| Error::Other(format!("Attachment index {} not found", attachment_index)))?;

    Ok(attachment.contents().to_vec())
}

/// Extract an attachment from a message and save it.
/// The save dialog is opened by the backend — the renderer never supplies a path.
#[tauri::command]
pub async fn save_attachment(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    account_id: String,
    message_id: String,
    attachment_index: u32,
    suggested_filename: String,
) -> Result<()> {
    log::info!(
        "Saving attachment {} from message {}",
        attachment_index,
        message_id,
    );

    let contents = read_attachment_contents(&state, &account_id, &message_id, attachment_index)?;

    prompt_save_and_stream(
        &app,
        &suggested_filename,
        "attachment",
        std::io::Cursor::new(contents),
    )
    .await
}

/// Open the native save-as dialog with `suggested_filename`, then atomically
/// stream bytes from `reader` to the user-chosen path (refusing symlinks,
/// temp file + fsync + rename). `std::io::copy` is used so large payloads
/// don't have to be buffered in memory. Returns `Ok(())` if the user
/// cancelled the dialog, since cancellation isn't an error from the
/// caller's perspective.
///
/// The non-blocking callback API + oneshot is intentional: calling
/// `blocking_save_file()` on the tokio worker that invoked the command
/// starves the GTK main thread on Linux, which manifests as a dialog that
/// opens but never renders its Save button.
/// Tag a file written from email content as downloaded, so macOS Gatekeeper
/// and the "downloaded from the internet" prompt apply when the user later
/// opens it (or an app extracted from it), as Mail and browsers do. Goyav is
/// not sandboxed and does not declare LSFileQuarantineEnabled, so the OS does
/// not add the attribute on its own. Best effort: failure is only logged.
#[cfg(target_os = "macos")]
fn mark_downloaded(file: &std::fs::File) {
    use std::os::unix::io::AsRawFd;
    let seconds = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs());
    // flags;timestamp(hex);agent;event-uuid
    let value = format!("0083;{seconds:08x};Goyav;");
    let name = c"com.apple.quarantine";
    // SAFETY: valid fd for the lifetime of `file`; name is NUL-terminated;
    // value pointer/length describe an initialized buffer.
    let rc = unsafe {
        libc::fsetxattr(
            file.as_raw_fd(),
            name.as_ptr(),
            value.as_ptr().cast(),
            value.len(),
            0,
            0,
        )
    };
    if rc != 0 {
        log::warn!(
            "Could not set quarantine attribute on saved file: {}",
            std::io::Error::last_os_error()
        );
    }
}

#[cfg(not(target_os = "macos"))]
fn mark_downloaded(_file: &std::fs::File) {}

async fn prompt_save_and_stream<R: std::io::Read>(
    app: &tauri::AppHandle,
    suggested_filename: &str,
    what: &str,
    mut reader: R,
) -> Result<()> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_file_name(suggested_filename)
        .save_file(move |path| {
            let _ = tx.send(path);
        });

    let dest = rx
        .await
        .map_err(|e| Error::Other(format!("Save dialog closed unexpectedly: {}", e)))?;

    let dest = match dest {
        Some(path) => path,
        None => return Ok(()),
    };

    let dest_path = dest
        .as_path()
        .ok_or_else(|| Error::Other("Invalid save path".to_string()))?;

    if let Ok(metadata) = std::fs::symlink_metadata(dest_path) {
        if metadata.file_type().is_symlink() {
            return Err(Error::Other(
                "Refusing to write to a symlink target".to_string(),
            ));
        }
    }

    let dest_dir = dest_path
        .parent()
        .ok_or_else(|| Error::Other("Save path must have a parent directory".to_string()))?;
    let dest_name = dest_path
        .file_name()
        .ok_or_else(|| Error::Other("Save path must include a file name".to_string()))?;
    let unique_suffix = format!(
        "{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| d.as_nanos())
    );
    let temp_path = dest_dir.join(format!(
        ".{}.{}.tmp",
        dest_name.to_string_lossy(),
        unique_suffix
    ));

    #[cfg(unix)]
    let mut file = {
        use std::os::unix::fs::OpenOptionsExt;
        std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .custom_flags(libc::O_NOFOLLOW)
            .open(&temp_path)
            .map_err(|e| Error::Other(format!("Failed to create temp file: {}", e)))?
    };

    #[cfg(not(unix))]
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp_path)
        .map_err(|e| Error::Other(format!("Failed to create temp file: {}", e)))?;

    if let Err(e) = std::io::copy(&mut reader, &mut file) {
        let _ = std::fs::remove_file(&temp_path);
        return Err(Error::Other(format!("Failed to write {}: {}", what, e)));
    }
    if let Err(e) = file.sync_all() {
        let _ = std::fs::remove_file(&temp_path);
        return Err(Error::Other(format!("Failed to flush {}: {}", what, e)));
    }
    mark_downloaded(&file);
    drop(file);

    #[cfg(not(unix))]
    {
        // On Windows, rename fails if dest exists. Remove it first.
        if dest_path.exists() {
            let _ = std::fs::remove_file(dest_path);
        }
    }

    if let Err(e) = std::fs::rename(&temp_path, dest_path) {
        let _ = std::fs::remove_file(&temp_path);
        return Err(Error::Other(format!("Failed to rename temp file: {}", e)));
    }

    #[cfg(unix)]
    {
        // Fsync parent directory for durability.
        if let Ok(dir) = std::fs::File::open(dest_dir) {
            let _ = dir.sync_all();
        }
    }

    log::info!("{} saved to {}", what, dest_path.display());
    Ok(())
}

/// Save a message's raw RFC822 (.eml) bytes to a user-chosen path. Fetches
/// the body on-demand if it isn't on disk yet, then opens the native save
/// dialog and streams the bytes through to the destination without
/// buffering the whole message in memory. `suggested_filename` is provided
/// by the caller (typically derived from the subject).
#[tauri::command]
pub async fn save_message_as_eml(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    account_id: String,
    message_id: String,
    suggested_filename: String,
) -> Result<()> {
    log::info!("Saving message {} as .eml", message_id);

    let (maildir_path, _, _, _, flags_json, _, _) = {
        let conn = state.db.reader();
        db::messages::get_message_metadata(&conn, &account_id, &message_id)?
    };

    let actual_maildir_path = ensure_message_body_on_disk(
        &app,
        &state,
        &account_id,
        &message_id,
        &maildir_path,
        &flags_json,
    )
    .await?;

    let full_path = crate::path_validation::resolve_under(&state.data_dir, &actual_maildir_path)?;
    let source = std::fs::File::open(&full_path)
        .map_err(|e| Error::Other(format!("Failed to open message file: {}", e)))?;

    prompt_save_and_stream(
        &app,
        &suggested_filename,
        "message",
        std::io::BufReader::new(source),
    )
    .await
}

#[cfg(test)]
mod remote_image_safety_tests {
    use super::{allowed_image_content_type, is_private_ip, remote_image_url_allowed};

    fn allowed(url: &str) -> bool {
        remote_image_url_allowed(&reqwest::Url::parse(url).unwrap())
    }

    #[test]
    fn private_and_mapped_addresses_are_blocked() {
        for ip in [
            "127.0.0.1",
            "10.1.2.3",
            "192.168.1.1",
            "169.254.169.254",
            "0.1.2.3",
            "100.64.0.1",
            "198.18.0.1",
            "224.0.0.1",
            "::1",
            "fd00::1",
            "fe80::1",
            "::ffff:127.0.0.1",
            "::ffff:192.168.1.1",
            "64:ff9b::7f00:1",
            "2002:7f00:1::1",
        ] {
            assert!(is_private_ip(&ip.parse().unwrap()), "{ip}");
        }
        for ip in ["93.184.216.34", "2606:2800:220:1::1"] {
            assert!(!is_private_ip(&ip.parse().unwrap()), "{ip}");
        }
    }

    #[test]
    fn redirect_targets_are_rechecked() {
        assert!(allowed("https://images.example.com/a.png"));
        for url in [
            "http://images.example.com/a.png",
            "http://192.168.1.1/router?reboot=1",
            "https://127.0.0.1/a.png",
            "https://[::ffff:7f00:1]/a.png",
            "https://localhost/a.png",
            "https://printer.local./a.png",
            "https://user:pw@images.example.com/a.png",
        ] {
            assert!(!allowed(url), "{url}");
        }
    }

    #[test]
    fn only_bare_image_types_reach_the_data_uri() {
        assert_eq!(allowed_image_content_type("image/PNG"), Some("image/png"));
        assert_eq!(
            allowed_image_content_type("image/jpeg; charset=x"),
            Some("image/jpeg")
        );
        assert_eq!(
            allowed_image_content_type("image/png\"><meta http-equiv=refresh content=0>"),
            None
        );
        assert_eq!(allowed_image_content_type("image/svg+xml"), None);
        assert_eq!(allowed_image_content_type("text/html"), None);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn saved_files_get_the_quarantine_attribute() {
        use std::os::unix::io::AsRawFd;
        let file = tempfile::tempfile().unwrap();
        super::mark_downloaded(&file);
        let mut buf = [0u8; 128];
        let name = c"com.apple.quarantine";
        // SAFETY: valid fd, NUL-terminated name, buffer length matches.
        let len = unsafe {
            libc::fgetxattr(
                file.as_raw_fd(),
                name.as_ptr(),
                buf.as_mut_ptr().cast(),
                buf.len(),
                0,
                0,
            )
        };
        assert!(len > 0, "{}", std::io::Error::last_os_error());
        let value = std::str::from_utf8(&buf[..len as usize]).unwrap();
        assert!(
            value.starts_with("0083;") && value.contains(";Goyav;"),
            "{value}"
        );
    }
}

#[cfg(test)]
mod tests {
    use super::{finish_with_imap_idle_resume, spawn_with_imap_idle_resume};
    use crate::error::Error;
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };

    #[tokio::test]
    async fn body_fetch_failure_still_runs_resume() {
        let resumed = Arc::new(AtomicBool::new(false));
        let resumed_in_future = resumed.clone();
        let task = spawn_with_imap_idle_resume::<String, _, _>(
            "account".into(),
            "body fetch",
            async { Err(Error::Other("fetch failed".into())) },
            async move {
                resumed_in_future.store(true, Ordering::Relaxed);
                Ok(())
            },
        );
        let result = task.await.expect("body-fetch owner task panicked");

        assert!(resumed.load(Ordering::Relaxed));
        assert_eq!(result.unwrap_err().to_string(), "fetch failed");
    }

    #[tokio::test]
    async fn dropped_body_fetch_waiter_cannot_skip_resume() {
        let (release_fetch, fetch_released) = tokio::sync::oneshot::channel();
        let (signal_resumed, resumed) = tokio::sync::oneshot::channel();
        let task = spawn_with_imap_idle_resume(
            "account".into(),
            "body fetch",
            async move {
                fetch_released.await.unwrap();
                Ok("path".to_string())
            },
            async move {
                signal_resumed.send(()).unwrap();
                Ok(())
            },
        );

        drop(task);
        release_fetch.send(()).unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(1), resumed)
            .await
            .expect("detached body-fetch task did not resume IDLE")
            .expect("resume signal was dropped");
    }

    #[tokio::test]
    async fn panicked_body_fetch_cannot_skip_resume() {
        let resumed = Arc::new(AtomicBool::new(false));
        let resumed_in_future = resumed.clone();
        let task = spawn_with_imap_idle_resume::<String, _, _>(
            "account".into(),
            "body fetch",
            async move { panic!("body-fetch panic") },
            async move {
                resumed_in_future.store(true, Ordering::Relaxed);
                Ok(())
            },
        );

        let result = task.await.expect("body-fetch owner task panicked");
        assert!(resumed.load(Ordering::Relaxed));
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("body fetch task failed"));
    }

    #[test]
    fn body_fetch_result_preserves_fetch_error_when_resume_also_fails() {
        let result = finish_with_imap_idle_resume::<String>(
            "account",
            "body fetch",
            Err(Error::Other("fetch failed".into())),
            Err(Error::Other("resume failed".into())),
        );
        assert_eq!(result.unwrap_err().to_string(), "fetch failed");
    }

    #[test]
    fn body_fetch_result_returns_resume_error_after_successful_fetch() {
        let result = finish_with_imap_idle_resume(
            "account",
            "body fetch",
            Ok("path".to_string()),
            Err(Error::Other("resume failed".into())),
        );
        assert_eq!(result.unwrap_err().to_string(), "resume failed");
    }

    #[test]
    fn body_fetch_result_returns_fetch_error_after_successful_resume() {
        let result = finish_with_imap_idle_resume::<String>(
            "account",
            "body fetch",
            Err(Error::Other("fetch failed".into())),
            Ok(()),
        );
        assert_eq!(result.unwrap_err().to_string(), "fetch failed");
    }

    #[test]
    fn body_fetch_result_returns_value_when_fetch_and_resume_succeed() {
        let result = finish_with_imap_idle_resume("account", "body fetch", Ok("path"), Ok(()));
        assert_eq!(result.unwrap(), "path");
    }

    #[tokio::test]
    async fn server_search_failure_still_runs_resume() {
        let resumed = Arc::new(AtomicBool::new(false));
        let resumed_in_future = resumed.clone();
        let task = spawn_with_imap_idle_resume::<Vec<String>, _, _>(
            "account".into(),
            "server search",
            async { Err(Error::Other("search failed".into())) },
            async move {
                resumed_in_future.store(true, Ordering::Relaxed);
                Ok(())
            },
        );
        let result = task.await.expect("search owner task panicked");

        assert!(resumed.load(Ordering::Relaxed));
        assert_eq!(result.unwrap_err().to_string(), "search failed");
    }

    #[tokio::test]
    async fn dropped_search_waiter_cannot_skip_resume() {
        let (release_search, search_released) = tokio::sync::oneshot::channel();
        let (signal_resumed, resumed) = tokio::sync::oneshot::channel();
        let task = spawn_with_imap_idle_resume(
            "account".into(),
            "server search",
            async move {
                search_released.await.unwrap();
                Ok(Vec::<String>::new())
            },
            async move {
                signal_resumed.send(()).unwrap();
                Ok(())
            },
        );

        drop(task);
        release_search.send(()).unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(1), resumed)
            .await
            .expect("detached search task did not resume IDLE")
            .expect("resume signal was dropped");
    }

    #[tokio::test]
    async fn panicked_search_cannot_skip_resume() {
        let resumed = Arc::new(AtomicBool::new(false));
        let resumed_in_future = resumed.clone();
        let task = spawn_with_imap_idle_resume::<Vec<String>, _, _>(
            "account".into(),
            "server search",
            async move { panic!("search panic") },
            async move {
                resumed_in_future.store(true, Ordering::Relaxed);
                Ok(())
            },
        );

        let result = task.await.expect("search owner task panicked");
        assert!(resumed.load(Ordering::Relaxed));
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("server search task failed"));
    }
}
