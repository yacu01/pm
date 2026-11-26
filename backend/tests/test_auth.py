def login(client, password="password"):
    return client.post("/api/login", json={"username": "user", "password": password})


def test_login_success_sets_http_only_cookie(client):
    response = login(client)
    assert response.status_code == 200
    assert response.json() == {"username": "user"}
    cookie = response.headers["set-cookie"]
    assert cookie.startswith("session=")
    assert "httponly" in cookie.lower()


def test_login_failure(client):
    response = login(client, password="wrong")
    assert response.status_code == 401
    assert "set-cookie" not in response.headers


def test_me_requires_session(client):
    assert client.get("/api/me").status_code == 401


def test_me_with_session(client):
    login(client)
    response = client.get("/api/me")
    assert response.status_code == 200
    assert response.json() == {"username": "user"}


def test_logout_clears_session(client):
    login(client)
    assert client.post("/api/logout").status_code == 200
    assert client.get("/api/me").status_code == 401


def test_tampered_cookie_rejected(client):
    client.cookies.set("session", "forged")
    assert client.get("/api/me").status_code == 401
