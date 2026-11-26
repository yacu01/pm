from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app import db

router = APIRouter(prefix="/api")


class Credentials(BaseModel):
    username: str
    password: str


def current_user(request: Request) -> str:
    user = request.session.get("user")
    if not user:
        raise HTTPException(status_code=401, detail="Not signed in")
    return user


def current_user_id(request: Request) -> int:
    user = db.get_user(current_user(request))
    if user is None:
        raise HTTPException(status_code=401, detail="Not signed in")
    return user[0]


@router.post("/login")
def login(credentials: Credentials, request: Request):
    user = db.get_user(credentials.username)
    if user is None or not db.verify_password(credentials.password, user[1]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    request.session["user"] = credentials.username
    return {"username": credentials.username}


@router.post("/logout")
def logout(request: Request):
    request.session.clear()
    return {"status": "ok"}


@router.get("/me")
def me(request: Request):
    return {"username": current_user(request)}
