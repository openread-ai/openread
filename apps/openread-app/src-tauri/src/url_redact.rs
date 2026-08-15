pub fn redact_url_fragment(url: &str) -> String {
    match url.split_once('#') {
        Some((before, _)) => format!("{before}#<redacted>"),
        None => url.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::redact_url_fragment;

    const SYNTHETIC_CALLBACK: &str =
        "openread://auth-callback#access_token=synthetic.access.token&refresh_token=synthetic.refresh.token&type=magiclink";
    const SYNTHETIC_OUTBOUND: &str =
        "https://auth.example.test/authorize?client_id=synthetic-client&redirect_uri=openread://auth-callback&state=synthetic-state&code_challenge=synthetic-challenge";

    #[test]
    fn redacts_fragment_bearing_callback_and_keeps_origin_and_path() {
        assert_eq!(
            redact_url_fragment(SYNTHETIC_CALLBACK),
            "openread://auth-callback#<redacted>"
        );
        assert!(!redact_url_fragment(SYNTHETIC_CALLBACK).contains("synthetic.access.token"));
        assert!(!redact_url_fragment(SYNTHETIC_CALLBACK).contains("synthetic.refresh.token"));
    }

    #[test]
    fn leaves_fragment_free_url_unchanged() {
        assert_eq!(redact_url_fragment(SYNTHETIC_OUTBOUND), SYNTHETIC_OUTBOUND);
        assert_eq!(
            redact_url_fragment("openread://auth-callback"),
            "openread://auth-callback"
        );
    }
}
