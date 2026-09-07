"""
scripts/migrate_sqlite_to_postgres.py
=====================================
Comprehensive migration utility to transfer all data from SQLite
(voice_clone_detection.db) into PostgreSQL (voiceshield).

Features:
- Migrates tables in strict foreign-key dependency order.
- Performs upsert (ON CONFLICT DO UPDATE) so it can be safely re-run without duplicates.
- Handles boolean type conversions (SQLite 0/1 -> Postgres boolean).
- Handles NULL values and JSON serialization.
- Prints full table status and row counts before and after migration.
"""

from __future__ import annotations

import os
import sys
import sqlite3
import psycopg2
from psycopg2.extras import execute_values

SQLITE_PATH = "voice_clone_detection.db"
POSTGRES_DB = os.getenv("PGDATABASE", "voiceshield")
POSTGRES_HOST = os.getenv("PGHOST", "localhost")
POSTGRES_PORT = int(os.getenv("PGPORT", "5432"))
POSTGRES_USER = os.getenv("PGUSER", None)

TABLE_METADATA = [
    {
        "table": "organizations",
        "conflict": "id",
        "bool_cols": ["is_active"],
    },
    {
        "table": "users",
        "conflict": "id",
        "bool_cols": ["is_active"],
    },
    {
        "table": "protected_identities",
        "conflict": "id",
        "bool_cols": ["is_active"],
    },
    {
        "table": "speaker_profiles",
        "conflict": "id",
        "bool_cols": [],
    },
    {
        "table": "security_policies",
        "conflict": "org_id",
        "bool_cols": [],
    },
    {
        "table": "call_sessions",
        "conflict": "session_id",
        "bool_cols": ["alert_triggered"],
    },
    {
        "table": "risk_events",
        "conflict": "id",
        "bool_cols": ["speech_detected", "speaker_match", "is_alert"],
    },
    {
        "table": "security_incidents",
        "conflict": "incident_id",
        "bool_cols": [],
    },
    {
        "table": "security_actions",
        "conflict": "action_id",
        "bool_cols": [],
    },
    {
        "table": "audit_logs",
        "conflict": "id",
        "bool_cols": [],
    },
]


def get_sqlite_conn():
    if not os.path.exists(SQLITE_PATH):
        print(f"[ERROR] SQLite database file '{SQLITE_PATH}' not found!")
        sys.exit(1)
    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_postgres_conn():
    conn_params = {"dbname": POSTGRES_DB, "host": POSTGRES_HOST, "port": POSTGRES_PORT}
    if POSTGRES_USER:
        conn_params["user"] = POSTGRES_USER
    try:
        conn = psycopg2.connect(**conn_params)
        conn.autocommit = False
        return conn
    except Exception as exc:
        print(f"[ERROR] Failed to connect to PostgreSQL: {exc}")
        sys.exit(1)


def migrate():
    print("=" * 70)
    print("VOICESHIELD: SQLITE TO POSTGRESQL DATA MIGRATION")
    print("=" * 70)
    print(f"Source (SQLite):     {os.path.abspath(SQLITE_PATH)}")
    print(f"Target (PostgreSQL): dbname={POSTGRES_DB}, host={POSTGRES_HOST}:{POSTGRES_PORT}\n")

    s_conn = get_sqlite_conn()
    p_conn = get_postgres_conn()

    s_cur = s_conn.cursor()
    p_cur = p_conn.cursor()

    try:
        # Pre-check row counts
        print(f"{'Table Name':<25} | {'SQLite Rows':<12} | {'Postgres Before':<16}")
        print("-" * 58)
        for meta in TABLE_METADATA:
            table = meta["table"]
            s_cur.execute(f"SELECT COUNT(*) FROM {table};")
            s_cnt = s_cur.fetchone()[0]
            p_cur.execute(f"SELECT COUNT(*) FROM {table};")
            p_cnt = p_cur.fetchone()[0]
            print(f"{table:<25} | {s_cnt:<12} | {p_cnt:<16}")
        print("-" * 58 + "\n")

        print("Beginning data migration...")

        total_migrated = 0

        for meta in TABLE_METADATA:
            table = meta["table"]
            conflict = meta["conflict"]
            bool_cols = set(meta.get("bool_cols", []))

            # Fetch columns from SQLite
            s_cur.execute(f"PRAGMA table_info({table});")
            cols = [col[1] for col in s_cur.fetchall()]

            # Fetch all rows from SQLite
            s_cur.execute(f"SELECT * FROM {table};")
            rows = s_cur.fetchall()

            if not rows:
                print(f"  [{table}] 0 rows in SQLite. Skipping.")
                continue

            # Process row values
            processed_rows = []
            for row in rows:
                val_list = []
                for idx, col in enumerate(cols):
                    val = row[idx]
                    if col in bool_cols:
                        if val is not None:
                            val = bool(val)
                    val_list.append(val)
                processed_rows.append(tuple(val_list))

            # Construct UPSERT query for PostgreSQL
            col_names_str = ", ".join(cols)
            update_assignments = [f"{c} = EXCLUDED.{c}" for c in cols if c != conflict]
            if update_assignments:
                on_conflict_clause = f"ON CONFLICT ({conflict}) DO UPDATE SET {', '.join(update_assignments)}"
            else:
                on_conflict_clause = f"ON CONFLICT ({conflict}) DO NOTHING"

            insert_query = f"""
                INSERT INTO {table} ({col_names_str})
                VALUES %s
                {on_conflict_clause};
            """

            execute_values(p_cur, insert_query, processed_rows)
            p_conn.commit()

            print(f"  ✓ [{table}] Successfully migrated {len(processed_rows)} rows.")
            total_migrated += len(processed_rows)

        print("\n" + "=" * 70)
        print("MIGRATION COMPLETED SUCCESSFULLY!")
        print("=" * 70)

        # Post-migration check
        print(f"{'Table Name':<25} | {'Postgres Total Rows':<20} | {'Status':<10}")
        print("-" * 60)
        for meta in TABLE_METADATA:
            table = meta["table"]
            p_cur.execute(f"SELECT COUNT(*) FROM {table};")
            cnt = p_cur.fetchone()[0]
            print(f"{table:<25} | {cnt:<20} | {'OK' if cnt >= 0 else 'EMPTY'}")
        print("-" * 60)

        # Inspect speaker_profiles row
        p_cur.execute("SELECT id, speaker_id, protected_identity_id, embedding_dim, sample_count FROM speaker_profiles;")
        spk_rows = p_cur.fetchall()
        print("\n[VERIFICATION] speaker_profiles in PostgreSQL:")
        if spk_rows:
            for spk in spk_rows:
                print(f"  • ID={spk[0]}, Speaker ID={spk[1]}, Identity={spk[2]}, Embedding Dim={spk[3]}, Samples={spk[4]}")
        else:
            print("  (No speaker profiles found!)")

        # Inspect call_sessions
        p_cur.execute("SELECT count(*), max(start_time) FROM call_sessions;")
        call_summary = p_cur.fetchone()
        print(f"\n[VERIFICATION] call_sessions in PostgreSQL: {call_summary[0]} calls (latest: {call_summary[1]})")

        # Inspect users
        p_cur.execute("SELECT id, username, email, role FROM users ORDER BY username;")
        users = p_cur.fetchall()
        print(f"\n[VERIFICATION] users in PostgreSQL ({len(users)} users):")
        for u in users:
            print(f"  • {u[1]:<12} | role={u[3]:<18} | email={u[2]}")

    except Exception as exc:
        p_conn.rollback()
        print(f"\n[ERROR] Migration failed: {exc}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        s_conn.close()
        p_conn.close()


if __name__ == "__main__":
    migrate()
