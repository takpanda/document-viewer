# セットアップガイド

## 前提条件

- Docker / Docker Compose がインストールされていること

## Quick Start

### 1. リポジトリをクローン

```bash
git clone <repository-url>
cd document-viewer
```

### 2. Docker でビルド＆起動

```bash
docker compose up --build
```

### 3. ブラウザでアクセス

```
http://localhost:8080
```

- Web UI: `http://localhost:8080`
- MCP endpoint: `http://localhost:8081/mcp`

> **補足**
> FastMCP の Streamable HTTP endpoint を `curl` などで監視する場合は、
> `Content-Type: application/json` に加えて
> `Accept: application/json, text/event-stream` が必要です。
> さらに、空の JSON (`{}`) ではなく有効な JSON-RPC リクエストを送ってください。

## 使い方

1. 画面右上の **「フォルダ選択」** ボタンをクリック
2. Markdownファイルが含まれるフォルダを選択
3. 左ペインにファイルツリーが表示される
4. `.md` ファイルをクリックするとプレビューが表示される

## 環境変数

| 変数名 | デフォルト値 | 説明 |
|--------|-------------|------|
| `UPLOAD_DIR` | `/app/uploads` | アップロードファイルの保存先 |
| `MAX_UPLOAD_SIZE` | `52428800` (50MB) | アップロードサイズ上限（バイト） |
| `FLASK_ENV` | `production` | Flask実行環境 |

## 開発モード

ローカルで開発する場合：

```bash
# 仮想環境を作成
python -m venv .venv
source .venv/bin/activate

# 依存パッケージをインストール
pip install -r requirements.txt

# 開発サーバーを起動
python app.py
```

### API テスト

中核 API のスモークテストは `pytest` で実行できます。

```bash
pytest -q
```

### エンドツーエンドテスト

Playwright CLI を利用した E2E テスト環境を用意しています。Node.js 18 以上が必要です。

```bash
# 依存関係をインストール
npm install

# Playwright CLI スキルを取得
npm run e2e:install
```

コンテナを使用する場合、ホストに Node をインストールするか、付属の `e2e` サービスを使います。例えばアプリとMCPを起動後に:

```bash
docker compose run --rm e2e
```

サービスはリポジトリをマウントし、`npm install` → `npm run e2e` を実行します。テストコマンドは `package.json` で変更できます。


> **注意**: 開発サーバー (`python app.py`) は本番環境では使用しないでください。
> 本番環境では Gunicorn + Docker を使用します。
