"""Database models for SeatLock."""
from datetime import datetime, timezone

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


def utcnow():
    return datetime.now(timezone.utc)


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(200), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(300), nullable=False)
    is_admin = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    holds = db.relationship("SeatHold", backref="user", lazy="dynamic")
    bookings = db.relationship("Booking", backref="user", lazy="dynamic")
    waitlist_entries = db.relationship("WaitlistEntry", backref="user", lazy="dynamic")

    # Two roles: "customer" books seats, "creator" publishes and manages events.
    # Stored in the existing is_admin column so older databases keep working.
    @property
    def role(self):
        return "creator" if self.is_admin else "customer"

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "role": self.role,
            "is_admin": self.is_admin,  # kept for older clients; same as role == "creator"
        }


class Event(db.Model):
    __tablename__ = "events"
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(300), nullable=False)
    description = db.Column(db.Text, default="")
    venue = db.Column(db.String(300), default="")
    category = db.Column(db.String(100), default="")
    image_url = db.Column(db.String(500), default="")
    creator_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    shows = db.relationship("Show", backref="event", lazy="dynamic",
                            cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "venue": self.venue,
            "category": self.category,
            "image_url": self.image_url or "",
            "creator_id": self.creator_id,
        }


class Show(db.Model):
    __tablename__ = "shows"
    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(db.Integer, db.ForeignKey("events.id"), nullable=False)
    start_time = db.Column(db.DateTime, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    seats = db.relationship("Seat", backref="show", lazy="dynamic",
                            cascade="all, delete-orphan")
    bookings = db.relationship("Booking", backref="show", lazy="dynamic")

    def to_dict(self, with_seat_summary=False):
        d = {
            "id": self.id,
            "event_id": self.event_id,
            "event_title": self.event.title if self.event else None,
            "start_time": self.start_time.isoformat() if self.start_time else None,
        }
        if with_seat_summary:
            seats = self.seats.all()
            d["seat_summary"] = {
                "total": len(seats),
                "available": sum(1 for s in seats if s.status == "available"),
                "held": sum(1 for s in seats if s.status == "held"),
                "booked": sum(1 for s in seats if s.status == "booked"),
            }
        return d


def show_brief(show):
    """Small show + event summary embedded in bookings and waitlist rows."""
    if show is None:
        return None
    ev = show.event
    return {
        "id": show.id,
        "start_time": show.start_time.isoformat() if show.start_time else None,
        "event_id": show.event_id,
        "event_title": ev.title if ev else None,
        "venue": ev.venue if ev else None,
        "category": ev.category if ev else None,
    }


class Seat(db.Model):
    __tablename__ = "seats"
    id = db.Column(db.Integer, primary_key=True)
    show_id = db.Column(db.Integer, db.ForeignKey("shows.id"), nullable=False)
    row_label = db.Column(db.String(10), nullable=False)
    seat_number = db.Column(db.Integer, nullable=False)
    category = db.Column(db.String(50), default="Standard")
    price = db.Column(db.Integer, nullable=False, default=499)  # INR
    # available | held | booked
    status = db.Column(db.String(20), default="available", nullable=False, index=True)

    __table_args__ = (
        db.UniqueConstraint("show_id", "row_label", "seat_number",
                            name="uq_seat_per_show"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "show_id": self.show_id,
            "row": self.row_label,
            "seat_number": self.seat_number,
            "label": f"{self.row_label}{self.seat_number}",
            "category": self.category,
            "price": self.price,
            "status": self.status,
        }


class SeatHold(db.Model):
    __tablename__ = "seat_holds"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    show_id = db.Column(db.Integer, db.ForeignKey("shows.id"), nullable=False)
    seat_id = db.Column(db.Integer, db.ForeignKey("seats.id"), nullable=False)
    # active | expired | released | converted
    status = db.Column(db.String(20), default="active", nullable=False, index=True)
    expires_at = db.Column(db.DateTime, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    seat = db.relationship("Seat")

    def _expires_utc(self):
        if self.expires_at is None:
            return None
        if self.expires_at.tzinfo is None:
            return self.expires_at.replace(tzinfo=timezone.utc)
        return self.expires_at

    def to_dict(self, with_seat=False):
        exp = self._expires_utc()
        d = {
            "id": self.id,
            "user_id": self.user_id,
            "show_id": self.show_id,
            "seat_id": self.seat_id,
            "status": self.status,
            "expires_at": exp.isoformat() if exp else None,
            "seconds_left": max(0, int((exp - utcnow()).total_seconds())) if exp else 0,
        }
        if with_seat and self.seat:
            d["seat"] = self.seat.to_dict()
        return d


class Booking(db.Model):
    __tablename__ = "bookings"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    show_id = db.Column(db.Integer, db.ForeignKey("shows.id"), nullable=False)
    # confirmed | cancelled
    status = db.Column(db.String(20), default="confirmed", nullable=False, index=True)
    total = db.Column(db.Integer, nullable=False, default=0)  # INR
    idempotency_key = db.Column(db.String(200), nullable=True, index=True)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    __table_args__ = (
        # A given user + key may only ever create one booking. This is the
        # DB-level backstop for idempotent payment/booking retries.
        db.UniqueConstraint("user_id", "idempotency_key",
                            name="uq_booking_user_idempotency"),
    )

    seats = db.relationship("BookingSeat", backref="booking", lazy="dynamic",
                            cascade="all, delete-orphan")
    payment = db.relationship("Payment", backref="booking", uselist=False,
                              cascade="all, delete-orphan")

    def to_dict(self):
        seat_rows = []
        for bs in self.seats.all():
            seat = Seat.query.get(bs.seat_id)
            seat_rows.append({
                "seat_id": bs.seat_id,
                "label": f"{seat.row_label}{seat.seat_number}" if seat else None,
                "price": bs.price,
            })
        return {
            "id": self.id,
            "user_id": self.user_id,
            "show_id": self.show_id,
            "status": self.status,
            "total": self.total,
            "idempotency_key": self.idempotency_key,
            "seats": seat_rows,
            "show": show_brief(self.show),
            "payment": self.payment.to_dict() if self.payment else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class BookingSeat(db.Model):
    __tablename__ = "booking_seats"
    id = db.Column(db.Integer, primary_key=True)
    booking_id = db.Column(db.Integer, db.ForeignKey("bookings.id"), nullable=False)
    seat_id = db.Column(db.Integer, db.ForeignKey("seats.id"), nullable=False)
    price = db.Column(db.Integer, nullable=False)


class Payment(db.Model):
    __tablename__ = "payments"
    id = db.Column(db.Integer, primary_key=True)
    booking_id = db.Column(db.Integer, db.ForeignKey("bookings.id"),
                           unique=True, nullable=False)
    amount = db.Column(db.Integer, nullable=False)  # INR
    # succeeded | refunded  (mock payment, no real money moves)
    status = db.Column(db.String(20), default="succeeded", nullable=False)
    provider = db.Column(db.String(50), default="mock")
    idempotency_key = db.Column(db.String(200), nullable=True, index=True)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "booking_id": self.booking_id,
            "amount": self.amount,
            "status": self.status,
            "provider": self.provider,
        }


class WaitlistEntry(db.Model):
    __tablename__ = "waitlist"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    show_id = db.Column(db.Integer, db.ForeignKey("shows.id"), nullable=False)
    seats_requested = db.Column(db.Integer, nullable=False, default=1)
    # waiting | notified | cancelled
    status = db.Column(db.String(20), default="waiting", nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "show_id": self.show_id,
            "seats_requested": self.seats_requested,
            "status": self.status,
            "show": show_brief(Show.query.get(self.show_id)),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


def ensure_schema():
    """Tiny migration: add columns introduced after a database was first created.

    db.create_all() never alters existing tables, so older seatlock.db files
    would miss newer columns. Safe to call on every start.
    """
    from sqlalchemy import inspect, text
    insp = inspect(db.engine)
    if "events" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("events")}
        if "image_url" not in cols:
            with db.engine.begin() as conn:
                conn.execute(text("ALTER TABLE events ADD COLUMN image_url VARCHAR(500) DEFAULT ''"))
        if "creator_id" not in cols:
            with db.engine.begin() as conn:
                conn.execute(text("ALTER TABLE events ADD COLUMN creator_id INTEGER"))
        # Events created before owners existed go to the first event creator.
        first = User.query.filter_by(is_admin=True).order_by(User.id.asc()).first()
        if first:
            Event.query.filter(Event.creator_id.is_(None)).update({"creator_id": first.id})
            db.session.commit()
