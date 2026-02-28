"""
Markdown Document Viewer - Flask Backend
=========================================
Serves a web UI for browsing and previewing Markdown documents.
Users upload a folder of documents via the browser, and the app
renders them with GitHub-flavored Markdown + Mermaid diagram support.
"""

import os
import shutil
from pathlib import Path

from flask import Flask, jsonify, render_template, request, send_file, abort

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

app = Flask(__name__)

UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", os.path.join(app.root_path, "uploads")))
MAX_UPLOAD_SIZE = int(os.environ.get("MAX_UPLOAD_SIZE", 50 * 1024 * 1024))  # 50 MB

app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_SIZE
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0  # Disable static file caching


@app.after_request
def add_no_cache_headers(response):
    """Prevent browser caching of static JS/CSS during development."""
    if response.content_type and ('javascript' in response.content_type or 'css' in response.content_type):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

# Ensure upload directory exists
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Allowed image extensions (served as binary)
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico", ".bmp"}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _safe_path(filepath: str) -> Path:
    """Resolve *filepath* under UPLOAD_DIR and guard against path traversal."""
    resolved = (UPLOAD_DIR / filepath).resolve()
    if not str(resolved).startswith(str(UPLOAD_DIR.resolve())):
        abort(403, description="Access denied")
    return resolved


def _build_tree(directory: Path, rel_root: Path | None = None) -> list[dict]:
    """Recursively build a JSON-serialisable tree of *directory*."""
    if rel_root is None:
        rel_root = directory

    entries: list[dict] = []
    try:
        children = sorted(directory.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
    except PermissionError:
        return entries

    for child in children:
        if child.name.startswith("."):
            continue  # skip hidden files
        rel = child.relative_to(rel_root)
        if child.is_dir():
            entries.append(
                {
                    "name": child.name,
                    "type": "directory",
                    "path": str(rel),
                    "children": _build_tree(child, rel_root),
                }
            )
        else:
            entries.append(
                {
                    "name": child.name,
                    "type": "file",
                    "path": str(rel),
                }
            )
    return entries


# ---------------------------------------------------------------------------
# Routes – pages
# ---------------------------------------------------------------------------


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/test")
def test_page():
    return render_template("test.html")


# ---------------------------------------------------------------------------
# Routes – API
# ---------------------------------------------------------------------------


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/api/upload", methods=["POST"])
def upload():
    """Accept files uploaded via <input webkitdirectory>.

    Each file's relative path is sent as a corresponding form field
    ``paths[]`` so the server can reconstruct the directory layout.
    """
    files = request.files.getlist("files[]")
    paths = request.form.getlist("paths[]")

    if not files:
        return jsonify({"error": "No files provided"}), 400

    saved = 0
    for file_storage, rel_path in zip(files, paths):
        if not rel_path:
            continue
        dest = _safe_path(rel_path)
        dest.parent.mkdir(parents=True, exist_ok=True)
        file_storage.save(dest)
        saved += 1

    return jsonify({"message": f"{saved} files uploaded", "count": saved})


@app.route("/api/folder", methods=["POST"])
def create_folder():
    """Create a new folder under UPLOAD_DIR.

    Expects JSON body: { "path": "relative/path/to/new-folder" }
    """
    data = request.get_json(silent=True) or {}
    rel_path = (data.get("path") or "").strip()

    if not rel_path:
        return jsonify({"error": "パスが指定されていません"}), 400

    # Validate folder name segments
    for segment in rel_path.replace("\\", "/").split("/"):
        if not segment or segment in (".", "..") or "/" in segment:
            return jsonify({"error": "無効なフォルダ名です"}), 400

    dest = _safe_path(rel_path)
    if dest.exists():
        return jsonify({"error": "同名のフォルダまたはファイルが既に存在します"}), 409

    dest.mkdir(parents=True, exist_ok=True)
    return jsonify({"message": "フォルダを作成しました", "path": rel_path}), 201


@app.route("/api/upload-to", methods=["POST"])
def upload_to_folder():
    """Upload files to a specific target folder.

    Form fields:
      - target: relative path of the destination folder
      - files[]: one or more files
    """
    target = (request.form.get("target") or "").strip()
    files = request.files.getlist("files[]")

    if not files:
        return jsonify({"error": "ファイルが選択されていません"}), 400

    # Resolve target directory (empty string = root)
    if target:
        target_dir = _safe_path(target)
    else:
        target_dir = UPLOAD_DIR

    if not target_dir.is_dir():
        return jsonify({"error": "指定されたフォルダが存在しません"}), 404

    saved = 0
    for f in files:
        filename = f.filename or ""
        # Strip any directory components the browser may include
        filename = filename.replace("\\", "/").split("/")[-1].strip()
        if not filename or filename.startswith("."):
            continue
        dest = (target_dir / filename).resolve()
        # Guard against traversal
        if not str(dest).startswith(str(UPLOAD_DIR.resolve())):
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        f.save(dest)
        saved += 1

    return jsonify({"message": f"{saved} 件のファイルをアップロードしました", "count": saved})


@app.route("/api/tree")
def tree():
    """Return the directory tree of uploaded documents as JSON."""
    return jsonify(_build_tree(UPLOAD_DIR))


@app.route("/api/file/<path:filepath>")
def get_file(filepath: str):
    """Return the contents of a single uploaded file."""
    resolved = _safe_path(filepath)

    if not resolved.is_file():
        abort(404, description="File not found")

    suffix = resolved.suffix.lower()

    # Serve images as binary
    if suffix in IMAGE_EXTENSIONS:
        return send_file(resolved)

    # Everything else as UTF-8 text
    try:
        content = resolved.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return send_file(resolved)

    return content, 200, {"Content-Type": "text/plain; charset=utf-8"}


@app.route("/api/item", methods=["DELETE"])
def delete_item():
    """Delete a single file or folder.

    Expects JSON body: { "path": "relative/path", "type": "file"|"directory" }
    """
    data = request.get_json(silent=True) or {}
    rel_path = (data.get("path") or "").strip()
    item_type = (data.get("type") or "").strip()

    if not rel_path:
        return jsonify({"error": "パスが指定されていません"}), 400
    if item_type not in ("file", "directory"):
        return jsonify({"error": "種別が不正です"}), 400

    resolved = _safe_path(rel_path)

    if not resolved.exists():
        return jsonify({"error": "対象が見つかりません"}), 404

    # Extra safety: don't allow deleting the upload root itself
    if resolved.resolve() == UPLOAD_DIR.resolve():
        return jsonify({"error": "ルートフォルダは削除できません"}), 403

    if item_type == "directory":
        if not resolved.is_dir():
            return jsonify({"error": "指定されたパスはフォルダではありません"}), 400
        shutil.rmtree(resolved)
    else:
        if not resolved.is_file():
            return jsonify({"error": "指定されたパスはファイルではありません"}), 400
        resolved.unlink()

    return jsonify({"message": "削除しました", "path": rel_path})


@app.route("/api/files", methods=["DELETE"])
def clear_files():
    """Remove all uploaded files."""
    if UPLOAD_DIR.exists():
        shutil.rmtree(UPLOAD_DIR)
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    return jsonify({"message": "All files cleared"})


# ---------------------------------------------------------------------------
# Development entry-point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)
