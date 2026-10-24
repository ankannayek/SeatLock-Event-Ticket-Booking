"""Seed SeatLock with demo accounts, events, shows and seats.

Usage:
    python seed.py            # seed only if the DB is empty
    python seed.py --reset    # drop + recreate + seed (dev only)
"""
import argparse
from datetime import datetime

from app import create_app
from auth import hash_password
from models import Event, Show, User, db, ensure_schema
from services import generate_seats


def seed_data(app):
    """Create demo data if it does not already exist. Returns a summary dict."""
    with app.app_context():
        db.create_all()
        ensure_schema()
        if User.query.filter_by(email="admin@seatlock.local").first() is None:
            db.session.add(User(name="SeatLock Organizer",
                                email="admin@seatlock.local",
                                password_hash=hash_password("Admin123!"),
                                is_admin=True))
        if User.query.filter_by(email="demo@seatlock.local").first() is None:
            db.session.add(User(name="Demo User",
                                email="demo@seatlock.local",
                                password_hash=hash_password("Demo123!")))
        db.session.commit()
        creator = User.query.filter_by(email="admin@seatlock.local").first()

        events_spec = [
            {
                "title": "Indie Music Night - Live in Kolkata",
                "description": "An evening of independent music, acoustic sets and local bands.",
                "venue": "Nazrul Mancha, Kolkata",
                "category": "Music",
                "shows": ["2026-12-05T19:00:00", "2026-12-06T19:00:00"],
            },
            {
                "title": "Tech Summit 2026 - Build & Scale",
                "description": "Talks on backend systems, scaling, and building products in India.",
                "venue": "Biswa Bangla Convention Centre, Kolkata",
                "category": "Conference",
                "shows": ["2026-12-12T10:00:00", "2026-12-13T10:00:00"],
            },
        ]
        created_events = 0
        created_shows = 0
        for spec in events_spec:
            event = Event.query.filter_by(title=spec["title"]).first()
            if event is None:
                event = Event(title=spec["title"], description=spec["description"],
                              venue=spec["venue"], category=spec["category"],
                              creator_id=creator.id)
                db.session.add(event)
                db.session.commit()
                created_events += 1
            for start_raw in spec["shows"]:
                start = datetime.fromisoformat(start_raw)
                show = Show.query.filter_by(event_id=event.id,
                                            start_time=start).first()
                if show is None:
                    show = Show(event_id=event.id, start_time=start)
                    db.session.add(show)
                    db.session.commit()
                    generate_seats(show)
                    created_shows += 1
        return {
            "events_created": created_events,
            "shows_created": created_shows,
            "event_creator": "admin@seatlock.local / Admin123!",
            "customer": "demo@seatlock.local / Demo123!",
        }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true",
                        help="Drop all tables and re-seed (dev only).")
    args = parser.parse_args()
    app = create_app()
    if args.reset:
        with app.app_context():
            db.drop_all()
            db.create_all()
            ensure_schema()
    print(seed_data(app))
