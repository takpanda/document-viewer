# アーキテクチャ概要

## システム構成図

```mermaid
graph TB
    subgraph Browser["ブラウザ"]
        UI["Web UI<br/>(Vanilla JS + Tailwind)"]
        MD["marked.js<br/>(Markdown → HTML)"]
        MM["mermaid.js<br/>(ダイアグラム描画)"]
        HL["highlight.js<br/>(シンタックスハイライト)"]
    end

    subgraph Docker["Docker コンテナ"]
        Flask["Flask App<br/>(Python)"]
        GU["Gunicorn<br/>(WSGI Server)"]
        FS["ファイルシステム<br/>(uploads/)"]
    end

    UI -->|"HTTP API"| GU
    GU --> Flask
    Flask --> FS
    UI --> MD
    UI --> MM
    UI --> HL

    style Browser fill:#dbeafe,stroke:#3b82f6
    style Docker fill:#dcfce7,stroke:#22c55e
```

## API 設計

```mermaid
sequenceDiagram
    participant B as ブラウザ
    participant S as Flask Server

    B->>S: POST /api/upload (FormData)
    S-->>B: { count: N }

    B->>S: GET /api/tree
    S-->>B: [{ name, type, path, children }]

    B->>S: GET /api/file/{path}
    S-->>B: ファイル内容 (text/plain)

    B->>S: DELETE /api/files
    S-->>B: { message: "cleared" }
```

## データフロー

```mermaid
flowchart LR
    A[フォルダ選択] --> B[FormData送信]
    B --> C[サーバーに保存]
    C --> D[ツリー構造取得]
    D --> E[ツリー描画]
    E --> F[ファイル選択]
    F --> G[Markdown取得]
    G --> H[HTML変換]
    H --> I[プレビュー表示]
```

## 技術スタック

### フロントエンド
- **Vanilla JavaScript** – フレームワークなし、軽量
- **Tailwind CSS** (CDN) – ユーティリティファーストCSS
- **marked.js** – Markdown → HTML変換
- **mermaid.js** – ダイアグラム描画
- **highlight.js** – コードハイライト

### バックエンド
- **Python 3.12** – ランタイム
- **Flask 3.x** – Webフレームワーク
- **Gunicorn** – 本番WSGIサーバー
- **Docker** – コンテナ化

## クラス図（例）

```mermaid
classDiagram
    class FlaskApp {
        +index() Response
        +health() JSON
        +upload() JSON
        +tree() JSON
        +get_file(path) Response
        +clear_files() JSON
    }

    class Tree {
        -selectedPath: string
        +load() void
        +getSelectedPath() string
    }

    class Preview {
        -currentPath: string
        +showFile(path) void
        +showWelcome() void
        +syncTheme(dark) void
    }

    class App {
        +toggleSidebar(open) void
    }

    App --> Tree : uses
    App --> Preview : uses
    Tree ..> Preview : file-selected event
```
