-- Single-professional MVP. Range bounds include service duration + 15-minute buffer.
CREATE TABLE IF NOT EXISTS weekly_hours (
    weekday integer PRIMARY KEY CHECK (weekday BETWEEN 0 AND 6),
    opens time NOT NULL,
    closes time NOT NULL,
    CHECK (opens < closes)
);
CREATE TABLE IF NOT EXISTS schema_versions (version integer PRIMARY KEY);
INSERT INTO weekly_hours SELECT day, '09:00'::time, '17:00'::time
FROM generate_series(0,4) AS day WHERE NOT EXISTS (SELECT 1 FROM schema_versions WHERE version=1)
ON CONFLICT DO NOTHING;
INSERT INTO schema_versions VALUES (1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS bookings (
    id uuid PRIMARY KEY,
    service_id text NOT NULL,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    occupied_until timestamptz NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    cancel_hash text NOT NULL,
    cancelled boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (starts_at < ends_at AND ends_at < occupied_until),
    EXCLUDE USING gist (tstzrange(starts_at, occupied_until, '[)') WITH &&)
        WHERE (NOT cancelled)
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash text PRIMARY KEY,
    expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS login_attempts (
    client_key text PRIMARY KEY,
    attempts integer NOT NULL,
    started_at timestamptz NOT NULL
);
