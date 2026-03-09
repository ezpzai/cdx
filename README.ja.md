<div align="center">
  <a href="./README.md">English</a> |
  <a href="./README.ko.md">한국어</a> |
  <a href="./README.zh-CN.md">简体中文</a> |
  <a href="./README.ja.md">日本語</a> |
  <a href="./README.es.md">Español</a>
</div>

# <div align="center">cdx</div>

<div align="center">
  <strong>複数の Codex アカウントを運用する人のための、ローカルファーストなコントロールプレーン。</strong>
</div>

<div align="center">
  正しいプロファイルで Codex を起動し、認証ファイルを探し回らずに利用状況を確認し、
  共有 <code>AGENTS.md</code> の接続状態を 1 つのダッシュボードで管理できます。
</div>

<br />

<div align="center">
  <img alt="Node 20+" src="https://img.shields.io/badge/Node-20%2B-111111?style=for-the-badge&logo=node.js&logoColor=5FA04E" />
  <img alt="React 19" src="https://img.shields.io/badge/React-19-111111?style=for-the-badge&logo=react&logoColor=61DAFB" />
  <img alt="Vite 7" src="https://img.shields.io/badge/Vite-7-111111?style=for-the-badge&logo=vite&logoColor=646CFF" />
  <img alt="Platforms" src="https://img.shields.io/badge/Linux%20%26%20macOS-supported-111111?style=for-the-badge" />
</div>

<br />

<div align="center">
  <a href="#クイックスタート"><img alt="Quick Start" src="https://img.shields.io/badge/Quick%20Start-18181B?style=flat-square&logo=rocket&logoColor=white" /></a>
  <a href="#コマンドリファレンス"><img alt="CLI" src="https://img.shields.io/badge/CLI-18181B?style=flat-square&logo=gnubash&logoColor=white" /></a>
  <a href="#ダッシュボードの仕組み"><img alt="Dashboard" src="https://img.shields.io/badge/Dashboard-18181B?style=flat-square&logo=react&logoColor=61DAFB" /></a>
  <a href="#今後の方向性"><img alt="Roadmap" src="https://img.shields.io/badge/Roadmap-18181B?style=flat-square&logo=github&logoColor=white" /></a>
</div>

<div align="center">
  <sub>ローカルファースト。プロファイル前提。alias の寄せ集めではなく、運用の見通しが欲しい Codex ユーザー向け。</sub>
</div>

## ハイライト

| プロファイル起動 | 利用状況の可視化 | 共有 AGENTS 接続 | ローカルダッシュボード |
| --- | --- | --- | --- |
| 常に正しい `CODEX_HOME` で `codex` を起動 | 認証ファイルを手で開かずに利用状況を確認 | 複数リポジトリで 1 つの `AGENTS.md` を維持 | フルターミナル不要の操作はブラウザで処理 |

## 代表的なワークフロー

| シナリオ | cdx が助けること |
| --- | --- |
| 個人用と仕事用の Codex アカウントを使い分ける開発者 | 環境変数を手で切り替えずに、きれいにプロファイルを切り替えられる |
| 複数の Codex home を管理するチームリード | 誰がログインしているか、どのプランか、どのプロファイルが上限に近いかを素早く把握できる |
| 多数のリポジトリを扱う環境 | 各リポジトリで設定を繰り返さず、1 つの共有 `AGENTS.md` を再利用できる |
| ブラウザ中心の運用 | run、login、doctor 更新などの共通操作をターミナルだけに頼らず実行できる |

## アーキテクチャ概要

```text
レガシー home (~/.codex, ~/.codex2, ...)
           +
モダン home (~/.cdx/profiles/*)
           |
           v
     cdx のプロファイル検出
           |
           +-------------------+
           |                   |
           v                   v
       CLI コマンド        Vite ローカル API
           |                   |
           +---------+---------+
                     |
                     v
  共通アクション: run / usage / login / logout /
  doctor / agents / profile 管理
                     |
                     v
          Codex CLI + ローカルダッシュボード
```

## こういう状況向けです

- 1 台のマシンで複数の Codex アイデンティティを使い分けている
- 長いセッションを始める前にアカウント状態と利用状況を確認したい
- よく使う操作に対して軽いブラウザ UI がほしい
- その場しのぎのスクリプトではなく、複数リポジトリで共有 `AGENTS.md` を統一したい

## cdx を使う理由

Codex の複数アカウント運用は、たいてい shell alias、複製された設定ディレクトリ、そして「どのアカウントがどこでログインしているか」のメモから始まります。
`cdx` はそれを明示的なワークフローに変えます。

- プロファイルごとの `codex` 起動
- アカウント状態と利用状況を 1 か所で確認
- リポジトリをまたいだ共有 `AGENTS.md` 管理
- フルターミナルが不要な操作向けのブラウザダッシュボード

## 現在提供している機能

### CLI

- `cdx run [profile] [codex args...]`
- `cdx usage [profile] [--json]`
- `cdx agents edit --global`
- `cdx agents status`
- `cdx ls`
- `cdx whoami [profile]`
- `cdx login <profile>`
- `cdx logout <profile>`
- `cdx create <profile>`
- `cdx rm <profile> [--force]`
- `cdx doctor`

### Web ダッシュボード

- プロファイル、ライブ利用状況、AGENTS カバレッジ、doctor 状態の概要
- Codex セッションを始めるための run picker
- プロファイル作成
- ログイン / ログアウトセッション開始
- 状態ポーリング付き run セッション開始
- doctor の再取得
- 共有 `AGENTS.md` の準備

## 機能マップ

| 領域 | 現在含まれているもの |
| --- | --- |
| プロファイル管理 | 作成、一覧、確認、削除 |
| アカウント操作 | ログイン、ログアウト、認証メタデータ確認 |
| 利用状況運用 | ライブ利用状況取得、単一 / 複数プロファイル表示 |
| リポジトリ運用 | グローバル AGENTS 準備と状態確認 |
| セッション制御 | ダッシュボードから Codex run を開始し、アクション状態をポーリング |

## クイックスタート

### 要件

- Node.js 20+
- `PATH` 上で `codex` が利用可能
- Linux または macOS

### インストール

```bash
npm install
npm run build
```

### ダッシュボード起動

```bash
npm run dev
```

これで Vite UI と、ダッシュボードが使うローカル API レイヤーが一緒に起動します。

### CLI の利用

```bash
node dist-cli/index.js --help
```

開発中にローカルコマンドとして使いたい場合:

```bash
npm link
cdx doctor
```

## 最初の利用フロー

```bash
cdx create work
cdx login work
cdx usage work
cdx run work
```

すでに複数の Codex home を使っている場合、`~/.codex` や `~/.codex2` のようなレガシープロファイルも検出できます。

## コマンドリファレンス

| コマンド | 役割 |
| --- | --- |
| `cdx run [profile] [codex args...]` | 選択したプロファイルの `CODEX_HOME` で `codex` を起動 |
| `cdx usage [profile] [--json]` | 単一または全プロファイルの利用状況を取得 |
| `cdx agents edit --global` | 共有グローバル `AGENTS.md` を準備して開く |
| `cdx agents status` | プロジェクトとグローバル AGENTS の接続状態を表示 |
| `cdx ls` | 検出したプロファイル一覧を表示 |
| `cdx whoami [profile]` | プロファイルのアカウント情報を表示 |
| `cdx login <profile>` | プロファイルのログインフローを開始 |
| `cdx logout <profile>` | プロファイルのログアウトフローを開始 |
| `cdx create <profile>` | `~/.cdx/profiles` 配下に新しいプロファイルを作成 |
| `cdx rm <profile> [--force]` | プロファイルを削除 |
| `cdx doctor` | 環境と設定をチェック |

## ダッシュボードの仕組み

Web UI は独立したバックエンドサービスではありません。開発時とプレビュー時には、Vite サーバーがローカル API を公開し、CLI と同じプロファイル / アクションロジックを呼び出します。

- `GET /api/dashboard` プロファイル、利用状況、AGENTS 状態、doctor ヒントを集約
- `POST /api/run-sessions` プロファイル単位の Codex run を開始
- `POST /api/login-sessions` ログインフローを開始
- `POST /api/profiles/:id/logout` ログアウトフローを開始
- `GET /api/action-sessions/:id` セッション進行状況をポーリング
- `POST /api/agents/global-file` 共有グローバル `AGENTS.md` を準備

これにより、ホストされたコントロールプレーンや追加サービスなしで、ローカルファーストの構成を保てます。CLI とブラウザ層でロジックを重複させる必要もありません。

## 利用状況データの取得元

`cdx usage` とダッシュボードは、各プロファイルに保存された認証状態を使って ChatGPT バックエンドの usage エンドポイントから主にデータを取得します。
旧 `/status` スクレイピング経路も互換性のため残っていますが、主経路ではありません。

## 現在の制限

- Web UI にはまだ完全な対話型ターミナルはありません
- 長時間の Codex フローは、依然としてブラウザより実ターミナル向きです
- `agents edit --global` は現在、ファイルを準備してローカルエディタを開く方式であり、ブラウザ内エディタではありません
- Windows 対応は未完成です
- 旧 `/status` 経路の一部は Windows で利用できない端末ツールに依存しています

## 開発

```bash
npm run typecheck
npm run lint
npm run build
```

ビルド済み CLI エントリーポイント:

```bash
node dist-cli/index.js --help
```

## 今後の方向性

- 複数アカウント運用の可視性をさらに強化
- ダッシュボードでのセッション監視を強化
- ターミナル依存が低いユーザー向けのプロファイル導入を改善
- リポジトリ間の AGENTS 設定をさらに自動化

## デザイン意図

ダッシュボードは、よくある管理画面ではなく、Codex のための運用サイドカーらしい感触を目指しています。

- `cdx run`
- `cdx usage`
- `cdx agents edit --global`
- `cdx doctor`
