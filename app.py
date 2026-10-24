"""SeatLock Flask application factory + runnable entry point."""
import os
import threading
import time

from flask import Flask, jsonify, request, send_from_directory

from config import Config
from models import User, db, ensure_schema
from routes import api


def _cleanup_loop(app):
    interval = int(app.config.get("CLEANUP_INTERVAL_SECONDS", 30))
    while True:
        time.sleep(interval)
        try:
            with app.app_context():
                from services import expire_holds
                expire_holds()
        except Exception:
            # Background cleanup must never crash the server.
            continue


def create_app(config_class=Config, config_overrides=None):
    app = Flask(__name__)
    app.config.from_object(config_class)
    if config_overrides:
        app.config.update(config_overrides)

    db.init_app(app)
    app.register_blueprint(api)

    # Optional CORS for a separately hosted frontend (CORS_ORIGINS in .env).
    @app.after_request
    def add_cors(resp):
        origin = request.headers.get("Origin")
        allowed = app.config.get("CORS_ORIGINS") or []
        if origin and request.path.startswith("/api") and (origin in allowed or "*" in allowed):
            resp.headers["Access-Control-Allow-Origin"] = origin
            resp.headers["Vary"] = "Origin"
            resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, Idempotency-Key"
            resp.headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS"
        return resp

    @app.route("/api/<path:_rest>", methods=["OPTIONS"])
    def api_preflight(_rest):
        return ("", 204)

    # Single-page app: serve the built React frontend and fall back to
    # index.html for client-side routes. /api/* stays JSON.
    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def frontend(path):
        dist = app.config.get("FRONTEND_DIST")
        if path.startswith("api/"):
            return jsonify({"error": "not found"}), 404
        if dist and os.path.isdir(dist):
            full = os.path.join(dist, path)
            if path and os.path.isfile(full):
                return send_from_directory(dist, path)
            return send_from_directory(dist, "index.html")
        return jsonify({
            "error": "frontend not built",
            "hint": "Run `npm install && npm run build` in frontend/, "
                    "or start the dev server with `npm run dev`.",
        }), 404

    @app.errorhandler(404)
    def not_found(_exc):
        return jsonify({"error": "not found"}), 404

    @app.errorhandler(405)
    def method_not_allowed(_exc):
        return jsonify({"error": "method not allowed"}), 405

    if app.config.get("BACKGROUND_CLEANUP") and not app.extensions.get("cleanup_started"):
        app.extensions["cleanup_started"] = True
        thread = threading.Thread(target=_cleanup_loop, args=(app,), daemon=True)
        thread.start()

    return app


def _init_db(application):
    with application.app_context():
        db.create_all()
        ensure_schema()
        # Seed demo data on first run so the app is usable immediately.
        if User.query.count() == 0:
            from seed import seed_data
            print(seed_data(application))


# WSGI entry point for gunicorn (`gunicorn app:app`).
app = create_app()
if os.environ.get("SEATLOCK_AUTO_INIT", "1") == "1":
    _init_db(app)


if __name__ == "__main__":
    application = app
    application.run(host=application.config["HOST"],
                    port=application.config["PORT"],
                    debug=application.config["DEBUG"])
