CREATE TABLE IF NOT EXISTS app_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    providers TEXT NOT NULL,
    extra_nodes TEXT NOT NULL,
    clash_template TEXT NOT NULL,
    sing_box_template TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
