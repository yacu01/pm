import json
import os
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from openai import OpenAI
from pydantic import BaseModel, ValidationError

from app import board, db
from app.auth import current_user_id

MODEL = "openai/gpt-oss-120b"

SYSTEM_PROMPT = """You are the assistant in a Kanban project management app. The user has one board with 5 fixed columns. You can answer questions about the board and change it: create, edit, move and delete cards, and rename columns.

The current board is below as JSON. "columns" is in display order; each column's "cardIds" lists its cards in display order. "cards" lists every card.

Rules for changing the board:
- Return the complete updated board in "board", including everything that did not change.
- Keep all 5 columns with the same ids in the same order. You may change column titles.
- Every card must be in exactly one column's cardIds, and every id in cardIds must be a card in "cards".
- New cards need a new unique id such as "card-<short-random-text>". Card titles must not be empty.
- If the user is not asking for a change, set "board" to null.

Always put a short, friendly message for the user in "reply", describing what you changed if anything.

Current board:
{board}"""

router = APIRouter(prefix="/api")


class AICard(BaseModel):
    id: str
    title: str
    details: str


class AIColumn(BaseModel):
    id: str
    title: str
    cardIds: list[str]


class AIBoard(BaseModel):
    """Board shape for the model: cards as a list, since strict Structured Outputs cannot describe a map."""

    columns: list[AIColumn]
    cards: list[AICard]


class AIResponse(BaseModel):
    reply: str
    board: AIBoard | None


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


class ChatResponse(BaseModel):
    reply: str
    board: board.BoardData | None


def get_client() -> OpenAI:
    return OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=os.environ["OPENROUTER_API_KEY"],
    )


@router.post("/chat")
def chat(
    request: ChatRequest,
    user_id: Annotated[int, Depends(current_user_id)],
    client: Annotated[OpenAI, Depends(get_client)],
) -> ChatResponse:
    current = db.get_board(user_id)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT.format(board=json.dumps(current))},
        *[message.model_dump() for message in request.history],
        {"role": "user", "content": request.message},
    ]
    completion = client.chat.completions.parse(
        model=MODEL, messages=messages, response_format=AIResponse
    )
    result = completion.choices[0].message.parsed
    if result.board is None:
        return ChatResponse(reply=result.reply, board=None)

    try:
        updated = board.BoardData.model_validate(
            {
                "columns": [column.model_dump() for column in result.board.columns],
                "cards": {card.id: card.model_dump() for card in result.board.cards},
            }
        )
        board.save(user_id, updated)
    except (ValidationError, HTTPException):
        return ChatResponse(
            reply=f"{result.reply}\n\n(The board change was invalid, so it was not saved.)",
            board=None,
        )
    return ChatResponse(reply=result.reply, board=updated)
