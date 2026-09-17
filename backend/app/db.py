from collections.abc import Iterator
from pathlib import Path

from alembic.config import Config
from sqlalchemy import create_engine, inspect
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from alembic import command
from app.config import get_settings


class Base(DeclarativeBase):
    pass


_engine: Engine | None = None
_session_factory: sessionmaker[Session] | None = None

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_BASELINE_REVISION = "0001"


def _run_migrations(engine: Engine) -> None:
    """Bring the schema to head, via Alembic, on the engine `init_engine` just built.

    A database created before Alembic existed has the baseline tables but no
    `alembic_version` row; stamp it at the baseline instead of re-running `CREATE
    TABLE` against tables that already exist, then apply anything newer.
    """
    config = Config(str(_BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(_BACKEND_DIR / "alembic"))

    with engine.begin() as connection:
        config.attributes["connection"] = connection
        if "alembic_version" not in inspect(connection).get_table_names() and "workouts" in inspect(
            connection
        ).get_table_names():
            command.stamp(config, _BASELINE_REVISION)
        command.upgrade(config, "head")


def init_engine(url: str | None = None) -> Engine:
    """Create (or recreate) the engine. Tests call this with an in-memory/temp database."""
    global _engine, _session_factory
    url = url or get_settings().database_url
    connect_args = {}
    if url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
        path = url.removeprefix("sqlite:///")
        if path and path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
    _engine = create_engine(url, connect_args=connect_args)
    _session_factory = sessionmaker(bind=_engine, expire_on_commit=False)

    from app import models  # noqa: F401  (register tables)

    _run_migrations(_engine)
    return _engine


def get_db() -> Iterator[Session]:
    if _session_factory is None:
        init_engine()
    assert _session_factory is not None
    with _session_factory() as session:
        yield session
