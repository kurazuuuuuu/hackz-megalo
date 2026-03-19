# ハックツハッカソン 〜メガロカップ〜
### 関連URL
- Topa`z: https://topaz.dev/projects/afb5ff1dbfb7d031e984
- Doorkeeper: https://hackz-community.doorkeeper.jp/events/194352

> [!NOTE]
> 完全に一人プレイ専用です。
> もし複数人がプレイするならその人数分GKEが必要になるのでインフラ費用が大変なことになります。

## 概要
- KubernetesのPodをいじめたり観察して遊ぶやつ
- Podが死んでも*k8sの素晴らしい力で新たな生命(Pod)が生えてくる*

> [!WARNING]
> Podは非常にか弱い生命です。大切にしてあげてください。
> 手が触れたり強い風が当たると死んでしまうかもしれません。

## 技術構成

### フロントエンド
- Three.js
	- Github: https://github.com/mrdoob/three.js
	- Docs: https://threejs.org/docs/
- WebXR
	- Meta WebXR Docs: https://developers.meta.com/horizon/documentation/web/webxr-overview/
	- Docs: https://developer.mozilla.org/ja/docs/Web/API/WebXR_Device_API/Fundamentals
- WebSocket
	- Docs: https://developer.mozilla.org/ja/docs/Web/API/WebSockets_API

### バックエンド
- Go
	- Github: https://github.com/golang/go
	- Effective Go: https://go.dev/doc/effective_go
	- Standard library: https://pkg.go.dev/std

### インフラ
#### IaC
- Terraform
	- Github: https://github.com/hashicorp/terraform
	- Docs: https://developer.hashicorp.com/terraform/docs
	- Deploy stack: `terraform/gcp/deploy`
#### Network
- Cloudflare
	- Docs: https://developers.cloudflare.com/
- Cloudflare Tunnel
	- Docs: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/

#### Deployment
- Google Kubernetes Engine (GKE)
	- Docs: https://docs.cloud.google.com/kubernetes-engine/docs?hl=ja
	- Kubernetes secrets: External Secrets Operator + Workload Identity
- Google Memorystore for Redis
	- Docs: https://docs.cloud.google.com/memorystore/docs/redis?hl=ja
- Google Logging
- Google Error Reporting
	- Docs: https://docs.cloud.google.com/error-reporting/docs?hl=ja

#### CI/CD
- Google Cloud Build
	- Docs: https://docs.cloud.google.com/build/docs/overview?hl=ja
- Google Cloud Deploy
	- Docs: https://docs.cloud.google.com/deploy/docs?hl=ja
- Google Cloud Artifact Registry
	- Docs: https://docs.cloud.google.com/artifact-registry/docs?hl=ja

### 開発環境
- WezTerm (*neovim*)
- Terraform
- Meta Quest Developer Hub
	-  Meta Quest Pro
- OrbStack (macOS)
	- Github: https://github.com/orbstack/orbstack
	- Docs: https://docs.orbstack.dev/
	- Docker Container
	- Kubernetes
#### IDE
- Antigravity

#### フロントエンド開発
- Vite+
    - Github: https://github.com/voidzero-dev/vite-plus

#### バックエンド開発
- Air
    - Github: https://github.com/air-verse/air

- golangci-lint
	- Github: https://github.com/golangci/golangci-lint

#### AIツール

##### フロント・バックエンド開発
- Codex CLI (gpt-5.3-codex)

##### インフラ構築
- Antigravity (gemini-3.1-pro)
- Gemini CLI (gemini-3.1-pro)

##### 情報収集
- Grok
- NotebookLM
- Gemini (DeepResearch)
- ChatGPT (DeepResearch)
