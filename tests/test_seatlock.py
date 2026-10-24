"""Automated tests for SeatLock core flows.

Run from ~/workspace/seatlock:
    python -m pytest -q
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

from app import create_app
from models import Seat, SeatHold, db
from seed import seed_data


@pytest.fixture()
def app(tmp_path):
    db_path = tmp_path / "test.db"
    application = create_app(
        config_overrides={
            "TESTING": True,
            "RATELIMIT_ENABLED": False,
            "BACKGROUND_CLEANUP": False,
            "SQLALCHEMY_DATABASE_URI": f"sqlite:///{db_path}",
            "HOLD_SECONDS": 600,
        }
    )
    with application.app_context():
        db.create_all()
        seed_data(application)
    yield application
    with application.app_context():
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


def login(client, email, password):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.get_json()
    return r.get_json()["token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def first_show_and_seats(client):
    r = client.get("/api/events")
    assert r.status_code == 200
    events = r.get_json()["events"]
    assert len(events) >= 2
    show_id = events[0]["shows"][0]["id"]
    r = client.get(f"/api/shows/{show_id}/seats?status=available")
    seats = r.get_json()["seats"]
    assert len(seats) >= 4
    return show_id, seats


def test_register_login_and_list_events(client):
    r = client.post("/api/auth/register", json={
        "name": "Test User", "email": "test@example.com", "password": "secret123"})
    assert r.status_code == 201
    assert "token" in r.get_json()
    token = login(client, "test@example.com", "secret123")
    r = client.get("/api/auth/me", headers=auth(token))
    assert r.status_code == 200
    assert r.get_json()["user"]["email"] == "test@example.com"


def test_seat_hold(client, app):
    token = login(client, "demo@seatlock.local", "Demo123!")
    show_id, seats = first_show_and_seats(client)
    seat_ids = [seats[0]["id"], seats[1]["id"]]
    r = client.post(f"/api/shows/{show_id}/holds", json={"seat_ids": seat_ids},
                    headers=auth(token))
    assert r.status_code == 201, r.get_json()
    # Held seats are no longer listed as available.
    r = client.get(f"/api/shows/{show_id}/seats?status=available")
    available_ids = {s["id"] for s in r.get_json()["seats"]}
    assert seat_ids[0] not in available_ids
    assert seat_ids[1] not in available_ids


def test_double_booking_prevention(client, app):
    token_a = login(client, "demo@seatlock.local", "Demo123!")
    # Second user
    client.post("/api/auth/register", json={
        "name": "Second", "email": "second@example.com", "password": "secret123"})
    token_b = login(client, "second@example.com", "secret123")

    show_id, seats = first_show_and_seats(client)
    seat_id = seats[0]["id"]

    # User A holds, then books.
    r = client.post(f"/api/shows/{show_id}/holds", json={"seat_ids": [seat_id]},
                    headers=auth(token_a))
    assert r.status_code == 201
    r = client.post(f"/api/shows/{show_id}/bookings",
                    json={"seat_ids": [seat_id], "idempotency_key": "pay-a-1"},
                    headers=auth(token_a))
    assert r.status_code == 201, r.get_json()

    # User B cannot hold the already-booked seat.
    r = client.post(f"/api/shows/{show_id}/holds", json={"seat_ids": [seat_id]},
                    headers=auth(token_b))
    assert r.status_code == 409

    # User B cannot book it either (no hold, seat booked).
    r = client.post(f"/api/shows/{show_id}/bookings",
                    json={"seat_ids": [seat_id], "idempotency_key": "pay-b-1"},
                    headers=auth(token_b))
    assert r.status_code in (400, 409)


def test_hold_expiry_releases_seat(client, app):
    # Shorten the hold for this test by editing the live hold's expiry.
    token = login(client, "demo@seatlock.local", "Demo123!")
    show_id, seats = first_show_and_seats(client)
    seat_id = seats[0]["id"]
    r = client.post(f"/api/shows/{show_id}/holds", json={"seat_ids": [seat_id]},
                    headers=auth(token))
    assert r.status_code == 201

    # Force the hold into the past, then any seat request must expire it.
    with app.app_context():
        hold = SeatHold.query.filter_by(seat_id=seat_id, status="active").first()
        assert hold is not None
        from datetime import datetime, timedelta
        hold.expires_at = datetime.utcnow() - timedelta(seconds=1)
        db.session.commit()

    r = client.get(f"/api/shows/{show_id}/seats?status=available")
    available_ids = {s["id"] for s in r.get_json()["seats"]}
    assert seat_id in available_ids
    with app.app_context():
        seat = Seat.query.get(seat_id)
        assert seat.status == "available"


def test_idempotent_payment_booking(client, app):
    token = login(client, "demo@seatlock.local", "Demo123!")
    show_id, seats = first_show_and_seats(client)
    seat_ids = [seats[0]["id"], seats[1]["id"]]
    r = client.post(f"/api/shows/{show_id}/holds", json={"seat_ids": seat_ids},
                    headers=auth(token))
    assert r.status_code == 201

    payload = {"seat_ids": seat_ids, "idempotency_key": "idem-123"}
    r1 = client.post(f"/api/shows/{show_id}/bookings", json=payload,
                     headers=auth(token))
    assert r1.status_code == 201, r1.get_json()
    booking_id = r1.get_json()["booking"]["id"]

    # Exact replay with the same key must NOT create a second booking/payment.
    r2 = client.post(f"/api/shows/{show_id}/bookings", json=payload,
                     headers=auth(token))
    assert r2.status_code == 200
    assert r2.get_json()["replayed"] is True
    assert r2.get_json()["booking"]["id"] == booking_id

    r = client.get("/api/bookings/me", headers=auth(token))
    assert len(r.get_json()["bookings"]) == 1


def test_cancel_and_rebook(client, app):
    token = login(client, "demo@seatlock.local", "Demo123!")
    show_id, seats = first_show_and_seats(client)
    seat_id = seats[0]["id"]
    client.post(f"/api/shows/{show_id}/holds", json={"seat_ids": [seat_id]},
                headers=auth(token))
    r = client.post(f"/api/shows/{show_id}/bookings",
                    json={"seat_ids": [seat_id], "idempotency_key": "cancel-1"},
                    headers=auth(token))
    assert r.status_code == 201
    booking_id = r.get_json()["booking"]["id"]

    r = client.post(f"/api/bookings/{booking_id}/cancel", headers=auth(token))
    assert r.status_code == 200
    assert r.get_json()["booking"]["status"] == "cancelled"
    assert r.get_json()["booking"]["payment"]["status"] == "refunded"

    # Seat is free again: hold + book with a new key.
    r = client.post(f"/api/shows/{show_id}/holds", json={"seat_ids": [seat_id]},
                    headers=auth(token))
    assert r.status_code == 201
    r = client.post(f"/api/shows/{show_id}/bookings",
                    json={"seat_ids": [seat_id], "idempotency_key": "cancel-2"},
                    headers=auth(token))
    assert r.status_code == 201


def test_waitlist_and_admin(client, app):
    admin_token = login(client, "admin@seatlock.local", "Admin123!")
    r = client.post("/api/admin/events", json={
        "title": "Test Event", "venue": "Test Hall", "category": "Test"},
        headers=auth(admin_token))
    assert r.status_code == 201
    event_id = r.get_json()["event"]["id"]
    r = client.post(f"/api/admin/events/{event_id}/shows", json={
        "start_time": "2027-01-15T19:00:00",
        "seat_layout": {"rows": ["A"], "seats_per_row": 5}},
        headers=auth(admin_token))
    assert r.status_code == 201
    assert r.get_json()["seats_created"] == 5

    demo_token = login(client, "demo@seatlock.local", "Demo123!")
    show_id = r.get_json()["show"]["id"]
    r = client.post(f"/api/shows/{show_id}/waitlist",
                    json={"seats_requested": 2}, headers=auth(demo_token))
    assert r.status_code == 201
    assert r.get_json()["waitlist_entry"]["status"] == "waiting"


def test_holds_me_release_and_limits(client, app):
    token = login(client, "demo@seatlock.local", "Demo123!")
    show_id, seats = first_show_and_seats(client)
    ids = [seats[0]["id"], seats[1]["id"]]
    r = client.post(f"/api/shows/{show_id}/holds", json={"seat_ids": ids},
                    headers=auth(token))
    assert r.status_code == 201
    assert r.get_json()["holds"][0]["seconds_left"] > 0

    # Active holds can be restored after a page refresh.
    r = client.get(f"/api/holds/me?show_id={show_id}", headers=auth(token))
    group = r.get_json()["holds"][0]
    assert {h["seat_id"] for h in group["holds"]} == set(ids)
    assert group["total"] == sum(h["seat"]["price"] for h in group["holds"])
    assert group["show"]["event_title"]

    # Releasing frees the seats again.
    r = client.delete(f"/api/shows/{show_id}/holds", headers=auth(token))
    assert r.get_json()["released"] == 2
    r = client.get(f"/api/shows/{show_id}/seats?status=available")
    assert ids[0] in {s["id"] for s in r.get_json()["seats"]}
    assert client.get("/api/holds/me", headers=auth(token)).get_json()["holds"] == []

    # Over the per-hold cap is rejected.
    many = [s["id"] for s in seats[:9]]
    r = client.post(f"/api/shows/{show_id}/holds", json={"seat_ids": many},
                    headers=auth(token))
    assert r.status_code == 400


def test_booking_has_show_and_waitlist_no_duplicates(client, app):
    token = login(client, "demo@seatlock.local", "Demo123!")
    show_id, seats = first_show_and_seats(client)
    sid = seats[0]["id"]
    client.post(f"/api/shows/{show_id}/holds", json={"seat_ids": [sid]}, headers=auth(token))
    r = client.post(f"/api/shows/{show_id}/bookings",
                    json={"seat_ids": [sid], "idempotency_key": "k-show"}, headers=auth(token))
    assert r.get_json()["booking"]["show"]["venue"]

    assert client.post(f"/api/shows/{show_id}/waitlist", json={}, headers=auth(token)).status_code == 201
    assert client.post(f"/api/shows/{show_id}/waitlist", json={}, headers=auth(token)).status_code == 409


def test_unknown_api_path_is_json_404(client):
    r = client.get("/api/nope")
    assert r.status_code == 404
    assert r.get_json()["error"] == "not found"


# ---------------- admin: passes, images, edit, delete ----------------

def admin_headers(client):
    return auth(login(client, "admin@seatlock.local", "Admin123!"))


def test_admin_event_with_image_and_custom_passes(client):
    h = admin_headers(client)
    r = client.post("/api/admin/events", headers=h, json={
        "title": "Jazz Night", "venue": "Hall", "category": "Music",
        "image_url": "https://example.com/a.jpg"})
    assert r.status_code == 201
    ev = r.get_json()["event"]
    assert ev["image_url"] == "https://example.com/a.jpg"

    bad = client.post("/api/admin/events", headers=h, json={"title": "x", "image_url": "javascript:alert(1)"})
    assert bad.status_code == 400

    r = client.post(f"/api/admin/events/{ev['id']}/shows", headers=h, json={
        "start_time": "2026-12-20T19:00:00",
        "seat_layout": {"seats_per_row": 6, "passes": [
            {"name": "Gold Circle", "price": 1500, "rows": 2},
            {"name": "Early Bird", "price": 300, "rows": 3}]}})
    assert r.status_code == 201, r.get_json()
    assert r.get_json()["seats_created"] == 30
    show_id = r.get_json()["show"]["id"]
    seats = client.get(f"/api/shows/{show_id}/seats").get_json()["seats"]
    assert {s["category"] for s in seats} == {"Gold Circle", "Early Bird"}
    assert {s["price"] for s in seats if s["category"] == "Early Bird"} == {300}


def test_pass_validation(client):
    h = admin_headers(client)
    ev = client.post("/api/admin/events", headers=h, json={"title": "T"}).get_json()["event"]
    url = f"/api/admin/events/{ev['id']}/shows"
    base = {"start_time": "2026-12-20T19:00:00"}
    for passes in ([], [{"name": "", "price": 1, "rows": 1}],
                   [{"name": "A", "price": 1, "rows": 1}, {"name": "a", "price": 2, "rows": 1}],
                   [{"name": "A", "price": -5, "rows": 1}],
                   [{"name": "A", "price": 5, "rows": 27}]):
        r = client.post(url, headers=h, json={**base, "seat_layout": {"passes": passes}})
        assert r.status_code == 400, passes
    # nothing half-created
    assert client.get(f"/api/events/{ev['id']}").get_json()["event"]["shows"] == []


def test_edit_event_show_and_delete(client):
    h = admin_headers(client)
    ev = client.post("/api/admin/events", headers=h, json={"title": "Old"}).get_json()["event"]
    r = client.patch(f"/api/admin/events/{ev['id']}", headers=h, json={"title": "New", "venue": "V"})
    assert r.status_code == 200 and r.get_json()["event"]["title"] == "New"

    show = client.post(f"/api/admin/events/{ev['id']}/shows", headers=h, json={
        "start_time": "2026-12-20T19:00:00",
        "seat_layout": {"seats_per_row": 4, "passes": [{"name": "Std", "price": 100, "rows": 2}]}}).get_json()["show"]
    r = client.patch(f"/api/admin/shows/{show['id']}", headers=h, json={
        "start_time": "2026-12-21T20:30:00",
        "passes": [{"current_name": "Std", "name": "Regular", "price": 250}]})
    assert r.status_code == 200
    assert r.get_json()["passes"][0]["name"] == "Regular"
    assert r.get_json()["passes"][0]["price"] == 250
    assert r.get_json()["show"]["start_time"].startswith("2026-12-21T20:30")

    assert client.delete(f"/api/admin/shows/{show['id']}", headers=h).status_code == 200
    assert client.delete(f"/api/admin/events/{ev['id']}", headers=h).status_code == 200
    assert client.get(f"/api/events/{ev['id']}").status_code == 404


def test_cannot_delete_booked_show_and_admin_only(client):
    h = admin_headers(client)
    show_id, seats = first_show_and_seats(client)[:2]
    seat_ids = [x["id"] if isinstance(x, dict) else x for x in seats]
    user = auth(login(client, "demo@seatlock.local", "Demo123!"))
    assert client.patch("/api/admin/events/1", headers=user, json={"title": "x"}).status_code == 403
    client.post(f"/api/shows/{show_id}/holds", headers=user, json={"seat_ids": seat_ids[:1]})
    r = client.post(f"/api/shows/{show_id}/bookings", headers={**user, "Idempotency-Key": "k1"}, json={"seat_ids": seat_ids[:1]})
    assert r.status_code in (200, 201), r.get_json()
    assert client.delete(f"/api/admin/shows/{show_id}", headers=h).status_code == 409


def test_image_upload(client, app, tmp_path):
    app.config["UPLOAD_DIR"] = str(tmp_path / "up")
    h = admin_headers(client)
    import io
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 50
    r = client.post("/api/admin/uploads", headers=h, data={"file": (io.BytesIO(png), "a.png")}, content_type="multipart/form-data")
    assert r.status_code == 201, r.get_json()
    url = r.get_json()["url"]
    assert client.get(url).status_code == 200
    r = client.post("/api/admin/uploads", headers=h, data={"file": (io.BytesIO(b"<svg onload=1>"), "a.svg")}, content_type="multipart/form-data")
    assert r.status_code == 400


# ---------------- roles: customer vs event creator ----------------

def register(client, role, email):
    r = client.post("/api/auth/register", json={"name": "N", "email": email, "password": "secret1", "role": role})
    assert r.status_code == 201, r.get_json()
    return r.get_json()


def test_register_roles(client):
    c = register(client, "customer", "c@example.com")
    assert c["user"]["role"] == "customer" and c["user"]["is_admin"] is False
    o = register(client, "creator", "o@example.com")
    assert o["user"]["role"] == "creator" and o["user"]["is_admin"] is True
    bad = client.post("/api/auth/register", json={"name": "N", "email": "z@example.com", "password": "secret1", "role": "admin"})
    assert bad.status_code == 400
    # No role given means customer.
    d = client.post("/api/auth/register", json={"name": "N", "email": "d@example.com", "password": "secret1"})
    assert d.get_json()["user"]["role"] == "customer"


def test_customers_cannot_create_events(client):
    c = register(client, "customer", "c2@example.com")
    r = client.post("/api/admin/events", headers=auth(c["token"]), json={"title": "Nope"})
    assert r.status_code == 403


def test_creators_only_manage_their_own_events(client):
    a = register(client, "creator", "a@example.com")
    b = register(client, "creator", "b@example.com")
    ev = client.post("/api/admin/events", headers=auth(a["token"]), json={"title": "A's event"}).get_json()["event"]
    assert ev["creator_id"] == a["user"]["id"]
    # B cannot edit, delete, or add shows to A's event.
    assert client.patch(f"/api/admin/events/{ev['id']}", headers=auth(b["token"]), json={"title": "x"}).status_code == 403
    assert client.delete(f"/api/admin/events/{ev['id']}", headers=auth(b["token"])).status_code == 403
    assert client.post(f"/api/admin/events/{ev['id']}/shows", headers=auth(b["token"]),
                       json={"start_time": "2026-12-01T10:00:00", "seat_layout": {"seats_per_row": 2, "passes": [{"name": "GA", "price": 100, "rows": 1}]}}).status_code == 403
    # B's own list does not include A's event; A's does.
    mine_b = client.get("/api/admin/events", headers=auth(b["token"])).get_json()["events"]
    mine_a = client.get("/api/admin/events", headers=auth(a["token"])).get_json()["events"]
    assert ev["id"] not in [e["id"] for e in mine_b]
    assert ev["id"] in [e["id"] for e in mine_a]


def test_event_cover_design_choice(client):
    h = admin_headers(client)
    ok = client.post("/api/admin/events", headers=h, json={"title": "D", "image_url": "art:stage:3"})
    assert ok.status_code == 201 and ok.get_json()["event"]["image_url"] == "art:stage:3"
    for bad in ("art:nope:1", "art:stage:9", "art:stage"):
        assert client.post("/api/admin/events", headers=h, json={"title": "D", "image_url": bad}).status_code == 400


def test_cancelled_bookings_do_not_block_delete(client):
    h = admin_headers(client)
    ev = client.post("/api/admin/events", headers=h, json={"title": "Del"}).get_json()["event"]
    show = client.post(f"/api/admin/events/{ev['id']}/shows", headers=h, json={
        "start_time": "2026-12-20T18:00:00",
        "seat_layout": {"seats_per_row": 3, "passes": [{"name": "GA", "price": 100, "rows": 2}]}}).get_json()["show"]
    user = auth(login(client, "demo@seatlock.local", "Demo123!"))
    seats = client.get(f"/api/shows/{show['id']}/seats").get_json()["seats"]
    ids = [seats[0]["id"], seats[1]["id"]]
    assert client.post(f"/api/shows/{show['id']}/holds", headers=user, json={"seat_ids": ids}).status_code == 201
    r = client.post(f"/api/shows/{show['id']}/bookings", headers={**user, "Idempotency-Key": "del-1"}, json={"seat_ids": ids})
    assert r.status_code in (200, 201), r.get_json()
    booking_id = r.get_json()["booking"]["id"]
    # An active booking blocks deleting the show and the event.
    assert client.delete(f"/api/admin/shows/{show['id']}", headers=h).status_code == 409
    assert client.delete(f"/api/admin/events/{ev['id']}", headers=h).status_code == 409
    # After cancelling, both can be deleted, and the customer's list still loads.
    assert client.post(f"/api/bookings/{booking_id}/cancel", headers=user).status_code == 200
    assert client.delete(f"/api/admin/events/{ev['id']}", headers=h).status_code == 200
    assert client.get("/api/bookings/me", headers=user).status_code == 200
    assert client.get(f"/api/events/{ev['id']}").status_code == 404
