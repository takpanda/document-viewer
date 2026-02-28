# Document Viewer

Markdownドキュメントをブラウザ上でプレビューできるWebアプリケーションです。  
フォルダをアップロードすると、ファイルツリーとGitHub風のMarkdownプレビューを提供します。

![Python](https://img.shields.io/badge/Python-3.12-blue)
![Flask](https://img.shields.io/badge/Flask-3.x-green)
![Docker](https://img.shields.io/badge/Docker-ready-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)

## 主な機能

- **ファイルツリー表示** — アップロードしたフォルダの階層構造を左ペインに表示
- **Markdownプレビュー** — GitHub Flavored Markdown をリアルタイムで描画
- **Mermaidダイアグラム** — Mermaid記法のダイアグラムをSVGでレンダリング
- **シンタックスハイライト** — highlight.js によるコードブロックの色付け
- **ダークモード** — ライト / ダーク テーマの切り替え対応
- **レスポンシブ対応** — モバイル・デスクトップ両対応のUI

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | Vanilla JavaScript, Tailwind CSS |
| Markdownパーサー | marked.js |
| ダイアグラム | mermaid.js |
| コードハイライト | highlight.js |
| バックエンド | Python 3.12, Flask 3.x |
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

ブラウザで **http://localhost:8080** にアクセスしてください。

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

## API

| メソッド | エンドポイント | 説明 |
|---------|---------------|------|
| `GET` | `/` | Web UI |
| `GET` | `/health` | ヘルスチェック |
| `POST` | `/api/upload` | フォルダのアップロード |
| `GET` | `/api/tree` | ファイルツリーの取得 |
| `GET` | `/api/file/{path}` | ファイル内容の取得 |
| `DELETE` | `/api/files` | アップロードファイルの全削除 |

## プロジェクト構成

```
document-viewer/
├── app.py                # Flask バックエンド
├── Dockerfile            # コンテナ定義
├── docker-compose.yml    # Compose 設定
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
