from typing import Annotated, Self

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from app import db
from app.auth import current_user_id

router = APIRouter(prefix="/api")


class Card(BaseModel):
    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    details: str


class Column(BaseModel):
    id: str = Field(min_length=1)
    title: str
    cardIds: list[str]


class BoardData(BaseModel):
    columns: list[Column] = Field(min_length=5, max_length=5)
    cards: dict[str, Card]

    @model_validator(mode="after")
    def check_references(self) -> Self:
        if len({column.id for column in self.columns}) != len(self.columns):
            raise ValueError("Column ids must be unique")
        for key, card in self.cards.items():
            if key != card.id:
                raise ValueError(f"Card key {key} does not match id {card.id}")
        placed = [card_id for column in self.columns for card_id in column.cardIds]
        if len(placed) != len(set(placed)):
            raise ValueError("A card appears in more than one column")
        if set(placed) != set(self.cards):
            raise ValueError("Every card must be in exactly one column")
        return self


UserId = Annotated[int, Depends(current_user_id)]


@router.get("/board")
def get_board(user_id: UserId) -> BoardData:
    return BoardData.model_validate(db.get_board(user_id))


def save(user_id: int, board: BoardData):
    """Save the board, rejecting changes to the column ids or their order."""
    stored_ids = [column["id"] for column in db.get_board(user_id)["columns"]]
    if [column.id for column in board.columns] != stored_ids:
        raise HTTPException(status_code=422, detail="Columns cannot be added, removed or reordered")
    db.save_board(user_id, board.model_dump())


@router.put("/board")
def put_board(board: BoardData, user_id: UserId) -> BoardData:
    save(user_id, board)
    return board
