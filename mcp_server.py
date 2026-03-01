"""
MCP Server for Document Viewer
================================
Provides LLM access to uploaded documents via Model Context Protocol (SSE transport).
Tools: list_documents, read_document, search_documents, get_document_info
Resources: docs://tree, docs://file/{path}
"""

import os
import re
from datetime import datetime, timezone
from pathlib import Path

from mcp.server.fastmcp import FastMCP

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", "/app/uploads"))
SKILLS_DIR = Path(os.environ.get("SKILLS_DIR", "/app/skills"))
MCP_PORT = int(os.environ.get("MCP_PORT", "8081"))

mcp = FastMCP(
    "Document Viewer MCP",
    instructions=(
        "このMCPサーバーは、Document Viewerにアップロードされたドキュメントへのアクセスを提供します。"
        "list_documents でファイル一覧を取得し、read_document でファイル内容を読み、"
        "search_documents でキーワード検索ができます。"
        "また、共有されたGitHub Copilotスキルの検索・閲覧も可能です。"
        "list_skills でスキル一覧、search_skills で検索、get_skill_info で詳細を取得できます。"
    ),
    host="0.0.0.0",
    port=MCP_PORT,
)

# Allowed text extensions for reading
TEXT_EXTENSIONS = {
    ".md", ".txt", ".json", ".yaml", ".yml", ".toml", ".ini", ".cfg",
    ".py", ".js", ".ts", ".jsx", ".tsx", ".html", ".css", ".scss",
    ".xml", ".csv", ".sh", ".bash", ".zsh", ".fish",
    ".java", ".kt", ".go", ".rs", ".c", ".cpp", ".h", ".hpp",
    ".rb", ".php", ".sql", ".r", ".swift", ".dart",
    ".env", ".gitignore", ".dockerignore", ".editorconfig",
    ".lock", ".log", ".conf", ".cfg", ".properties",
}

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico", ".bmp"}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _safe_resolve(rel_path: str) -> Path:
    """Resolve a relative path under UPLOAD_DIR, guarding traversal."""
    resolved = (UPLOAD_DIR / rel_path).resolve()
    if not str(resolved).startswith(str(UPLOAD_DIR.resolve())):
        raise ValueError("Access denied: path traversal detected")
    return resolved


def _is_text_file(path: Path) -> bool:
    """Check if a file is likely a text file."""
    if path.suffix.lower() in TEXT_EXTENSIONS:
        return True
    # No extension — try reading a small chunk
    if not path.suffix:
        try:
            path.read_bytes()[:512].decode("utf-8")
            return True
        except (UnicodeDecodeError, OSError):
            return False
    return False


def _build_tree(directory: Path, rel_root: Path | None = None) -> list[dict]:
    """Recursively build a tree structure."""
    if rel_root is None:
        rel_root = directory

    entries: list[dict] = []
    try:
        children = sorted(directory.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
    except PermissionError:
        return entries

    for child in children:
        if child.name.startswith("."):
            continue
        rel = child.relative_to(rel_root)
        if child.is_dir():
            entries.append({
                "name": child.name,
                "type": "directory",
                "path": str(rel),
                "children": _build_tree(child, rel_root),
            })
        else:
            entries.append({
                "name": child.name,
                "type": "file",
                "path": str(rel),
            })
    return entries


def _collect_files(directory: Path, rel_root: Path | None = None) -> list[Path]:
    """Collect all files recursively."""
    if rel_root is None:
        rel_root = directory
    files = []
    try:
        for child in sorted(directory.iterdir()):
            if child.name.startswith("."):
                continue
            if child.is_dir():
                files.extend(_collect_files(child, rel_root))
            elif child.is_file():
                files.append(child)
    except PermissionError:
        pass
    return files


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------


@mcp.tool()
def list_documents(path: str = "") -> str:
    """アップロードされたドキュメントのファイルツリーを取得します。

    Args:
        path: 対象ディレクトリの相対パス（省略でルート）
    """
    import json

    target = _safe_resolve(path) if path else UPLOAD_DIR
    if not target.is_dir():
        return f"エラー: '{path}' はディレクトリではありません"

    tree = _build_tree(target, UPLOAD_DIR)
    if not tree:
        return "ドキュメントがアップロードされていません"

    return json.dumps(tree, ensure_ascii=False, indent=2)


@mcp.tool()
def read_document(path: str) -> str:
    """指定されたドキュメントファイルの内容を読み取ります。

    Args:
        path: ファイルの相対パス（例: "docs/architecture.md"）
    """
    resolved = _safe_resolve(path)

    if not resolved.is_file():
        return f"エラー: '{path}' が見つかりません"

    if resolved.suffix.lower() in IMAGE_EXTENSIONS:
        return f"'{path}' は画像ファイルです（テキストとして読み取れません）"

    if not _is_text_file(resolved):
        return f"'{path}' はバイナリファイルのため読み取れません"

    try:
        content = resolved.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return f"'{path}' のエンコーディングを読み取れません"

    # 大きすぎるファイルは切り詰め
    max_chars = 100_000
    if len(content) > max_chars:
        content = content[:max_chars] + f"\n\n... (以降省略: 全{len(content)}文字)"

    return content


@mcp.tool()
def search_documents(query: str, file_pattern: str = "") -> str:
    """ドキュメント内をキーワード検索します。マッチした行とコンテキストを返します。

    Args:
        query: 検索キーワード（正規表現対応）
        file_pattern: ファイル名のフィルタ（glob形式、例: "*.md"）。省略で全ファイル対象。
    """
    import json
    from fnmatch import fnmatch

    if not query:
        return "エラー: 検索キーワードを指定してください"

    try:
        pattern = re.compile(query, re.IGNORECASE)
    except re.error:
        # 正規表現として無効な場合はリテラル検索
        pattern = re.compile(re.escape(query), re.IGNORECASE)

    all_files = _collect_files(UPLOAD_DIR)
    results = []
    total_matches = 0

    for fpath in all_files:
        if not _is_text_file(fpath):
            continue

        rel = str(fpath.relative_to(UPLOAD_DIR))

        # ファイルパターンフィルタ
        if file_pattern and not fnmatch(fpath.name, file_pattern):
            continue

        try:
            lines = fpath.read_text(encoding="utf-8").splitlines()
        except (UnicodeDecodeError, OSError):
            continue

        file_matches = []
        for i, line in enumerate(lines, 1):
            if pattern.search(line):
                # 前後1行のコンテキスト
                ctx_start = max(0, i - 2)
                ctx_end = min(len(lines), i + 1)
                context_lines = lines[ctx_start:ctx_end]
                file_matches.append({
                    "line": i,
                    "text": line.strip(),
                    "context": "\n".join(context_lines),
                })

        if file_matches:
            total_matches += len(file_matches)
            results.append({
                "path": rel,
                "matches": file_matches[:10],  # ファイルあたり最大10件
                "match_count": len(file_matches),
            })

    if not results:
        return f"'{query}' に一致するドキュメントは見つかりませんでした"

    # マッチ数でソート
    results.sort(key=lambda r: r["match_count"], reverse=True)

    output = {
        "query": query,
        "total_matches": total_matches,
        "files_matched": len(results),
        "results": results[:20],  # 最大20ファイル
    }
    return json.dumps(output, ensure_ascii=False, indent=2)


@mcp.tool()
def get_document_info(path: str) -> str:
    """ファイルまたはディレクトリのメタ情報を取得します。

    Args:
        path: ファイルまたはディレクトリの相対パス
    """
    import json

    resolved = _safe_resolve(path)

    if not resolved.exists():
        return f"エラー: '{path}' が見つかりません"

    stat = resolved.stat()
    modified = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()

    if resolved.is_file():
        size = stat.st_size
        info = {
            "path": path,
            "type": "file",
            "size_bytes": size,
            "size_human": (
                f"{size} B" if size < 1024
                else f"{size / 1024:.1f} KB" if size < 1024 * 1024
                else f"{size / (1024 * 1024):.1f} MB"
            ),
            "extension": resolved.suffix,
            "is_text": _is_text_file(resolved),
            "modified": modified,
        }
    else:
        files = _collect_files(resolved)
        info = {
            "path": path,
            "type": "directory",
            "file_count": len(files),
            "total_size_bytes": sum(f.stat().st_size for f in files),
            "modified": modified,
        }

    return json.dumps(info, ensure_ascii=False, indent=2)


# ---------------------------------------------------------------------------
# Resources
# ---------------------------------------------------------------------------


@mcp.resource("docs://tree")
def resource_tree() -> str:
    """ドキュメントツリー全体を返すリソース"""
    return list_documents()


@mcp.resource("docs://file/{path}")
def resource_file(path: str) -> str:
    """個別ファイルの内容を返すリソース"""
    return read_document(path)


# ---------------------------------------------------------------------------
# Skills – Helpers
# ---------------------------------------------------------------------------

SKILLS_METADATA_FILE = SKILLS_DIR / "metadata.json"


def _load_skills_metadata() -> list[dict]:
    """Load the skills metadata index."""
    if SKILLS_METADATA_FILE.is_file():
        try:
            import json
            return json.loads(SKILLS_METADATA_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return []


def _safe_skill_resolve(author: str, name: str, extra: str = "") -> Path:
    """Resolve a path under SKILLS_DIR/{author}/{name}, guarding traversal."""
    base = SKILLS_DIR / author / name
    if extra:
        resolved = (base / extra).resolve()
    else:
        resolved = base.resolve()
    if not str(resolved).startswith(str(SKILLS_DIR.resolve())):
        raise ValueError("Access denied: path traversal detected")
    return resolved


# ---------------------------------------------------------------------------
# Skills – Tools
# ---------------------------------------------------------------------------


@mcp.tool()
def list_skills(query: str = "") -> str:
    """共有されたGitHub Copilotスキルの一覧を取得します。

    Args:
        query: 検索キーワード（省略で全件取得）。スキル名、説明、投稿者名を検索対象とします。
    """
    import json

    metadata = _load_skills_metadata()

    if query:
        q = query.lower()
        metadata = [
            s for s in metadata
            if q in s.get("name", "").lower()
            or q in s.get("description", "").lower()
            or q in s.get("author", "").lower()
        ]

    if not metadata:
        return "共有されたスキルはありません" if not query else f"'{query}' に一致するスキルは見つかりませんでした"

    # Return summary without file lists for brevity
    summary = []
    for s in metadata:
        summary.append({
            "author": s.get("author"),
            "skill_name": s.get("skill_name"),
            "name": s.get("name"),
            "description": s.get("description", ""),
            "uploaded_at": s.get("uploaded_at"),
        })

    return json.dumps(summary, ensure_ascii=False, indent=2)


@mcp.tool()
def get_skill_info(author: str, skill_name: str) -> str:
    """指定されたスキルの詳細情報とSKILL.mdの内容を取得します。

    Args:
        author: スキルの投稿者名
        skill_name: スキル名
    """
    import json

    try:
        skill_dir = _safe_skill_resolve(author, skill_name)
    except ValueError as e:
        return str(e)

    if not skill_dir.is_dir():
        return f"エラー: スキル '{author}/{skill_name}' が見つかりません"

    metadata = _load_skills_metadata()
    entry = next((s for s in metadata if s.get("author") == author and s.get("skill_name") == skill_name), None)

    # Read SKILL.md content
    skill_md = skill_dir / "SKILL.md"
    md_content = ""
    if skill_md.is_file():
        try:
            md_content = skill_md.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            md_content = "(読み取りに失敗しました)"

    # Collect file list
    files = []
    for p in sorted(skill_dir.rglob("*")):
        if p.is_file() and not p.name.startswith("."):
            files.append(str(p.relative_to(skill_dir)))

    result = {
        "author": author,
        "skill_name": skill_name,
        "name": entry.get("name", skill_name) if entry else skill_name,
        "description": entry.get("description", "") if entry else "",
        "uploaded_at": entry.get("uploaded_at") if entry else None,
        "files": files,
        "skill_md_content": md_content,
    }

    return json.dumps(result, ensure_ascii=False, indent=2)


@mcp.tool()
def search_skills(query: str) -> str:
    """スキルのSKILL.md内をキーワード検索します。

    Args:
        query: 検索キーワード（正規表現対応）
    """
    import json

    if not query:
        return "エラー: 検索キーワードを指定してください"

    try:
        pattern = re.compile(query, re.IGNORECASE)
    except re.error:
        pattern = re.compile(re.escape(query), re.IGNORECASE)

    metadata = _load_skills_metadata()
    results = []

    for skill in metadata:
        author = skill.get("author", "")
        name = skill.get("skill_name", "")
        try:
            skill_dir = _safe_skill_resolve(author, name)
        except ValueError:
            continue

        skill_md = skill_dir / "SKILL.md"
        if not skill_md.is_file():
            continue

        try:
            content = skill_md.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue

        lines = content.splitlines()
        matches = []
        for i, line in enumerate(lines, 1):
            if pattern.search(line):
                matches.append({"line": i, "text": line.strip()})

        if matches:
            results.append({
                "author": author,
                "skill_name": name,
                "name": skill.get("name", name),
                "match_count": len(matches),
                "matches": matches[:5],
            })

    if not results:
        return f"'{query}' に一致するスキルは見つかりませんでした"

    results.sort(key=lambda r: r["match_count"], reverse=True)

    output = {
        "query": query,
        "skills_matched": len(results),
        "results": results[:20],
    }
    return json.dumps(output, ensure_ascii=False, indent=2)


# ---------------------------------------------------------------------------
# Skills – Resources
# ---------------------------------------------------------------------------


@mcp.resource("skills://list")
def resource_skills_list() -> str:
    """共有スキル一覧を返すリソース"""
    return list_skills()


@mcp.resource("skills://skill/{author}/{name}")
def resource_skill(author: str, name: str) -> str:
    """個別スキルの詳細を返すリソース"""
    return get_skill_info(author, name)


# ---------------------------------------------------------------------------
# Entry-point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    mcp.run(transport="streamable-http")
