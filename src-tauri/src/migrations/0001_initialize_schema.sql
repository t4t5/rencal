CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    email TEXT,
    access_token TEXT,
    refresh_token TEXT,
    expires_at INTEGER,
    created_at INTEGER NOT NULL
);

CREATE TABLE calendars (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    provider_calendar_id TEXT,
    name TEXT NOT NULL,
    color TEXT,
    selected INTEGER NOT NULL DEFAULT 1,
    sync_token TEXT,
    last_synced_at INTEGER,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    UNIQUE(account_id, provider_calendar_id)
);

CREATE TABLE events (
    id TEXT PRIMARY KEY,
    provider_event_id TEXT,
    calendar_id TEXT NOT NULL,
    summary TEXT,
    start TEXT NOT NULL,
    end TEXT NOT NULL,
    all_day INTEGER NOT NULL,
    updated_at TEXT,
    FOREIGN KEY (calendar_id) REFERENCES calendars(id) ON DELETE CASCADE
);

CREATE INDEX idx_calendars_account_id ON calendars(account_id);
CREATE INDEX idx_events_calendar_id ON events(calendar_id);
CREATE INDEX idx_events_provider_event_id ON events(provider_event_id);
CREATE INDEX idx_events_start ON events(start);
