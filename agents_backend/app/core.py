import uuid
from datetime import datetime
from typing import Annotated, Literal

import fastapi
import pydantic
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic_ai import Agent
from pydantic_ai.exceptions import UnexpectedModelBehavior
from pydantic_ai.messages import (
    ModelMessage,
)
from typing_extensions import TypedDict

from app.agents import agents_list, get_agent
from app.db import Database, Session
from app.login import CurrentUser, get_current_user

router = APIRouter(
    tags=["core"],
    dependencies=[Depends(get_current_user)],
)


async def get_db(request: Request) -> Database:
    return request.app.state.db


@router.get("/chat/")
async def get_chat(session_id: str, user: CurrentUser, database: Database = Depends(get_db)) -> list[ModelMessage]:
    msgs = await database.get_messages(session_id, user)
    return msgs


@router.get("/agents/")
async def get_agents() -> list[str]:
    return agents_list()


@router.get("/sessions/")
async def get_sessions(user: CurrentUser, database: Database = Depends(get_db)) -> list[Session]:
    sessions = await database.get_sessions(user)
    return sessions


class NewSessionRequest(pydantic.BaseModel):
    agent_name: str = "search_bot"


@router.post("/sessions/new")
async def create_new_session(
    request: NewSessionRequest, user: CurrentUser, database: Database = Depends(get_db)
) -> dict[str, str]:
    """Generate a new session ID and initialize with the selected agent"""
    session_id = f"session-{datetime.utcnow().timestamp()}-{uuid.uuid4().hex[:8]}"
    # Create the session with the specified agent
    await database._ensure_session_exists(session_id, user, request.agent_name)
    return {"session_id": session_id, "agent_name": request.agent_name}


@router.delete("/sessions/{session_id}")
async def delete_session_path(
    session_id: str, user: CurrentUser, database: Database = Depends(get_db)
) -> dict[str, bool]:
    """Delete a session and its messages using path parameter"""
    print(f"Deleting session with ID (path): {session_id}")
    success = await database.delete_session(session_id, user)
    return {"success": success}


class ChatMessage(TypedDict):
    """Format of messages sent to the browser."""

    role: Literal["user", "model"]
    timestamp: str
    content: str


NodeAdapter: pydantic.TypeAdapter[ModelMessage] = pydantic.TypeAdapter(
    ModelMessage, config=pydantic.ConfigDict(defer_build=True, ser_json_bytes="base64", val_json_bytes="base64")
)


@router.post("/chat/")
async def post_chat(
    prompt: Annotated[str, fastapi.Form()],
    session_id: Annotated[str, fastapi.Form()],
    user: CurrentUser,
    database: Database = Depends(get_db),
) -> StreamingResponse:
    async def stream_messages():
        yield (prompt.encode("utf-8") + b"\n")

        agent_name = await database.get_session_agent(session_id, user)

        agent = get_agent(agent_name)

        messages = await database.get_messages(session_id, user)
        async with agent.iter(prompt, message_history=messages) as agent_run:
            async for node in agent_run:
                if Agent.is_user_prompt_node(node):
                    # yield (str(node).encode("utf-8") + b"\n")
                    pass
                elif Agent.is_model_request_node(node):
                    yield NodeAdapter.dump_json(node.request)
                elif Agent.is_call_tools_node(node):
                    yield NodeAdapter.dump_json(node.model_response)
                elif Agent.is_end_node(node):
                    pass
                    # yield NodeAdapter.dump_json(node)
                else:
                    raise UnexpectedModelBehavior(f"Unexpected message type for chat app: {node}")
            await database.add_messages(session_id, agent_run.result.new_messages_json(), user, agent_name)

    return StreamingResponse(stream_messages(), media_type="text/plain")
