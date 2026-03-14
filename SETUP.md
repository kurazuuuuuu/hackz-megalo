
## Homebrewツールインストール
```zsh
brew bundle install --file config/Brewfile
```

## Kubernetes (OrbStack)
1. OrbStack.appからKubernetesをONにしクラスタ作成
2. `kubectl config use-context orbstack`でOrbStackのクラスタをコンテキストに設定

> [!NOTE]
> 本開発が終わったら元のクラスタに戻すこと！！
> 普段使ってる環境が壊れたと勘違いするぞ！！

## [Vite+](https://viteplus.dev/) (フロントエンドツールチェイン)
Vite v8に合わせて登場した新しいフロントエンド開発向けツール
- Vite
- Vitest
- Oxlint
- Oxfmt
- Rolldown
- tsdown
- Vite Task
など、たくさんのツールを１つにまとめ管理することができる。また、使用に関してもいい感じにしてくれるっぽい。

### Install `vp`
#### macOS / Linux
```zsh
curl -fsSL https://vite.plus | bash

# 一応パス確認用
source ~/.zshrc
```


