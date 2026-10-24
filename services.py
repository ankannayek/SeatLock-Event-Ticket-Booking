"""Core booking logic for SeatLock.

Concurrency note (important for a CV / interview discussion):
- All hold / confirm / cancel operations run under a single process-wide
  RLock AND inside one DB transaction. With the default SQLite setup this
  serialises writers, so a second concurrent request sees the seat as
  held/booked and fails instead of double-booking.
- The Booking(user_id, idempotency_key) unique constraint is a second,
  DB-level backstop for idempotent retries.
- For a multi-worker PostgreSQL deployment, replace the in-process lock
  with SELECT ... FOR UPDATE on the seat rows (or a Postgres advisory
  lock). That is documented as a limitation in README.md; it is not
  claimed to be multi-process safe here.
"""
import threading
from datetime import datetime, timedelta, timezone

from flask import current_app

from models import (Booking, BookingSeat, Payment, Seat, SeatHold,
                    WaitlistEntry, db, utcnow)

booking_lock = threading.RLock()


class BookingError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def hold_seconds():
    return int(current_app.config.get("HOLD_SECONDS", 600))


def expire_holds():
    """Release every active hold whose expiry has passed. Returns count."""
    now = utcnow()
    # SQLite stores naive datetimes in some paths; normalise for comparison.
    expired = SeatHold.query.filter(
        SeatHold.status == "active",
        SeatHold.expires_at <= now,
    ).all()
    count = 0
    for hold in expired:
        hold.status = "expired"
        seat = Seat.query.get(hold.seat_id)
        if seat and seat.status == "held":
            seat.status = "available"
        count += 1
    if count:
        db.session.commit()
    return count


def _ensure_naive(dt):
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.replace(tzinfo=None)
    return dt


def create_hold(user_id, show_id, seat_ids):
    """Hold seats for `hold_seconds()`. Raises BookingError on conflict."""
    if not seat_ids or not isinstance(seat_ids, list):
        raise BookingError("seat_ids must be a non-empty list", 400)
    if len(set(seat_ids)) != len(seat_ids):
        raise BookingError("duplicate seat_ids in request", 400)
    limit = int(current_app.config.get("MAX_SEATS_PER_HOLD", 8))
    if len(seat_ids) > limit:
        raise BookingError(f"you can hold at most {limit} seats at a time", 400)
    with booking_lock:
        expire_holds()
        seats = Seat.query.filter(
            Seat.show_id == show_id, Seat.id.in_(seat_ids)
        ).all()
        if len(seats) != len(seat_ids):
            raise BookingError("one or more seats do not belong to this show", 400)
        for seat in seats:
            if seat.status != "available":
                raise BookingError(
                    f"seat {seat.row_label}{seat.seat_number} is not available "
                    f"(status: {seat.status})", 409)
        expires_at = utcnow() + timedelta(seconds=hold_seconds())
        holds = []
        for seat in seats:
            seat.status = "held"
            hold = SeatHold(user_id=user_id, show_id=show_id, seat_id=seat.id,
                            status="active", expires_at=expires_at)
            db.session.add(hold)
            holds.append(hold)
        db.session.commit()
        return holds


def release_holds(user_id, show_id):
    """Release every active hold the user has on a show. Returns count."""
    with booking_lock:
        expire_holds()
        holds = SeatHold.query.filter_by(
            user_id=user_id, show_id=show_id, status="active").all()
        for hold in holds:
            hold.status = "released"
            seat = Seat.query.get(hold.seat_id)
            if seat and seat.status == "held":
                seat.status = "available"
        if holds:
            db.session.commit()
            notify_waitlist(show_id)
        return len(holds)


def confirm_booking(user_id, show_id, seat_ids, idempotency_key=None):
    """Convert the caller's active holds into a confirmed booking.

    Idempotency: if the same user re-sends the same idempotency_key, the
    original booking is returned unchanged and no second payment is made.
    """
    if not seat_ids or not isinstance(seat_ids, list):
        raise BookingError("seat_ids must be a non-empty list", 400)
    if len(set(seat_ids)) != len(seat_ids):
        raise BookingError("duplicate seat_ids in request", 400)

    with booking_lock:
        if idempotency_key:
            existing = Booking.query.filter_by(
                user_id=user_id, idempotency_key=idempotency_key).first()
            if existing:
                return existing, True  # replayed, not a new booking

        expire_holds()
        seats = Seat.query.filter(
            Seat.show_id == show_id, Seat.id.in_(seat_ids)
        ).all()
        if len(seats) != len(seat_ids):
            raise BookingError("one or more seats do not belong to this show", 400)

        holds = []
        for seat in seats:
            hold = SeatHold.query.filter_by(
                user_id=user_id, show_id=show_id, seat_id=seat.id,
                status="active").first()
            if not hold:
                raise BookingError(
                    f"seat {seat.row_label}{seat.seat_number} is not held by you "
                    f"(status: {seat.status}). Hold seats first.", 409)
            holds.append(hold)

        total = sum(s.price for s in seats)
        booking = Booking(user_id=user_id, show_id=show_id,
                          status="confirmed", total=total,
                          idempotency_key=idempotency_key)
        db.session.add(booking)
        db.session.flush()  # assign booking.id before BookingSeat/Payment
        for seat in seats:
            db.session.add(BookingSeat(booking_id=booking.id,
                                       seat_id=seat.id, price=seat.price))
            seat.status = "booked"
        for hold in holds:
            hold.status = "converted"
        # Mock payment: no real money, no external gateway.
        db.session.add(Payment(booking_id=booking.id, amount=total,
                               status="succeeded", provider="mock",
                               idempotency_key=idempotency_key))
        try:
            db.session.commit()
        except Exception as exc:
            db.session.rollback()
            # Race on the unique idempotency constraint -> return original.
            if idempotency_key:
                existing = Booking.query.filter_by(
                    user_id=user_id, idempotency_key=idempotency_key).first()
                if existing:
                    return existing, True
            raise BookingError(f"booking failed: {exc}", 409)
        return booking, False


def cancel_booking(user, booking):
    """Cancel a confirmed booking, release its seats, refund mock payment."""
    with booking_lock:
        if booking.status != "confirmed":
            raise BookingError(f"booking is already {booking.status}", 400)
        booking.status = "cancelled"
        for bs in booking.seats.all():
            seat = Seat.query.get(bs.seat_id)
            if seat and seat.status == "booked":
                seat.status = "available"
        if booking.payment and booking.payment.status == "succeeded":
            booking.payment.status = "refunded"
        db.session.commit()
        notify_waitlist(booking.show_id)
        return booking


def notify_waitlist(show_id):
    """Mark the earliest waiting entry for a show as notified.

    This does NOT auto-book seats for them; it is a signal that seats
    may now be available. Auto-booking would need payment consent.
    """
    entry = WaitlistEntry.query.filter_by(
        show_id=show_id, status="waiting").order_by(
        WaitlistEntry.created_at.asc()).first()
    if entry:
        entry.status = "notified"
        db.session.commit()
        return entry
    return None


MAX_PASSES = 8
MAX_ROWS = 26
MAX_PER_ROW = 30


def parse_passes(passes):
    """Validate admin-defined passes: [{name, price, rows}, ...] (front rows first)."""
    if not isinstance(passes, list) or not passes:
        raise BookingError("add at least one pass", 400)
    if len(passes) > MAX_PASSES:
        raise BookingError(f"at most {MAX_PASSES} passes per show", 400)
    out, seen = [], set()
    for p in passes:
        if not isinstance(p, dict):
            raise BookingError("invalid pass", 400)
        name = str(p.get("name") or "").strip()
        if not name:
            raise BookingError("every pass needs a name", 400)
        if len(name) > 50:
            raise BookingError("pass names can be at most 50 characters", 400)
        if name.lower() in seen:
            raise BookingError(f'pass name "{name}" is used twice', 400)
        seen.add(name.lower())
        try:
            price = int(p.get("price"))
            rows = int(p.get("rows"))
        except (TypeError, ValueError):
            raise BookingError(f'"{name}" needs a whole-number price and row count', 400)
        if price < 0:
            raise BookingError("prices cannot be negative", 400)
        if rows < 1:
            raise BookingError(f'"{name}" needs at least one row', 400)
        out.append({"name": name, "price": price, "rows": rows})
    if sum(p["rows"] for p in out) > MAX_ROWS:
        raise BookingError(f"a show can have at most {MAX_ROWS} rows in total", 400)
    return out


def generate_seats(show, layout=None):
    """Create seats for a show.

    layout["passes"] (preferred): [{name, price, rows}] from the front of the
    hall to the back; layout["seats_per_row"] sets the row length.
    The older rows/categories/prices layout is still accepted.
    """
    layout = layout or {}
    per_row = int(layout.get("seats_per_row", 10))
    if not 1 <= per_row <= MAX_PER_ROW:
        raise BookingError(f"seats per row must be between 1 and {MAX_PER_ROW}", 400)

    plan = []  # (row_label, category, price)
    if layout.get("passes") is not None:
        letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        i = 0
        for p in parse_passes(layout["passes"]):
            for _ in range(p["rows"]):
                plan.append((letters[i], p["name"], p["price"]))
                i += 1
    else:
        rows = layout.get("rows") or ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]
        prices = layout.get("prices") or {"Premium": 799, "Standard": 499, "VIP": 1199}
        categories = layout.get("categories") or {}
        for row in rows:
            category = categories.get(row)
            if not category:
                if row in ("A", "B", "C"):
                    category = "Premium"
                elif row in ("I", "J"):
                    category = "VIP"
                else:
                    category = "Standard"
            plan.append((row, category, int(prices.get(category, 499))))

    created = []
    for row, category, price in plan:
        for n in range(1, per_row + 1):
            seat = Seat(show_id=show.id, row_label=row, seat_number=n,
                        category=category, price=price, status="available")
            db.session.add(seat)
            created.append(seat)
    db.session.commit()
    return created


def show_passes(show):
    """Passes of an existing show, in row order, with usage counts."""
    seats = Seat.query.filter_by(show_id=show.id).order_by(
        Seat.row_label.asc(), Seat.seat_number.asc()).all()
    order, info = [], {}
    for s in seats:
        if s.category not in info:
            info[s.category] = {"name": s.category, "price": s.price, "rows": set(),
                                "seats": 0, "booked": 0}
            order.append(s.category)
        d = info[s.category]
        d["rows"].add(s.row_label)
        d["seats"] += 1
        if s.status in ("booked", "held"):
            d["booked"] += 1
    return [{**info[c], "rows": len(info[c]["rows"])} for c in order]
