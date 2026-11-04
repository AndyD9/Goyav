use mail_parser::{Address as MailAddress, HeaderValue, MessageParser, MimeHeaders};

use crate::message::{Address, Attachment, MessageBody};

fn mail_address_to_list(addr: &MailAddress<'_>) -> Vec<Address> {
    match addr {
        MailAddress::List(list) => list
            .iter()
            .map(|a| Address {
                name: a.name.as_ref().map(|s| s.to_string()),
                email: a
                    .address
                    .as_ref()
                    .map(|s| s.to_string())
                    .unwrap_or_default(),
            })
            .collect(),
        MailAddress::Group(groups) => groups
            .iter()
            .flat_map(|g| {
                g.addresses.iter().map(|a| Address {
                    name: a.name.as_ref().map(|s| s.to_string()),
                    email: a
                        .address
                        .as_ref()
                        .map(|s| s.to_string())
                        .unwrap_or_default(),
                })
            })
            .collect(),
    }
}

/// Sender shown by the reader and used as the Reply target.
///
/// RFC 5322 allows one From field, but a sender can emit several. mail-parser's
/// `from()` returns the *last* instance, while the list, notifications, filters
/// and the PGP signer check use the sender stored at sync time (`hint`: the
/// first instance for IMAP, the server's choice for JMAP/Graph). To show one
/// identity everywhere, the From instance that carries the stored address wins,
/// and otherwise the first instance. Within it, the first mailbox with an
/// address is used.
fn reader_sender(parsed: &mail_parser::Message<'_>, hint: &str) -> Address {
    let instances: Vec<Vec<Address>> = parsed
        .headers()
        .iter()
        .filter(|header| matches!(header.name, mail_parser::HeaderName::From))
        .filter_map(|header| match &header.value {
            HeaderValue::Address(address) => Some(mail_address_to_list(address)),
            _ => None,
        })
        .collect();
    let hint = hint.trim();
    let chosen = instances
        .iter()
        .find(|list| {
            !hint.is_empty()
                && list
                    .iter()
                    .any(|a| a.email.trim().eq_ignore_ascii_case(hint))
        })
        .or(instances.first());
    let matching_mailbox = chosen.and_then(|list| {
        list.iter()
            .find(|a| !hint.is_empty() && a.email.trim().eq_ignore_ascii_case(hint))
            .or_else(|| list.iter().find(|a| !a.email.trim().is_empty()))
    });
    matching_mailbox.cloned().unwrap_or(Address {
        name: None,
        email: hint.to_string(),
    })
}

/// Subject shown by the reader: the first Subject field, matching the subject
/// stored at sync time (mail-parser's `subject()` returns the last one).
fn reader_subject(parsed: &mail_parser::Message<'_>) -> Option<String> {
    parsed
        .headers()
        .iter()
        .find(|header| matches!(header.name, mail_parser::HeaderName::Subject))
        .and_then(|header| match &header.value {
            HeaderValue::Text(text) => Some(text.to_string()),
            HeaderValue::TextList(list) => Some(list.join(" ")),
            _ => None,
        })
        .or_else(|| parsed.subject().map(|s| s.to_string()))
}

/// Parse a raw message into a full MessageBody for the reader view.
pub fn parse_message_body(
    message_id: &str,
    raw: &[u8],
    from_email_hint: &str,
    to_json: &str,
    cc_json: &str,
    flags_json: &str,
    is_encrypted: bool,
    is_signed: bool,
) -> Option<MessageBody> {
    let parsed = MessageParser::default().parse(raw)?;

    let from_addr = reader_sender(&parsed, from_email_hint);

    let to: Vec<Address> = serde_json::from_str(to_json).unwrap_or_default();
    let cc: Vec<Address> = serde_json::from_str(cc_json).unwrap_or_default();
    let flags: Vec<String> = serde_json::from_str(flags_json).unwrap_or_default();

    let subject = reader_subject(&parsed);
    let date = parsed.date().map(|d| d.to_rfc3339()).unwrap_or_default();

    // Grab raw HTML once for both image detection and sanitization
    let raw_html = parsed.body_html(0);

    // Check for remote images before sanitization strips <img> tags.
    // Only match https:// to align with the loading pipeline (parse_html_with_images
    // only allows https URL scheme).
    let has_remote_images = raw_html
        .as_ref()
        .map(|s| {
            use std::sync::LazyLock;
            static RE: LazyLock<regex::Regex> = LazyLock::new(|| {
                regex::Regex::new(r#"(?i)<img\b[^>]*\bsrc\s*=\s*["']https://"#).unwrap()
            });
            RE.is_match(s)
        })
        .unwrap_or(false);

    let body_html = raw_html.map(|s| {
        let url_schemes = std::collections::HashSet::from(["http", "https", "mailto"]);
        ammonia::Builder::default()
            .add_generic_attributes(&["style"])
            .rm_tags(&[
                "img", "object", "embed", "iframe", "form", "input", "button", "textarea",
                "select", "video", "audio", "source", "svg", "math",
            ])
            .url_schemes(url_schemes)
            .clean(&s)
            .to_string()
    });
    let body_text = parsed.body_text(0).map(|s| s.to_string());

    let attachments: Vec<Attachment> = parsed
        .attachments()
        .enumerate()
        .map(|(i, att)| {
            let filename = att.attachment_name().map(|s| s.to_string());
            let content_type = att
                .content_type()
                .map(|ct| format!("{}/{}", ct.ctype(), ct.subtype().unwrap_or("octet-stream")))
                .unwrap_or_else(|| "application/octet-stream".to_string());
            Attachment {
                index: i as u32,
                filename,
                content_type,
                size: att.len() as u64,
            }
        })
        .collect();

    let list_id = match parsed.list_id() {
        HeaderValue::Text(t) => Some(t.to_string()),
        _ => None,
    };

    let pgp_kind = crate::mail::pgp_mime::detect_kind(raw);
    Some(MessageBody {
        id: message_id.to_string(),
        subject,
        from: from_addr,
        to,
        cc,
        date,
        flags,
        body_html,
        body_text,
        attachments,
        is_encrypted,
        is_signed,
        list_id,
        has_remote_images,
        pgp_kind,
    })
}

/// Re-parse a raw message body allowing `<img>` tags.
/// All other dangerous tags remain stripped. Used for the "Load remote images" feature.
/// The sandboxed iframe's CSP (`img-src https: data:`) is the enforcement layer
/// that blocks non-HTTPS image loads at the browser level.
pub fn parse_html_with_images(raw: &[u8]) -> Option<String> {
    let parsed = MessageParser::default().parse(raw)?;
    parsed.body_html(0).map(|s| {
        let url_schemes = std::collections::HashSet::from(["https", "mailto"]);
        ammonia::Builder::default()
            .add_generic_attributes(&["style"])
            .add_tags(&["img"])
            .add_tag_attributes("img", &["src", "alt", "width", "height", "style"])
            .rm_tags(&[
                "object", "embed", "iframe", "form", "input", "button", "textarea", "select",
                "video", "audio", "source", "svg", "math",
            ])
            .url_schemes(url_schemes)
            .clean(&s)
            .to_string()
    })
}

#[cfg(test)]
mod tests {
    use super::{mail_address_to_list, parse_html_with_images, parse_message_body};
    use crate::message::MessageBody;
    use mail_parser::MessageParser;

    const DOUBLE_FROM: &[u8] = b"From: news@attacker.example\r\n\
From: \"Bank Security\" <security@bank.example>\r\n\
Subject: A\r\n\
Subject: B\r\n\
To: me@x.test\r\n\
\r\n\
hi\r\n";

    fn reader(raw: &[u8], hint: &str) -> MessageBody {
        parse_message_body("m1", raw, hint, "[]", "[]", "[]", false, false).unwrap()
    }

    #[test]
    fn repeated_from_shows_the_same_sender_as_the_list() {
        // IMAP stores the first From; the reader must not show the last one.
        let body = reader(DOUBLE_FROM, "news@attacker.example");
        assert_eq!(body.from.email, "news@attacker.example");
        assert_eq!(body.subject.as_deref(), Some("A"));
        // A server that stored the other instance gets that one, consistently.
        let body = reader(DOUBLE_FROM, "security@bank.example");
        assert_eq!(body.from.email, "security@bank.example");
        // Without a stored sender, the first instance is used.
        assert_eq!(reader(DOUBLE_FROM, "").from.email, "news@attacker.example");
    }

    #[test]
    fn sender_skips_mailboxes_without_an_address() {
        let raw = b"From: undisclosed-recipients:;, real@x.test\r\nSubject: s\r\n\r\nbody\r\n";
        assert_eq!(reader(raw, "").from.email, "real@x.test");
    }

    const ADDRESSES: &[u8] = include_bytes!("../../../tests/fixtures/eai-test-messages/addresses");
    const ATTACHMENT: &[u8] =
        include_bytes!("../../../tests/fixtures/eai-test-messages/attachment");
    const FROM: &[u8] = include_bytes!("../../../tests/fixtures/eai-test-messages/from");
    const MIMEFIELD: &[u8] = include_bytes!("../../../tests/fixtures/eai-test-messages/mimefield");
    const NOT_EMOJI: &[u8] = include_bytes!("../../../tests/fixtures/eai-test-messages/not-emoji");
    const PUNYCODE: &[u8] = include_bytes!("../../../tests/fixtures/eai-test-messages/punycode");

    fn body(raw: &[u8]) -> MessageBody {
        parse_message_body(
            "test-message",
            raw,
            "fallback@example.invalid",
            "[]",
            "[]",
            "[]",
            false,
            false,
        )
        .expect("EAI message body should parse")
    }

    fn html_message(html: &str) -> Vec<u8> {
        format!(
            "From: sender@example.org\r\n\
             To: recipient@example.org\r\n\
             Subject: Sanitizer test\r\n\
             Message-ID: <sanitizer@example.org>\r\n\
             MIME-Version: 1.0\r\n\
             Content-Type: text/html; charset=utf-8\r\n\r\n\
             {html}"
        )
        .into_bytes()
    }

    fn assert_html_is_removed(raw: &[u8], forbidden: &[&str]) {
        let normal = body(raw).body_html.expect("HTML body should parse");
        let with_images = parse_html_with_images(raw).expect("HTML body should parse");
        for value in forbidden {
            assert!(!normal.contains(value), "normal HTML retained {value}");
            assert!(
                !with_images.contains(value),
                "image-enabled HTML retained {value}"
            );
        }
    }

    #[test]
    fn parses_unicode_addresses_in_structured_headers() {
        let message = MessageParser::default()
            .parse(ADDRESSES)
            .expect("EAI message should parse");
        let from = mail_address_to_list(message.from().expect("From header should parse"));
        let cc = mail_address_to_list(message.cc().expect("Cc header should parse"));

        assert_eq!(from[0].name.as_deref(), Some("Jøran Øygårdvær"));
        assert_eq!(from[0].email, "jøran@example.com");
        assert_eq!(cc.len(), 1);
        assert_eq!(cc[0].name.as_deref(), Some("Jøran Øygårdvær"));
        assert_eq!(cc[0].email, "jøran@example.com");
    }

    #[test]
    fn parses_unicode_from_header() {
        let message = body(FROM);

        assert_eq!(message.from.name.as_deref(), Some("Jøran Øygårdvær"));
        assert_eq!(message.from.email, "jøran@example.com");
        assert_eq!(
            message.body_text.as_deref().map(str::trim_end),
            Some("asdf")
        );
    }

    #[test]
    fn preserves_punycode_domains_and_unicode_local_parts() {
        let message = MessageParser::default()
            .parse(PUNYCODE)
            .expect("EAI message should parse");
        let from = mail_address_to_list(message.from().expect("From header should parse"));
        let to = mail_address_to_list(message.to().expect("To header should parse"));

        assert_eq!(from[0].email, "info@xn--dmi-0na.fo");
        assert_eq!(to[0].email, "dømi@xn--dmi-0na.fo");
    }

    #[test]
    fn does_not_decode_punycode_like_local_part() {
        let message = MessageParser::default()
            .parse(NOT_EMOJI)
            .expect("EAI message should parse");
        let from = mail_address_to_list(message.from().expect("From header should parse"));

        assert_eq!(from[0].email, "xn--ls8ha@outlook.com");
    }

    #[test]
    fn parses_unicode_filename_on_single_part_attachment() {
        let message = body(MIMEFIELD);

        assert_eq!(message.attachments.len(), 1);
        assert_eq!(
            message.attachments[0].filename.as_deref(),
            Some("blåbærsyltetøy")
        );
        assert_eq!(message.attachments[0].content_type, "text/plain");
    }

    #[test]
    fn parses_unicode_filename_on_multipart_attachment() {
        let message = body(ATTACHMENT);

        assert_eq!(message.attachments.len(), 1);
        assert_eq!(
            message.attachments[0].filename.as_deref(),
            Some("blåbærsyltetøy")
        );
        assert_eq!(message.attachments[0].content_type, "image/jpeg");
        assert!(message.attachments[0].size > 1_000);
    }

    #[test]
    fn strips_svg_animation_xss_from_rustsec_2026_0213() {
        let raw = html_message(
            r#"<svg xmlns="http://www.w3.org/2000/svg">
                <a><set attributeName="href" to="javascript:alert('xss')"></set>
                <text>Click</text></a>
            </svg>"#,
        );

        assert_html_is_removed(&raw, &["<svg", "<set", "javascript:"]);
    }

    #[test]
    fn strips_mathml_mxss_from_rustsec_2026_0193() {
        let raw = html_message(
            r#"<math><annotation-xml encoding="text/html">
                <style><!--</style><img src=x onerror=alert('xss')>
            </annotation-xml></math>"#,
        );

        assert_html_is_removed(&raw, &["<math", "<annotation-xml", "onerror"]);
    }
}
