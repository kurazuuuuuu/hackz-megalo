
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
