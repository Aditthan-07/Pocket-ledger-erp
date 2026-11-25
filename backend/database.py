"""
Pocket Ledger ERP - Database Configuration and Session Management
SQLAlchemy 2.0 declarative base, engine, and session provider.
Configured for SQLite file pocket_ledger.db with foreign key PRAGMA enabled,
and designed to be 100% compatible with PostgreSQL via DATABASE_URL.
"""

import os
from pathlib import Path
from typing import Generator
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import declarative_base, sessionmaker, Session

# Base directory for pocket-ledger
BASE_DIR = Path(__file__).resolve().parent.parent
DB_FILE = BASE_DIR / "pocket_ledger.db"

# Database URL from environment or default SQLite
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DB_FILE}")

# SQLite specific connect args
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    echo=False,
    future=True,
)

# Enable Foreign Key support in SQLite
if DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

# Session factory
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    expire_on_commit=False,
)

# Declarative Base for SQLAlchemy 2.0 models
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """FastAPI Dependency for database session injection with auto-close."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all database tables defined in models and apply lightweight auto-migrations."""
    from backend import models  # noqa: F401 - ensure models are imported
    Base.metadata.create_all(bind=engine)

    # Auto-migration for SQLite: ensure district column in parties table
    if DATABASE_URL.startswith("sqlite"):
        with engine.connect() as conn:
            try:
                res = conn.execute(text("PRAGMA table_info(parties)")).fetchall()
                cols = [r[1] for r in res]
                if cols and "district" not in cols:
                    conn.execute(text("ALTER TABLE parties ADD COLUMN district VARCHAR(50)"))
                    conn.commit()
            except Exception:
                pass
