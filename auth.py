"""JWT auth helpers + a small in-memory rate limiter."""
import threading
import time
from datetime import datetime, timedelta, timezone
from functools import wraps

import jwt
from flask import current_app, g, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

from models import User


def hash_password(password):
    return generate_password_hash(password)


def verify_password(password_hash, password):
    return check_password_hash(password_hash, password)


def make_token(user):
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "is_admin": user.is_admin,
        "exp": now + timedelta(hours=int(current_app.config.get("JWT_EXPIRY_HOURS", 24))),
    }
    return jwt.encode(payload, current_app.config["JWT_SECRET"], algorithm="HS256")


def current_user():
    return getattr(g, "current_user", None)


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error": "missing or invalid Authorization header"}), 401
        token = auth.split(" ", 1)[1].strip()
        try:
            payload = jwt.decode(token, current_app.config["JWT_SECRET"],
                                 algorithms=["HS256"])
        except Exception:
            return jsonify({"error": "invalid or expired token"}), 401
        user = User.query.get(int(payload["sub"]))
        if not user:
            return jsonify({"error": "user not found"}), 401
        g.current_user = user
        return fn(*args, **kwargs)
    return wrapper


def admin_required(fn):
    @wraps(fn)
    @login_required
    def wrapper(*args, **kwargs):
        if not current_user().is_admin:
            return jsonify({"error": "admin only"}), 403
        return fn(*args, **kwargs)
    return wrapper


# ---- simple in-memory rate limiter (no Redis required) ----
_rate_lock = threading.Lock()


def rate_limit(limit, window_seconds=60):
    """Allow `limit` requests per window per (IP, endpoint). 429 beyond that."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if not current_app.config.get("RATELIMIT_ENABLED", True):
                return fn(*args, **kwargs)
            store = current_app.extensions.setdefault("rate_limit_store", {})
            key = f"{request.remote_addr}:{request.endpoint}"
            now = time.time()
            with _rate_lock:
                timestamps = [t for t in store.get(key, []) if now - t < window_seconds]
                if len(timestamps) >= limit:
                    return jsonify({"error": "rate limit exceeded, try again later"}), 429
                timestamps.append(now)
                store[key] = timestamps
            return fn(*args, **kwargs)
        return wrapper
    return decorator
