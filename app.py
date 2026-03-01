"""
Markdown Document Viewer - Flask Backend
=========================================
Serves a web UI for browsing and previewing Markdown documents.
Users upload a folder of documents via the browser, and the app
renders them with GitHub-flavored Markdown + Mermaid diagram support.
"""

import io
import json
import os
import re
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import yaml
from flask import Flask, jsonify, render_template, request, send_file, abort

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

app = Flask(__name__)

UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", os.path.join(app.root_path, "uploads")))
SKILLS_DIR = Path(os.environ.get("SKILLS_DIR", os.path.join(app.root_path, "skills")))
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
SKILLS_DIR.mkdir(parents=True, exist_ok=True)

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


@app.route("/api/move", methods=["POST"])
def move_item():
    """Move a file or folder to a new parent directory.

    Expects JSON body:
      { "source": "relative/path", "destination": "new/parent" }
    destination can be empty string to move to root.
    """
    data = request.get_json(silent=True) or {}
    source_rel = (data.get("source") or "").strip()
    dest_rel = (data.get("destination") or "").strip()

    if not source_rel:
        return jsonify({"error": "移動元が指定されていません"}), 400

    source = _safe_path(source_rel)
    if not source.exists():
        return jsonify({"error": "移動元が見つかりません"}), 404

    # Cannot move the upload root itself
    if source.resolve() == UPLOAD_DIR.resolve():
        return jsonify({"error": "ルートフォルダは移動できません"}), 403

    # Resolve destination parent
    if dest_rel:
        dest_parent = _safe_path(dest_rel)
    else:
        dest_parent = UPLOAD_DIR

    if not dest_parent.is_dir():
        return jsonify({"error": "移動先フォルダが存在しません"}), 404

    dest = dest_parent / source.name

    # Prevent moving into itself
    if source.is_dir():
        if dest_parent.resolve() == source.resolve() or str(dest_parent.resolve()).startswith(str(source.resolve()) + os.sep):
            return jsonify({"error": "フォルダを自身の中に移動することはできません"}), 400

    # Already in same location
    if source.parent.resolve() == dest_parent.resolve():
        return jsonify({"error": "移動元と移動先が同じです"}), 400

    if dest.exists():
        return jsonify({"error": "移動先に同名のファイルまたはフォルダが既に存在します"}), 409

    shutil.move(str(source), str(dest))

    new_rel = str(dest.relative_to(UPLOAD_DIR))
    return jsonify({"message": "移動しました", "path": new_rel})


@app.route("/api/files", methods=["DELETE"])
def clear_files():
    """Remove all uploaded files."""
    if UPLOAD_DIR.exists():
        shutil.rmtree(UPLOAD_DIR)
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    return jsonify({"message": "All files cleared"})


# ---------------------------------------------------------------------------
# Skills – Helpers
# ---------------------------------------------------------------------------

METADATA_FILE = SKILLS_DIR / "metadata.json"


def _safe_skill_path(author: str, name: str, extra: str = "") -> Path:
    """Resolve a path under SKILLS_DIR/{author}/{name} and guard against traversal."""
    base = SKILLS_DIR / author / name
    if extra:
        resolved = (base / extra).resolve()
    else:
        resolved = base.resolve()
    if not str(resolved).startswith(str(SKILLS_DIR.resolve())):
        abort(403, description="Access denied")
    return resolved


def _load_metadata() -> list[dict]:
    """Load the skills metadata index."""
    if METADATA_FILE.is_file():
        try:
            return json.loads(METADATA_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    return []


def _save_metadata(data: list[dict]) -> None:
    """Persist the skills metadata index."""
    METADATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _parse_frontmatter(text: str) -> dict:
    """Extract YAML front matter from a Markdown file."""
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.DOTALL)
    if match:
        try:
            return yaml.safe_load(match.group(1)) or {}
        except yaml.YAMLError:
            pass
    return {}


def _collect_files(directory: Path) -> list[str]:
    """Return a list of relative file paths inside *directory*."""
    files = []
    for p in sorted(directory.rglob("*")):
        if p.is_file() and not p.name.startswith("."):
            files.append(str(p.relative_to(directory)))
    return files


def _validate_slug(value: str) -> bool:
    """Check that a value is a safe slug (alphanumeric, hyphens, underscores)."""
    return bool(re.match(r'^[a-zA-Z0-9][a-zA-Z0-9._-]*$', value))


# ---------------------------------------------------------------------------
# Skills – API
# ---------------------------------------------------------------------------


@app.route("/api/skills", methods=["GET"])
def list_skills():
    """Return all shared skills."""
    q = (request.args.get("q") or "").strip().lower()
    metadata = _load_metadata()
    if q:
        metadata = [
            s for s in metadata
            if q in s.get("name", "").lower()
            or q in s.get("description", "").lower()
            or q in s.get("author", "").lower()
        ]
    return jsonify(metadata)


@app.route("/api/skills/upload", methods=["POST"])
def upload_skill():
    """Upload a skill folder.

    Form fields:
      - author: publisher name (slug)
      - files[]: skill files
      - paths[]: relative paths (webkitRelativePath)
    """
    author = (request.form.get("author") or "").strip()
    files = request.files.getlist("files[]")
    paths = request.form.getlist("paths[]")

    if not author:
        return jsonify({"error": "投稿者名が指定されていません"}), 400
    if not _validate_slug(author):
        return jsonify({"error": "投稿者名に使用できない文字が含まれています（英数字・ハイフン・アンダースコアのみ）"}), 400
    if not files:
        return jsonify({"error": "ファイルが選択されていません"}), 400

    # Determine the skill folder name from the first path
    # paths[] look like: "skill-name/SKILL.md", "skill-name/data/foo.txt"
    skill_name = None
    for rel_path in paths:
        parts = rel_path.replace("\\", "/").split("/")
        if len(parts) >= 1 and parts[0]:
            skill_name = parts[0]
            break

    if not skill_name:
        return jsonify({"error": "スキルフォルダ名を特定できません"}), 400
    if not _validate_slug(skill_name):
        return jsonify({"error": "スキルフォルダ名に使用できない文字が含まれています"}), 400

    skill_dir = _safe_skill_path(author, skill_name)

    # Save files
    saved = 0
    for file_storage, rel_path in zip(files, paths):
        if not rel_path:
            continue
        # Strip the top-level skill folder from path so files go directly into skill_dir
        parts = rel_path.replace("\\", "/").split("/", 1)
        inner_path = parts[1] if len(parts) > 1 else parts[0]
        dest = (skill_dir / inner_path).resolve()
        # Guard against traversal
        if not str(dest).startswith(str(SKILLS_DIR.resolve())):
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        file_storage.save(dest)
        saved += 1

    if saved == 0:
        return jsonify({"error": "ファイルを保存できませんでした"}), 400

    # Parse SKILL.md frontmatter for metadata
    skill_md = skill_dir / "SKILL.md"
    fm = {}
    if skill_md.is_file():
        try:
            fm = _parse_frontmatter(skill_md.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError):
            pass

    # Update metadata index
    metadata = _load_metadata()
    # Remove existing entry with same author/name
    metadata = [s for s in metadata if not (s["author"] == author and s["skill_name"] == skill_name)]
    entry = {
        "author": author,
        "skill_name": skill_name,
        "name": fm.get("name", skill_name),
        "description": fm.get("description", ""),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "files": _collect_files(skill_dir),
    }
    metadata.append(entry)
    _save_metadata(metadata)

    return jsonify({"message": f"スキル '{skill_name}' をアップロードしました", "skill": entry}), 201


@app.route("/api/skills/<author>/<name>", methods=["GET"])
def get_skill(author: str, name: str):
    """Return skill metadata and file tree."""
    skill_dir = _safe_skill_path(author, name)
    if not skill_dir.is_dir():
        abort(404, description="スキルが見つかりません")

    metadata = _load_metadata()
    entry = next((s for s in metadata if s["author"] == author and s["skill_name"] == name), None)
    if not entry:
        # Rebuild entry from disk
        skill_md = skill_dir / "SKILL.md"
        fm = {}
        if skill_md.is_file():
            try:
                fm = _parse_frontmatter(skill_md.read_text(encoding="utf-8"))
            except (OSError, UnicodeDecodeError):
                pass
        entry = {
            "author": author,
            "skill_name": name,
            "name": fm.get("name", name),
            "description": fm.get("description", ""),
            "uploaded_at": None,
            "files": _collect_files(skill_dir),
        }

    return jsonify(entry)


@app.route("/api/skills/<author>/<name>/file/<path:filepath>", methods=["GET"])
def get_skill_file(author: str, name: str, filepath: str):
    """Return a single file inside a skill."""
    resolved = _safe_skill_path(author, name, filepath)
    if not resolved.is_file():
        abort(404, description="File not found")

    suffix = resolved.suffix.lower()
    if suffix in IMAGE_EXTENSIONS:
        return send_file(resolved)

    try:
        content = resolved.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return send_file(resolved)

    return content, 200, {"Content-Type": "text/plain; charset=utf-8"}


@app.route("/api/skills/<author>/<name>/download", methods=["GET"])
def download_skill(author: str, name: str):
    """Download a skill as a ZIP file.

    The ZIP is structured so that extracting it to ~/.agents/skills/
    creates the correct directory layout:
      {skill_name}/SKILL.md
      {skill_name}/data/...
    """
    skill_dir = _safe_skill_path(author, name)
    if not skill_dir.is_dir():
        abort(404, description="スキルが見つかりません")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for fpath in sorted(skill_dir.rglob("*")):
            if fpath.is_file() and not fpath.name.startswith("."):
                arcname = f"{name}/{fpath.relative_to(skill_dir)}"
                zf.write(fpath, arcname)
    buf.seek(0)

    return send_file(
        buf,
        mimetype="application/zip",
        as_attachment=True,
        download_name=f"{name}.zip",
    )


@app.route("/api/skills/<author>/<name>", methods=["DELETE"])
def delete_skill(author: str, name: str):
    """Delete a shared skill."""
    skill_dir = _safe_skill_path(author, name)
    if not skill_dir.is_dir():
        abort(404, description="スキルが見つかりません")

    shutil.rmtree(skill_dir)

    # Clean up empty author directory
    author_dir = SKILLS_DIR / author
    if author_dir.is_dir() and not any(author_dir.iterdir()):
        author_dir.rmdir()

    # Update metadata
    metadata = _load_metadata()
    metadata = [s for s in metadata if not (s["author"] == author and s["skill_name"] == name)]
    _save_metadata(metadata)

    return jsonify({"message": "スキルを削除しました"})


# ---------------------------------------------------------------------------
# Development entry-point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)
