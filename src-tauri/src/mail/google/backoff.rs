//! Rate-limit retries for Google API requests.
//!
//! Google signals quota exhaustion with either `429 Too Many Requests` or
//! `403` carrying a `rateLimitExceeded` / `userRateLimitExceeded` reason.
//! Both mean the request was not applied, so retrying is safe even for
//! writes. Other statuses are returned untouched for the caller to judge.

use std::future::Future;
use std::time::Duration;

use reqwest::{RequestBuilder, Response, StatusCode};

/// Retries after the first attempt, so at most four requests in total.
const MAX_RETRIES: u32 = 3;
/// Never sleep longer than this, whatever `Retry-After` asks for: a sync
/// cycle should fail and try again later rather than hang.
const MAX_DELAY: Duration = Duration::from_secs(30);
#[cfg(not(test))]
const BASE_DELAY: Duration = Duration::from_secs(1);
#[cfg(test)]
const BASE_DELAY: Duration = Duration::from_millis(1);

const RATE_LIMIT_REASONS: [&str; 3] = [
    "rateLimitExceeded",
    "userRateLimitExceeded",
    "RATE_LIMIT_EXCEEDED",
];

pub(super) trait SendWithBackoff {
    /// `send()`, retried with backoff while Google reports a rate limit.
    fn send_with_backoff(self) -> impl Future<Output = reqwest::Result<Response>> + Send;
}

impl SendWithBackoff for RequestBuilder {
    fn send_with_backoff(self) -> impl Future<Output = reqwest::Result<Response>> + Send {
        send_with_backoff(self)
    }
}

async fn send_with_backoff(request: RequestBuilder) -> reqwest::Result<Response> {
    let mut retry = 0;
    loop {
        // A streaming body cannot be replayed; send it once as before.
        let Some(attempt) = request.try_clone() else {
            return request.send().await;
        };
        let response = attempt.send().await?;
        let (response, rate_limited) = classify(response).await?;
        if !rate_limited || retry >= MAX_RETRIES {
            return Ok(response);
        }
        let delay = retry_delay(&response, retry);
        log::warn!(
            "Google API rate limited ({}), retrying in {:?} (retry {}/{})",
            response.status(),
            delay,
            retry + 1,
            MAX_RETRIES
        );
        tokio::time::sleep(delay).await;
        retry += 1;
    }
}

/// Whether `response` is a rate limit. A 403 has to be read to tell a
/// quota error from a permission error, so it is rebuilt from the bytes
/// for the caller.
async fn classify(response: Response) -> reqwest::Result<(Response, bool)> {
    match response.status() {
        StatusCode::TOO_MANY_REQUESTS => Ok((response, true)),
        StatusCode::FORBIDDEN => {
            let status = response.status();
            let version = response.version();
            let headers = response.headers().clone();
            let body = response.bytes().await?;
            let text = String::from_utf8_lossy(&body);
            let rate_limited = RATE_LIMIT_REASONS
                .iter()
                .any(|reason| text.contains(reason));
            let mut rebuilt = http::Response::new(body);
            *rebuilt.status_mut() = status;
            *rebuilt.version_mut() = version;
            *rebuilt.headers_mut() = headers;
            Ok((Response::from(rebuilt), rate_limited))
        }
        _ => Ok((response, false)),
    }
}

/// `Retry-After` in seconds when Google sends it, else exponential backoff.
fn retry_delay(response: &Response, retry: u32) -> Duration {
    let requested = response
        .headers()
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.trim().parse::<u64>().ok())
        .map(Duration::from_secs);
    requested
        .unwrap_or_else(|| BASE_DELAY * 2u32.pow(retry))
        .min(MAX_DELAY)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    /// Serves one canned response per connection and counts the requests.
    async fn serve(
        responses: Vec<(u16, &'static str)>,
    ) -> (String, tokio::task::JoinHandle<usize>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}/resource", listener.local_addr().unwrap());
        let handle = tokio::spawn(async move {
            let mut served = 0;
            for (status, body) in responses {
                let (mut socket, _) = listener.accept().await.unwrap();
                let mut bytes = Vec::new();
                while !bytes.windows(4).any(|window| window == b"\r\n\r\n") {
                    let mut chunk = [0; 1024];
                    let count = socket.read(&mut chunk).await.unwrap();
                    assert!(count > 0, "request ended before its headers");
                    bytes.extend_from_slice(&chunk[..count]);
                }
                let response = format!(
                    "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nRetry-After: 0\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                socket.write_all(response.as_bytes()).await.unwrap();
                served += 1;
            }
            served
        });
        (url, handle)
    }

    fn client() -> reqwest::Client {
        reqwest::Client::builder().no_proxy().build().unwrap()
    }

    #[tokio::test]
    async fn retries_429_until_success() {
        let (url, server) = serve(vec![(429, "{}"), (429, "{}"), (200, r#"{"ok":true}"#)]).await;
        let response = client().get(&url).send_with_backoff().await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.text().await.unwrap(), r#"{"ok":true}"#);
        assert_eq!(server.await.unwrap(), 3);
    }

    #[tokio::test]
    async fn retries_403_rate_limit_with_a_body() {
        let body = r#"{"error":{"errors":[{"reason":"rateLimitExceeded"}]}}"#;
        let (url, server) = serve(vec![(403, body), (200, "{}")]).await;
        let response = client()
            .post(&url)
            .json(&serde_json::json!({"summary": "x"}))
            .send_with_backoff()
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(server.await.unwrap(), 2);
    }

    #[tokio::test]
    async fn returns_other_403_with_its_body_intact() {
        let body = r#"{"error":{"errors":[{"reason":"forbidden"}]}}"#;
        let (url, server) = serve(vec![(403, body)]).await;
        let response = client().get(&url).send_with_backoff().await.unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        assert_eq!(
            response.headers().get("content-type").unwrap(),
            "application/json"
        );
        assert_eq!(response.text().await.unwrap(), body);
        assert_eq!(server.await.unwrap(), 1);
    }

    #[tokio::test]
    async fn gives_up_after_max_retries() {
        let (url, server) = serve(vec![(429, "{}"); 1 + MAX_RETRIES as usize]).await;
        let response = client().get(&url).send_with_backoff().await.unwrap();
        assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(server.await.unwrap(), 1 + MAX_RETRIES as usize);
    }

    #[test]
    fn delay_honours_retry_after_but_is_capped() {
        let response = |retry_after: &str| {
            Response::from(
                http::Response::builder()
                    .status(429)
                    .header("retry-after", retry_after)
                    .body(Vec::<u8>::new())
                    .unwrap(),
            )
        };
        assert_eq!(retry_delay(&response("5"), 0), Duration::from_secs(5));
        assert_eq!(retry_delay(&response("3600"), 0), MAX_DELAY);
        assert_eq!(retry_delay(&response("garbage"), 2), BASE_DELAY * 4);
    }
}
