<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# フロントエンド開発 (apps/frontend-webxr)
1. OpenSpecでプラン作成
2. 実装
    2.1 `vp check`で構文エラーがないことを確認
    2.2 エラーがある場合修正
3. ルートディレクトリで`docker compose build <該当サービス> --no-cache`を行い、ビルドエラーがないことを確認
4. 実装を完了と判断しユーザーに報告

# バックエンドサービス開発 (apps/**-service)
1. OpenSpecでプラン作成
2. 実装
    2.1 `golangci-lint run`でコードリントエラーを確認
    2.2 コードリントエラーがあれば修正
    2.2 再度確認しエラーがないことを確認
3. ルートディレクトリで`docker compose build <該当サービス> --no-cache`を行い、ビルドエラーがないことを確認
4. 実装を完了と判断しユーザーに報告

# Gitコミット
- コミットメッセージは必ず日本語で記述
- `feat, refactor, fix`のようなPrefixをコミットメッセージの先頭に付ける

