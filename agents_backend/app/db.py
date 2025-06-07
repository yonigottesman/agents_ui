from __future__ import annotations as _annotations

import asyncio
import sqlite3
from collections.abc import AsyncIterator
from concurrent.futures.thread import ThreadPoolExecutor
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime
from functools import partial
from pathlib import Path
from typing import Any, Callable, TypeVar

from pydantic_ai.messages import (
    ModelMessage,
    ModelMessagesTypeAdapter,
)
from typing_extensions import LiteralString, ParamSpec, TypedDict

THIS_DIR = Path(__file__).parent


P = ParamSpec("P")
R = TypeVar("R")


class Session(TypedDict):
    """Format of session data."""

    id: str
    title: str
    created_at: str
    last_message_at: str
    agent_name: str


@dataclass
class Database:
    """Rudimentary database to store chat messages in SQLite.

    The SQLite standard library package is synchronous, so we
    use a thread pool executor to run queries asynchronously.
    """

    con: sqlite3.Connection
    _loop: asyncio.AbstractEventLoop
    _executor: ThreadPoolExecutor

    @classmethod
    @asynccontextmanager
    async def connect(cls, file: Path = THIS_DIR / ".chat_app_messages.sqlite") -> AsyncIterator[Database]:
        loop = asyncio.get_event_loop()
        executor = ThreadPoolExecutor(max_workers=1)
        con = await loop.run_in_executor(executor, cls._connect, file)
        slf = cls(con, loop, executor)
        try:
            yield slf
        finally:
            await slf._asyncify(con.close)

    @staticmethod
    def _connect(file: Path) -> sqlite3.Connection:
        con = sqlite3.connect(str(file))
        cur = con.cursor()
        # Create sessions table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_message_at TEXT NOT NULL,
                agent_name TEXT DEFAULT 'search_bot'
            );
        """)
        # Update messages table to include session_id
        cur.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                message_list TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            );
        """)
        con.commit()
        return con

    async def add_messages(self, session_id: str, messages: bytes, agent_name: str = "search_bot"):
        # First, ensure the session exists
        await self._ensure_session_exists(session_id, agent_name)

        # Add the messages
        await self._asyncify(
            self._execute,
            "INSERT INTO messages (session_id, message_list, created_at) VALUES (?, ?, ?);",
            session_id,
            messages,
            datetime.utcnow().isoformat(),
            commit=True,
        )

        # Update last_message_at for the session
        await self._asyncify(
            self._execute,
            "UPDATE sessions SET last_message_at = ? WHERE id = ?;",
            datetime.utcnow().isoformat(),
            session_id,
            commit=True,
        )

        await self._asyncify(self.con.commit)

    async def get_messages(self, session_id: str) -> list[ModelMessage]:
        c = await self._asyncify(
            self._execute, "SELECT message_list FROM messages WHERE session_id = ? ORDER BY id", session_id
        )
        rows = await self._asyncify(c.fetchall)
        messages: list[ModelMessage] = []
        for row in rows:
            messages.extend(ModelMessagesTypeAdapter.validate_json(row[0]))
        return messages

    async def get_session_agent(self, session_id: str) -> str:
        """Get the agent name for a specific session"""
        c = await self._asyncify(self._execute, "SELECT agent_name FROM sessions WHERE id = ?", session_id)
        row = await self._asyncify(c.fetchone)
        if row and row[0]:
            return row[0]
        return "search_bot"  # Default to search_bot if not found

    async def get_sessions(self) -> list[Session]:
        c = await self._asyncify(
            self._execute,
            "SELECT id, title, created_at, last_message_at, agent_name FROM sessions ORDER BY last_message_at DESC",
        )
        rows = await self._asyncify(c.fetchall)
        sessions: list[Session] = []
        for row in rows:
            sessions.append(
                {
                    "id": row[0],
                    "title": row[1],
                    "created_at": row[2],
                    "last_message_at": row[3],
                    "agent_name": row[4]
                    if len(row) > 4
                    else "search_bot",  # Default to search_bot for backward compatibility
                }
            )
        return sessions

    async def delete_session(self, session_id: str) -> bool:
        """Delete a session and its messages"""
        try:
            # First delete all messages for this session
            await self._asyncify(
                self._execute,
                "DELETE FROM messages WHERE session_id = ?",
                session_id,
                commit=True,
            )

            # Then delete the session
            await self._asyncify(
                self._execute,
                "DELETE FROM sessions WHERE id = ?",
                session_id,
                commit=True,
            )

            return True
        except Exception as e:
            print(f"Error deleting session: {e}")
            return False

    async def _ensure_session_exists(self, session_id: str, agent_name: str = "search_bot"):
        # Check if session exists
        c = await self._asyncify(self._execute, "SELECT id, agent_name FROM sessions WHERE id = ?", session_id)
        row = await self._asyncify(c.fetchone)

        if not row:
            # Create new session with a default title
            await self._asyncify(
                self._execute,
                "INSERT INTO sessions (id, title, created_at, last_message_at, agent_name) VALUES (?, ?, ?, ?, ?);",
                session_id,
                f"{agent_name} {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}",
                datetime.utcnow().isoformat(),
                datetime.utcnow().isoformat(),
                agent_name,
                commit=True,
            )

    def _execute(self, sql: LiteralString, *args: Any, commit: bool = False) -> sqlite3.Cursor:
        cur = self.con.cursor()
        cur.execute(sql, args)
        if commit:
            self.con.commit()
        return cur

    async def _asyncify(self, func: Callable[P, R], *args: P.args, **kwargs: P.kwargs) -> R:
        return await self._loop.run_in_executor(  # type: ignore
            self._executor,
            partial(func, **kwargs),
            *args,  # type: ignore
        )
