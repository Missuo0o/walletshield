# WalletShield Local · v0.4.1 · Muse Wonder

[English README](README.md) · 简体中文说明

最新完整检查、修复、真实 Muse 与 MetaMask 观察及剩余验收边界见[完整验证记录 — 2026-10-23](docs/FULL-VALIDATION-2026-10-23-zh.md)。本轮包含 460 个通过的单元/回归测试、66 个本地节点实验室案例、71 个真实模型案例及有限补测，以及两个真实 Snap 确认弹窗。这是不同层的验证，不是检测准确率。旧验收文件保留为历史记录。

WalletShield 是一个 EVM 钱包安全原型，包含本地钱包实验室，以及可选的、需要身份验证的托管模式。配对后的 MetaMask Snap 将尚未签名的交易或消息请求发送到配置的后端。默认情况下，后端运行在你的电脑上。后端解码请求、选择证据采集器、读取配置网络的状态，按需在隔离的 Anvil 分叉中模拟交易，并请求 **Meta Muse Wonder `muse-wonder-1.0`** 评估所收集的证据。网页和 Snap 会在你决定于钱包中确认或取消之前显示结果。

它提供的是**签名前建议**。它不会强制阻止操作、代你签名、追回资金，也不会在签名后持续监控。自动分析仅覆盖 MetaMask 实际交给 Snap 的 EVM 交易和消息请求。安装 Snap 并不代表它会拦截每一项钱包操作。

本地钱包实验室目前包含 **66 个代表性案例：51 笔交易和 15 次消息签名**，涉及 **30 个分析配置中的 25 个**。这些数字描述已实现的路径和本地示例，不代表检测准确率，也不代表覆盖了多少比例的钱包风险。当前界面、新生成的解释和英文操作文档均使用英语；本页和下列中文文档提供中文说明。旧报告保留原始语言，并带有相应标注。

首次运行与故障恢复步骤请参阅[中文用户手册](docs/USER-MANUAL-zh.md)。每个分析配置提取的准确字段、尚存的不确定性和可扩展方向，请参阅[中文覆盖指南](docs/AI-COVERAGE-GUIDE-zh.md)。[README.md](README.md) 是主要英文说明，英文详细文档为[用户手册](docs/USER-MANUAL.md)和[自动生成的覆盖指南](docs/AI-COVERAGE-GUIDE.md)。

当前已实现/部分实现/手动入口/未覆盖的对照表和本轮修复说明见[当前覆盖范围](docs/CURRENT-COVERAGE-zh.md)（[English](docs/CURRENT-COVERAGE.md)）。

本轮还增加 DAI 结构 Permit、ERC-3009 单次转移授权、Safe 结构控制/执行、有界递归封装摘要、V3 仓位状态、部分桥提款/完成参数和通用 withdraw(uint256)。它们是有边界的候选适配器，不是全协议支持。已确认 nonce 仍固定区块，另有独立未固定的节点 pending nonce 视图，不取得原交易内容或替换规则。66 个钱包案例现包含 8 个简化账户交易和 4 个 DAI/ERC-3009 候选签名；其他新路径有 API/代码测试，不代表官方协议或公网钱包验收。详见[扩展能力与验收边界](docs/EXTENDED-COVERAGE-2026-10-22.md)。

当前检查使用钱包提供的未签名请求、来源 origin/网络元数据，以及成功取得的 RPC、情报和模拟证据。Muse 评价可观察请求信号，包括支持范围内的来源、消息和请求不一致。链/provider/执行上下文指技术观察。历史报告与验收文件保留原始记录，不被删除或改写。


## 当前证据与接入新增能力

当前 Muse 回复使用 `walletshield-facts-v1`：精确主体/字段/值/来源/链/区块/时间/范围，并在理由和维度中引用 `fact_ids`；历史回复继续可读。后端验证观察复制和相关性，不证明每个外部响应或自然语言句子真实。数字仍只由 Muse 给出，没有固定权重、下限或兜底。

后端部署登记/代码匹配、USD 参考价格源和维护式两链桥接路线核对已移除。已有 `.local/registry.json` 不再读取。基础交易/授权/签名解析、配置的 RPC 状态、部分 V2 路径（含已有原生币路径）、代币出资 V3 与通用分叉模拟、可选 GoPlus 和 Muse 评分保留。`ENABLE_SOURCE_VERIFICATION=1` 仍独立启用有界 Sourcify 源码匹配观察；它不是官方部署登记或代码审计。

有界证据包括 Seaport 签入承诺、Permit2 witness 外层承诺、UserOperation 参数/代码/费用观察、EIP-7702 元组密码学/有条件状态、原始分叉交易前后部分权限/金库/借贷状态、代币出资的 V3 路线实验和候选池状态。原来依赖登记的 Seaport counter/status/直接授权与 EntryPoint keyed nonce/deposit 检查不再提供。dApp 包装器须主动接入，不是全局钱包拦截；托管 ERC-1271 只验证本次登录，不验证未来资产签名。

Wallet and network 页面提供有界只读 RPC 能力观察：固定区块调用、一次历史余额和固定 trace 探测。成功不是完整 archive/trace 保证。源码核对仍是独立可选后端配置，公网页面不显示其状态。Public networks 的切换按钮通过选定钱包 provider 直接调用 `wallet_switchEthereumChain`，不调用接入 SDK、风险扫描或 Muse，由钱包处理确认。

`npm run evaluate:ai` 默认运行固定哈希的合成校验器检查，不请求模型/RPC，不代表在线 Muse 准确率。付费评估必须显式指定 `--live --confirm-paid`、案例和调用预算，不会自动运行。

完整[证据、配置、工具字段、SDK、评估与剩余边界说明](docs/RELIABILITY-AND-INTEGRATION-zh.md)。

## 一次操作会经历什么

```text
网页 / 其他 dApp 创建尚未签名的钱包请求
    → MetaMask 将支持的交易或签名请求交给配对后的 Snap
    → Snap 将请求发送到配置的本地或 HTTPS 后端
    → 严格输入验证与操作解码
    → 工具计划 + 独立证据采集器
    → 定性规则信号与明确列出的缺失检查
    → Muse 评估证据并引用证据 ID
    → 后端 SQLite 更新同一份报告
    → Snap / 网页显示建议
    → 用户在 MetaMask 中决定
```

对于本地实验室请求，后端先创建测试会话。网页将会话 ID 交给配对的 Snap，然后调用钱包。经过身份验证的 Snap 报告只会关联到匹配的请求和会话；仅从网页 API 发起的扫描不能代替已观察到的 Snap 请求交付。报告现在会由服务端记录采集通道：`paired-snap` 或 `workbench`；旧报告可能没有通道字段。钱包操作结果与安全评估是两件事：报告完成不代表交易已确认，返回签名也不证明有人使用过该签名。

收到请求后，后端会：

1. 按严格结构验证请求。它接受尚未签名的交易、消息或支持的 RPC 摘要，不接受客户端提供的分数、信誉结果或 RPC 地址覆盖。
2. 解码已知选择器和签名结构。识别出 ABI 结构只能确定一个**候选操作**，不能证明协议身份。未识别的输入保持未知。
3. 记录工具计划，说明哪些采集器适用，以及配置是否可用。选择了某个工具，不等于该项检查已成功。
4. 独立运行适用的采集器。证据包含 ID、来源、时间戳、状态，以及可获取的结构化事实。采集器失败会明确记为未知，其他已获取证据仍会保留。
5. 添加定性信号，包括权限范围、账户/网络不一致、截止时间已过、授权操作附带异常原生币金额，以及可观察数据的明确缺口。规则不提供数值分数。
6. 在启用 Muse 且未超出每日预算时，发送有大小限制的证据包，并验证结构化回复及其引用。对于可识别的验证失败，可额外预留一次模型尝试，使用相同证据和明确反馈修正输出。后端绝不会用本地编造的分数替代；额外尝试后仍无效的输出会被拒绝。
7. 保存结果，展示证据与剩余缺口。签名、发送、确认和取消仍由钱包负责。

独立的 RPC、区块头、余额和代码读取会保留成功的观察结果，即使另一次读取失败；不可用的字段不会被悄悄当成零或无代码。采集器将各自的读取固定在经验证的网络和区块上，但可能在不同区块和不同时间完成，因此报告不是一个全局同步的快照。模拟描述某个具体状态，不保证将来的执行结果。隔离执行会保留原请求中的 gas 上限、费用参数和 nonce；不会替换不足的 gas 上限或过时的 nonce 来制造成功。如果原请求没有 gas 上限，则使用并明确记录模拟默认值。分叉从记录的基础区块启动，再挖出自己的执行区块，因此执行区块可能与基础区块不同。

## 工具与职责

| 工具或组件 | 职责 | 重要边界 |
| --- | --- | --- |
| MetaMask Flask 与选定的 EIP-1193 provider | 连接选定账户；请求网络、本地交易和消息签名；安装并调用开发版 Snap | 安装多个扩展时，EIP-6963 发现机制帮助选择目标钱包。钱包负责授权和签名，也可能在提供 insight 前拒绝请求。 |
| WalletShield Snap | 交易/签名 insight 钩子、经过身份验证的后端配对/健康检查，以及钱包内建议 | 使用构建时配置的本地或 HTTPS 后端；没有覆盖所有钱包 RPC、权限请求或会话的通用钩子。 |
| React、Vite、Lucide | 本地界面、资产清单、实验案例选择、报告展示与历史记录 | 网页展示证据并发起用户明确选择的操作；它不是独立钱包。 |
| Fastify 与 Zod | 后端 API、Host/origin 检查、严格验证和可选托管钱包身份验证 | 托管模式必须明确配置 HTTPS；本地实验路由在该模式中保持禁用。 |
| viem 与配置的 EVM JSON-RPC | ABI/数量处理、网络/区块检查、余额、代码、代币/NFT 接口、allowance、协议只读方法调用，以及 EIP-712 编码 | 如果端点或合约提供虚假信息，RPC 观察可能过时或误导。`eth_call` 成功不等于完整的资产模拟。 |
| Infura 或明确配置的可信 RPC URL | 为后端提供真实网络状态 | Infura 密钥与 Meta 密钥不同。RPC 访问本身不提供钓鱼或蜜罐情报。 |
| Anvil（`@foundry-rs/anvil`） | 用于本地实验室的专用链 31337；用于模拟的独立临时分叉进程 | 分叉写入、账户模拟及买卖测试只在临时本地分叉执行，绝不作用于上游链。有界的临时只读 loopback 代理使上游 URL 不进入子进程参数，也使凭据不进入子进程环境。 |
| Solidity 编译器（`solc`）与本地测试合约 | 编译并部署测试代币、NFT、路由器、金库、借贷、动作、控制、Permit2 结构及包装代币测试合约 | 简化测试合约不是官方协议部署，也不是真实市场模型。 |
| GoPlus（可选） | 发现支持的链，并获取地址、网站、代币、卖出限制、税费及控制风险观察 | 默认禁用。不支持的链、缺失字段、超时和失败均保持未知。未命中不保证安全。 |
| SIWE 封装解析器与证据清单 | 有界的 EIP-4361 支持语法、来源、账户和时间检查；状态/来源计数、观察时间标记和区块溯源 | 登录重放保护仍依赖远程服务的 nonce 存储。计数和新鲜度标记不是风险或置信度百分比。 |
| 本地规则与请求路由器 | 解释操作结构、选择采集器、标记已观察条件并记录覆盖缺口 | 仅提供定性信息；没有数值下限、加权分数或兜底分数。 |
| Meta Muse Wonder | 六个维度的有证据引用评估、可选的 0–100 风险指标、原因、不确定性与行动建议 | 使用本次请求的证据；不会自己执行链上查询，也不能用模型记忆证明身份。 |
| Node.js SQLite（`node:sqlite`） | 在后端持久化报告、会话、哈希身份凭据、所有者映射和尝试次数 | 托管报告按已验证地址隔离。数据库包含未签名请求数据，应用不会加密数据库。 |
| TypeScript、Node 测试运行器、Snap CLI | 静态检查、自动回归检查、本地链验证和 Snap 打包 | 自动检查通过不能证明每项浏览器钱包操作都到达 Snap。 |

## 安装与启动

请使用 **Node.js 24.x**；`package.json` 声明的是 `^24.0.0`。需要 npm。锁文件会安装本地 Anvil 包、Solidity 编译器、前后端依赖和 Snap 构建工具；脚本不要求另行全局安装 Foundry。安装依赖需要联网。开发版 Snap 安装请使用装有 MetaMask Flask 的桌面浏览器，并使用专门的测试账户。

在项目目录执行：

```sh
node --version
npm --version
npm ci
npm run demo
```

`npm run demo` 会生成覆盖指南、检查类型、构建网页和 Snap，启动全新的专用 Anvil 链，部署 TEST-USD 与钱包实验室合约，然后启动 API、Vite 和 Snap 文件服务。不需要模型评分时，本地钱包测试无需 API 密钥。附带的 [macOS 启动器](%E5%90%AF%E5%8A%A8WalletShield.command) 会从本目录启动同一套 demo 流程。

在装有 Flask 的浏览器中打开 **[http://127.0.0.1:5173/](http://127.0.0.1:5173/)**。本地服务如下：

| 服务 | 地址 | 用途 |
| --- | --- | --- |
| 网页 | `http://127.0.0.1:5173` | UI，以及网页使用的 `/api` 代理 |
| 后端 | `http://127.0.0.1:8787` | 本地 API 与 SQLite 持久化 |
| Snap 文件 | `http://127.0.0.1:8080` | 开发版 Snap manifest 与 bundle |
| 本地 Anvil | `http://127.0.0.1:8545` | 测试网络，chain ID 为 `31337`（`0x7a69`） |

四项服务均绑定 loopback。网页从 Vite 发出的 `/api` 请求会代理到 8787 上的同一个后端，由它统一管理预算和请求状态。本地 Snap 直接调用 `http://127.0.0.1:8787/api`，使其带身份验证的不透明 origin CORS 预检由 Fastify 处理，而非 Vite。后端也会验证本地 Host 头，以抵御 DNS rebinding。请保持原终端开启。这些端口已被占用时不要再启动第二个 demo；启动器会检查端口并拒绝复用已有服务。

在**启动器终端按 Ctrl+C**，停止该次启动所管理的服务。单独启动的服务需要在各自终端停止。不要为了释放端口而终止无关进程。每次新 demo 都会启动全新的内存本地链并重新部署测试合约；旧的本地余额、授权、仓位和交易回执会消失。SQLite 历史仍保留，因此旧报告可能描述已经不存在的链状态。重启后请重新准备资产。

若要使用独立开发终端：

```sh
# Terminal 1: local chain; keep running
npm run chain

# Terminal 2: deploy both the base token and wallet lab fixtures
npm run deploy:local

# Terminal 2, after deployment: build and launch API + web + Snap servers
npm run build
npm run dev
```

`npm run deploy:lab` 会在已经准备好的本地链上检查或部署实验室合约。`npm run dev` 不启动或重置链，其 API 进程也不会监听源码变化：修改后端代码后请重启。各项服务命令为 `npm run dev:api`（监听模式）、`npm run dev:web` 和 `npm run dev:snap`；仅在组合启动器尚未占用相应端口时使用。修改 Snap 代码后，需要重新构建，再在 Flask 中重新加载并配对。

## 配置 Muse、RPC 与可选情报

以 [`.env.example`](.env.example) 为参考。**请在本地创建或编辑以下文件，不要盲目覆盖已有配置。** 这些文件位于被 Git 忽略的 `.local/` 目录。应用不会自动加载任意根目录 `.env` 文件。

如有需要，先创建目录：

```sh
mkdir -p .local
```

将 Meta Model API 配置放入 `.local/meta.env`：

```dotenv
MODEL_API_KEY=REPLACE_WITH_YOUR_META_MODEL_API_KEY_LOCALLY
ENABLE_META_AI=1
AI_DAILY_LIMIT=100
```

后端固定使用模型 `muse-wonder-1.0` 和端点 `https://api.meta.ai/v1/responses`。需要 Meta Model API 凭据；新评分不会使用 OpenAI API 密钥，也未配置其他提供方兜底。`ENABLE_META_AI=0` 会关闭模型调用。密钥为空时，不调用模型，也不生成数值分数。`AI_DAILY_LIMIT` 可设为 1 至 1000 的整数；缺失或无效时使用 **100**。

将 RPC 和可选工具开关放入 `.local/rpc.env`：

```dotenv
INFURA_API_KEY=REPLACE_WITH_YOUR_INFURA_API_KEY_LOCALLY
ENABLE_EXTERNAL_LOOKUPS=0
GOPLUS_TOKEN=
ENABLE_FORK_SIMULATION=1
ENABLE_MONITOR=0

# Optional explicit endpoints; replace only with endpoints you trust.
# RPC_1_URL=https://your-trusted-ethereum-rpc
# RPC_11155111_URL=https://your-trusted-sepolia-rpc
# RPC_8453_URL=https://your-trusted-base-rpc
# RPC_42161_URL=https://your-trusted-arbitrum-rpc
```

如果只需要专用本地链，可将 `INFURA_API_KEY` 留空。有效的 Infura 密钥会配置 Ethereum 主网（`1`）和 Sepolia（`11155111`）。显式的 `RPC_<CHAIN_ID>_URL` 会覆盖该网络推导出的 URL。其他 EVM 网络需要显式配置可信端点。URL 必须使用 HTTPS，loopback 可使用 HTTP；不接受包含用户名/密码的 URL。链 31337 始终使用 `http://127.0.0.1:8545`，不能通过配置重定向到其他网络。

`ENABLE_EXTERNAL_LOOKUPS=1` 会启用可选 GoPlus 请求；如有需要，设置 `GOPLUS_TOKEN`。仓库默认关闭，本次复核开发机已明确启用；各安装查看 `/api/security/status`，不会继承本机开关。适配器最多查询八个解码代币候选和八个明确交易对手，不遍历全部资产或钱包历史。`ENABLE_FORK_SIMULATION=1` 会在配置的 RPC 和历史状态支持时启用隔离执行；未明确设为 `1` 时，分叉模拟关闭。`ENABLE_MONITOR` 在此版本不会启用持续监控：实际加载的配置始终禁用计划性签名后监控。

进程环境变量优先。其次，Meta 凭据与 AI 开关从 `.local/meta.env` 加载。RPC/工具设置依次优先读取 `.local/rpc.env`、`.local/meta.env`，最后读取 `.local/ai.env` 中兼容的旧设置。不会复用旧 OpenAI 凭据。配置会在请求时重新读取，因此保存文件通常无需重启后端；如果修改的是进程环境，则需重启。

两种密钥都应保留在服务端。不要粘贴到聊天、源码、JSON 扫描输入、截图或浏览器输入框中。状态 API 返回配置标记、模型名和已配置的链 ID，不返回凭据或带密钥的 RPC URL。`.local/`、`.env` 和其他 `.env.*` 文件被 Git 忽略；`.env.example` 刻意只含占位内容。后端还会创建配对所需的 `.local/snap.token`。这是本地身份验证秘密，不是钱包私钥。

### 预算与连通性

每次已配置且启用模型的扫描，会为首次模型调用预留一次**每日尝试**；HTTP 失败、超时、拒答及被拒绝的模型输出也计入其中。允许的验证修正会再预留一次尝试，因此一次扫描最多消耗两次。计数按 UTC 日历日期计算，重启后保留。`AI_DAILY_LIMIT` 默认限制整个后端每天 100 次尝试；在本地模式中，用户主动发起的合成 AI 连通性测试也共享此额度。托管模式还默认限制每个已验证身份每天 20 次，该身份的网页凭据与 Snap 凭据共享额度。两项托管预算会原子预留：任一上限触发时，两项计数都不扣减，也不调用模型。这些是尝试次数上限，不是美元预算或提供方支出上限。RPC、Infura 和 GoPlus 有各自的服务限制与计费。分叉可能需要大量上游读取及历史状态访问；提供方套餐和支持的方法可能限制这些操作。

保存了密钥或出现 `aiConfigured` 标记，不代表已连通。来自配置提供方、已完成且通过验证的报告才能证明相应调用成功。模型评分可能耗时数十秒。本地模式允许一个进行中的扫描/模型测试。托管模式允许每个已验证身份一个进行中的扫描，服务总上限可配置（默认三个，范围 1–8）。托管模式每个已验证身份每分钟最多接受八次扫描启动，本地模式则按整个服务计数。过载会返回检查未完成错误，不会编造评估。

如需主动检查模型连接，开发者可对已运行的**本地模式**服务执行以下固定合成样本。此路由在托管模式禁用。它会向 Meta 发送合成证据，并消耗一次尝试；若需要允许的验证修正，则最多两次；两次都可能产生费用：

```sh
curl -sS -X POST http://127.0.0.1:5173/api/security/ai/test \
  -H 'Origin: http://127.0.0.1:5173' \
  -H 'Content-Type: application/json' \
  --data '{}'
```

请检查 `ai.status`、`ai.message` 和 `ai.result`。HTTP 成功不代表分数已被接受。遇到身份验证失败、额度耗尽、429、超时、拒答，或无法在允许次数/预算内修正的验证失败时，证据仍可查看，分数保持缺失。

## 使用本地钱包实验室

本地模式显示 **Local wallet lab**、**Public networks**、**Check history** 和 **Wallet setup**。托管模式隐藏本地实验室，并从 Public networks 开始。

1. 打开 **Wallet setup**，选择 **Connect wallet**。在 MetaMask Flask 中选择专门的测试账户。应用绝不会索要助记词或私钥。
2. 选择 **Install and pair Snap** 或 **Reload and pair Snap**。在 Flask 中批准开发版 Snap 权限。本地 ID 为 `local:http://127.0.0.1:8080`。Snap 先向后端验证凭据，接受后才存储；UI 会检查最新的、经过身份验证的配对健康响应。仅安装成功不代表验证了所有分析路径。
3. 选择 **Switch to local chain and prepare assets**。提示时批准添加或切换到 **WalletShield Local**，链 ID 为 `31337`。后端验证本地 Anvil 节点及测试合约代码，准备测试 ETH 和代币/NFT，并将当前账户设为本地控制合约的测试者。
4. 返回 **Local wallet lab**。阅读资产清单、选择类别与案例，并完成其前置操作。每项前置授权都需要单独在钱包确认。准备资产不会悄悄替你授权路由器、存入金库、质押或借款。
5. 选择 **Request a test transaction** 或 **Request a test signature**。阅读钱包请求、WalletShield 证据、Muse 结果（如有）与缺失检查。消息 insight 可能在进入钱包签名步骤后才出现。在 MetaMask 中决定确认或取消。
6. 在 **Wallet test history** 查看钱包结果以及是否观察到真实 Snap 报告。在 **Check history** 查看证据报告。历史搜索匹配显示的时间、操作和风险状态。需要时刷新记录。

建议从无限额授权开始，阅读 insight 后取消，再比较有限额授权和撤销授权。其他代表案例包括原生币和代币转账、NFT、V2/V3 结构兑换、金库存入/赎回、借贷、质押、流动性、桥接存入、领取、包装、铸造/销毁、控制变更、部署、批量调用、SIWE、Permit、Permit2 和类型化订单。

测试资产是**没有真实价值**的本地测试合约资产。准备操作会先将余额补足至 10 测试 ETH（后续测试合约准备交易可能消耗少量 gas）、5,000 TEST-USD，以及 LAB-USD、LAB-Q、LAB-BLOCK 各 5,000；已有更高余额会保留。它还会准备一个当前 ERC-721 测试 NFT，以及 ERC-1155 ID 1 和 2 各至少十个。WLAB 需要通过包装操作取得。切换到链 31337 不会带来主网 ETH 或代币，切换到其他链也不会将本地余额变为真实资产。资产准备后，网页通过 `wallet_watchAsset` 自动请求钱包显示五种已知 ERC-20（包括余额为零的 WLAB）及当前拥有的测试 NFT，请在 MetaMask 中确认提示。拒绝导入或钱包不支持 NFT 显示，不会撤销已经完成的链上资产准备；网页的链上清单仍是余额依据。MetaMask 扩展中的 NFT 导入属于实验性功能。原生测试 ETH 无需代币导入。NFT 和协议仓位可能需要执行对应钱包操作来取得或补充。

**Clear local test assets** 仅清空当前账户在 Anvil 链 31337 上已知测试合约的钱包余额：测试 ETH、TEST-USD、LAB-USD、LAB-Q、LAB-BLOCK、WLAB 与测试 NFT。执行前阅读英文确认提示。后端使用本地开发节点管理接口与有成功回执的测试合约交易，不重置整条链，也不调用公链 RPC。测试代币被销毁或转至固定丢弃地址，WLAB 被解包装，测试 NFT 转至丢弃地址；对应 NFT 的单项授权会随转移清除。操作员/ERC-20 授权、协议仓位、控制状态和历史保留，不隐藏钱包显示项，也不清理未知代币合约。再次准备可补充资产；若中途失败，已完成步骤可能保留，请先刷新余额。

实验室路由器使用固定本地价格；金库采用简化份额模型；借贷未实现完整清算市场；桥接测试只记录本地行为；控制升级测试合约不会审计新实现。LAB-BLOCK 故意限制卖出，以便测试相应证据路径。这些都不能证明真实协议的身份、流动性、偿付能力或行为。

网页绝不会上传、记录日志、持久化或提交**本地测试生成的签名**。它只在浏览器检查返回格式，然后丢弃签名。被分析的未签名消息仍会发送到本地后端，部分消息内容可能进入模型证据包。

钱包可能在显示 insight 前报错或被取消。如果会话表示未观察到 Snap 报告，不应把它算作完成的 Snap 检查。节点级测试或 API 报告同样不能证明浏览器/Snap 请求交付成功。

### 可选账户与签名变体测试

新增 8 个 **Smart-account fixture** 交易测试 threshold 降低、module 标记开/关、guard 设置/移除、fallback 设置/移除和 CALL 封装。已有本地部署请明确运行 `npm run deploy:lab`，只补充可选 `LabAccount` 后，再点击 **Prepare local test assets**。部署保留原测试合约地址/状态；准备资产会将可选账户重置给当前测试者。移除类案例先完成对应设置。

这是 owner 可直接调用的本地接口模型：无论显示 threshold 为多少，任一列出的 owner 都能直接调用。它**不是生产多签**；module/guard/fallback 只是标记，不实施真实约束。封装仅接受 CALL、空 signatures、零退款参数，故意拒绝 DELEGATECALL；不会修改真实智能钱包权限。

另有 `dai-allow`、`dai-revoke`、`erc3009-transfer`、`erc3009-receive` 四个签名案例，使用现有 LAB-USD domain 发起真实钱包消息，以测格式和字段提取。LabToken 不实现 DAI/ERC-3009 消费方法，也没有 ERC-3009 authorizationState getter；缺失状态/消费证据是预期边界。签名本身不消费消息、不改 allowance、不转币，生成签名仍在浏览器丢弃。

## 使用真实网络，并区分本地资产

**Public networks** 是独立页面，用于公共网络连接、只读检查，以及验证真实 Snap 请求交付的中性消息。它与本地实验室使用同一个选定的 EIP-1193 钱包 provider 和账户；不存在另一种“真实钱包”。变化的是网络，以及记录在该网络上的资产。钱包选择器在可用时使用 EIP-6963 发现机制，避免普通 MetaMask 与 Flask 争用同一个注入式 provider。请选择目标扩展；安装本地开发版 Snap 需要 Flask。

1. 按前文配置可信的后端 RPC。先使用 **Sepolia（`11155111`）** 和专门的测试账户。主网涉及真实价值；此 Flask 开发环境不适合存放真实资产。
2. 打开 **Public networks**，连接目标钱包。本地模式可在不连接账户时检查 RPC 连通性，此时不会查询余额/代码。托管模式在账户探测、配对和访问报告前，需要完成下文的钱包身份登录。
3. 选择后端数据网络，再点击 **Check RPC and account state**。后端验证 RPC 实际链 ID，读取区块、区块时间，并在已连接账户时，读取该账户在该区块的原生币余额和代码。委托代码与普通无代码账户会分别标明。结果最多可复用 15 秒。只使用服务端配置的端点；密钥和完整 RPC URL 不会返回浏览器。
4. 可选择 **Switch wallet to this network**。按钮直接向选定钱包请求 `wallet_switchEthereumChain`，不经过 SDK/风险扫描、不调用或等待 Muse；在钱包中确认或取消。如果未添加，请使用可信官方信息在钱包中添加，然后重试。页面不会将后端 Infura URL 暴露给钱包设置。仅选择数据网络不会切换钱包，请比较两处网络标签。
5. 安装或重新加载/配对配置的 Snap。后端健康握手必须对当前绑定账户通过。选择 **Test the wallet signing insight**，向真实钱包请求一条唯一的普通 `personal_sign` 消息。它不需要测试币或 gas。阅读消息说明的用途和钱包内 WalletShield insight，再决定签名或取消。页面将精确匹配该唯一消息与服务端记录的 `paired-snap` 报告；仅返回签名不能通过此检查。生成的签名在浏览器中被丢弃，而未签名消息和报告存入后端。若启用模型，这次真实 Snap 分析会调用 Muse 并消耗模型预算。
6. 对于转账、授权、Permit、兑换和其他支持的请求，请使用相应外部 dApp，并逐项阅读钱包 insight。本地模式需要相关服务持续运行。钱包连接、配对健康、请求交付和评估完成是需要分别核实的事实。

网络页面不会构造公共网络的转账、授权或资金交易。**RPC check** 不调用 Muse，也不生成分数；另行标注的 **message insight check** 可以调用 Muse。中性消息不是登录、Permit、订单或支出授权。托管身份登录是第三种明确标注的操作。链/余额检查成功只证明连通性和观察到的状态，不证明账户、合约、收款方、dApp 或交易安全。后端 RPC 访问与钱包自己的 RPC 配置相互独立。即使用相同账户地址连接 Sepolia 或主网，本地 TEST-USD/LAB 代币和 NFT 仍只在链 31337 上。

默认构建使用 Flask、本地配对和 `http://127.0.0.1:8787/api/security/scan`。托管构建使用编译时配置的 HTTPS 配套服务 origin 和 npm Snap ID。打包托管构建不会自动发布 npm 包，也不会自动获得 MetaMask 分发资格。连接/网络切换不是通用 Snap 拦截钩子。

## 配置与运行需要身份验证的托管模式

EOA 恢复证明同一密钥对 EVM 地址的控制，因此其身份仍按地址跨链使用。ERC-1271 登录则建立**地址加已验证链的身份**：网页/Snap 凭据、扫描、私有报告访问、删除和撤销均限定在该链。同一个合约地址在另一条链上可能有不同所有者。切换网络后，请在目标链重新登录并配对；Snap 健康和请求检查会拒绝不匹配或无法观察到的绑定网络。链绑定签名仅在 provider 观察匹配后，使用已验证身份链作为认证/取数范围，并不证明 dApp 的实际签名网络。

托管资源也按已验证身份隔离：EOA 使用地址键，合约身份使用 `eip155:<chainId>:<address>` 键。活动/最近扫描、每身份 AI 和取证预算、Snap 配对签发频率及活动凭据容量都使用该范围；该身份的网页和 Snap 会话共用额度。IP/全局限额以及服务总并发、总凭据容量仍由所有身份共享，不因切换链而增加。

首次按此身份策略启动时，会一次性使旧托管登录挑战及网页/Snap 凭据失效，因为旧记录没有区分 EOA 与合约身份。请重新登录并配对。已存报告、使用额度、配置和本地链资产保留，迁移不会删除它们。

托管模式已实现为显式启用的服务配置和独立发布产物。**本项目工作流程尚未将其部署、发布到 npm、注册或取得独立批准。** 准备发布前，需要提供真实域名、TLS、你拥有的 npm 包和公共源码仓库。默认本地启动器仍是 Flask 开发环境。

参考 [`deploy/service.env.example`](deploy/service.env.example) 创建或编辑 `.local/service.env`。此文件包含部署设置，不包含 API 密钥：

```dotenv
WALLETSHIELD_SERVICE_MODE=hosted
WALLETSHIELD_APP_ORIGIN=https://your-walletshield-domain.example
WALLETSHIELD_SNAP_PACKAGE=@your-owned-npm-scope/walletshield-snap
WALLETSHIELD_REPOSITORY_URL=https://github.com/your-org/your-public-repository
WALLETSHIELD_WALLET_DAILY_LIMIT=20
WALLETSHIELD_MAX_SCANS=3
```

请将每个占位值替换为你控制的值。托管运行时配置生成器会拒绝 loopback、非 HTTPS origin 和开发包名。Muse/RPC 凭据仍保留在仅后端使用的 `.local/meta.env` / `.local/rpc.env` 或进程环境中。服务启动器只从 `.local/service.env` 加载白名单内的部署设置，显式进程环境变量优先。

```sh
npm run build:hosted
npm run package:hosted
npm run start:hosted
```

`build:hosted` 先生成前端与 Snap 共享的非秘密运行时设置，再执行构建。`package:hosted` 要求相同设置以及成功构建的源码/bundle 指纹，并创建 **`dist/release-snap/`**：这是独立 npm 包，含你拥有的包名、匹配的 manifest、bundle、图标和发布 README。源码变化或 bundle 过期时必须先重建。开发版 Snap 包仍保持 private。该命令不会发布任何内容。可在本地检查包的准确内容：

```sh
cd dist/release-snap
npm pack --dry-run --ignore-scripts
```

服务命令应从项目目录运行，而非发布产物目录。`start:hosted` 在 `127.0.0.1:8787` 提供 `dist/web` 和 API；不会启动 Anvil 或本地 Snap 文件服务。需要在前面配置 HTTPS 反向代理，并保留配置的 Host。[`deploy/nginx.conf.example`](deploy/nginx.conf.example) 提供起始示例；请替换域名/证书路径，并确保公共 origin 与构建和服务配置完全一致。代理读取超时为钱包分析预留时间。在服务终端按 Ctrl+C 停止该进程。模式、域名或包名变化后，前端和 Snap 都需要重建；不要混用本地与托管 bundle。返回默认本地开发时，清除导出的托管部署变量，再运行 `npm run demo`，它会重新生成本地运行时设置。

托管用户流程：

1. 连接目标账户，选择 **Verify current wallet identity**（设置页中为 **Sign to verify this wallet**）。确认前逐项核对准确登录消息、应用域名、URI、账户、链、nonce 和到期时间。这是用于身份验证的账户控制权证明，不是资产支出权限。
2. 服务端签发有效期五分钟的一次性 challenge，并验证对其存储消息的 EOA 签名。支持的已部署合约可经可信 RPC 使用有界 ERC-1271 STATICCALL，绑定本次存储消息及区块；未部署账户或不支持策略不使用未经检查的兜底。登录成功后创建有效期八小时的网页 bearer，只保存在浏览器内存中。刷新、更换 provider/账户或断开连接都会清除内存身份；重新访问记录需再次验证。
3. 安装并配对 Snap。服务端签发**不同的**、绑定地址且有效期 30 天的 Snap bearer，通过配对传入 Snap；不会把网页 bearer 交给 Snap。Snap 在存储前验证后端接受该凭据，健康检查会验证绑定地址。配对到期或被撤销后，需要重新登录并配对。持久化原子签发上限为每分钟每身份 4 次、每个服务端观察到的 IP 12 次、全局 60 次；每身份最多保留 4 个活动 Snap 凭据，全局最多 8192 个。成功重配只轮换该身份最早到期的凭据。拒绝签发返回 429/Retry-After，不改变既有配对，也不扣签发计数。
4. 扫描必须来自已验证地址。历史、单份报告和证据由服务端地址映射控制，合约身份还限定已验证链；知道报告 ID 或伪造 Origin 不能获得访问权。UI 会将 Snap 采集与网页分析分别标注。每身份预算由该身份的网页/Snap 会话共享。
5. 选择 **Sign out all sessions and revoke pairing**，以原子操作撤销当前身份范围的网页/Snap 凭据及未完成登录挑战：EOA 为该地址，ERC-1271 为该地址的已验证链，其他身份范围不变。切换账户会清除浏览器会话，但不会自动撤销服务端之前签发的凭据。账户/provider/断开或加载失败会清空历史与详情；取消/延迟响应不能恢复前一身份的记录，当前所有者列表不存在的选择会清空。本地模式仍是同机共享历史，托管模式才按所有者隔离。

托管模式禁用本地实验室/资产准备、旧授权/workflow/demo 路由、monitor 兼容路由、覆盖指南下载和合成 AI 测试路由。身份验证速率限制和待处理 challenge 上限约束登录请求；签发 Snap 凭据需要有效网页 bearer。网页/Snap token 的到期、撤销、所有者映射和每日尝试次数都持久化到后端 SQLite，其中仅存储 token 哈希。HTTPS 服务和 npm 包仍需要真实钱包/浏览器验收，以及适用的 MetaMask 分发流程。准备产物不等于公开部署或独立安全认证。

## 阅读风险报告

新数值分数**只能来自 Muse**，且必须通过响应验证。Muse 独立提供 0 至 100 的整数，或通过 `null` 表示不评分。该数字是**未经校准的风险指标，不是损失概率**，也不是欺诈概率百分比、保证或认证结论。

没有固定分数区间、最低分、规则累加分、固定权重或模型失败时的兜底分数。模型文字评估与数字独立，规则也独立保留为定性信号。即使 Muse 得出不同结论，综合警告仍可保留规则识别的高风险信号；它不是通过对数值设阈值计算得到的。采集器仍可使用明确的定性启发式条件，例如模拟往返交易回收比例较低，或观察到高卖出税。这些会标为证据信号，不加分，也不决定 Muse 的数字。旧报告可能仍含历史规则分数，并标注为历史记录；这不是新安全扫描的评分政策。

每个被接受的模型结果必须恰好覆盖以下六个维度一次，且原因须引用已有证据 ID。维度判为 low/review/high 时，除了工具计划外，至少需要一项真实且非 unknown 的观察：

| 维度 | Muse 考虑的内容 |
| --- | --- |
| `authority` | 谁获得权限；资产、金额、到期、撤销及未来使用范围 |
| `exposure` | 金额与可见的同种资产余额之比、费用预算及潜在损失影响 |
| `execution` | 观察到的调用、资产变化、额外支出，以及模拟实际支持的行为 |
| `identity` | 来源、目标、协议、账户和网络是否一致；可用的信誉观察 |
| `protocol` | 滑点、退出、清算、代理/控制变更，以及证据实际支持的其他机制 |
| `deception` | 可观察来源/消息/请求不一致，以及支持的钓鱼情报 |

维度使用定性值（`low`、`review`、`high`、`unknown` 或 `not_applicable`），不会分别打数字分数或求平均。每个结果还包括证据支持程度（`limited`、`moderate` 或 `strong`）、有引用的原因、缺失数据、行动建议和受约束的蜜罐字段。证据支持程度描述证据包能提供多少支持，不是经过校准的模型置信概率。

nonce/domain 断言现在检查摘要、原因、各维度、行动建议和缺失数据文本，包括条目索引、匹配/不匹配方向、否定和条件性建议；必须引用对应的实际 RPC 观察，不能借无关引用声称已验证。自然语言校验仍是部分防护，不是所有句子的正确性证明。验证器会拒绝不存在的引用、缺失/重复维度、无证据支持的确定性表述、无支持的蜜罐陈述及不一致的放弃评分。评估范围记录此次请求实际未完成的检查与缺失证据；任何未知检查/缺口、模型发现的缺失、过旧/缺失/未来观察时间戳、公链区块来源/新鲜度失败或同高度冲突哈希都会阻止整体 low 或 strong 证据支持程度。完整 complete 与缺失列表继续显示；包字段为 assessment_scope，报告属性为 assessmentScope，策略名 observable-request-v1。允许的 low/strong 仅针对可观察请求范围，不证明身份可信或未来安全。全部维度为 unknown/not-applicable 时不能支持数字。仅缺少信誉数据不能证明身份恶意。失败、等待中、AI 禁用/未配置、预算耗尽或模型放弃评分时，**不显示数值分数**。

结构与引用语义检查约束输出格式及部分断言，但不能证明每句英语或每项模型判断都正确。用户仍需对照所引用的观察和剩余缺口阅读解释。

可识别的输出验证失败最多触发**一次**额外 Muse 调用，并须先独立、原子地预留每日预算。两次调用共享 50 秒模型时间预算；修正调用最多 25 秒，剩余不足五秒时不会开始。它接收相同证据、受控验证反馈，以及明确标为不可信的上次输出。HTTP/身份验证/额度错误、网络失败、超时、拒答及不完整响应封装不重试。有效的放弃评分不重试。修正结果受相同验证器检查；后端绝不强制生成数字。修正成功的结果会标明修正；当两次已完成响应都有有效用量数据时，会合计用量。即使没有分数被接受，任一次尝试也可能消耗提供方额度。

新报告会保存派生的 `quality` 清单，并将它发送到模型证据包。它列出 pass/warning/risk/unknown 计数、按来源统计的 observed/unknown 计数、每个可用的网络/区块/哈希/时间戳、同一链混用上游区块的情况、同一链/高度的哈希冲突、采集通道及钱包凭据归属。它标记相对于报告创建时间早于五分钟的观察、缺失/无效时间戳，以及超前超过 30 秒的时间戳。这些是证据诊断，不是风险分数、检测覆盖率或置信度百分比。观察时间是采集器记录结果的时间，不能证明上游数据的新鲜度。读取按区块号固定，而不是按区块哈希原子固定；记录哈希提供溯源，但不能排除链重组或提供方响应不一致。同高度哈希冲突需要新的独立检查，并会阻止整体 low 评估或 strong 证据支持程度。分叉执行与公共 RPC 区块仍属不同状态空间。

`pass` 只表示该项观察成功，不是地址或操作认证。`unknown` 表示检查未完成、不支持或缺失。转账成功不能证明收款方合法；有限额 allowance 仍可授权恶意支出；`eth_call` 成功、nonce 匹配或一次卖出成功，都不保证未来安全。

DAI 权限来自 allowed 的参考语义推导；ERC-3009 承诺单次精确数量，Permit2 transfer 为单 nonce 上限，后两者都不是持续 allowance。ERC-3009 当前余额不足会明确记录，不制造较小可消费转移量；空 calldata 的 DELEGATECALL 仍是委托代码执行，不是原生币转账。

支持的 EIP-712 无符号整数在风险解释前，会统一等值的十进制、十六进制与前导零表示，且保持被签 digest 不变。零地址按角色解释：支持的 NFT approval/Permit 撤销不会被误报为资产销毁；实际转账接收方及所有权变更仍按各自语义检查。transferFrom 的资产所有者与调用者分开；当前余额不足描述为执行/敞口问题，不再错误解释为授权覆盖未来入账。

对于 EIP-712 消息，只有属于从 primary type 可达的声明类型图中的字段，才能作为已签名意图的证据。类型图之外的额外 JSON 属性不是签名字段，不能单独证明签名权限、所有者不一致、财务敞口或其他风险。Permit2 nonce/allowance 检查的 owner 来自真实签名账户，而非消息额外提供的 `owner` 属性。识别出规范类型结构也不能认证验证合约。

支持的 SIWE 登录检查会验证 EIP-4361 封装：头部/账户，必需的 URI、version 1、chain、nonce、issued-at 字段及顺序，nonce 格式和长度，expiry/not-before 条件，domain/URI/source 差异，以及最多 16 个规范化资源 origin。它保留独立的 `login_nonce` unknown，因为签名前工具无法验证远程服务的 nonce 签发、唯一性或使用记录。语法正确不证明网站诚实、签名有效或登录成功。托管服务自身的准确消息身份验证是独立流程，具有自己的 nonce 存储。

标准 Permit2 中，`expiration = 0` 表示授权提交所在区块的时间戳，可在该区块内使用。它不证明权限在签名前已经过期，也不等于自动撤销。非零 expiration 已在过去，也不代表签名无害：提交仍可能更新 allowance 或 nonce 状态。报告保留此区别，以及候选合约是否真正实现标准 Permit2 语义的不确定性。

Snap 通过 `endowment:ethereum-provider` 在签名洞察期间尝试短时只读 `eth_chainId`，并单独记录带时间戳的 `signature.providerContext`。签名钩子没有与请求绑定的链：本地/EOA 请求保留 `chainId: 0`。托管合约身份只有在 provider 观察匹配时，才使用其已验证绑定链作为认证/取数范围；provider 链缺失或不匹配时要求重新连接，不生成评分。这不证明发起 dApp 的签名网络，也不把 provider 观察冒充签名 domain。签名者来自 `signature.from`；Snap 不会仅为检查额外请求选账户权限或新签名。

普通未签名消息分析没有新生成的消息签名可恢复或提交。提供的 EIP-7702 authorization list 例外：其中已含用于有界恢复的签名元组；raw r/s 不成为模型事实，但存储的外层请求可能包含这些字段。匹配 Permit nonce/domain、读取签名者代码或 ERC-1271 相关账户状态，都不等于验证签名有效或未来会被使用。标准权限还可能允许 spender 在编码的上限内决定最终收款方或实际转移金额；匹配结构不会承诺所有后续交易细节。

## 各类操作收集的证据

下表所有适用行还可以获得可信 RPC 的网络/区块/余额/代码事实、部分合约控制观察、可选 GoPlus 观察、规则信号、明确限制，然后交给 Muse 分析。只有实际可用且成功的工具才提供观察；报告会列出失败与缺口。权威分析配置定义位于 [`src/security/coverage.ts`](src/security/coverage.ts)。

| 分析配置 / 操作 | Muse 之前提取的参数与证据 | 范围与限制 |
| --- | --- | --- |
| 原生币转账 / 合约收款方 | 发送者、目标、金额、链、origin 和费用；固定区块的原生币余额/代码、已确认 nonce、所给费用与观察到的 base fee 比较，以及可选的一跳委托代码和分叉余额/gas/调用摘要 | 收款方身份和付款目的未验证；即使 calldata 为空，合约 receive/fallback 仍可能执行。 |
| ERC-20 转账 | 代币、收款方、原始数量；可读取的 symbol、decimals、余额；可选的观察到的变化量和额外支出 | 名称可伪造；未完整覆盖 rebasing、转账收费、隐藏资产或估值。 |
| NFT / 委托 / 批量 NFT 转账 | 所有者、收款方、token ID 或 IDs/数量；ERC-165 声明、owner/approval 或 ERC-1155 余额、部分 operator 状态 | 每种资产最多 16 个 ID；接口声明可能不实；集合真实性、价格、回调和非标准语义检查不完整。 |
| 单项授权、撤销、链上 Permit | spender、金额或 token ID、大额 allowance 信号、部分 owner/deadline 字段；代币标准、ERC-20 allowance 和余额 | ERC-20 与 ERC-721 `approve` 共用编码；NFT ID 为零不自动代表撤销。未覆盖所有 Permit 变体或未来支出。 |
| NFT operator 授权 / 撤销 | 集合、operator、布尔值及可读取的现有 operator 状态；控制/信誉/分叉证据 | 不完整枚举当前/未来持有资产，也不证明 operator 会诚实行事。 |
| 链上 Permit2 结构 allowance | 代币、spender、`uint160` 数量、expiration 和可用代币事实 | 结构不证明官方 Permit2 身份；独立读取用户对候选 Permit2 合约的底层 ERC-20 授权，以及其内部对最终 spender 的 amount/expiration/nonce。可读状态不证明部署身份、domain 语义或未来用途。 |
| V2 结构兑换 | 路径、输入量、最低输出、收款方、deadline；支持时，在分叉执行买入 → 授权所得代币 → 反向卖出，记录返回数量/gas、变化量及可选代币情报 | 限定路径结构且要求相同收款方；卖出失败有多种原因；往返损失含费用/价格冲击，不是纯税率。 |
| V3 结构兑换 | 八种规范 single/path、exact-in/exact-out；原始分叉买入与按实际输入扣减的衍生卖出；仅限代币出资；不支持原生资金与路由专用 sender 别名 | 不完整覆盖接收人/资金/聚合器、经济报价、MEV 或未来卖出。 |
| ERC-4626 结构金库 | 当前 asset/totals/preview/max/单位，以及原始分叉交易前后份额/底层余额/限制与兼容单位差值 | 接口不认证身份；不证明完整经济审计、未来价格/偿付或赎回。 |
| 借贷 / 抵押 | 当前 Aave 结构状态，以及原始分叉交易前后抵押/债务/健康因子及兼容单位差值；实际分叉后健康因子低于1的信号 | 不完整建模未来价格/预言机压力、清算或偿付；base 单位不是美元。 |
| 质押 / 解除质押 / 奖励 | 候选方法、数量、receiver；控制状态和通用分叉观察 | 不自动验证锁定期、罚没、奖励来源/公式或未来提款。 |
| 流动性 / V3 仓位变更 | V2/严格 V3 参数、positions/NFT 权限/单位；候选 manager/factory/pool 的 token/fee 关联、当前 tick/range/流动性 | 接口关联不认证官方池，不证明可执行报价、LP/NFT 价值、完整退出或未来费用。 |
| 跨链发起 / 提款 / 完成候选 | 部分 OP 结构源链参数、通用合约读取和源链分叉观察 | 不再核对维护的两端桥/messenger、counterpart 或两链路线；message/proof/relay、储备、最终性和到账均未验证。 |
| 领取 / 空投 | 常见 Merkle 结构的 index、account、amount、proof 项数、代码/控制及通用分叉效果 | 未完整验证 root/proof/领取资格或项目身份；proof 字节不会完整发送给 Muse。 |
| 原生包装 / 通用提款 | deposit() 的原生值，withdraw(uint256) 的数量标为 unverified_protocol_units，保留代码/部分控制和可选变化量 | 不假定一参数 withdraw 是质押退出或原生赎回；身份、单位/比率、偿付与退出仍未知。 |
| 铸造 / 销毁 | 候选方法、收款方、数量或 ID、代币及 value/变化量 | 数量与 NFT ID 可能仍有歧义；发行权、价格和所有销毁后果检查不完整。 |
| 控制 / 角色 / 升级 / 智能账户 | Safe 结构 owner/threshold/module/guard/fallback/hash；当前 owner/threshold/module/code 及支持的原始分叉前后 allowance/NFT/账户权限 | 无完整权限图、已认证 guard/fallback 存储、账户策略/签名/代码审计；移除可能削弱保护。 |
| 部署 | 发送者、value、初始化选择器/字节数和费用摘要；通用分叉效果 | 没有完整初始化字节码/源码/构造函数审计、验证构建对应关系或 CREATE2 身份证明。 |
| 批量 / Safe 执行 / 聚合器 | 标准编码 multicall、Safe execTransaction 和 packed MultiSend 子结构；CALL/delegatecall、目标/数量及有限字段，可选分叉 | 深度 3、32 子项、每 body 16384 字节、递归总量 32768 字节；结构不证明子调用者/owner/存储上下文、身份、签名或全部效果。 |
| SIWE 类登录 | 支持的头部/账户、URI origin、version/顺序、nonce 格式/长度、声明链、issued/expiry/not-before 时间及最多 16 个资源 origin；source/account/domain/URI 和本地时钟检查 | 远程 nonce 签发/使用、audience、生成签名有效性和实际服务端会话均未验证。 |
| 个人消息 | method、account、origin、最多 1,600 字符预览；实际来源/账户观察与可用情报 | 任意服务器/合约如何解释消息未知；预览可能截断，钱包链可能不可用。 |
| 原始 `eth_sign` | method、account、声明网络/来源和盲签信号；可用上下文 | 仅后端分析；Flask/SDK 可能不提供自动钩子。无法从哈希逆推出原意。实验室没有 raw-sign 按钮。 |
| Permit / NFT Permit / DAI / ERC-3009 签名 | 实际签入字段、digest/domain、部分 nonce/interface/state；DAI holder/spender/allowed 推导最大值或零；ERC-3009 payer/recipient/amount/时间窗/bytes32 authorizationState | 只支持参考结构，不认证签名/消费/实现。ERC-3009 为单次转移，非持续 allowance；receive 形式有条件性调用者限制。 |
| Permit2 签名 | 规范通用结构、nonce/allowance 层、owner 绑定和 witness 外层/type/hash | witness 消费方业务约束、自定义变体、签名接受和未来消费仍未知。 |
| 类型化订单 / 其他 EIP-712 | 规范 Seaport 签入的 offer/consideration、接收人、数量、时间、counter、conduit、哈希及零接收人提示；可选通用 DOMAIN_SEPARATOR 比较 | 不再读取当前订单 counter/填充/取消或直接 verifier 资产授权；合约订单 type4、criteria/conduit、签名接受、履约和公平价格仍不完整。 |
| 钱包权限 / 会话 | method/source、白名单公开地址/范围/限制/expiry 与有界嵌套摘要 | 需显式 API 或配合 dApp SDK；无全局 Snap 钩子、不执行 RPC、不采集秘密 session key，不证明账户执行限制。 |
| UserOperation / 智能账户 | 显式 v0.6/拆分 v0.7-v0.8 参数、声明 nonce/费用；sender/EntryPoint/factory/paymaster 代码与 base fee 比较 | 不再提供 EntryPoint 维护绑定和 keyed nonce/deposit/prefund 核对；无通用 Snap 钩子或完整 bundler/账户/session/paymaster 验证与执行。 |
| 添加/切换网络 / 关注资产 | 显式 API/主动接入 SDK 提交的 method、声明链和有界白名单字段；URL 仅保留 origin | 需显式集成才分析；Public networks 切换按钮不扫描、不调用 Muse。非全局钩子，后端不连接任意输入 URL，不认证新 provider。 |
| 只读钱包 RPC | method、有界公开 account/address/network 字段与可用来源观察 | 需显式 API/主动选择只读 SDK 分析；不执行原始 RPC，隐私范围仍不完整。 |
| 未知合约 / 钱包 RPC | target/value/selector/字节数，或 method 和有界白名单参数；通用适用观察 | 交易可能自动到达；任意钱包 RPC 需要手动输入。不从未知方法推断完整含义。 |

主要边界：显式资产读取最多八种资产；NFT 每种资产最多读取 16 个 ID；通用 RPC 摘要最多五层嵌套、16 个数组项和 40 个已识别字段。模拟通过有界且已识别的转账日志及已知显式资产发现资产，最多发现 32 种资产，并限制调用树大小。截断与不支持字段是限制，不算成功覆盖。未知资产 decimals 时，原始数字是最小单位数量，不是美元损失。份额与底层资产不能作为同一单位比较。

EIP-7702 现在分别观察实际元组密码学、声明链/nonce 范围、外层 sender nonce、顺序有条件资格和一跳 delegate 代码。不认证初始化/module/存储策略或完整 set-code 执行；不支持 envelope 保留缺口。托管 ERC-1271 仅核对登录；待处理替换、未来费用/打包及资产签名接受另行判断。

交易包含不支持的 EIP-7702 authorization/type 字段、blob 相关字段、非空 access list、未知交易类型或格式错误的执行数量时，会标记为未完成。模拟器不会悄悄移除这些字段，然后把替代的普通交易作为验证结果。

## 已覆盖、部分覆盖与未覆盖的行为

**已实现的代表路径：** 原生币和代币/NFT 转账、常见授权/撤销、部分 V2/V3 参数、EIP-712 编码和部分 Permit nonce/domain 检查、部分代币/控制状态、可选情报、通用隔离交易模拟、金库 preview 和 Aave 结构的当前账户数据。即使这些路径，也受上表逐项限制。

**协议理解仍属部分实现：** 质押、流动性、借款后果、真实兑换路径、桥接、领取、铸造/销毁、部署、升级、聚合器、订单及任意消息。熟悉的 ABI 或本地调用成功不能证明真实协议身份、未来价格和退出条件。来源/消息/请求不一致必须有实际观察支持，不能声称仅凭一次请求就识别所有骗局。

**当前没有端到端覆盖：** 通用钱包权限/会话拦截、ERC-4337 bundler/账户执行、完整 EIP-7702 authorization/委托验证、所有 Permit/NFT/witness/订单变体、全部协议方法、实际目标链到账，以及每种隐藏/非标准资产转移。Bitcoin、Solana 和其他非 EVM 网络、其他钱包集成、设备恶意软件、泄露的密钥/助记词、交易所内部系统及链下投资骗局均没有完整集成。计划性签名后监控和强制阻止不是产品能力。

有五个分析配置没有可执行的代表性钱包实验案例：原始 `eth_sign`、权限/会话请求、UserOperations、网络配置和只读 RPC。应用使用某些普通连接/网络/显示动作，并不代表 Snap 会自动拦截这些动作。已有案例的 25 个分析配置也未覆盖各自全部方法。

## 哪些可以扩展，哪些需要的不只是 RPC？

30 个分析配置描述尝试分析的路径，不是 30 个完整协议集成。新适配器应保留准确单位、溯源、缺失检查和行为测试，不能把熟悉名称直接当作已验证身份。这里的“RPC 适配器”指面向具体协议的 ABI/版本解码与只读方法调用代码；仅填写 Infura 密钥或更换 RPC URL 不会自动补齐这些协议分析能力。

| 扩展类别 | 可行工作 / 所需输入 | 改进后的边界 |
| --- | --- | --- |
| 可基于配置的 RPC 和具体协议适配器实现 | 更多 NFT/链上 Permit allowance 状态、包装资产退出、经验证的特定方法仓位、递归已知批量调用、操作后借贷情景、更多兑换路径及双链桥状态读取 | 需要明确 ABI/版本及有界执行测试。单靠 RPC 读取不能认证部署，也不能证明目标链到账、未来偿付能力或任意合约语义。 |
| 需要额外可信报价、价格或市场数据 | 同种资产估值、可靠的预期输出/滑点、池流动性、LP/份额估值、清算压力假设及多种交易规模 | 需要可信且与时间/网络/资产对应的数据源或 quoter。价格和未来排序会变化；模拟结果仍是情景。 |
| 需要验证过的源码、部署或信誉数据 | 真实协议/代币/集合身份、已审计的实现/控制关系图、验证字节码/构建对应关系、已知钓鱼和更广泛地址历史 | 需要可信注册表、验证源码/构建及明确数据年龄/覆盖范围的外部情报。未命中、名称或空代理槽都不是安全证书。 |
| 需要钱包/dApp 或依赖方配合 | 自动接收权限/会话/UserOperation、原始哈希背后的数据和远程服务 nonce/会话验证 | 提示词无法观察从未收到的请求或存储。 |
| 需要链下服务或独立调查 | 企业/域名身份、交易所内部余额、声称的投资回报、恶意客服对话、设备恶意软件或过去的密钥泄露 | 链上状态不能证明全部链下事实。额外采集需要单独的用户同意、隐私控制和合适集成。 |
| 无法在签名前凭一次快照证明 | 保证未来价格/流动性、打包/排序/MEV、之后的黑名单/升级决定、未来桥/验证者行为、普遍不存在隐藏资产或任意代码漏洞 | 更多数据和情景测试可减少不确定性，但不能证明尚未发生的事件或普遍安全。签名前 AI 分数始终只是指标。 |

这些描述已实现有界适配器之外的进一步扩展，不表示完整协议集成已启用。强制阻止和持续签名后监控仍不在本版本的建议行为范围内。检测质量需要独立标注数据、独立留出集评估及误报/漏报测量；66 个本地案例不能支持任何校准声明。

## 手动提交与开发者 API

本地模式提供钱包实验室和报告历史。对于没有自动 Snap 入口的请求，开发者可从本地 origin 将**未签名**请求手动提交至 `POST /api/security/scan`。它分析摘要，不执行请求的钱包 RPC。主 UI 目前没有通用手动 JSON 编辑器。

例如，以下命令扫描一个合成权限请求，但不会授予权限。启用 Muse 时会发送证据，并最多消耗两次分别预留的尝试，包括允许的验证修正：

```sh
curl -sS -X POST http://127.0.0.1:5173/api/security/scan \
  -H 'Origin: http://127.0.0.1:5173' \
  -H 'Content-Type: application/json' \
  --data '{"kind":"permission","chainId":31337,"origin":"http://127.0.0.1:5173","method":"wallet_requestPermissions","params":[{"eth_accounts":{}}]}'
```

请求结构与限制见 [`src/security/types.ts`](src/security/types.ts)。交易数量使用十六进制字符串；消息请求使用 `kind: "signature"`；`chainId: 0` 表示未取得签名请求的活动钱包链。类型化消息声明的链可以指导查询，但不能证明钱包当前网络。

| 端点 | 用途 |
| --- | --- |
| `GET /api/health` | 本地 API 健康状态/版本 |
| `GET /api/security/status` | 模型/工具标记和已配置链 ID；不含凭据 |
| `GET /api/networks` | 公共网络名称、ID 和配置标记；不含 RPC URL 或密钥 |
| `POST /api/networks/check` | 使用已配置 RPC 只读探测链/区块及可选账户余额/代码；不调用 Muse，不发交易 |
| `POST /api/security/pair` | 本地网页取得本地配对 token；托管模式已验证网页身份取得独立的地址绑定 Snap token，ERC-1271 身份还绑定验证链 |
| `GET /api/security/pair/status` | 经过身份验证的 Snap 配对/后端健康检查；接受配对 Snap 的 null origin |
| `POST /api/security/scan` | 验证并分析一个未签名请求 |
| `POST /api/security/ai/test` | 主动执行固定合成模型连通性检查 |
| `GET /api/security/records` 和 `GET /api/security/records/:id` | 已存安全报告；列表返回最近 100 条 |
| `GET /api/security/records/:id/evidence` | 提供给模型的有界证据包 |
| `GET /api/lab/status` | 当前案例/分析配置数量、测试合约就绪状态和每日模型预算 |
| `GET /api/lab/inventory?address=…` | 本地资产和仓位清单 |
| `POST /api/lab/prepare` | 准备并校验本地测试资产，网页随后请求钱包显示 |
| `POST /api/lab/clear` | 确认后清空本地测试合约钱包余额，要求 `{address, confirm: true}` |
| `POST /api/lab/begin`、会话读取/结果路由 | 本地钱包测试生命周期；不能代替 Snap 报告 |
| `POST /api/wallet-auth/challenge` 和 `POST /api/wallet-auth/verify` | 仅托管模式的精确消息 EOA 或支持的已部署合约登录验证 |
| `GET /api/wallet-auth/status` | 托管 bearer 地址、可选合约身份链及到期时间；不返回原始凭据 |
| `POST /api/wallet-auth/reports/delete` | 经确认逻辑删除当前身份范围的报告并撤销对应凭据；保留其他身份及额度 |
| `POST /api/wallet-auth/logout` 和 `POST /api/wallet-auth/revoke` | 托管当前会话退出，以及经网页授权撤销当前身份地址/链范围的网页/Snap 凭据 |

本地浏览器写操作要求本地 workbench origin，本地 Snap 扫描要求其配对 bearer。本地模式应保留在 loopback。托管模式的扫描、配对和历史需要经过身份验证的网页凭据或绑定钱包的 Snap 凭据；Origin 本身从不证明身份。托管交易/消息发送者必须匹配绑定地址。已验证网页用户可手动提交 permission/UserOperation/RPC 摘要获取建议；这些手动报告按所有者隔离，不执行所请求 RPC，也不新增自动 Snap 钩子。Snap 凭据仅允许交易/消息扫描。旧 demo、rule-engine、workflow、lab 和 monitor 兼容路由仍在仓库中，但在托管服务中禁用。它们不是启用中的签名后监控产品。

## 托管隐私、上游预算与证据强化

在 POSIX 系统上，启动时会将磁盘数据库及已有 WAL/SHM 附属文件限制为仅所属用户可读写的 `0600`，新建数据库目录使用 `0700`。这些权限也会收紧已有数据库，但不加密数据，不能阻止同一操作系统账户、管理员或未保护备份的访问。

模型输入在发送前受限：序列化证据包最多 **200,000 个 UTF-8 字节**，每次完整模型请求（包括修复请求）最多 **500,000 字节**。超限不会悄悄删减证据后生成看似完整的评估：原始证据保留，该次失败分析不接受分数。超时、供应商失败、拒答/无效输出及有效弃评也都不会产生本地编造的兜底分数。

Vite 禁止直接通过文件路由读取 `.local/`、`.audit-build/`、`.presentation-build/`、`.git/`、环境/凭据文件及数据库文件，包括 `/@fs/` 请求。秘密仍须保存在指定私有文件中；这些拒绝规则是额外防护，不意味着可以把开发服务器公开到互联网。

**Sign out all sessions and revoke pairing** 会以原子操作撤销当前身份范围内的凭据和未完成挑战：EOA 为该地址的全部会话，合约身份则仅限已验证链上的会话。**Delete my stored reports** 先要求确认，只删除同一身份范围的报告并撤销其凭据。其他身份和使用额度保留，不能通过删报告重置付费尝试限额。每次托管报告插入/更新都会在同一 SQLite 事务校验凭据仍有效且归属正确；撤销后的进行中请求不能把报告写回来。已发送给 Meta/RPC/情报服务的请求无法因删除而撤回或退款。

这里的删除是 SQLite **逻辑行删除**，不保证 WAL 页、磁盘、备份或第三方日志中的历史字节被法证擦除。应用不加密数据库。自动保留默认关闭；运营者可在后端 `.local/service.env` 或进程环境配置以下非密钥项：

```dotenv
WALLETSHIELD_SCAN_WALLET_DAILY_LIMIT=100
WALLETSHIELD_SCAN_IP_DAILY_LIMIT=300
WALLETSHIELD_SCAN_GLOBAL_DAILY_LIMIT=1000
WALLETSHIELD_REPORT_RETENTION_DAYS=0
```

证据/RPC/分叉扫描预算独立于模型调用预算：托管扫描在**采集之前**原子预留六个范围（每分钟每身份 8 次、服务端观察 IP 16 次、全局 60 次，另有以上可配置 UTC 日上限）。任一范围耗尽就拒绝扫描，不扣其他范围，不启动采集器。计数持久化，重启不重置；拒绝/未完成检查不产生兜底分数。模型调用仍有独立限额。这是初始容量策略，不是公众规模吞吐或可用性保证；网络连通探测仍有自己的限额。可配置日上限范围：每身份 1–10,000、每 IP 1–100,000、全局 1–1,000,000。

保留天数 `0` 不删除已有数据。显式设置 1–3650 天时，每次启动及之后每分钟最多清理 100 份已过期且有托管所有者映射的报告，积压可能需要多批；年龄按报告创建时间计算。无所有者映射的本地历史、使用额度、其他应用状态和第三方副本不由该策略删除。

公链区块来源与采集时间分开记录。`quality.blockFreshness` 标出 RPC/隔离分叉区块时间超过 300 秒、未来超过 30 秒、缺少区块时间/hash 或链身份未验证的观察；这些缺口会阻止整体 `low` 和 `strong` 证据支持程度，不是评分权重。合成演示与本地链 31337 不按公链区块年龄限制，因为本地时钟可能人为设置；观察时间诊断另算，新近区块也不证明没有重组或节点不一致。

Muse 新增接收 `evidence_admissibility`（各维度可由哪些实际观察支持）与 `claim_support`（有界基本调用/分叉执行/分叉卖出的支持）。真实但不相关的引用不能支撑该维度。代币元数据/开源状态或卖出风险标记为零，不能单独支撑身份、诱导或权限结论；实际控制权标记可支持权限，卖出/税费观察可支持敞口/协议，负面身份断言须有绑定请求/链的已识别风险观察。后端对所有展示文字检查无依据的“官方身份”、绝对安全、未来执行/卖出保证与事实性美元损失断言，同时保留明确未知与条件建议。基本调用不是交易上链，分叉结果不是公网执行或未来保证。这些只是部分自然语言防护，不是形式证明或独立准确率/校准基准；本轮新增检查采用离线对抗样本，不证明当前线上 Muse 的准确率。模型成功响应流式限制为 150,000 字节，错误响应为 16,000 字节，超限会取消读取，拒绝无效 UTF-8；不会把原始供应商错误文本作为用户建议。资源限制不证明模型结论真实。

GoPlus 仍需显式开启。它从已识别的外层/路径/Permit2/批量字段中最多选八个代币与八个交易对手，不把桥的远端 token 或 delegatecall 目标直接当作本链代币。每轮最多十八个网络请求、四路并发、单请求 1.8 秒、总共 7.5 秒；响应缓存三十秒（最多 256 项），支持链列表缓存一小时。结果带 `fetchedAt`、`cacheHit`、`cacheAgeMs`、`cacheTtlMs`、`providerAsOf:null`、`freshnessVerified:false`；刚取得不表示知道供应商数据的实际日期。缺失标记、闭源/代理导致的遗漏、未查询/截断候选与未命中均是边界，参见 [GoPlus 官方响应说明](https://docs.gopluslabs.io/reference/response-details)。

代币出资的规范 V3 single/path、exact-input/exact-output 保留有界依赖式分叉买卖适配器。原买入保留已有执行字段，衍生卖出按实际输入扣减和取得输出计算。移除部署绑定后，V3 原生币出资往返实验及路由专用 sender-sentinel 接收人别名不再支持；适用时仍可进行原交易通用模拟。候选池/factory 关联、tick/range 和有效流动性仅是观察，不认证官方池、报价或未来退出。不透明聚合器、不支持的资金/接收人及未来排序仍有缺口。钱包目录仍为 66 个代表性案例；移除前的历史验收结果不认证当前缩小后的范围。

自动入口仍取决于钱包实际交付。MetaMask 当前仅显示 Critical 严重级别的消息洞察，并在进入 Sign 后展示；交易洞察有独立入口，参见 [官方入口说明](https://docs.metamask.io/snaps/reference/entry-points/)。权限、会话、UserOperation 等仍需显式 API 或配合的 dApp SDK 接入，不安装全局钱包拦截。托管登录支持 EOA 恢复及支持范围内已部署合约的 ERC-1271 精确登录消息核对；未部署/ERC-6492 和不支持的策略仍不可用。公开上线仍需真实域名/TLS、目标 Snap 发布与分发、浏览器钱包验收、安全备份恢复以及负载/故障测试。

## 隐私与数据流

- **钱包 → 配置的后端：** 未签名请求、钱包提供的链/来源元数据及解码操作。后端在 SQLite 保存未签名 calldata 或消息载荷、证据和模型输出。本地模式保存在你的电脑，托管模式保存在运营者服务器。托管所有者检查隔离地址，但应用不加密数据库；托管用户可确认逻辑删除本人报告，运营者可显式启用有界保留策略，默认关闭。
- **后端 → 可信 RPC：** 公共账户/合约地址、调用参数、余额/代码/存储/接口查询，以及可选分叉所需状态读取。证据采集器不会广播真实上游交易。另外，网页可明确请求钱包发送用户选定的交易。
- **后端 → GoPlus，仅启用时：** 已确认支持链上的选定地址/代币，以及网站检查所需的规范化公共来源 origin。本地开发 origin 不作为公共网站信誉结果。
- **后端 → Meta，仅启用且有预算时：** 白名单请求摘要、链、规范化来源 origin、费用字段、解码字段、证据与缺失检查。验证修正会重发相同证据、受控反馈，以及最多 20,000 字符且标注为不可信的上次被拒输出。模型 origin 字段移除 URL 路径/查询和凭据。不会将完整 calldata 或完整历史作为模型输入；但消息预览和解码财务字段仍可能含私人信息。
- **实验室/中性 insight 测试生成的签名：** 在浏览器检查并丢弃，不上传、不使用。Snap 处理未签名请求。这与存储用于分析的测试消息不同。
- **托管登录签名：** 有意发送到后端，以验证准确且短时有效的 challenge。它证明访问报告和配对所需的账户控制权，不授予资产权限。签名本身不持久化。网页 bearer 凭据保留在浏览器内存中，后端 bearer 记录只存哈希。Snap 存储另一份绑定地址的 Snap token。

采集通道记录使用了哪个经过身份验证的凭据；它不是钱包/Snap 代码实际执行的密码学证明。较大的有界报告在后端保留完整证据，Snap 为可读性最多优先显示 24 项证据。

Meta 请求使用 `store: false`；此请求选项不能断言提供方所有日志或数据保留行为。软件不索要助记词、私钥或密码。风险分析接受未签名请求；独立托管身份验证流程则按前文明确请求登录签名。不要在未签名消息或开发者 API 输入中放入秘密：字段过滤不是通用秘密检测器。Meta/RPC 密钥保留在服务端，不进入模型证据或前端状态。本地配对秘密或托管 Snap bearer 只通过配对流程传递，与网页 bearer 分开。

`.local/walletshield.sqlite` 保存历史、会话、模型尝试计数，以及托管身份验证 challenge、哈希凭据、所有者映射和速率/预算状态；还可能有 SQLite WAL 文件。`.local/deployment.json`、`.local/lab-deployment.json` 和编译测试合约产物描述本地部署；`.local/snap.token` 保存本地模式配对秘密。只向可信位置备份后端数据。如需保留历史，普通重启时应保留这些文件。删除或替换可能移除历史、重置本地计数或要求重新配对；启动全新本地链与重置数据库历史是不同操作。

## 验证

从本目录运行相应检查：

```sh
npm test
npm run build
npm run test:security
npm run test:extensions
npm run test:v3
npm run test:asset-cleanup
```

| 命令 | 验证内容 / 造成的变化 |
| --- | --- |
| `npm test` | 单元/API 回归检查，涵盖解码、模型结构/引用检查、隐私证据包边界、配置、路由、历史、钱包/Snap 请求结构及会话匹配；使用测试数据/模拟，不需要付费模型调用。 |
| `npm run typecheck` | 主项目与 Snap 的 TypeScript 检查。 |
| `npm run build` | 重新生成覆盖指南，检查类型，构建前端和 Snap bundle/manifest。 |
| `npm run test:security` | 在独立端口启动自己的临时 Anvil，验证模拟行为后关闭；不使用当前浏览器测试钱包链，也不调用付费模型。 |
| `npm run test:extensions` | 启动另一个临时 Anvil，验证账户、仓位及 DAI/ERC-3009 的实际 getter 取数、部分失败和时间边界；仅主动写入测试合约状态，确认采集器不挖块后关闭。不会调用模型或浏览器钱包。 |
| `npm run test:v3` | 隔离的规范代币出资 V3 路线/失败场景、原生币通用执行及部分协议/权限前后状态比较；源状态不变，不写公网链，不调用钱包 UI 或模型。 |
| `npm run test:asset-cleanup` | 在独立随机端口临时 Anvil 验证清零余额、收到的 NFT、保留仓位/授权、重复清理与重新补充。不会接触常用本地链，也不调用钱包或模型。 |
| `npm run test:chain` | 在运行中的链 31337 上验证原始本地授权/资金准备流程；需要本地部署，会执行本地测试写入，然后恢复快照。 |
| `npm run test:lab` | 使用本地节点账户执行当前 66 案例目录，验证交易回执和签名恢复，并写入 `docs/wallet-lab-acceptance.json`；会对运行中的本地链创建/恢复快照。 |
| `npm run docs:coverage` | 从源码定义重新生成详细覆盖指南。 |
| `node --import tsx --test tests/wallet-auth.test.ts tests/hosted-integration.test.ts` | 离线合成 EOA 登录、到期/重放/撤销、哈希凭据、所有者隔离、托管路由限制、主体绑定、原子预算和并发钱包限制。不调用真实钱包/RPC/模型。 |

运行链检查前，先启动 `npm run demo`，再在另一终端执行。请在浏览器空闲时运行 `test:chain` 和 `test:lab`：恢复快照可能撤销并发的本地操作。实验室的 51 笔交易和 15 个节点生成的签名验证的是本地请求构造与行为，**不是** MetaMask UI 或真实 Snap 钩子交付。`docs/` 中的本地验收报告是带日期的观察记录，不证明当前远程连通性，也不是检测基准。

开发者可主动运行真实模型审计：

```sh
node --import tsx scripts/test-ai-audit.ts
```

它需要运行中的本地应用、已部署实验室和已启用的 Muse 凭据，会对三个固定本地请求进行真实 Meta 调用。它保留 API 额度消耗、写入审计结果，并恢复本地链快照。它不会发起浏览器钱包请求，也不验证 Snap 交付。请在实验室空闲时明确决定后运行，不要把合成验收当作广泛的模型准确率证明。

要验证完整用户路径，请手动使用 Flask：重新加载/配对已构建 Snap、准备本地资产、发起案例、阅读钱包内 insight、选择确认/取消，并确认关联会话显示真实 Snap 报告及正确钱包结果。成功路径和失败/未知路径都要检查。模型失败时应保留证据和缺口，不显示分数。

## 故障排查与部署状态

| 现象 | 检查方式 |
| --- | --- |
| 启动器报告端口被占用 | 停止之前的 WalletShield 终端会话；停止无关进程前先检查端口所属进程。 |
| 网页无法连接钱包 | 在装有 Flask 的桌面浏览器打开 loopback URL，检查选定账户与扩展访问权限。应用内嵌浏览器可能没有扩展。 |
| Snap 安装或配对失败 | 安装从 8080 端口获取文件；本地 Snap 随后直接连接 8787 的 API。以 “Snap installed;” 开头的消息表示安装后凭据、后端连接或验证阶段失败。重建后刷新页面并重新加载/配对；旧 bundle 可能仍指向 Vite 5173，其默认 CORS 中间件会先处理不透明 origin 的预检。 |
| 没有 Snap 报告 | 检查钱包是否在钩子前拒绝/失败，Snap 是否启用并配对，以及请求是否有支持的钩子。仅 API 扫描不是自动钱包检查。 |
| 测试合约或资产不可用 | 保持 Anvil 运行；执行 `npm run deploy:local`（基础代币仍有效时可用 `deploy:lab`），刷新并重新准备资产。重启链会使旧状态失效。 |
| MetaMask 中没有代币 | 查看网页链上清单，并确认准备后自动出现的钱包导入提示；拒绝显示或钱包不支持 NFT 导入不会改变余额。检查链 31337 和准确合约。 |
| 金库、借贷、质押、兑换或解包装案例失败 | 完成案例列明的前置授权和存入操作；准备资产不会自动建立这些仓位。 |
| 没有 AI 分数 | 查看 `ai.status` 与 `ai.message`：密钥缺失/关闭、每日上限、HTTP 失败、超时、拒答、验证失败或放弃评分均可能正常导致无数字。 |
| 已配置 RPC，但链检查未知 | 检查端点可达性、实际返回链 ID、提供方额度和历史状态支持。已配置不代表已验证连通。 |
| 签名没有已验证的请求网络 | 钩子没有与请求绑定的链。可能存在独立 Snap-provider 快照，但它未绑定发起 dApp 或签名时刻；与 domain 相同也不能证明请求网络。 |
| 旧报告与当前行为不同 | SQLite 历史会跨代码和本地链重启保留。检查报告版本、来源、时间和历史分数标记。 |

默认构建仍是 **localhost Flask 开发集成**。需要身份验证的托管模式现已提供显式 HTTPS/运行时设置、钱包绑定凭据、按所有者隔离的报告、撤销、额度、受限路由和独立 npm 打包，但尚未公开部署或发布。构建 `dist/web` 或准备包，不能证明 TLS/域名所有权、Snap 已发布且可安装、注册资格、保留政策或生产安全。向用户提供服务前，需要完成真实域名/代理设置，通过适用的 MetaMask 流程发布并验证目标 npm 产物，并测试真实浏览器钱包行为。当前官方分发说明区分仅开放权限与受保护权限，并为列出的密钥管理 API 规定额外审计要求；请检查准确发布权限和现行政策，不要假设所有 Snap 都适用同一批准要求。参阅 [MetaMask publication](https://docs.metamask.io/snaps/how-to/publish-a-snap/) 和 [distribution/allowlisting](https://docs.metamask.io/snaps/how-to/get-allowlisted/)。

源码入口：[`web/src/main.tsx`](web/src/main.tsx)、[`snap/src/index.ts`](snap/src/index.ts)、[`src/security/api.ts`](src/security/api.ts)、[`src/security/ai.ts`](src/security/ai.ts)、[`src/security/providers.ts`](src/security/providers.ts)、[`src/security/coverage.ts`](src/security/coverage.ts) 和 [`src/testing/cases.ts`](src/testing/cases.ts)。[中文用户手册](docs/USER-MANUAL-zh.md)与[中文覆盖指南](docs/AI-COVERAGE-GUIDE-zh.md)提供操作说明及逐字段覆盖范围；英文原文为[用户手册](docs/USER-MANUAL.md)和[自动生成的详细覆盖指南](docs/AI-COVERAGE-GUIDE.md)。旧截图或验收产物与当前行为不同时，以当前源码和实际报告为准。

当前实现与修复边界见[当前覆盖与可靠性说明](docs/CURRENT-COVERAGE-zh.md)。新增路径的验证与带日期历史验收分开记录；本轮未调用付费 Muse，也未替用户在真实钱包中确认操作，不能据此宣称真实模型准确率或评分校准。[此前的界面与证据审查](docs/ENGLISH-EVIDENCE-REVIEW-2026-10-22.md)及其他带日期验收文件保留为历史记录。

## 本轮依赖修复状态

更新后的依赖使用 `@fastify/static` 10.1.7，并通过锁文件覆盖将 `tmp` 固定为 0.2.7、受影响的 `bn.js` 5.x 范围升为 5.2.5、低于 11.1.1 的 `uuid` 升为 11.1.1。本轮 `npm audit --omit=dev` 确认生产依赖已无已知告警。完整审计仍有 12 个低危受影响包条目，根源是 `elliptic` 开发/构建工具依赖链，当前上游没有可用修复路径。12 个条目不是 12 种独立根因，也不能声称所有依赖已经零漏洞。

按更新的锁文件执行 `npm ci`；发布前重新运行 `npm audit --omit=dev` 与 `npm audit`。这些是本次审计时点的结果，不是永久承诺，也不能替代项目安全审计、浏览器钱包验收或开发构建环境检查。

[2026-10-22 扩展验证记录](docs/RELIABILITY-ACCEPTANCE-2026-10-22.md)列出本轮离线、临时链检查及尚未进行的验收；它不是识别准确率或安全认证。
