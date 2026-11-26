import json
import os
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app import ai, db
from app.main import app

SEED = json.loads(db.SEED_BOARD.read_text())


def ai_board(board: dict) -> ai.AIBoard:
    return ai.AIBoard(columns=board["columns"], cards=list(board["cards"].values()))


@pytest.fixture
def model(signed_in):
    """Replace the OpenAI client; set model.response to control what the AI returns."""
    client = MagicMock()
    client.chat.completions.parse.side_effect = lambda **kwargs: SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(parsed=client.response))]
    )
    app.dependency_overrides[ai.get_client] = lambda: client
    yield client
    app.dependency_overrides.clear()


def send(client, message="Hi", history=()):
    return client.post("/api/chat", json={"message": message, "history": list(history)})


def test_reply_only_leaves_board_unchanged(signed_in, model):
    model.response = ai.AIResponse(reply="Hello!", board=None)
    response = send(signed_in)
    assert response.status_code == 200
    assert response.json() == {"reply": "Hello!", "board": None}
    assert signed_in.get("/api/board").json() == SEED


def test_reply_with_board_saves_it(signed_in, model):
    board = json.loads(json.dumps(SEED))
    board["cards"]["card-new"] = {"id": "card-new", "title": "From AI", "details": ""}
    board["columns"][0]["cardIds"].append("card-new")
    board["columns"][4]["cardIds"].append(board["columns"][1]["cardIds"].pop())
    model.response = ai.AIResponse(reply="Done.", board=ai_board(board))

    response = send(signed_in, "Add a card and move one")
    assert response.json() == {"reply": "Done.", "board": board}
    assert signed_in.get("/api/board").json() == board


def test_invalid_board_is_not_saved(signed_in, model):
    board = json.loads(json.dumps(SEED))
    board["columns"][0]["cardIds"].append("card-missing")
    model.response = ai.AIResponse(reply="Done.", board=ai_board(board))

    response = send(signed_in)
    assert response.status_code == 200
    assert response.json()["board"] is None
    assert "not saved" in response.json()["reply"]
    assert signed_in.get("/api/board").json() == SEED


def test_changed_columns_are_not_saved(signed_in, model):
    board = json.loads(json.dumps(SEED))
    board["columns"].reverse()
    model.response = ai.AIResponse(reply="Done.", board=ai_board(board))

    assert send(signed_in).json()["board"] is None
    assert signed_in.get("/api/board").json() == SEED


def test_request_includes_board_history_and_message(signed_in, model):
    model.response = ai.AIResponse(reply="Sure.", board=None)
    history = [{"role": "user", "content": "Earlier"}, {"role": "assistant", "content": "Reply"}]
    send(signed_in, "Now", history)

    kwargs = model.chat.completions.parse.call_args.kwargs
    assert kwargs["model"] == "openai/gpt-oss-120b"
    assert kwargs["response_format"] is ai.AIResponse
    messages = kwargs["messages"]
    assert messages[0]["role"] == "system"
    assert json.dumps(SEED) in messages[0]["content"]
    assert messages[1:] == [*history, {"role": "user", "content": "Now"}]


def test_chat_requires_session(client):
    assert send(client).status_code == 401


def test_test_route_removed(signed_in):
    assert signed_in.post("/api/ai/test").status_code in (404, 405)


@pytest.mark.skipif(not os.environ.get("OPENROUTER_API_KEY"), reason="OPENROUTER_API_KEY not set")
def test_openrouter_adds_card(signed_in):
    response = send(signed_in, 'Add a card called "Write release notes" to the Backlog column.')
    assert response.status_code == 200
    board = signed_in.get("/api/board").json()
    titles = {board["cards"][card_id]["title"] for card_id in board["columns"][0]["cardIds"]}
    assert "Write release notes" in titles
