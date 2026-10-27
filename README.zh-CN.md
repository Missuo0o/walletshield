# WalletShield · Muse Wonder

[English](README.md) · [中文使用手册](docs/USER-MANUAL-zh.md) · [当前覆盖范围](docs/CURRENT-COVERAGE-zh.md)

WalletShield 是一个 EVM 钱包安全原型，在你**决定是否签名前**解释请求的风险。MetaMask Snap 将未签名请求交给后端，后端收集证据，再请 **Meta Muse Wonder（`muse-wonder-1.0`）**进行风险评估。钱包和网页展示评估、依据及尚未完成的检查。

产品提供风险提示，签名或取消始终由你在 MetaMask 中决定，不强制阻止，也不持续监控签名后的行为。

## 可以评估什么

| 请求类型 | 在支持路径中收集的证据示例 |
| --- | --- |
| 转账 | 原生币、ERC-20、ERC-721、ERC-1155 的接收方、数量、所有权、余额及部分资产变化 |
| 授权与撤销 | ERC-20 额度、单个 NFT 授权、操作员权限及现有 allowance |
| 消息签名 | Permit、常见 Permit2、DAI 风格 Permit、ERC-3009、普通消息、SIWE 风格登录及部分类型化订单 |
| 兑换 | 已解析的路径、限额、接收方，部分 V2/V3 状态、隔离执行及支持的买入后卖出实验 |
| DeFi 操作 | 部分金库、借贷、质押、流动性、包装代币、铸造、销毁及领取操作的参数与状态 |
| 账户与合约控制 | 部分所有者、角色、升级、Safe 风格控制、EIP-7702 授权及有界批量调用结构 |
| 其他主动接入请求 | 合作 dApp 或 API 客户端明确提交的权限、会话及 UserOperation 摘要 |

这些是有明确边界的适配器，不代表支持所有协议。详见[覆盖矩阵](docs/CURRENT-COVERAGE-zh.md)和[提交评估的具体字段](docs/AI-COVERAGE-GUIDE-zh.md)。本地钱包实验室提供 **67 个代表性案例，覆盖 25 类分析路径**，包含交易和消息签名请求。

## 运行流程

```text
未签名钱包请求 → MetaMask Snap → 后端验证与解析
    → 适用的 RPC / 可选情报 / 隔离模拟工具
    → 证据、定性信号及明确的检查缺口
    → Muse 评估 → 验证后的报告 → Snap 与网页
    → 用户在 MetaMask 中决定
```

后端使用 **Fastify/Zod** 提供 API 和输入验证，用 **viem/JSON-RPC** 解析请求及读取状态，用 **Anvil** 运行本地测试合约和隔离分叉，用 **SQLite** 保存报告。**React/Vite** 网页连接你选择的钱包提供方，Snap 提供受支持的钱包内提示。Infura 等 RPC 服务负责提供链上数据，不负责连接或控制你的钱包。

Muse 从权限、敞口、执行、身份、协议和欺骗六个维度给出可选的 **0–100 风险分数**、原因、不确定性与建议。本地规则只提供定性证据，**没有固定加分、数值权重或兜底分数**。后端验证引用的事实、资产对象、单位及结论是否有依据。证据不足可以不出分；失败或被拒绝的模型输出也保持无分数。分数是建议性指标，不是经过校准的损失概率。

## 快速启动

需要 **Node.js 24.x**、npm，以及安装 **MetaMask Flask** 的桌面浏览器。请使用专门的开发钱包，Flask 测试账户中不要存放真实资金。

**macOS 用户：直接双击项目文件夹中的 [StartWalletShield.command](StartWalletShield.command)。** 它会进入项目目录，使用本机可用的 Node（存在 Codex 运行时则优先使用），在缺少 `node_modules` 时安装依赖，然后自动执行 `npm run demo`。启动器不会安装 Node.js，需要事先具备 Node 24。使用启动器后，**不需要再重复运行下面的命令**。

其他系统或希望使用终端开发的用户，可以在项目目录选择以下替代方式：

```sh
node --version
npm ci
npm run demo
```

请完整执行 `npm ci`。当前启动器（包括托管模式）仍需要被归类为开发依赖的 `tsx` 等工具，不能用 `npm ci --omit=dev` 替代。

Demo 会构建网页与 Snap，启动全新的本地 Anvil 链，部署测试合约，然后启动以下服务：

| 服务 | 本地地址 |
| --- | --- |
| 网页 | http://127.0.0.1:5173 |
| 后端 API | http://127.0.0.1:8787 |
| 开发版 Snap 文件 | http://127.0.0.1:8080 |
| Anvil，链 ID 31337 | http://127.0.0.1:8545 |

启动器不会自动打开浏览器。请在安装 Flask 的浏览器中打开 **http://127.0.0.1:5173/**。保持终端运行，按 **Ctrl+C** 停止本次 Demo 的服务。启动下一次前先停止旧的 WalletShield 会话。每次新 Demo 都会重置本地链；保存的报告仍是历史记录，重启后需要重新准备资产。

分别运行开发终端、修改后端或 Snap，以及启动排错的步骤见[使用手册](docs/USER-MANUAL-zh.md)。`npm run deploy:lab` 用于检查或补充已有本地链上的实验室合约。

## 配置后端

使用**两个本地配置文件**。本机已经配置好时，保留原文件、正常启动即可。新克隆的项目可以从可见的 [Meta 模板](config/meta.env.example) 和 [RPC 模板](config/rpc.env.example) 创建；`cp -n` 会保留已有文件：

```sh
mkdir -p .local
cp -n config/meta.env.example .local/meta.env
cp -n config/rpc.env.example .local/rpc.env
```

请编辑 `.local/meta.env` 和 `.local/rpc.env`，而不是模板。`config/` 中的文件是可见示例，**不会自动加载**；真正生效的私有 `.local/` 文件不会上传 GitHub，可以有意与示例不同。在 macOS Finder 中按 **Command + Shift + .**，即可显示隐藏文件并找到 `.local/`。

| 设置 | 文件 | 用途 |
| --- | --- | --- |
| `MODEL_API_KEY` | `.local/meta.env` | Meta Model API 密钥；真实调用 Muse 时需要 |
| `ENABLE_META_AI=1` | `.local/meta.env` | 允许模型调用；设为 `0` 则关闭 |
| `AI_DAILY_LIMIT=100` | `.local/meta.env` | 整个后端每个 UTC 日的调用尝试上限；范围为 1–1000 |
| `INFURA_API_KEY` | `.local/rpc.env` | 配置后端读取 Ethereum 主网和 Sepolia |
| `RPC_<CHAIN_ID>_URL` | `.local/rpc.env` | 指定其他 EVM 网络的可信端点，或覆盖推导出的端点 |
| `ENABLE_FORK_SIMULATION=1` | `.local/rpc.env` | RPC 和历史状态支持时启用隔离 Anvil 模拟 |
| `ENABLE_EXTERNAL_LOOKUPS=1` | `.local/rpc.env` | 主动启用 GoPlus 地址、网站及代币风险观察 |

模型由代码常量 **`META_MODEL`** 固定为 `muse-wonder-1.0`，端点为 `https://api.meta.ai/v1/responses`。它**不是环境变量模型选择器**，在本地文件加入 `META_MODEL=` 不会更换模型。这里需要 Meta 密钥，不使用 OpenAI 密钥。

本地钱包测试不需要 Infura 密钥。Muse 没有配置、未启用或调用未成功时，仍可查看证据，但不会得到 AI 数字。Infura 提供公网状态读取，不提供钱包权限或钓鱼检测。其他网络需要各自可信的 `RPC_<CHAIN_ID>_URL`；链 31337 始终绑定本地节点。

启用 GoPlus，只需在 **`.local/rpc.env`** 设置这个开关：

```env
ENABLE_EXTERNAL_LOOKUPS=1
```

改为 `0` 即关闭。**`GOPLUS_TOKEN` 不是开关，匿名查询时可以不配置或留空。** 仓库模板初始值为 `0`，本地实际文件设为 `1` 就是开启，不受模板值影响；模板不会在运行时加载。`/api/security/status` 的 `externalLookups` 显示后端实际加载的开关值。启用不代表查询成功或支持所有链，缺失情报保持未知。可选源码验证和专用 trace 端点见[使用手册](docs/USER-MANUAL-zh.md)。

进程环境变量优先。Meta 凭据与 AI 设置随后读取 `.local/meta.env`；RPC/工具设置依次读取 `.local/rpc.env` → `.local/meta.env` → 旧版 `.local/ai.env` 中首个已定义的值。文件在每次请求时重新读取；修改进程环境变量则需要重启。请勿为了套用模板而覆盖已有配置。

模型调用可能产生费用。失败也计入每日尝试额度，允许的输出修正可能再消耗一次尝试。这是尝试次数上限，不是金额预算。RPC 与情报服务有各自的额度。密钥应始终保留在服务端，不要提交 Git、截图或发送到聊天。

## 连接 Snap 并用钱包测试

1. 打开 **Wallet setup → Connect wallet**，选择预期的 Flask 钱包提供方和测试账户。
2. 点击 **Install and pair Snap**，在钱包中批准权限。本地 ID 为 `local:http://127.0.0.1:8080`。等待后端配对与健康验证；安装成功本身不证明请求已经被分析。
3. 点击 **Switch to local chain and prepare assets**，批准网络提示。后端在链 31337 准备测试 ETH、代币和 NFT；资产显示提示需要在钱包中另行确认。
4. 打开 **Local wallet lab**，选择操作并阅读 **Prerequisites**。每项所需授权都要单独确认；准备资产不会自动授权路由器或创建协议仓位。
5. 点击 **Request a test transaction/signature**，查看 WalletShield 提示、证据及可用的 Muse 评估，再在 MetaMask 中确认或取消。消息提示可能在进入钱包签名步骤后出现。
6. 对照 **Wallet test history** 与 **Check history**。钱包结果和观察到的 Snap 请求送达是两件事；取消的请求也可以有完整的签前报告。

可以先选择无限授权并取消，再比较有限授权和撤销。本地测试资产没有真实价值。拒绝钱包显示不会撤销已经准备的余额。**Clear local test assets** 只清理当前本地账户的已知测试合约钱包余额，不会清除长期授权、协议仓位、历史记录或未知资产。

修改 Snap 后重新构建、刷新网页，再点击 **Reload and pair Snap**。钱包提示超时后，请先在 MetaMask 中处理已有提示再重试，网页无法取消已经打开的钱包请求。

## 公网使用与部署

配置后端 RPC 后，打开 **Public networks**，连接所需账户并选择网络。**Check RPC and account state** 只检查连接，不评风险；**Test the wallet signing insight** 检查 Snap 消息送达，并可能调用 Muse。真实转账、授权或兑换应在相应 dApp 中发起，然后在钱包中查看 WalletShield。

自动评估要求 MetaMask 将受支持的交易或消息交给已配对的 Snap。没有相应入口的权限、会话和 UserOperation，需要 dApp/API 主动接入；安装 Snap 不代表可以观察全部钱包操作。切换网络本身是直接的钱包请求，不产生 Muse 分数。

向公众分发还需要 HTTPS 托管、身份与配对配置，以及 Snap 发布流程。仅配置 Infura 密钥不会发布服务。详见[托管部署说明](docs/USER-MANUAL-zh.md)。

## 隐私与边界

- 未签名请求、消息内容、地址和证据会在后端处理并写入 SQLite 历史。启用 AI 时，有界证据包发送给 Meta；配置的 RPC/情报服务接收相关查询。应用不会加密本地存储。
- WalletShield 不索要助记词或私钥。实验室生成的资产签名留在浏览器中并被丢弃；未签名消息仍可能被保存和评估。
- 模拟成功只描述某个状态，不能保证未来卖出、价格、跨链到账、协议偿付或绝对安全。自定义协议、不透明批量调用、非标准资产和未支持的钱包入口可能只能部分分析或无法评分。
- 产品仍是原型，尚无独立建立的风险检测准确率。扩大使用前，请阅读[覆盖与可靠性边界](docs/CURRENT-COVERAGE-zh.md)。

## 进一步阅读

[中文使用手册](docs/USER-MANUAL-zh.md) · [English manual](docs/USER-MANUAL.md) · [覆盖范围](docs/CURRENT-COVERAGE-zh.md) · [取数字段与 AI 证据](docs/AI-COVERAGE-GUIDE-zh.md) · [接入与评估](docs/RELIABILITY-AND-INTEGRATION.md)

开发者验证命令与带日期的结果：[最新完整复测](docs/FULL-RETEST-2026-10-27-zh.md)。

## 线上测试实验室

可选的 **Test lab** 将钱包实验室保留在线上网站，使用临时测试链 **31338**；电脑本地链仍为 **31337**。连接专用测试钱包、验证身份、安装并配对已发布的 Snap，再准备资产并确认新网络。请求依然经过钱包 → Snap → 后端取证 → Muse → 报告。测试资产没有真实价值。

这是**共享测试链**，使用 15 分钟独占交易时段；合约控制状态可能随测试者切换而改变。准备和清理资产仅限本人已验证账户，测试会话按身份隔离，链上数据公开。受限 HTTPS RPC 不开放 Anvil 管理与解锁账户发送。需由运营者显式启用并部署，详见[线上实验室说明](docs/HOSTED-TEST-LAB.md)。
