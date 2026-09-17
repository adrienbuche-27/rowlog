from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


_engine: Engine | None = None
_session_factory: sessionmaker[Session] | None = None


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

    Base.metadata.create_all(_engine)
    return _engine


def get_db() -> Iterator[Session]:
    if _session_factory is None:
        init_engine()
    assert _session_factory is not None
    with _session_factory() as session:
        yield session
