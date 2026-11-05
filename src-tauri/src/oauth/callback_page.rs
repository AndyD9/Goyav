//! The page the browser shows after an OAuth redirect lands on the local
//! callback listener. It follows the Goyav look (ground, panel card, teal
//! accent, light and dark) and speaks the browser's language when it is
//! French. Everything is inline: the CSP allows only this exact stylesheet
//! (by hash) and the embedded logo, and no script at all.

use std::io::Write;
use std::sync::LazyLock;

use base64::Engine;
use sha2::{Digest, Sha256};

pub(super) enum CallbackPage {
    Success,
    AccessDenied,
    Failure,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum PageLang {
    En,
    Fr,
}

impl PageLang {
    /// The browser's preferred language from its `Accept-Language` header.
    pub(super) fn from_accept_language(header: Option<&str>) -> Self {
        let preferred = header
            .and_then(|value| value.split(',').next())
            .map(|tag| {
                tag.split(';')
                    .next()
                    .unwrap_or("")
                    .trim()
                    .to_ascii_lowercase()
            })
            .unwrap_or_default();
        if preferred == "fr" || preferred.starts_with("fr-") {
            PageLang::Fr
        } else {
            PageLang::En
        }
    }

    fn html_lang(self) -> &'static str {
        match self {
            PageLang::En => "en",
            PageLang::Fr => "fr",
        }
    }
}

struct PageText {
    heading: &'static str,
    message: &'static str,
    hint: &'static str,
}

fn page_text(page: &CallbackPage, lang: PageLang) -> PageText {
    match (page, lang) {
        (CallbackPage::Success, PageLang::En) => PageText {
            heading: "Authorization successful!",
            message: "You can close this window and return to Goyav.",
            hint: "Goyav is finishing the setup of your account.",
        },
        (CallbackPage::Success, PageLang::Fr) => PageText {
            heading: "Autorisation réussie\u{a0}!",
            message: "Vous pouvez fermer cette fenêtre et revenir à Goyav.",
            hint: "Goyav termine la configuration de votre compte.",
        },
        (CallbackPage::AccessDenied, PageLang::En) => PageText {
            heading: "Authorization not completed",
            message: "Access was not granted. Return to Goyav and try again.",
            hint: "You can close this window.",
        },
        (CallbackPage::AccessDenied, PageLang::Fr) => PageText {
            heading: "Autorisation non accordée",
            message: "L'accès n'a pas été accordé. Revenez à Goyav et réessayez.",
            hint: "Vous pouvez fermer cette fenêtre.",
        },
        (CallbackPage::Failure, PageLang::En) => PageText {
            heading: "Authorization failed",
            message: "The provider did not complete authorization. Return to Goyav and try again.",
            hint: "You can close this window.",
        },
        (CallbackPage::Failure, PageLang::Fr) => PageText {
            heading: "Échec de l'autorisation",
            message: "Le fournisseur n'a pas terminé l'autorisation. Revenez à Goyav et réessayez.",
            hint: "Vous pouvez fermer cette fenêtre.",
        },
    }
}

/// Mirrors the light and dark tokens of `src/assets/styles/main.css`.
const STYLE: &str = r#":root{--ground:#e9ecea;--bg:#fff;--text:#151917;--text-secondary:#4b5450;--text-muted:#7f8984;--border:#e2e6e4;--accent:#14806f;--accent-soft:#dff2ee;--danger:#ce2c31;--danger-soft:#fbe4ea;--shadow:0 16px 48px rgba(16,24,20,.14);color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--ground:#121212;--bg:#1b1b1b;--text:#ececec;--text-secondary:#a8a8a8;--text-muted:#727272;--border:#2a2a2a;--accent:#2bb39e;--accent-soft:rgba(43,179,158,.16);--danger:#ff6369;--danger-soft:rgba(229,72,77,.16);--shadow:0 16px 48px rgba(0,0,0,.55)}}
*{box-sizing:border-box}
html,body{height:100%;margin:0}
body{display:flex;align-items:center;justify-content:center;padding:16px;background:var(--ground);color:var(--text);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,Ubuntu,sans-serif;-webkit-font-smoothing:antialiased}
main{width:100%;max-width:400px;padding:32px 32px 24px;background:var(--bg);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow);text-align:center;animation:rise .35s ease-out}
.brand{display:flex;align-items:center;justify-content:center;gap:8px;margin:0 0 28px;font-size:15px;font-weight:600;letter-spacing:-.01em}
.brand img{width:28px;height:28px;border-radius:6px}
.badge{display:flex;align-items:center;justify-content:center;width:56px;height:56px;margin:0 auto 16px;border-radius:50%;background:var(--accent-soft);color:var(--accent)}
.error .badge{background:var(--danger-soft);color:var(--danger)}
h1{margin:0 0 8px;font-size:20px;font-weight:600;letter-spacing:-.015em}
p{margin:0;color:var(--text-secondary)}
.hint{margin-top:24px;padding-top:16px;border-top:1px solid var(--border);font-size:12px;color:var(--text-muted)}
@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){main{animation:none}}"#;

const CHECK_ICON: &str = r#"<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>"#;
const ERROR_ICON: &str = r#"<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>"#;

static LOGO_DATA_URI: LazyLock<String> = LazyLock::new(|| {
    let png = include_bytes!("../../icons/64x64.png");
    format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(png)
    )
});

static CONTENT_SECURITY_POLICY: LazyLock<String> = LazyLock::new(|| {
    let hash = base64::engine::general_purpose::STANDARD.encode(Sha256::digest(STYLE));
    format!(
        "default-src 'none'; style-src 'sha256-{hash}'; img-src data:; base-uri 'none'; form-action 'none'"
    )
});

fn render(page: &CallbackPage, lang: PageLang) -> String {
    let text = page_text(page, lang);
    let (class, icon) = match page {
        CallbackPage::Success => ("success", CHECK_ICON),
        CallbackPage::AccessDenied | CallbackPage::Failure => ("error", ERROR_ICON),
    };
    format!(
        "<!doctype html><html lang=\"{lang}\"><head><meta charset=\"utf-8\">\
         <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\
         <title>{heading} · Goyav</title><style>{STYLE}</style></head>\
         <body><main class=\"{class}\">\
         <div class=\"brand\"><img src=\"{logo}\" alt=\"\">Goyav</div>\
         <div class=\"badge\">{icon}</div>\
         <h1>{heading}</h1><p>{message}</p>\
         <p class=\"hint\">{hint}</p>\
         </main></body></html>",
        lang = lang.html_lang(),
        heading = text.heading,
        message = text.message,
        hint = text.hint,
        logo = *LOGO_DATA_URI,
    )
}

pub(super) fn write_callback_page(stream: &mut impl Write, page: CallbackPage, lang: PageLang) {
    let status = match page {
        CallbackPage::Success => "200 OK",
        CallbackPage::AccessDenied | CallbackPage::Failure => "400 Bad Request",
    };
    let body = render(&page, lang);
    let response = format!(
        "HTTP/1.1 {status}\r\n\
         Content-Type: text/html; charset=utf-8\r\n\
         Content-Length: {}\r\n\
         Cache-Control: no-store\r\n\
         Content-Security-Policy: {}\r\n\
         X-Content-Type-Options: nosniff\r\n\
         Connection: close\r\n\r\n\
         {body}",
        body.len(),
        *CONTENT_SECURITY_POLICY,
    );
    // The browser may already have closed the tab. Callback processing must
    // not fail merely because the informational response cannot be written.
    stream.write_all(response.as_bytes()).ok();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn language_follows_the_preferred_browser_language() {
        assert_eq!(
            PageLang::from_accept_language(Some("fr-FR,fr;q=0.9,en;q=0.8")),
            PageLang::Fr
        );
        assert_eq!(PageLang::from_accept_language(Some("fr")), PageLang::Fr);
        assert_eq!(
            PageLang::from_accept_language(Some("en-US,fr;q=0.9")),
            PageLang::En
        );
        assert_eq!(PageLang::from_accept_language(Some("fry")), PageLang::En);
        assert_eq!(PageLang::from_accept_language(None), PageLang::En);
    }

    #[test]
    fn csp_allows_exactly_the_inline_stylesheet() {
        let hash = base64::engine::general_purpose::STANDARD.encode(Sha256::digest(STYLE));
        assert!(CONTENT_SECURITY_POLICY.starts_with("default-src 'none';"));
        assert!(CONTENT_SECURITY_POLICY.contains(&format!("style-src 'sha256-{hash}'")));
        assert!(!CONTENT_SECURITY_POLICY.contains("unsafe-inline"));
        assert!(!CONTENT_SECURITY_POLICY.contains("script-src"));
        let page = render(&CallbackPage::Success, PageLang::En);
        assert!(page.contains(&format!("<style>{STYLE}</style>")));
        assert!(!page.contains("<script"));
    }

    #[test]
    fn french_pages_are_translated() {
        let page = render(&CallbackPage::Success, PageLang::Fr);
        assert!(page.contains("lang=\"fr\""));
        assert!(page.contains("Autorisation réussie"));
        let page = render(&CallbackPage::AccessDenied, PageLang::Fr);
        assert!(page.contains("class=\"error\""));
        assert!(page.contains("L'accès n'a pas été accordé"));
    }
}
