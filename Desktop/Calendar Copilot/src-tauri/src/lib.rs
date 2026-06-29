use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use base64::engine::general_purpose::{URL_SAFE, URL_SAFE_NO_PAD};
use base64::Engine as _;
use chrono::{DateTime, Datelike, NaiveDate, NaiveTime, TimeZone, Utc, Weekday};
use keyring::Entry;
use regex::Regex;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;
use uuid::Uuid;

const KEYRING_SERVICE: &str = "CalendarCopilotDesktop";
const KEYRING_GOOGLE_REFRESH_TOKEN: &str = "google_refresh_token";
const DEFAULT_POLL_SECONDS: u64 = 90;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredGoogleConfig {
    client_id: String,
    client_secret: String,
    redirect_uri: String,
    calendar_id: String,
}

impl Default for StoredGoogleConfig {
    fn default() -> Self {
        Self {
            client_id: String::new(),
            client_secret: String::new(),
            redirect_uri: "http://127.0.0.1:8976/oauth/callback".to_string(),
            calendar_id: "primary".to_string(),
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NormalizedMessageV2 {
    source: String,
    source_message_id: String,
    sender: String,
    recipients: Vec<String>,
    subject: Option<String>,
    body: String,
    received_at: String,
    thread_id: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExtractedEventV2 {
    title: String,
    start_time: String,
    end_time: Option<String>,
    timezone: Option<String>,
    location: Option<String>,
    attendees: Option<Vec<String>>,
    description: Option<String>,
    confidence: f64,
    source_message_id: String,
    source: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CandidateEventRecord {
    id: String,
    message: NormalizedMessageV2,
    extracted_event: ExtractedEventV2,
    created_at: String,
}

#[derive(Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct PersistedState {
    watcher_enabled: bool,
    polling_interval_seconds: u64,
    connected: bool,
    last_checked: Option<String>,
    processed_message_ids: HashSet<String>,
    candidates: Vec<CandidateEventRecord>,
    created_events: HashMap<String, String>,
    detected_count: u64,
    google: StoredGoogleConfig,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WatcherStatus {
    watcher_enabled: bool,
    polling_interval_seconds: u64,
    connected: bool,
    last_checked: Option<String>,
    candidate_count: usize,
    detected_count: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopStateResponse {
    status: WatcherStatus,
    candidates: Vec<CandidateEventRecord>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoogleOAuthConfigInput {
    client_id: String,
    client_secret: String,
    redirect_uri: String,
    refresh_token: Option<String>,
    calendar_id: Option<String>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExchangeAuthCodePayload {
    client_id: String,
    client_secret: String,
    redirect_uri: String,
    code: String,
}

#[derive(Clone, Serialize)]
struct UrlResponse {
    url: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RefreshStoredResponse {
    refresh_token_stored: bool,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateEventPayload {
    candidate_id: String,
    title: String,
    start_time: String,
    end_time: Option<String>,
    timezone: Option<String>,
    location: Option<String>,
    attendees: Option<Vec<String>>,
    description: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateEventResponse {
    calendar_event_id: String,
}

#[derive(Clone)]
struct AppState {
    persisted: Arc<Mutex<PersistedState>>,
    watcher_started: Arc<Mutex<bool>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            persisted: Arc::new(Mutex::new(PersistedState {
                polling_interval_seconds: DEFAULT_POLL_SECONDS,
                ..PersistedState::default()
            })),
            watcher_started: Arc::new(Mutex::new(false)),
        }
    }
}

fn keyring_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_GOOGLE_REFRESH_TOKEN).map_err(|err| err.to_string())
}

fn get_refresh_token() -> Option<String> {
    let entry = keyring_entry().ok()?;
    entry.get_password().ok()
}

fn set_refresh_token(token: &str) -> Result<(), String> {
    let entry = keyring_entry()?;
    entry.set_password(token).map_err(|err| err.to_string())
}

fn state_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|err| err.to_string())?;
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    Ok(dir.join("desktop-state.json"))
}

async fn persist_state(app: &AppHandle, state: &PersistedState) -> Result<(), String> {
    let path = state_file_path(app)?;
    let json = serde_json::to_string_pretty(state).map_err(|err| err.to_string())?;
    fs::write(path, json).map_err(|err| err.to_string())
}

fn load_state(app: &AppHandle) -> Result<PersistedState, String> {
    let path = state_file_path(app)?;
    if !path.exists() {
        return Ok(PersistedState {
            polling_interval_seconds: DEFAULT_POLL_SECONDS,
            ..PersistedState::default()
        });
    }

    let content = fs::read_to_string(path).map_err(|err| err.to_string())?;
    let mut loaded: PersistedState = serde_json::from_str(&content).map_err(|err| err.to_string())?;
    if loaded.polling_interval_seconds == 0 {
        loaded.polling_interval_seconds = DEFAULT_POLL_SECONDS;
    }
    Ok(loaded)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GmailMessageListResponse {
    messages: Option<Vec<GmailMessageListEntry>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GmailMessageListEntry {
    id: String,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GmailMessageDetails {
    id: String,
    thread_id: Option<String>,
    snippet: Option<String>,
    internal_date: Option<String>,
    payload: Option<GmailPayload>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GmailPayload {
    headers: Option<Vec<GmailHeader>>,
    body: Option<GmailBody>,
    parts: Option<Vec<GmailPayload>>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GmailHeader {
    name: String,
    value: String,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GmailBody {
    data: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GoogleTokenResponse {
    access_token: String,
    refresh_token: Option<String>,
}

async fn refresh_access_token(config: &StoredGoogleConfig, refresh_token: &str) -> Result<String, String> {
    let client = Client::new();
    let params = [
        ("client_id", config.client_id.as_str()),
        ("client_secret", config.client_secret.as_str()),
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
    ];
    let response = client
        .post("https://oauth2.googleapis.com/token")
        .form(&params)
        .send()
        .await
        .map_err(|err| err.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Token refresh failed with status {}", response.status()));
    }

    let parsed = response
        .json::<GoogleTokenResponse>()
        .await
        .map_err(|err| err.to_string())?;
    Ok(parsed.access_token)
}

fn extract_plain_text(payload: &Option<GmailPayload>) -> Option<String> {
    fn visit(node: &GmailPayload) -> Option<String> {
        if let Some(body) = &node.body {
            if let Some(data) = &body.data {
                if !data.is_empty() {
                    if let Ok(decoded) = decode_base64_url(data) {
                        if !decoded.trim().is_empty() {
                            return Some(decoded);
                        }
                    }
                }
            }
        }

        if let Some(parts) = &node.parts {
            for part in parts {
                if let Some(found) = visit(part) {
                    return Some(found);
                }
            }
        }
        None
    }

    payload.as_ref().and_then(visit)
}

fn decode_base64_url(input: &str) -> Result<String, String> {
    let raw = URL_SAFE_NO_PAD
        .decode(input)
        .or_else(|_| URL_SAFE.decode(input))
        .map_err(|err| err.to_string())?;
    String::from_utf8(raw).map_err(|err| err.to_string())
}

fn parse_headers(headers: &[GmailHeader]) -> HashMap<String, String> {
    headers
        .iter()
        .map(|h| (h.name.to_lowercase(), h.value.clone()))
        .collect()
}

fn parse_message(details: GmailMessageDetails) -> NormalizedMessageV2 {
    let headers = details
        .payload
        .as_ref()
        .and_then(|payload| payload.headers.clone())
        .unwrap_or_default();
    let header_map = parse_headers(&headers);
    let sender = header_map
        .get("from")
        .cloned()
        .unwrap_or_else(|| "unknown@gmail.com".to_string());
    let recipients = header_map
        .get("to")
        .map(|value| {
            value
                .split(',')
                .map(|entry| entry.trim().to_string())
                .filter(|entry| !entry.is_empty())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let subject = header_map.get("subject").cloned();

    let body = extract_plain_text(&details.payload)
        .or(details.snippet.clone())
        .unwrap_or_else(|| "(No body available)".to_string());

    let received_at = details
        .internal_date
        .as_ref()
        .and_then(|value| value.parse::<i64>().ok())
        .and_then(|millis| Utc.timestamp_millis_opt(millis).single())
        .unwrap_or_else(Utc::now)
        .to_rfc3339();

    NormalizedMessageV2 {
        source: "gmail".to_string(),
        source_message_id: details.id,
        sender,
        recipients,
        subject,
        body,
        received_at,
        thread_id: details.thread_id,
    }
}

fn parse_time(body: &str) -> Option<NaiveTime> {
    let regex = Regex::new(r"(?i)\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b").ok()?;
    let captures = regex.captures(body)?;
    let raw_hour = captures.get(1)?.as_str().parse::<u32>().ok()?;
    let minute = captures
        .get(2)
        .and_then(|m| m.as_str().parse::<u32>().ok())
        .unwrap_or(0);
    let meridiem = captures.get(3).map(|m| m.as_str().to_lowercase());

    let hour = match meridiem.as_deref() {
        Some("am") => raw_hour % 12,
        Some("pm") => (raw_hour % 12) + 12,
        None if raw_hour < 24 => raw_hour,
        _ => return None,
    };

    NaiveTime::from_hms_opt(hour, minute, 0)
}

fn next_weekday(base: NaiveDate, target: Weekday) -> NaiveDate {
    let mut days = (target.num_days_from_monday() as i64 - base.weekday().num_days_from_monday() as i64) % 7;
    if days <= 0 {
        days += 7;
    }
    base + chrono::Duration::days(days)
}

fn parse_date(body: &str, received_at: DateTime<Utc>) -> Option<NaiveDate> {
    let lower = body.to_lowercase();
    let base = received_at.date_naive();

    if lower.contains("tomorrow") {
        return Some(base + chrono::Duration::days(1));
    }
    if lower.contains("today") {
        return Some(base);
    }

    let next_day_regex =
        Regex::new(r"\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b").ok()?;
    if let Some(captures) = next_day_regex.captures(&lower) {
        let weekday = match captures.get(1)?.as_str() {
            "monday" => Weekday::Mon,
            "tuesday" => Weekday::Tue,
            "wednesday" => Weekday::Wed,
            "thursday" => Weekday::Thu,
            "friday" => Weekday::Fri,
            "saturday" => Weekday::Sat,
            "sunday" => Weekday::Sun,
            _ => Weekday::Mon,
        };
        return Some(next_weekday(base, weekday));
    }

    let iso_regex = Regex::new(r"\b(\d{4})-(\d{2})-(\d{2})\b").ok()?;
    if let Some(captures) = iso_regex.captures(&lower) {
        let year = captures.get(1)?.as_str().parse::<i32>().ok()?;
        let month = captures.get(2)?.as_str().parse::<u32>().ok()?;
        let day = captures.get(3)?.as_str().parse::<u32>().ok()?;
        return NaiveDate::from_ymd_opt(year, month, day);
    }

    let slash_regex = Regex::new(r"\b(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b").ok()?;
    if let Some(captures) = slash_regex.captures(&lower) {
        let month = captures.get(1)?.as_str().parse::<u32>().ok()?;
        let day = captures.get(2)?.as_str().parse::<u32>().ok()?;
        let year = captures
            .get(3)
            .and_then(|part| part.as_str().parse::<i32>().ok())
            .unwrap_or(base.year());
        return NaiveDate::from_ymd_opt(year, month, day);
    }

    None
}

fn extract_event(message: &NormalizedMessageV2) -> Option<ExtractedEventV2> {
    let received_at = DateTime::parse_from_rfc3339(&message.received_at).ok()?.with_timezone(&Utc);
    let body = format!("{}\n{}", message.subject.clone().unwrap_or_default(), message.body);
    let date = parse_date(&body, received_at)?;
    let start_time = parse_time(&body)?;
    let start = Utc.from_utc_datetime(&date.and_time(start_time));
    let end = start + chrono::Duration::hours(1);

    Some(ExtractedEventV2 {
        title: message
            .subject
            .clone()
            .unwrap_or_else(|| "Potential meeting".to_string()),
        start_time: start.to_rfc3339(),
        end_time: Some(end.to_rfc3339()),
        timezone: Some("UTC".to_string()),
        location: None,
        attendees: Some(message.recipients.clone()),
        description: Some(format!(
            "Detected from Gmail message {}\n\n{}",
            message.source_message_id,
            message.body.chars().take(700).collect::<String>()
        )),
        confidence: 0.74,
        source_message_id: message.source_message_id.clone(),
        source: "gmail".to_string(),
    })
}

async fn list_recent_messages(access_token: &str, after_unix_seconds: i64) -> Result<Vec<String>, String> {
    let query = format!("after:{after_unix_seconds}");
    let client = Client::new();
    let response = client
        .get("https://gmail.googleapis.com/gmail/v1/users/me/messages")
        .bearer_auth(access_token)
        .query(&[("maxResults", "20"), ("q", query.as_str())])
        .send()
        .await
        .map_err(|err| err.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Failed to list Gmail messages ({})", response.status()));
    }

    let parsed = response
        .json::<GmailMessageListResponse>()
        .await
        .map_err(|err| err.to_string())?;
    Ok(parsed
        .messages
        .unwrap_or_default()
        .into_iter()
        .map(|message| message.id)
        .collect())
}

async fn fetch_message_details(access_token: &str, id: &str) -> Result<GmailMessageDetails, String> {
    let client = Client::new();
    let url = format!("https://gmail.googleapis.com/gmail/v1/users/me/messages/{id}");
    let response = client
        .get(url)
        .bearer_auth(access_token)
        .query(&[("format", "full")])
        .send()
        .await
        .map_err(|err| err.to_string())?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to fetch Gmail message {id} ({})",
            response.status()
        ));
    }

    response
        .json::<GmailMessageDetails>()
        .await
        .map_err(|err| err.to_string())
}

async fn create_google_calendar_event(
    config: &StoredGoogleConfig,
    access_token: &str,
    event: &ExtractedEventV2,
    message: &NormalizedMessageV2,
) -> Result<String, String> {
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct EventBody<'a> {
        summary: &'a str,
        description: String,
        location: Option<&'a str>,
        attendees: Vec<HashMap<&'static str, String>>,
        start: HashMap<&'static str, String>,
        end: HashMap<&'static str, String>,
    }

    let description = format!(
        "{}\n\nSource: {}\nMessage ID: {}\nSender: {}",
        event.description.clone().unwrap_or_default(),
        message.source,
        message.source_message_id,
        message.sender
    );
    let attendees = event
        .attendees
        .clone()
        .unwrap_or_default()
        .into_iter()
        .map(|email| HashMap::from([("email", email)]))
        .collect::<Vec<_>>();
    let start = HashMap::from([
        ("dateTime", event.start_time.clone()),
        ("timeZone", event.timezone.clone().unwrap_or_else(|| "UTC".to_string())),
    ]);
    let end = HashMap::from([
        (
            "dateTime",
            event
                .end_time
                .clone()
                .unwrap_or_else(|| (Utc::now() + chrono::Duration::hours(1)).to_rfc3339()),
        ),
        ("timeZone", event.timezone.clone().unwrap_or_else(|| "UTC".to_string())),
    ]);

    let request_body = EventBody {
        summary: &event.title,
        description,
        location: event.location.as_deref(),
        attendees,
        start,
        end,
    };

    let url = format!(
        "https://www.googleapis.com/calendar/v3/calendars/{}/events",
        urlencoding::encode(&config.calendar_id)
    );
    let response = Client::new()
        .post(url)
        .bearer_auth(access_token)
        .json(&request_body)
        .send()
        .await
        .map_err(|err| err.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Calendar event creation failed ({})", response.status()));
    }

    let value = response.json::<serde_json::Value>().await.map_err(|err| err.to_string())?;
    let event_id = value
        .get("id")
        .and_then(|val| val.as_str())
        .unwrap_or("unknown_event_id")
        .to_string();
    Ok(event_id)
}

async fn run_watcher_once_inner(app: &AppHandle, state: &AppState) -> Result<(), String> {
    let snapshot = {
        let guard = state.persisted.lock().await;
        guard.clone()
    };

    if snapshot.google.client_id.is_empty() || snapshot.google.client_secret.is_empty() {
        let mut guard = state.persisted.lock().await;
        guard.connected = false;
        persist_state(app, &guard).await?;
        return Ok(());
    }

    let refresh_token = match get_refresh_token() {
        Some(token) => token,
        None => {
            let mut guard = state.persisted.lock().await;
            guard.connected = false;
            persist_state(app, &guard).await?;
            return Ok(());
        }
    };

    let access_token = refresh_access_token(&snapshot.google, &refresh_token).await?;
    let after_unix = snapshot
        .last_checked
        .as_ref()
        .and_then(|last| DateTime::parse_from_rfc3339(last).ok())
        .map(|dt| dt.timestamp())
        .unwrap_or_else(|| (Utc::now() - chrono::Duration::hours(12)).timestamp());

    let message_ids = list_recent_messages(&access_token, after_unix).await?;
    let mut new_candidates = Vec::new();

    for message_id in message_ids {
        if snapshot.processed_message_ids.contains(&message_id) {
            continue;
        }

        let details = fetch_message_details(&access_token, &message_id).await?;
        let normalized = parse_message(details);
        if let Some(extracted_event) = extract_event(&normalized) {
            let already_created = snapshot
                .created_events
                .contains_key(&extracted_event.source_message_id);
            let already_queued = snapshot
                .candidates
                .iter()
                .any(|candidate| candidate.message.source_message_id == extracted_event.source_message_id);
            if !already_created && !already_queued {
                new_candidates.push(CandidateEventRecord {
                    id: Uuid::new_v4().to_string(),
                    message: normalized.clone(),
                    extracted_event,
                    created_at: Utc::now().to_rfc3339(),
                });
            }
        }
    }

    let mut guard = state.persisted.lock().await;
    for candidate in new_candidates {
        guard.detected_count += 1;
        guard.processed_message_ids.insert(candidate.message.source_message_id.clone());
        guard.candidates.push(candidate);
    }
    guard.last_checked = Some(Utc::now().to_rfc3339());
    guard.connected = true;
    persist_state(app, &guard).await
}

async fn ensure_watcher_task(app: AppHandle, state: AppState) {
    let mut started_guard = state.watcher_started.lock().await;
    if *started_guard {
        return;
    }
    *started_guard = true;
    drop(started_guard);

    tokio::spawn(async move {
        loop {
            let (enabled, seconds) = {
                let guard = state.persisted.lock().await;
                (
                    guard.watcher_enabled,
                    guard.polling_interval_seconds.max(DEFAULT_POLL_SECONDS),
                )
            };

            if enabled {
                let _ = run_watcher_once_inner(&app, &state).await;
            }

            tokio::time::sleep(Duration::from_secs(seconds)).await;
        }
    });
}

#[tauri::command]
async fn get_desktop_state(state: State<'_, AppState>) -> Result<DesktopStateResponse, String> {
    let guard = state.persisted.lock().await;
    let status = WatcherStatus {
        watcher_enabled: guard.watcher_enabled,
        polling_interval_seconds: guard.polling_interval_seconds,
        connected: guard.connected,
        last_checked: guard.last_checked.clone(),
        candidate_count: guard.candidates.len(),
        detected_count: guard.detected_count,
    };
    Ok(DesktopStateResponse {
        status,
        candidates: guard.candidates.clone(),
    })
}

#[tauri::command]
async fn set_watcher_enabled(
    app: AppHandle,
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), String> {
    {
        let mut guard = state.persisted.lock().await;
        guard.watcher_enabled = enabled;
        persist_state(&app, &guard).await?;
    }
    ensure_watcher_task(app.clone(), state.inner().clone()).await;
    Ok(())
}

#[tauri::command]
async fn set_polling_interval_seconds(
    app: AppHandle,
    state: State<'_, AppState>,
    seconds: u64,
) -> Result<(), String> {
    let mut guard = state.persisted.lock().await;
    guard.polling_interval_seconds = seconds.clamp(30, 3600);
    persist_state(&app, &guard).await
}

#[tauri::command]
async fn run_watcher_once(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    run_watcher_once_inner(&app, state.inner()).await
}

#[tauri::command]
async fn save_google_oauth_config(
    app: AppHandle,
    state: State<'_, AppState>,
    config: GoogleOAuthConfigInput,
) -> Result<(), String> {
    if let Some(token) = config.refresh_token.as_ref() {
        if !token.is_empty() {
            set_refresh_token(token)?;
        }
    }

    let mut guard = state.persisted.lock().await;
    guard.google.client_id = config.client_id;
    guard.google.client_secret = config.client_secret;
    guard.google.redirect_uri = config.redirect_uri;
    guard.google.calendar_id = config.calendar_id.unwrap_or_else(|| "primary".to_string());
    guard.connected = get_refresh_token().is_some();
    persist_state(&app, &guard).await
}

#[tauri::command]
async fn generate_google_auth_url(client_id: String, redirect_uri: String) -> Result<UrlResponse, String> {
    let scope = urlencoding::encode(
        "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events",
    );
    let url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id={}&redirect_uri={}&scope={}&access_type=offline&prompt=consent",
        urlencoding::encode(&client_id),
        urlencoding::encode(&redirect_uri),
        scope
    );
    Ok(UrlResponse { url })
}

#[tauri::command]
async fn exchange_google_auth_code(
    app: AppHandle,
    state: State<'_, AppState>,
    client_id: String,
    client_secret: String,
    redirect_uri: String,
    code: String,
) -> Result<RefreshStoredResponse, String> {
    let client = Client::new();
    let params = [
        ("code", code.as_str()),
        ("client_id", client_id.as_str()),
        ("client_secret", client_secret.as_str()),
        ("redirect_uri", redirect_uri.as_str()),
        ("grant_type", "authorization_code"),
    ];
    let response = client
        .post("https://oauth2.googleapis.com/token")
        .form(&params)
        .send()
        .await
        .map_err(|err| err.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Code exchange failed ({})", response.status()));
    }

    let parsed = response
        .json::<GoogleTokenResponse>()
        .await
        .map_err(|err| err.to_string())?;
    if let Some(token) = parsed.refresh_token.as_ref() {
        if !token.is_empty() {
            set_refresh_token(token)?;
        }
    }

    let mut guard = state.persisted.lock().await;
    guard.google.client_id = client_id;
    guard.google.client_secret = client_secret;
    guard.google.redirect_uri = redirect_uri;
    guard.connected = get_refresh_token().is_some();
    persist_state(&app, &guard).await?;

    Ok(RefreshStoredResponse {
        refresh_token_stored: get_refresh_token().is_some(),
    })
}

#[tauri::command]
async fn ignore_candidate(
    app: AppHandle,
    state: State<'_, AppState>,
    candidate_id: String,
) -> Result<(), String> {
    let mut guard = state.persisted.lock().await;
    guard.candidates.retain(|candidate| candidate.id != candidate_id);
    persist_state(&app, &guard).await
}

#[tauri::command]
async fn create_calendar_event_from_candidate(
    app: AppHandle,
    state: State<'_, AppState>,
    payload: CreateEventPayload,
) -> Result<CreateEventResponse, String> {
    let snapshot = {
        let guard = state.persisted.lock().await;
        guard.clone()
    };

    let refresh_token = get_refresh_token().ok_or("No Google refresh token stored.")?;
    let access_token = refresh_access_token(&snapshot.google, &refresh_token).await?;
    let candidate = snapshot
        .candidates
        .iter()
        .find(|candidate| candidate.id == payload.candidate_id)
        .cloned()
        .ok_or("Candidate not found.")?;

    if snapshot
        .created_events
        .contains_key(&candidate.message.source_message_id)
    {
        return Err("A calendar event was already created from this source message.".to_string());
    }

    let mut updated_event = candidate.extracted_event.clone();
    updated_event.title = payload.title;
    updated_event.start_time = payload.start_time;
    updated_event.end_time = payload.end_time;
    updated_event.timezone = payload.timezone;
    updated_event.location = payload.location;
    updated_event.attendees = payload.attendees;
    updated_event.description = payload.description;

    let event_id = create_google_calendar_event(
        &snapshot.google,
        &access_token,
        &updated_event,
        &candidate.message,
    )
    .await?;

    let mut guard = state.persisted.lock().await;
    guard
        .created_events
        .insert(candidate.message.source_message_id.clone(), event_id.clone());
    guard.candidates.retain(|item| item.id != payload.candidate_id);
    persist_state(&app, &guard).await?;

    Ok(CreateEventResponse {
        calendar_event_id: event_id,
    })
}

pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .setup(|app| {
            let loaded = load_state(app.handle())?;
            let app_state = app.state::<AppState>();
            tauri::async_runtime::block_on(async {
                let mut guard = app_state.persisted.lock().await;
                *guard = loaded;
                guard.connected = get_refresh_token().is_some()
                    && !guard.google.client_id.is_empty()
                    && !guard.google.client_secret.is_empty();
            });
            let state = app_state.inner().clone();
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                ensure_watcher_task(handle, state).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_desktop_state,
            set_watcher_enabled,
            set_polling_interval_seconds,
            run_watcher_once,
            save_google_oauth_config,
            generate_google_auth_url,
            exchange_google_auth_code,
            ignore_candidate,
            create_calendar_event_from_candidate
        ])
        .run(tauri::generate_context!())
        .expect("error while running Calendar Copilot desktop app");
}
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use reqwest::Client;
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

#[derive(Clone)]
struct DesktopWatcher {
  state: Arc<Mutex<WatcherRuntime>>,
  http_client: Client,
  endpoint: String,
  token: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WatcherStatus {
  running: bool,
  interval_seconds: u64,
  tick_count: u64,
  last_tick_at: Option<String>,
  last_result: Option<String>,
  last_error: Option<String>,
}

#[derive(Clone, Debug)]
struct WatcherRuntime {
  running: bool,
  interval_seconds: u64,
  tick_count: u64,
  last_tick_at: Option<String>,
  last_result: Option<String>,
  last_error: Option<String>,
}

impl WatcherRuntime {
  fn new() -> Self {
    Self {
      running: false,
      interval_seconds: 300,
      tick_count: 0,
      last_tick_at: None,
      last_result: None,
      last_error: None,
    }
  }

  fn status(&self) -> WatcherStatus {
    WatcherStatus {
      running: self.running,
      interval_seconds: self.interval_seconds,
      tick_count: self.tick_count,
      last_tick_at: self.last_tick_at.clone(),
      last_result: self.last_result.clone(),
      last_error: self.last_error.clone(),
    }
  }
}

impl DesktopWatcher {
  fn from_env() -> Self {
    let endpoint = std::env::var("DESKTOP_WATCHER_ENDPOINT")
      .unwrap_or_else(|_| "http://127.0.0.1:3000/api/desktop/watcher/tick".to_string());
    let token = std::env::var("DESKTOP_WATCHER_TOKEN").ok();

    Self {
      state: Arc::new(Mutex::new(WatcherRuntime::new())),
      http_client: Client::new(),
      endpoint,
      token,
    }
  }

  fn snapshot(&self) -> Result<WatcherStatus, String> {
    let guard = self.state.lock().map_err(|err| err.to_string())?;
    Ok(guard.status())
  }

  async fn tick_once(&self) -> Result<(), String> {
    {
      let mut guard = self.state.lock().map_err(|err| err.to_string())?;
      guard.last_tick_at = Some(current_timestamp_string());
    }

    let mut request = self.http_client.post(self.endpoint.clone());
    if let Some(token) = &self.token {
      request = request.bearer_auth(token);
    }

    match request.send().await {
      Ok(response) => {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let mut guard = self.state.lock().map_err(|err| err.to_string())?;
        guard.tick_count += 1;
        guard.last_error = None;
        guard.last_result = Some(format!("{} {}", status, body));
        Ok(())
      }
      Err(error) => {
        let mut guard = self.state.lock().map_err(|err| err.to_string())?;
        guard.tick_count += 1;
        guard.last_error = Some(error.to_string());
        Err(error.to_string())
      }
    }
  }
}

fn current_timestamp_string() -> String {
  match SystemTime::now().duration_since(UNIX_EPOCH) {
    Ok(duration) => duration.as_secs().to_string(),
    Err(_) => "0".to_string(),
  }
}

#[tauri::command]
fn watcher_status(watcher: State<DesktopWatcher>) -> Result<WatcherStatus, String> {
  watcher.snapshot()
}

#[tauri::command]
async fn trigger_watcher_tick(watcher: State<'_, DesktopWatcher>) -> Result<WatcherStatus, String> {
  let _ = watcher.tick_once().await;
  watcher.snapshot()
}

#[tauri::command]
async fn start_watcher(
  watcher: State<'_, DesktopWatcher>,
  app_handle: AppHandle,
  interval_seconds: Option<u64>,
) -> Result<WatcherStatus, String> {
  let selected_interval = interval_seconds.unwrap_or(300).max(30);
  let should_spawn = {
    let mut guard = watcher.state.lock().map_err(|err| err.to_string())?;
    guard.interval_seconds = selected_interval;
    let already_running = guard.running;
    guard.running = true;
    !already_running
  };

  if should_spawn {
    let watcher_for_task = app_handle.state::<DesktopWatcher>().inner().clone();
    tauri::async_runtime::spawn(async move {
      loop {
        let running = watcher_for_task
          .state
          .lock()
          .map(|guard| guard.running)
          .unwrap_or(false);

        if !running {
          break;
        }

        let _ = watcher_for_task.tick_once().await;

        let delay_seconds = watcher_for_task
          .state
          .lock()
          .map(|guard| guard.interval_seconds)
          .unwrap_or(300);
        tauri::async_runtime::sleep(Duration::from_secs(delay_seconds)).await;
      }
    });
  }

  watcher.snapshot()
}

#[tauri::command]
fn stop_watcher(watcher: State<'_, DesktopWatcher>) -> Result<WatcherStatus, String> {
  {
    let mut guard = watcher.state.lock().map_err(|err| err.to_string())?;
    guard.running = false;
  }
  watcher.snapshot()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let watcher = DesktopWatcher::from_env();

  tauri::Builder::default()
    .manage(watcher)
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      watcher_status,
      trigger_watcher_tick,
      start_watcher,
      stop_watcher
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
