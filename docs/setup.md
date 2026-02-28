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

> **注意**: 開発サーバー (`python app.py`) は本番環境では使用しないでください。
> 本番環境では Gunicorn + Docker を使用します。
