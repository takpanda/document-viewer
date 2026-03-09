# Document Viewer

Markdownドキュメントをブラウザ上でプレビューできるWebアプリケーションです。  
フォルダをアップロードすると、ファイルツリーとGitHub風のMarkdownプレビューを提供します。  
MCPサーバーを内蔵しており、LLMからドキュメントへのアクセスも可能です。

![Python](https://img.shields.io/badge/Python-3.12-blue)
![Flask](https://img.shields.io/badge/Flask-3.x-green)
![MCP](https://img.shields.io/badge/MCP-Streamable_HTTP-purple)
![Docker](https://img.shields.io/badge/Docker-ready-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)

## 主な機能

- **ファイルツリー表示** — アップロードしたフォルダの階層構造を左ペインに表示
- **Markdownプレビュー** — GitHub Flavored Markdown をリアルタイムで描画
- **Mermaidダイアグラム** — Mermaid記法のダイアグラムをSVGでレンダリング
- **シンタックスハイライト** — highlight.js によるコードブロックの色付け
- **ダークモード** — ライト / ダーク テーマの切り替え対応
- **レスポンシブ対応** — モバイル・デスクトップ両対応のUI
- **MCP サーバー** — LLMからドキュメントの参照・検索が可能（Streamable HTTP）

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | Vanilla JavaScript, Tailwind CSS |
| Markdownパーサー | marked.js |
| ダイアグラム | mermaid.js |
| コードハイライト | highlight.js |
| バックエンド | Python 3.12, Flask 3.x |
| MCP サーバー | mcp Python SDK (FastMCP) |
| WSGIサーバー | Gunicorn |
| コンテナ | Docker / Docker Compose |

## クイックスタート

### Docker（推奨）

```bash
# リポジトリをクローン
git clone https://github.com/takpanda/document-viewer.git
cd document-viewer

# ビルド＆起動
docker compose up --build
```

- Web UI: **http://localhost:8080**
- MCP エンドポイント: **http://localhost:8081/mcp**

※FastMCP の Streamable HTTP エンドポイントを `healthcheck` する場合は、
`Content-Type: application/json` に加えて
`Accept: application/json, text/event-stream` を付与し、
**空の JSON (`{}`) ではなく有効な JSON-RPC リクエスト** を送る必要があります。
空の JSON だと 400 Bad Request になります。

### ローカル開発

```bash
# 仮想環境を作成
python -m venv .venv
source .venv/bin/activate

# 依存パッケージをインストール
pip install -r requirements.txt

# 開発サーバーを起動
python app.py
```

> **注意**: `python app.py` は開発用です。本番環境では Docker + Gunicorn を使用してください。

## 使い方

1. 画面右上の **「フォルダ選択」** ボタンをクリック
2. Markdownファイルが含まれるフォルダを選択してアップロード
3. 左ペインにファイルツリーが表示される
4. `.md` ファイルをクリックするとプレビューが表示される

## 環境変数

| 変数名 | デフォルト値 | 説明 |
|--------|-------------|------|
| `UPLOAD_DIR` | `/app/uploads` | アップロードファイルの保存先 |
| `MAX_UPLOAD_SIZE` | `52428800` (50MB) | アップロードサイズ上限（バイト） |
| `FLASK_ENV` | `production` | Flask実行環境 |
| `MCP_PORT` | `8081` | MCPサーバーのポート番号 |

## API

| メソッド | エンドポイント | 説明 |
|---------|---------------|------|
| `GET` | `/` | Web UI |
| `GET` | `/health` | ヘルスチェック |
| `POST` | `/api/upload` | フォルダのアップロード |
| `GET` | `/api/tree` | ファイルツリーの取得 |
| `GET` | `/api/file/{path}` | ファイル内容の取得 |
| `DELETE` | `/api/files` | アップロードファイルの全削除 |

## MCP サーバー

LLMがアップロードされたドキュメントにアクセスするための [Model Context Protocol](https://modelcontextprotocol.io/) サーバーです。  
Streamable HTTP トランスポートで動作し、`http://localhost:8081/mcp` で接続できます。

### MCP Tools

> **ヘルスチェックに関する補足**
>
> FastMCP は Streamable HTTP トランスポートで動作するため、
> `Content-Type: application/json` だけでなく
> `Accept: application/json, text/event-stream` も必要です。
> また、`{}` のような空 JSON ではなく、`initialize` などの
> **有効な JSON-RPC リクエスト** を送ってください。
>
> 例:
>
> ```bash
> curl -X POST http://localhost:8081/mcp \
>   -H "Content-Type: application/json" \
>   -H "Accept: application/json, text/event-stream" \
>   -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"healthcheck","version":"1.0"}}}'
> ```

| Tool | 説明 | パラメータ |
|------|------|------------|
| `list_documents` | ファイルツリーの取得 | `path?` — 対象ディレクトリ（省略でルート） |
| `read_document` | ファイル内容の読み取り | `path` — ファイルの相対パス |
| `search_documents` | 全文キーワード検索（正規表現対応） | `query`, `file_pattern?` |
| `get_document_info` | メタ情報の取得（サイズ・更新日等） | `path` |

### MCP Resources

| URI | 説明 |
|-----|------|
| `docs://tree` | ドキュメントツリー全体 |
| `docs://file/{path}` | 個別ファイルの内容 |

### クライアント設定例

#### VS Code（`.vscode/mcp.json`）

```json
{
  "servers": {
    "document-viewer": {
      "type": "http",
      "url": "http://localhost:8081/mcp"
    }
  }
}
```

#### Claude Desktop（`claude_desktop_config.json`）

```json
{
  "mcpServers": {
    "document-viewer": {
      "url": "http://localhost:8081/mcp"
    }
  }
}
```

## API テスト

中核 API のスモークテストは `pytest` で実行できます。

```bash
pytest -q
```

このテストでは主に以下を確認します。

- `/health`
- `/api/upload`
- `/api/tree`
- `/api/file/<path>`
- `/api/folder`

GitHub Actions でも pull request ごとに自動実行されます。

## End-to‑End テスト (Playwright CLI)

このプロジェクトでは [Playwright CLI](https://github.com/microsoft/playwright-cli) を使ってブラウザの自動化やエンドツーエンドのテストができます。

### セットアップ

1. Node 18 以上がインストールされていることを確認します。
2. ルートディレクトリで依存関係をインストールします:

   ```bash
   npm install
   ```

3. Playwright のコマンドラインツールとスキルを取得します:

   ```bash
   npm run e2e:install
   ```

> `playwright-cli` はグローバルにインストールされていなくても `npx` 経由で実行できます。

### 使い方

- 開発サーバーを立ち上げたあと、簡単な操作を試すには:
  ```bash
  npm run e2e:open           # ブラウザを起動して http://localhost:8080 を開く
  npm run e2e                # スクリーンショットを撮る簡単なワンライナー
  ```

- `playwright-cli --help` で利用可能なコマンドやスキルの一覧を参照します。
- 出力アーティファクトはデフォルトで `playwright-artifacts/` ディレクトリに保存されます。

### コンフィグレーション

`.playwright/cli.config.json` にはデフォルトのブラウザ、出力先などを記述済みです。必要に応じて調整してください。

## プロジェクト構成

```
document-viewer/
├── app.py                # Flask バックエンド
├── mcp_server.py         # MCP サーバー（Streamable HTTP）
├── Dockerfile            # コンテナ定義
├── docker-compose.yml    # Compose 設定（app + mcp）
├── requirements.txt      # Python 依存パッケージ
├── docs/                 # プロジェクトドキュメント
│   ├── architecture.md   # アーキテクチャ概要
│   └── setup.md          # セットアップガイド
├── static/
│   ├── css/style.css     # カスタムスタイル
│   ├── js/
│   │   ├── app.js        # メインアプリケーション
│   │   ├── preview.js    # Markdownプレビュー
│   │   └── tree.js       # ファイルツリー
│   └── vendor/           # サードパーティライブラリ
└── templates/
    └── index.html        # メインHTML
```

## ドキュメント

- [セットアップガイド](docs/setup.md)
- [アーキテクチャ概要](docs/architecture.md)
