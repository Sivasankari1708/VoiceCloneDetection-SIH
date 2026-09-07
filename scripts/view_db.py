
"""
scripts/view_db.py
==================
Quick database inspector for VoiceShield SQLite database (voice_clone_detection.db).

Usage:
    python scripts/view_db.py                  # Show database summary & latest records
    python scripts/view_db.py users            # View all users
    python scripts/view_db.py calls            # View recent call sessions
    python scripts/view_db.py incidents        # View all security incidents
    python scripts/view_db.py risks            # View recent risk events
    python scripts/view_db.py audit            # View recent audit logs
"""

import sys
import sqlite3
import os

DB_PATH = "voice_clone_detection.db"

def print_separator(title=""):
    if title:
        print(f"\n{'='*25} {title.upper()} {'='*25}")
    else:
        print("="*65)

def get_connection():
    if not os.path.exists(DB_PATH):
        print(f"Error: Database file '{DB_PATH}' not found!")
        sys.exit(1)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def show_summary(conn):
    print_separator("VoiceShield Database Summary")
    print(f"Database File: {os.path.abspath(DB_PATH)}")
    print(f"File Size:     {os.path.getsize(DB_PATH) / 1024:.1f} KB\n")

    cursor = conn.cursor()
    tables = [
        "organizations",
        "users",
        "protected_identities",
        "call_sessions",
        "security_incidents",
        "risk_events",
        "audit_logs",
        "security_actions",
        "security_policies",
    ]

    print(f"{'Table Name':<25} | {'Row Count':<10}")
    print("-" * 38)
    for table in tables:
        try:
            cursor.execute(f"SELECT COUNT(*) FROM {table}")
            count = cursor.fetchone()[0]
            print(f"{table:<25} | {count:<10}")
        except Exception:
            print(f"{table:<25} | (not created)")

def show_users(conn):
    print_separator("Users (Authentication & RBAC)")
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, full_name, email, role, org_id FROM users")
    rows = cursor.fetchall()
    print(f"{'Username':<12} | {'Full Name':<22} | {'Role':<18} | {'Org ID'}")
    print("-" * 75)
    for r in rows:
        org = r['org_id'] or "(None - Citizen)"
        print(f"{r['username']:<12} | {r['full_name']:<22} | {r['role']:<18} | {org}")

def show_calls(conn, limit=5):
    print_separator(f"Recent Call Sessions (Latest {limit})")
    cursor = conn.cursor()
    cursor.execute(
        "SELECT session_id, caller_name, recipient_user_id, status, current_risk_score, current_risk_level, start_time "
        "FROM call_sessions ORDER BY start_time DESC LIMIT ?",
        (limit,)
    )
    rows = cursor.fetchall()
    if not rows:
        print("No call sessions found.")
        return
    print(f"{'Session ID':<22} | {'Caller':<25} | {'Status':<8} | {'Risk':<10} | {'Start Time'}")
    print("-" * 90)
    for r in rows:
        caller = (r['caller_name'] or 'Unknown')[:25]
        risk = f"{r['current_risk_score']:.0f} ({r['current_risk_level']})"
        time_str = (r['start_time'] or '')[:19]
        print(f"{r['session_id']:<22} | {caller:<25} | {r['status']:<8} | {risk:<10} | {time_str}")

def show_incidents(conn, limit=5):
    print_separator(f"Security Incidents (Latest {limit})")
    cursor = conn.cursor()
    cursor.execute(
        "SELECT incident_id, severity, scenario, claimed_identity, target_individual, current_risk_score, status, created_at "
        "FROM security_incidents ORDER BY created_at DESC LIMIT ?",
        (limit,)
    )
    rows = cursor.fetchall()
    if not rows:
        print("No security incidents logged.")
        return
    print(f"{'Incident ID':<22} | {'Severity':<9} | {'Risk':<5} | {'Claimed Identity':<22} | {'Target':<18} | {'Status'}")
    print("-" * 95)
    for r in rows:
        claimed = (r['claimed_identity'] or 'N/A')[:22]
        target = (r['target_individual'] or 'N/A')[:18]
        print(f"{r['incident_id']:<22} | {r['severity']:<9} | {r['current_risk_score']:<5.0f} | {claimed:<22} | {target:<18} | {r['status']}")

def show_risks(conn, limit=5):
    print_separator(f"Recent Risk Events (Latest {limit})")
    cursor = conn.cursor()
    cursor.execute(
        "SELECT chunk_id, session_id, speech_detected, raw_synthetic_prob, raw_speaker_sim, risk_score, risk_level, intent, transcript_chunk "
        "FROM risk_events ORDER BY timestamp DESC LIMIT ?",
        (limit,)
    )
    rows = cursor.fetchall()
    if not rows:
        print("No risk events found.")
        return
    for r in rows:
        synth = f"{r['raw_synthetic_prob']:.2f}" if r['raw_synthetic_prob'] is not None else "N/A"
        sim = f"{r['raw_speaker_sim']:.2f}" if r['raw_speaker_sim'] is not None else "N/A"
        transcript = f"\"{r['transcript_chunk']}\"" if r['transcript_chunk'] else "(no speech)"
        print(f"Chunk #{r['chunk_id']} [{r['session_id'][:16]}...] | Synth={synth} | SpkSim={sim} | Risk={r['risk_score']:.0f} ({r['risk_level']}) | Intent={r['intent']}")
        print(f"  Transcript: {transcript}")
        print("-" * 70)

def main():
    conn = get_connection()
    arg = sys.argv[1].lower() if len(sys.argv) > 1 else ""

    if arg in ("users", "user"):
        show_users(conn)
    elif arg in ("calls", "call", "sessions"):
        show_calls(conn, limit=20)
    elif arg in ("incidents", "incident"):
        show_incidents(conn, limit=20)
    elif arg in ("risks", "risk", "events"):
        show_risks(conn, limit=10)
    else:
        show_summary(conn)
        show_users(conn)
        show_calls(conn, limit=3)
        show_incidents(conn, limit=3)
        print("\nTip: Run 'python scripts/view_db.py [users|calls|incidents|risks]' to inspect specific tables.")

    conn.close()

if __name__ == "__main__":
    main()
