from collections.abc import Generator

from sqlalchemy import event, text
from sqlmodel import Session, SQLModel, create_engine

from app.config import settings

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args)

if settings.database_url.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def _sqlite_fk(dbapi_conn, _connection_record) -> None:
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()


def _sqlite_add_user_phone_column() -> None:
    if not settings.database_url.startswith("sqlite"):
        return
    with engine.begin() as conn:
        rows = conn.execute(text("PRAGMA table_info(user)")).fetchall()
        colnames = {str(r[1]) for r in rows}
        if "phone" not in colnames:
            try:
                conn.execute(text("ALTER TABLE user ADD COLUMN phone VARCHAR"))
            except Exception:
                pass


def _sqlite_add_user_profile_columns() -> None:
    if not settings.database_url.startswith("sqlite"):
        return
    with engine.begin() as conn:
        rows = conn.execute(text("PRAGMA table_info(user)")).fetchall()
        colnames = {str(r[1]) for r in rows}
        for col, ddl in (
            ("first_name", "ALTER TABLE user ADD COLUMN first_name VARCHAR(120) DEFAULT ''"),
            ("last_name", "ALTER TABLE user ADD COLUMN last_name VARCHAR(120) DEFAULT ''"),
            ("niche", "ALTER TABLE user ADD COLUMN niche VARCHAR(200)"),
        ):
            if col not in colnames:
                try:
                    conn.execute(text(ddl))
                except Exception:
                    pass


def _sqlite_add_fieldzone_iot_columns() -> None:
    """Добавить колонки IoT к существующей SQLite-таблице fieldzone (create_all не меняет схему)."""
    if not settings.database_url.startswith("sqlite"):
        return
    with engine.begin() as conn:
        rows = conn.execute(text("PRAGMA table_info(fieldzone)")).fetchall()
        colnames = {str(r[1]) for r in rows}
        for col, ddl in (
            ("soil_ph", "ALTER TABLE fieldzone ADD COLUMN soil_ph FLOAT"),
            ("soil_ec_ds_m", "ALTER TABLE fieldzone ADD COLUMN soil_ec_ds_m FLOAT"),
            ("soil_temp_c", "ALTER TABLE fieldzone ADD COLUMN soil_temp_c FLOAT"),
        ):
            if col not in colnames:
                try:
                    conn.execute(text(ddl))
                except Exception:
                    pass


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    _sqlite_add_user_phone_column()
    _sqlite_add_user_profile_columns()
    _sqlite_add_fieldzone_iot_columns()


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
