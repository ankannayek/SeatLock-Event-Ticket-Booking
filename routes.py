"""HTTP routes for SeatLock."""
import os
import re
import uuid
from datetime import datetime

from flask import Blueprint, current_app, jsonify, request, send_from_directory

from auth import (admin_required, current_user, hash_password, login_required,
                  make_token, rate_limit, verify_password)
from models import (Booking, BookingSeat, Event, Payment, Seat, SeatHold, Show, User, WaitlistEntry,
                    db, show_brief)
from services import (BookingError, cancel_booking, confirm_booking,
                      create_hold, expire_holds, generate_seats, hold_seconds,
                      parse_passes, release_holds, show_passes)

api = Blueprint("api", __name__, url_prefix="/api")


def err(message, status=400):
    return jsonify({"error": message}), status


def get_json():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return {}
    return data


def valid_email(email):
    return bool(email and re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email))


@api.route("/config", methods=["GET"])
def public_config():
    """Settings the frontend needs to show accurate copy."""
    from flask import current_app
    return jsonify({
        "hold_seconds": hold_seconds(),
        "max_seats_per_hold": int(current_app.config.get("MAX_SEATS_PER_HOLD", 8)),
    })


# ---------------- auth ----------------

@api.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "seatlock"})


@api.route("/auth/register", methods=["POST"])
@rate_limit(20, 60)
def register():
    data = get_json()
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not name or not valid_email(email) or len(password) < 6:
        return err("name, a valid email, and a password of at least 6 characters are required", 400)
    if User.query.filter_by(email=email).first():
        return err("email already registered", 409)
    role = (data.get("role") or "customer").strip().lower()
    if role not in ("customer", "creator"):
        return err('role must be "customer" or "creator"', 400)
    user = User(name=name, email=email, password_hash=hash_password(password),
                is_admin=(role == "creator"))
    db.session.add(user)
    db.session.commit()
    return jsonify({"user": user.to_dict(), "token": make_token(user)}), 201


@api.route("/auth/login", methods=["POST"])
@rate_limit(20, 60)
def login():
    data = get_json()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    user = User.query.filter_by(email=email).first()
    if not user or not verify_password(user.password_hash, password):
        return err("invalid email or password", 401)
    return jsonify({"user": user.to_dict(), "token": make_token(user)})


@api.route("/auth/me", methods=["GET"])
@login_required
def me():
    return jsonify({"user": current_user().to_dict()})


# ---------------- events / shows / seats ----------------

@api.route("/events", methods=["GET"])
def list_events():
    events = Event.query.order_by(Event.id.asc()).all()
    out = []
    for e in events:
        d = e.to_dict()
        d["shows"] = [s.to_dict(with_seat_summary=True)
                      for s in e.shows.order_by(Show.start_time.asc()).all()]
        out.append(d)
    return jsonify({"events": out})


@api.route("/events/<int:event_id>", methods=["GET"])
def get_event(event_id):
    event = Event.query.get_or_404(event_id)
    d = event.to_dict()
    d["shows"] = [s.to_dict(with_seat_summary=True)
                  for s in event.shows.order_by(Show.start_time.asc()).all()]
    return jsonify({"event": d})


@api.route("/shows/<int:show_id>", methods=["GET"])
def get_show(show_id):
    show = Show.query.get_or_404(show_id)
    expire_holds()
    d = show.to_dict(with_seat_summary=True)
    d["event"] = show.event.to_dict() if show.event else None
    return jsonify({"show": d})


@api.route("/shows/<int:show_id>/seats", methods=["GET"])
def list_seats(show_id):
    show = Show.query.get_or_404(show_id)
    expire_holds()
    status = request.args.get("status")
    q = Seat.query.filter_by(show_id=show.id).order_by(
        Seat.row_label.asc(), Seat.seat_number.asc())
    if status in ("available", "held", "booked"):
        q = q.filter_by(status=status)
    return jsonify({"show_id": show.id, "seats": [s.to_dict() for s in q.all()]})


# ---------------- holds & bookings ----------------

@api.route("/shows/<int:show_id>/holds", methods=["POST"])
@login_required
@rate_limit(30, 60)
def hold_seats(show_id):
    if current_user().is_admin:
        return err("event creator accounts cannot book seats; use a customer account", 403)
    show = Show.query.get_or_404(show_id)
    data = get_json()
    try:
        holds = create_hold(current_user().id, show.id, data.get("seat_ids"))
    except BookingError as exc:
        return err(exc.message, exc.status)
    return jsonify({"holds": [h.to_dict() for h in holds],
                    "expires_in_seconds": hold_seconds()}), 201


@api.route("/shows/<int:show_id>/holds", methods=["DELETE"])
@login_required
def release_show_holds(show_id):
    Show.query.get_or_404(show_id)
    return jsonify({"released": release_holds(current_user().id, show_id)})


@api.route("/holds/me", methods=["GET"])
@login_required
def my_holds():
    """The caller's active holds, grouped by show, so checkout survives a refresh."""
    expire_holds()
    q = SeatHold.query.filter_by(user_id=current_user().id, status="active")
    show_id = request.args.get("show_id", type=int)
    if show_id:
        q = q.filter_by(show_id=show_id)
    groups = {}
    for hold in q.order_by(SeatHold.id.asc()).all():
        g = groups.setdefault(hold.show_id, {
            "show": show_brief(Show.query.get(hold.show_id)), "holds": []})
        g["holds"].append(hold.to_dict(with_seat=True))
    out = []
    for g in groups.values():
        g["seconds_left"] = min(h["seconds_left"] for h in g["holds"])
        g["total"] = sum(h["seat"]["price"] for h in g["holds"])
        out.append(g)
    return jsonify({"holds": out})


@api.route("/shows/<int:show_id>/bookings", methods=["POST"])
@login_required
@rate_limit(30, 60)
def book_show(show_id):
    if current_user().is_admin:
        return err("event creator accounts cannot book seats; use a customer account", 403)
    show = Show.query.get_or_404(show_id)
    data = get_json()
    # Idempotency key: header wins, body is the fallback.
    key = request.headers.get("Idempotency-Key") or data.get("idempotency_key")
    try:
        booking, replayed = confirm_booking(
            current_user().id, show.id, data.get("seat_ids"), key)
    except BookingError as exc:
        return err(exc.message, exc.status)
    status = 200 if replayed else 201
    payload = {"booking": booking.to_dict(), "replayed": replayed}
    return jsonify(payload), status


@api.route("/bookings/me", methods=["GET"])
@login_required
def my_bookings():
    bookings = Booking.query.filter_by(user_id=current_user().id).order_by(
        Booking.created_at.desc()).all()
    return jsonify({"bookings": [b.to_dict() for b in bookings]})


@api.route("/bookings/<int:booking_id>", methods=["GET"])
@login_required
def get_booking(booking_id):
    booking = Booking.query.get_or_404(booking_id)
    user = current_user()
    if booking.user_id != user.id and not (user.is_admin and owns(booking.show.event, user)):
        return err("forbidden", 403)
    return jsonify({"booking": booking.to_dict()})


@api.route("/bookings/<int:booking_id>/cancel", methods=["POST"])
@login_required
@rate_limit(30, 60)
def cancel(booking_id):
    booking = Booking.query.get_or_404(booking_id)
    user = current_user()
    if booking.user_id != user.id and not (user.is_admin and owns(booking.show.event, user)):
        return err("forbidden", 403)
    try:
        booking = cancel_booking(user, booking)
    except BookingError as exc:
        return err(exc.message, exc.status)
    return jsonify({"booking": booking.to_dict()})


# ---------------- waitlist ----------------

@api.route("/shows/<int:show_id>/waitlist", methods=["POST"])
@login_required
def join_waitlist(show_id):
    if current_user().is_admin:
        return err("event creator accounts cannot book seats; use a customer account", 403)
    show = Show.query.get_or_404(show_id)
    data = get_json()
    try:
        requested = int(data.get("seats_requested", 1))
    except (TypeError, ValueError):
        return err("seats_requested must be an integer", 400)
    if requested < 1:
        return err("seats_requested must be at least 1", 400)
    already = WaitlistEntry.query.filter_by(
        user_id=current_user().id, show_id=show.id, status="waiting").first()
    if already:
        return err("you are already on the waitlist for this show", 409)
    entry = WaitlistEntry(user_id=current_user().id, show_id=show.id,
                          seats_requested=requested)
    db.session.add(entry)
    db.session.commit()
    return jsonify({"waitlist_entry": entry.to_dict()}), 201


@api.route("/waitlist/me", methods=["GET"])
@login_required
def my_waitlist():
    entries = WaitlistEntry.query.filter_by(
        user_id=current_user().id).order_by(WaitlistEntry.created_at.desc()).all()
    return jsonify({"waitlist": [e.to_dict() for e in entries]})


@api.route("/waitlist/<int:entry_id>", methods=["DELETE"])
@login_required
def cancel_waitlist(entry_id):
    entry = WaitlistEntry.query.get_or_404(entry_id)
    if entry.user_id != current_user().id:
        return err("forbidden", 403)
    entry.status = "cancelled"
    db.session.commit()
    return jsonify({"waitlist_entry": entry.to_dict()})


# ---------------- admin ----------------

def parse_start(raw):
    """ISO 8601 string -> naive datetime (venue-local), or None if invalid."""
    try:
        dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt.replace(tzinfo=None) if dt.tzinfo is not None else dt


def clean_image_url(raw):
    """Empty, an uploaded file path, or an http(s) link. Anything else is rejected."""
    url = (raw or "").strip()
    if not url:
        return ""
    if len(url) > 500:
        raise ValueError("image link is too long")
    if (url.startswith("/api/uploads/") or re.match(r"^https?://", url, re.I)
            or re.match(r"^art:(music|tech|stage|festival|sports|abstract):[0-5]$", url)):
        return url
    raise ValueError("image must be an uploaded file, a chosen design or an http(s) link")


def event_fields(data, event, creating=False):
    """Copy validated editable fields from a JSON body onto an event. Returns an error response or None."""
    if creating or "title" in data:
        title = (data.get("title") or "").strip()
        if not title:
            return err("title is required", 400)
        event.title = title[:300]
    for key, limit in (("description", None), ("venue", 300), ("category", 100)):
        if key in data:
            val = str(data.get(key) or "").strip()
            setattr(event, key, val[:limit] if limit else val)
    if "image_url" in data:
        try:
            event.image_url = clean_image_url(data.get("image_url"))
        except ValueError as exc:
            return err(str(exc), 400)
    return None


def owns(event, user=None):
    """Creators manage their own events (events with no owner are open to any creator)."""
    user = user or current_user()
    return event.creator_id is None or event.creator_id == user.id


def not_yours():
    return err("you can only manage events you created", 403)


@api.route("/admin/events", methods=["GET"])
@admin_required
def admin_list_events():
    """The signed-in creator's own events, with shows and seat counts."""
    events = Event.query.filter(
        (Event.creator_id == current_user().id) | (Event.creator_id.is_(None))
    ).order_by(Event.id.desc()).all()
    out = []
    for e in events:
        d = e.to_dict()
        d["shows"] = [s.to_dict(with_seat_summary=True)
                      for s in e.shows.order_by(Show.start_time.asc()).all()]
        d["has_bookings"] = any(active_bookings(s["id"]) for s in d["shows"])
        out.append(d)
    return jsonify({"events": out})


@api.route("/admin/events", methods=["POST"])
@admin_required
def admin_create_event():
    data = get_json()
    event = Event(creator_id=current_user().id)
    bad = event_fields(data, event, creating=True)
    if bad:
        return bad
    db.session.add(event)
    db.session.commit()
    return jsonify({"event": event.to_dict()}), 201


@api.route("/admin/events/<int:event_id>", methods=["PATCH", "PUT"])
@admin_required
def admin_update_event(event_id):
    event = Event.query.get_or_404(event_id)
    if not owns(event):
        return not_yours()
    bad = event_fields(get_json(), event)
    if bad:
        return bad
    db.session.commit()
    return jsonify({"event": event.to_dict()})


def active_bookings(show_id):
    """Confirmed bookings only. Cancelled ones don't block deleting a show."""
    return Booking.query.filter_by(show_id=show_id, status="confirmed").count()


def purge_show(show):
    """Delete a show with its seats, holds, waitlist and cancelled bookings.

    Caller must first check active_bookings() is zero. Cancelled bookings (and
    their refunded payments) are removed too, because they point at the seats.
    """
    for b in Booking.query.filter_by(show_id=show.id).all():
        BookingSeat.query.filter_by(booking_id=b.id).delete()
        Payment.query.filter_by(booking_id=b.id).delete()
        db.session.delete(b)
    db.session.flush()
    SeatHold.query.filter_by(show_id=show.id).delete()
    WaitlistEntry.query.filter_by(show_id=show.id).delete()
    Seat.query.filter_by(show_id=show.id).delete()
    db.session.delete(show)


@api.route("/admin/events/<int:event_id>", methods=["DELETE"])
@admin_required
def admin_delete_event(event_id):
    event = Event.query.get_or_404(event_id)
    if not owns(event):
        return not_yours()
    shows = event.shows.all()
    if any(active_bookings(s.id) for s in shows):
        return err("this event has active bookings, so it cannot be deleted. Cancel them first.", 409)
    for s in shows:
        purge_show(s)
    db.session.delete(event)
    db.session.commit()
    return jsonify({"deleted": True})


@api.route("/admin/events/<int:event_id>/shows", methods=["POST"])
@admin_required
def admin_create_show(event_id):
    event = Event.query.get_or_404(event_id)
    if not owns(event):
        return not_yours()
    data = get_json()
    if not data.get("start_time"):
        return err("start_time (ISO 8601) is required", 400)
    start_time = parse_start(data["start_time"])
    if start_time is None:
        return err("start_time must be ISO 8601, e.g. 2026-12-05T19:00:00", 400)
    layout = data.get("seat_layout") or {}
    try:
        # Validate everything before anything is written.
        per_row = int(layout.get("seats_per_row", 10))
        if not 1 <= per_row <= 30:
            raise BookingError("seats per row must be between 1 and 30", 400)
        if layout.get("passes") is not None:
            parse_passes(layout["passes"])
    except (BookingError, TypeError, ValueError) as exc:
        return err(getattr(exc, "message", "invalid seat layout"), 400)
    show = Show(event_id=event.id, start_time=start_time)
    db.session.add(show)
    db.session.commit()
    seats = generate_seats(show, layout)
    return jsonify({"show": show.to_dict(with_seat_summary=True),
                    "seats_created": len(seats)}), 201


@api.route("/admin/shows/<int:show_id>", methods=["GET"])
@admin_required
def admin_get_show(show_id):
    show = Show.query.get_or_404(show_id)
    if not owns(show.event):
        return not_yours()
    return jsonify({
        "show": show.to_dict(with_seat_summary=True),
        "passes": show_passes(show),
        "has_bookings": active_bookings(show.id) > 0,
    })


@api.route("/admin/shows/<int:show_id>", methods=["PATCH", "PUT"])
@admin_required
def admin_update_show(show_id):
    """Change the start time and/or rename and re-price passes.

    passes: [{current_name, name, price}]. Existing bookings keep the price
    they were paid at; everything else follows the new price.
    """
    show = Show.query.get_or_404(show_id)
    if not owns(show.event):
        return not_yours()
    data = get_json()
    if data.get("start_time"):
        start = parse_start(data["start_time"])
        if start is None:
            return err("start_time must be ISO 8601, e.g. 2026-12-05T19:00:00", 400)
        show.start_time = start
    if data.get("passes") is not None:
        existing = {p["name"]: p for p in show_passes(show)}
        mapping, seen = {}, set()
        for p in data["passes"]:
            old = p.get("current_name")
            if old not in existing:
                return err(f'unknown pass "{old}"', 400)
            name = str(p.get("name") or "").strip()
            if not name or len(name) > 50:
                return err("every pass needs a name of up to 50 characters", 400)
            if name.lower() in seen:
                return err(f'pass name "{name}" is used twice', 400)
            seen.add(name.lower())
            try:
                price = int(p.get("price"))
            except (TypeError, ValueError):
                return err(f'"{name}" needs a whole-number price', 400)
            if price < 0:
                return err("prices cannot be negative", 400)
            mapping[old] = (name, price)
        for seat in Seat.query.filter_by(show_id=show.id).all():
            if seat.category in mapping:
                seat.category, seat.price = mapping[seat.category]
    db.session.commit()
    return jsonify({"show": show.to_dict(with_seat_summary=True), "passes": show_passes(show)})


@api.route("/admin/shows/<int:show_id>", methods=["DELETE"])
@admin_required
def admin_delete_show(show_id):
    show = Show.query.get_or_404(show_id)
    if not owns(show.event):
        return not_yours()
    if active_bookings(show.id):
        return err("this show has active bookings, so it cannot be deleted. Cancel them first.", 409)
    purge_show(show)
    db.session.commit()
    return jsonify({"deleted": True})


# ---- image uploads ----

_IMAGE_SIGNATURES = (
    (b"\x89PNG\r\n\x1a\n", ".png"),
    (b"\xff\xd8\xff", ".jpg"),
    (b"GIF87a", ".gif"),
    (b"GIF89a", ".gif"),
)
MAX_UPLOAD_BYTES = 3 * 1024 * 1024


def upload_dir():
    path = current_app.config.get("UPLOAD_DIR") or os.path.join(current_app.instance_path, "uploads")
    os.makedirs(path, exist_ok=True)
    return path


@api.route("/admin/uploads", methods=["POST"])
@admin_required
@rate_limit(30, 60)
def admin_upload():
    f = request.files.get("file")
    if f is None:
        return err("choose an image file", 400)
    blob = f.read(MAX_UPLOAD_BYTES + 1)
    if len(blob) > MAX_UPLOAD_BYTES:
        return err("image is too large (3 MB maximum)", 413)
    ext = next((e for sig, e in _IMAGE_SIGNATURES if blob.startswith(sig)), None)
    if ext is None and blob[:4] == b"RIFF" and blob[8:12] == b"WEBP":
        ext = ".webp"
    if ext is None:
        return err("only PNG, JPG, GIF or WebP images are allowed", 400)
    name = f"{uuid.uuid4().hex}{ext}"
    with open(os.path.join(upload_dir(), name), "wb") as out:
        out.write(blob)
    return jsonify({"url": f"/api/uploads/{name}"}), 201


@api.route("/uploads/<path:name>", methods=["GET"])
def serve_upload(name):
    resp = send_from_directory(upload_dir(), name)
    resp.headers["Cache-Control"] = "public, max-age=86400"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    return resp
