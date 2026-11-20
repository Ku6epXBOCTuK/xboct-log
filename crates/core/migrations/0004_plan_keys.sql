CREATE TABLE IF NOT EXISTS plan_number_high_water (
    singleton   INTEGER PRIMARY KEY CHECK (singleton = 1),
    last_number INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS plan_keys (
    plan_id TEXT PRIMARY KEY REFERENCES plans(id) ON DELETE CASCADE,
    key     TEXT NOT NULL UNIQUE,
    number  INTEGER NOT NULL UNIQUE
);

INSERT INTO plan_keys (plan_id, key, number)
SELECT numbered.id, 'PL-' || numbered.rn, numbered.rn
FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn
    FROM plans
) AS numbered
WHERE NOT EXISTS (SELECT 1 FROM plan_keys pk WHERE pk.plan_id = numbered.id);

INSERT INTO plan_number_high_water (singleton, last_number)
SELECT 1, COALESCE(MAX(number), 0) FROM plan_keys
WHERE TRUE
ON CONFLICT (singleton) DO UPDATE SET last_number = MAX(last_number, excluded.last_number);

CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_keys_key ON plan_keys (key);
CREATE INDEX IF NOT EXISTS idx_plan_keys_number ON plan_keys (number);
