import importlib.util
import io
import sys
from pathlib import Path

import pytest


@pytest.fixture()
def client(tmp_path, monkeypatch):
    upload_dir = tmp_path / "uploads"
    skills_dir = tmp_path / "skills"
    monkeypatch.setenv("UPLOAD_DIR", str(upload_dir))
    monkeypatch.setenv("SKILLS_DIR", str(skills_dir))

    module_name = "document_viewer_app_under_test"
    sys.modules.pop(module_name, None)

    app_path = Path(__file__).resolve().parents[1] / "app.py"
    spec = importlib.util.spec_from_file_location(module_name, app_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)

    module.app.config.update(TESTING=True)

    with module.app.test_client() as test_client:
        yield test_client

    sys.modules.pop(module_name, None)


def test_health_returns_ok(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.get_json() == {"status": "ok"}



def test_upload_builds_tree_and_reads_file(client):
    response = client.post(
        "/api/upload",
        data={
            "files[]": [
                (io.BytesIO(b"# Hello\n"), "README.md"),
                (io.BytesIO(b"nested content\n"), "guide.md"),
            ],
            "paths[]": ["README.md", "docs/guide.md"],
        },
        content_type="multipart/form-data",
    )

    assert response.status_code == 200
    assert response.get_json()["count"] == 2

    tree_response = client.get("/api/tree")
    assert tree_response.status_code == 200
    assert tree_response.get_json() == [
        {
            "name": "docs",
            "type": "directory",
            "path": "docs",
            "children": [
                {"name": "guide.md", "type": "file", "path": "docs/guide.md"}
            ],
        },
        {"name": "README.md", "type": "file", "path": "README.md"},
    ]

    file_response = client.get("/api/file/README.md")
    assert file_response.status_code == 200
    assert file_response.get_data(as_text=True) == "# Hello\n"



def test_create_folder_validates_input_and_conflicts(client):
    response = client.post("/api/folder", json={"path": "notes"})
    assert response.status_code == 201
    assert response.get_json()["path"] == "notes"

    conflict_response = client.post("/api/folder", json={"path": "notes"})
    assert conflict_response.status_code == 409

    invalid_response = client.post("/api/folder", json={"path": "../escape"})
    assert invalid_response.status_code == 400



def test_upload_requires_files(client):
    response = client.post(
        "/api/upload",
        data={"paths[]": ["README.md"]},
        content_type="multipart/form-data",
    )

    assert response.status_code == 400
    assert response.get_json() == {"error": "No files provided"}
