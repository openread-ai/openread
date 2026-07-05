use std::{borrow::Cow, sync::Arc, time::Duration};

const NATIVE_RELEASE_PREFIX: &str = "openread-tauri";
const DEFAULT_ENVIRONMENT: &str = "development";
const DEFAULT_SAMPLE_RATE: f32 = 1.0;
const SENSITIVE_TEXT_MARKERS: &[&str] = &[
    "authorization",
    "cookie",
    "password",
    "token",
    "secret",
    "api_key",
    "apikey",
    "byok",
    "oauth",
    "code=",
    "file://",
    "/users/",
    "/home/",
    "\\users\\",
    "c:\\",
];

pub fn init() -> Option<sentry::ClientInitGuard> {
    let dsn = read_env("SENTRY_DSN")?;
    let parsed_dsn = match dsn.parse::<sentry::types::Dsn>() {
        Ok(dsn) => dsn,
        Err(error) => {
            log::warn!("Native Sentry disabled: invalid SENTRY_DSN: {error}");
            return None;
        }
    };

    let environment = resolve_native_sentry_environment(&std::env::var);
    let release = resolve_native_sentry_release(&std::env::var);
    let sample_rate = resolve_sample_rate(
        std::env::var("SENTRY_SAMPLE_RATE").ok().as_deref(),
        DEFAULT_SAMPLE_RATE,
    );

    let guard = sentry::init(sentry::ClientOptions {
        dsn: Some(parsed_dsn),
        environment: Some(Cow::Owned(environment.clone())),
        release: Some(Cow::Owned(release.clone())),
        sample_rate,
        traces_sample_rate: 0.0,
        attach_stacktrace: true,
        send_default_pii: false,
        server_name: None,
        shutdown_timeout: Duration::from_secs(2),
        before_send: Some(Arc::new(scrub_native_sentry_event)),
        ..Default::default()
    });

    if guard.is_enabled() {
        sentry::configure_scope(|scope| {
            scope.set_tag("service", "openread-tauri");
            scope.set_tag("platform", "tauri-rust");
            scope.set_tag("os", std::env::consts::OS);
            scope.set_tag("arch", std::env::consts::ARCH);
            scope.set_tag("environment", environment.as_str());
            scope.set_tag("release", release.as_str());
        });
        log::info!("Native Sentry initialized for {environment} / {release}");
    }

    Some(guard)
}

fn read_env(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn resolve_native_sentry_environment(
    read: &dyn Fn(&'static str) -> Result<String, std::env::VarError>,
) -> String {
    read_non_empty(read, "SENTRY_ENVIRONMENT")
        .or_else(|| read_non_empty(read, "NEXT_PUBLIC_SENTRY_ENVIRONMENT"))
        .or_else(|| read_non_empty(read, "TAURI_ENV"))
        .or_else(|| read_non_empty(read, "NODE_ENV"))
        .unwrap_or_else(|| DEFAULT_ENVIRONMENT.to_string())
}

fn resolve_native_sentry_release(
    read: &dyn Fn(&'static str) -> Result<String, std::env::VarError>,
) -> String {
    read_non_empty(read, "SENTRY_RELEASE")
        .or_else(|| read_non_empty(read, "NEXT_PUBLIC_SENTRY_RELEASE"))
        .or_else(|| {
            read_non_empty(read, "GITHUB_SHA").map(|sha| format!("{NATIVE_RELEASE_PREFIX}@{sha}"))
        })
        .or_else(|| {
            read_non_empty(read, "COMMIT_SHA").map(|sha| format!("{NATIVE_RELEASE_PREFIX}@{sha}"))
        })
        .unwrap_or_else(|| format!("{NATIVE_RELEASE_PREFIX}@{}", env!("CARGO_PKG_VERSION")))
}

fn read_non_empty(
    read: &dyn Fn(&'static str) -> Result<String, std::env::VarError>,
    name: &'static str,
) -> Option<String> {
    read(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn resolve_sample_rate(value: Option<&str>, fallback: f32) -> f32 {
    value
        .and_then(|raw| raw.parse::<f32>().ok())
        .filter(|rate| (0.0..=1.0).contains(rate))
        .unwrap_or(fallback)
}

fn scrub_native_sentry_event(
    mut event: sentry::protocol::Event<'static>,
) -> Option<sentry::protocol::Event<'static>> {
    if event_contains_sensitive_text(&event) {
        return None;
    }

    event.request = None;
    event.user = None;
    event.server_name = None;
    event.extra.retain(|key, _| !is_sensitive_key(key.as_str()));

    Some(event)
}

fn event_contains_sensitive_text(event: &sentry::protocol::Event<'_>) -> bool {
    serde_json::to_value(event)
        .ok()
        .is_some_and(|value| json_contains_sensitive_text(&value))
}

fn json_contains_sensitive_text(value: &serde_json::Value) -> bool {
    match value {
        serde_json::Value::String(value) => contains_sensitive_text(value),
        serde_json::Value::Array(values) => values.iter().any(json_contains_sensitive_text),
        serde_json::Value::Object(values) => values.iter().any(|(key, value)| {
            contains_sensitive_text(key) || json_contains_sensitive_text(value)
        }),
        serde_json::Value::Null | serde_json::Value::Bool(_) | serde_json::Value::Number(_) => {
            false
        }
    }
}

fn contains_sensitive_text(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    SENSITIVE_TEXT_MARKERS
        .iter()
        .any(|marker| lower.contains(marker))
}

fn is_sensitive_key(key: &str) -> bool {
    let lower = key.to_ascii_lowercase();
    matches!(
        lower.as_str(),
        "authorization"
            | "cookie"
            | "cookies"
            | "password"
            | "token"
            | "secret"
            | "apikey"
            | "api_key"
            | "byok"
            | "byok_key"
            | "body"
            | "requestbody"
            | "responsebody"
            | "path"
            | "filepath"
            | "file_path"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn reader(
        values: HashMap<&'static str, &'static str>,
    ) -> impl Fn(&'static str) -> Result<String, std::env::VarError> {
        move |name| {
            values
                .get(name)
                .map(|value| value.to_string())
                .ok_or(std::env::VarError::NotPresent)
        }
    }

    #[test]
    fn resolves_native_environment_from_private_contract_first() {
        let read = reader(HashMap::from([
            ("SENTRY_ENVIRONMENT", "production"),
            ("NEXT_PUBLIC_SENTRY_ENVIRONMENT", "web-production"),
        ]));

        assert_eq!(resolve_native_sentry_environment(&read), "production");
    }

    #[test]
    fn resolves_native_release_from_commit_fallback() {
        let read = reader(HashMap::from([("GITHUB_SHA", "abc123")]));

        assert_eq!(
            resolve_native_sentry_release(&read),
            "openread-tauri@abc123"
        );
    }

    #[test]
    fn resolves_sample_rate_with_safe_fallbacks() {
        assert_eq!(resolve_sample_rate(Some("0.25"), 1.0), 0.25);
        assert_eq!(resolve_sample_rate(Some("2"), 1.0), 1.0);
        assert_eq!(resolve_sample_rate(Some("nope"), 0.5), 0.5);
    }

    #[test]
    fn detects_sensitive_text_before_send() {
        assert!(contains_sensitive_text(
            "failed to open file:///Users/me/book.epub"
        ));
        assert!(contains_sensitive_text("oauth code=abc"));
        assert!(!contains_sensitive_text("native panic without payload"));
    }

    #[test]
    fn drops_event_with_sensitive_extra_value() {
        let mut event = sentry::protocol::Event::default();
        event.extra.insert(
            "runtime".to_string(),
            serde_json::json!("failed to open file:///Users/me/book.epub"),
        );

        assert!(scrub_native_sentry_event(event).is_none());
    }

    #[test]
    fn detects_sensitive_stack_frame_payload() {
        let payload = serde_json::json!({
            "exception": {
                "values": [
                    {
                        "stacktrace": {
                            "frames": [
                                { "abs_path": "file:///Users/me/book.epub" }
                            ]
                        }
                    }
                ]
            }
        });

        assert!(json_contains_sensitive_text(&payload));
    }

    #[test]
    fn identifies_sensitive_extra_keys() {
        assert!(is_sensitive_key("authorization"));
        assert!(is_sensitive_key("file_path"));
        assert!(!is_sensitive_key("runtime"));
    }
}
