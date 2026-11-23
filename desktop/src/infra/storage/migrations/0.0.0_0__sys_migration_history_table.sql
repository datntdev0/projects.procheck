CREATE TABLE sys_migration_history (
    version TEXT NOT NULL,
    seq INTEGER NOT NULL,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL,
    PRIMARY KEY (version, seq)
);
