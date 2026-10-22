# WalletShield 使用说明与完整工具流程

**适用版本：0.4.1 + Meta Muse Wonder · 编写日期：2026-10-22**

本文根据当前项目代码说明实际行为，涵盖操作步骤、工具分工、取数方式、风险类别、模型输入和评分来源。它是一份当前实现说明，不代表所有钱包风险已经解决。模型与 Infura 是否已连接，以本机实时测试结果为准。

## 1. 先理解 WalletShield 在做什么

WalletShield 在用户准备提交交易或签署消息时，整理这次操作的资产与权限影响，查询可用证据，并让 Meta Muse Wonder 对证据给出风险意见。它把结果显示在网页或钱包确认流程中，由用户决定是否继续。

```text
用户准备转账、授权、兑换或签消息
                  ↓
MetaMask 把支持的请求交给 Snap，或用户在网页主动提交 JSON
                  ↓
后端校验输入 → 解析操作 → 按类别选择取数工具
                  ↓
节点状态 + 协议接口 + 签名检查 + 可选副本模拟 / 风险情报
                  ↓
规则标记风险和缺口 → 整理结构化证据 → Meta Muse Wonder
                  ↓
校验模型输出 → 保存检查记录 → 网页 / Snap 显示
                  ↓
用户在钱包里决定签名、拒绝或取消
```

这里的“风险监控”主要指**签名前的单次风险检查**。项目不持续盯住签名后的钱包活动，也不强制阻止用户签名。某次本地测试交易提交后核对回执，只是确认该次测试的处理状态，不是持续监控。

三个边界尤其重要：

- **钱包要提供请求，Snap 才能分析。** 当前自动入口是交易与部分消息签名，不是对所有网站、所有钱包 RPC 的全局拦截。
- **后端负责取数，模型负责评价证据。** 模型没有在这次调用中获得独立浏览、访问节点或随意调用工具的能力。
- **进入检查流程不等于已经完整理解。** 未识别协议、没有 RPC、模拟失败、情报不支持等情况会保留未知。

MetaMask 将交易与消息签名作为不同的 Snap 入口，见 [MetaMask 官方入口说明](https://docs.metamask.io/snaps/reference/entry-points/)。

## 2. 四个网页页面分别做什么

| 页面 | 用户主要操作 | 实际工具与数据 | 是否进入 Meta 评分 |
|---|---|---|---|
| 钱包防护 → 演示样本 | 选择操作场景，点击“开始检查” | 固定合成数据 + 解析器 + 规则引擎 | **不调用模型**，分数如有则明确来自规则 |
| 钱包防护 → 检查请求 | 提交未签名 JSON，可补充操作背景 | 综合后端按请求读取节点、协议、模拟和已启用情报 | 配置并开启 Muse 后尝试调用 |
| 钱包防护 → 测试 AI 连接 | 主动点击固定合成样本连接测试 | 固定样本证据 + Meta API | **会调用模型**，可能产生 API 费用 |
| 授权测试 | 演示或本地 TEST-USD 授权、撤销 | 原有 ERC-20 规则路径、余额/allowance 和基础 eth_call；可发起钱包请求 | 本页“开始安全检查”本身不直接调用 Muse；实际钱包请求若触发 Snap，会另走综合分析 |
| 检查记录 | 搜索、查看授权检查与钱包处理状态 | 本地 SQLite、记录关联和必要的回执核对 | 查看记录不会重新评分 |
| 钱包接入 | 连接测试钱包，安装/重新加载 Snap，确认本地链 | MetaMask Flask、钱包 RPC、Snap 配对、本地状态查询 | 连接和安装本身不调用 Muse |

**最容易混淆的区别：网页上的授权预检、钱包实际签名请求、Meta 模型评分，是三个不同的步骤。** 看见预检成功，不能据此认为模型调用成功；看见风险提示，也不能据此认为交易已经执行。

## 3. 从启动到第一次钱包测试

### 3.1 启动项目

使用 Node.js 24。在 Finder 双击项目根目录的 `启动WalletShield.command`，或在项目目录执行：

```sh
npm run demo
```

新电脑首次使用，需要先安装项目依赖：`npm ci`。一键启动会构建网页与 Snap、启动本地 Anvil、部署 TEST-USD，然后启动后端、网页与 Snap 文件服务。

| 服务 | 本机地址 | 作用 |
|---|---|---|
| 网页 | http://127.0.0.1:5173/ | 操作与结果界面 |
| 后端 API | http://127.0.0.1:8787/ | 校验、取证、评分和记录 |
| Snap 文件服务 | http://127.0.0.1:8080/ | 提供 Snap 清单、脚本和图标供 Flask 加载 |
| 本地测试链 | http://127.0.0.1:8545/ | Anvil，链 ID 为 31337；测试交易与测试资金 |

Vite 会把网页的 API 请求转交给后端；部分工作流/综合检查路由在 Vite 内复用同一套后端代码。网页地址、API 地址、Snap 文件地址、链节点地址用途不同，不能互换。

终端按 **Ctrl+C** 关闭本次启动的服务。已经运行时不要重复启动；重启一键演示会重建本地链状态，SQLite 历史记录会保留。

### 3.2 连接自己的测试钱包

在装有 **MetaMask Flask** 的桌面浏览器中打开网页，进入“钱包接入”，点击“连接测试钱包”。在钱包中选择并允许连接测试账户。

这一步使用 `eth_requestAccounts` 获取你批准连接的公开地址。它不意味着你已经授权使用代币，也不会把私钥交给网页。网页运行在没有钱包扩展的浏览器中时，无法完成这一步。

### 3.3 安装或重新加载 Snap

在“钱包接入”点击“安装本地 Snap”或“重新加载 Snap”。Snap ID：

```text
local:http://127.0.0.1:8080
```

网页先调用 `wallet_requestSnaps`，再通过 `wallet_invokeSnap` 的 `walletshield_configure` 方法完成本机配对。安装结果由钱包返回，不能只凭点击按钮判断成功。

| Snap 权限/入口 | 在项目中的用途 |
|---|---|
| transaction-insight / onTransaction | 取得钱包交出的未签名交易及允许提供的来源 |
| signature-insight / onSignature | 取得钱包交出的未签名消息及允许提供的来源 |
| network-access | 调用本机综合检查 API |
| page-home / onHomePage | 在钱包中展示 WalletShield 首页与能力说明 |
| snap_manageState | 保存本机后端配对令牌 |
| rpc.dapps / onRpcRequest | 接受本地工作台明确发起的配置请求，不是任意 RPC 拦截器 |

本机配对令牌用于验证 Snap 与后端通信，**不是钱包私钥，也不是 Meta API Key**。本次构建没有索取用户私钥、助记词或代替用户签署资产交易的权限。

交易提示出现在钱包的交易确认流程。消息签名的关键提示可能在点击 Sign 后才展示，具体由 MetaMask 的当前确认界面决定；不是一连接钱包就对所有操作自动弹窗。参见 [官方消息签名入口说明](https://docs.metamask.io/snaps/reference/entry-points/#onsignature)。

### 3.4 准备本地测试资金

进入“授权测试”，使用本地链检查模式。连接账户后点击“准备本地测试资金”，按钱包提示添加或切换到 **WalletShield Local，31337**。

| 此步骤 | 使用的工具 | 实际行为 |
|---|---|---|
| 切换网络 | wallet_switchEthereumChain；必要时 wallet_addEthereumChain | 把测试钱包切到本地链，不是把主网资产搬过来 |
| 核对本地环境 | 固定本机 RPC、链 ID、Anvil 标识、部署地址与代码哈希 | 拒绝把资金准备请求指向其他网络 |
| 准备测试 ETH | anvil_setBalance | 余额不足时补至 10 测试 ETH，供本地 gas 使用 |
| 准备 TEST-USD | 测试合约 faucet | 余额不足时补至 5,000 TEST-USD，较高余额不减少 |
| 显示代币 | wallet_watchAsset | 添加代币显示条目，不是生成余额 |

TEST-USD 不是 USDT，没有实际美元价值。测试 ETH 也不是主网 ETH。即使钱包对本地 ETH 套用了市场价格，仍不代表这些测试币可以兑现。

### 3.5 先做授权预检，再发起钱包测试

建议依次测试：极高额度授权、有限额度授权、撤销授权。

1. 选择操作和被授权地址，点击“开始安全检查”。这里使用原有本地规则与基础链查询，不会直接请求 Muse。
2. 点击“在钱包中发起测试授权”，实际请求进入 MetaMask。
3. 如果 Snap 安装、配对及自动入口正常，钱包会把该请求交给 Snap；Snap 调用综合后端，显示风险依据和可用评分。
4. 查看授权对象、额度、未知项、分数来源，再由你在钱包中决定确认或取消。
5. 到“检查记录”查看钱包报告与回执状态；综合报告还可在“钱包防护”的“最近的综合检查”中查看。

**确认 approve 只建立权限，通常不会立刻转走代币。** 撤销某项 ERC-20 授权一般是将该 spender 的额度设为 0；不代表撤销所有合约的全部权限。

本版真实钱包测试按钮主要构造本地 TEST-USD 的 approve。更多风险场景可以做固定演示、主动 JSON 检查，或在兼容请求进入钱包时由 Snap 分析；不是每个演示选项都有对应的一键真实交易。

### 3.6 使用综合检查页

“钱包防护”有两种方式：

- **演示样本：** 选场景后直接检查。完全使用固定证据，不请求真实节点、外部情报或 AI。
- **检查请求：** 选择场景可带出 JSON 模板，再替换为实际待检查的未签名请求。该页只检查，不替你签名、广播或执行其中的 RPC。

可选的“补充操作背景”提供提现前付款、保证收益、由谁引导等信息。这些是**用户陈述**，不是程序自动读取聊天后发现的事实。

### 3.7 配置 Muse 与 Infura，再测试真实连接

两种密钥用途不同，均在本机后端文件中保存，不发送到聊天。

`.local/meta.env`：

```dotenv
MODEL_API_KEY=在本机填写Meta密钥
ENABLE_META_AI=1
```

模型固定为 `muse-wonder-1.0`，接口固定为 `https://api.meta.ai/v1/responses`，与 [Meta 官方说明](https://dev.meta.ai/docs/overview)一致。旧 OpenAI Key 不再用于新请求。模型运行在 Meta 云端，不是下载到电脑上的离线模型。

`.local/rpc.env`：

```dotenv
INFURA_API_KEY=在本机填写Infura密钥
ENABLE_EXTERNAL_LOOKUPS=0
ENABLE_FORK_SIMULATION=1
ENABLE_MONITOR=0
```

后端会生成 Ethereum 主网（1）和 Sepolia（11155111）的 Infura RPC。其他网络可明确配置 `RPC_网络ID_URL`。本地 31337 无需 Infura，始终使用本机节点。Infura 提供节点访问，不等于提供诈骗黑名单或保证全部 trace/历史状态方法可用，参见 [Infura 入门](https://docs.infura.io/get-started/infura/)。

保存配置后，点击“刷新状态”。配置按请求重新读取，但“已保存”“已配置网络”只说明读到了配置，**不是远端鉴权或连接已成功的证明**。

在“钱包防护”展开“如何启用 AI 与真实数据”，主动点击“测试 AI 连接（固定合成样本）”。这个特定按钮会调用模型；普通“演示样本”不会。看到有效的 AI 完成报告后，才能确认这次模型调用成功。它也不验证真实链 RPC。

如需地址、网站和代币风险情报，再将 `ENABLE_EXTERNAL_LOOKUPS=1`，可选填写 `GOPLUS_TOKEN`。Infura Key、Meta Key 和 GoPlus Token 是不同服务的凭据。

## 4. 一次综合请求内部经历了什么

| 顺序 | 实际组件 | 做什么 | 产物 |
|---|---|---|---|
| 1 | 网页或 Snap | 交出未签名交易/消息；Snap 不带用户已生成签名 | 请求类型、公开地址、数据、网络及可用来源 |
| 2 | Fastify + Zod | 校验 JSON 结构、地址、十六进制、大小和允许字段；校验本地来源或 Snap 配对 | 合法请求，或格式/权限错误 |
| 3 | ABI / EIP-712 解析器 | 解码常见方法和参数；不认识的保留未知 | operation：类别、参数、目标、复杂性 |
| 4 | 工具路由器 | 按操作决定需要哪些数据 | tool_plan：工具选择与可用性 |
| 5 | 证据采集器 | 并行尝试基础节点、协议、签名链上校验与副本模拟；基础采集器内按配置查询 GoPlus | 带来源、时间、状态和检查 ID 的 checks |
| 6 | 本地规则 | 结合参数与已取到事实，标记风险、警告和缺失 | 文字风险信号、综合提示、missingData；不生成数字 |
| 7 | evidencePacket | 把允许的字段组成模型证据包 | 精简请求摘要、操作、检查、缺口；不提供规则数字 |
| 8 | Meta Responses API | 根据这些证据输出 JSON 风险意见 | 分数/未知、理由、建议、缺失项 |
| 9 | Zod + 业务校验 | 检查分数范围、引用及 honeypot 结论是否有依据；不设分数下限 | 有效模型结果，或明确失败 |
| 10 | SQLite + 网页/Snap | 先保存基础报告，再用同一 ID 更新模型结果 | 可查看、导出的综合检查报告 |

工具计划只代表“选了什么”，不代表这些工具已经成功。不同工具在各自固定区块取数，目前不是所有工具共用一个完全原子的链状态快照。

## 5. 到底提取哪些“关键词”或数据

### 5.1 主要是结构化字段，不是按词搜索判诈骗

交易里的 `data` 是编码数据。解析器先读取函数选择器，再按已知 ABI 解码参数，并通过重新编码核对来避免忽略多余字节或错误结构。

| 识别线索 | 提取字段 | 含义 |
|---|---|---|
| approve；常见选择器 0x095ea7b3 | spender、amountOrTokenId、unlimited | 给谁什么额度/哪个 NFT 编号的权限；ERC-20 与 ERC-721 的编码可能相同，需核对标准 |
| setApprovalForAll；0xa22cb465 | operator、approved | 是否开启集合级 NFT 权限 |
| transfer；0xa9059cbb | recipient、amount、token | 谁会收到多少代币 |
| transferFrom / safeTransferFrom | owner、recipient、tokenId 或 amount | 从谁的账户转出、转给谁、哪项资产 |
| V2 swap 方法 | path、amountIn、amountOutMin、recipient、deadline | 兑换路径、投入、最低接收、收款人、期限 |
| V3 exactInput / exactOutput 等 | tokens/路径、fee、价格/金额限制 | 常见 V3 候选，不能仅凭方法名证明路由可信 |
| Permit / PermitSingle 等 EIP-712 类型 | domain、verifyingContract、owner/spender、value/amount、nonce、deadline/expiration | 签名可能授予的未来资产权限 |
| owner / paused / 代理槽 | 控制者、暂停状态、implementation/admin/beacon | 当前可见的部分合约控制能力 |
| 普通消息 / SIWE 外观 | method、messagePreview、domain、owner、chainId、expiration | 消息内容摘要和声明的登录范围，不是完整会话验证 |
| 钱包 RPC / 会话参数 | method、scope、limit、validUntil、paymaster、entryPoint 等 | 只提取白名单字段，不执行原 RPC |

函数名、类型名、代币名称都可以被模仿。发现“Permit”这个名称，不等于已经证明它是标准 Permit；结构编码与链上接口校验分别提供不同证据。

### 5.2 每类数据从哪里来

| 数据来源 | 代表字段/信号 | 当前如何使用 |
|---|---|---|
| 待签请求 | from、to、value、gas、nonce、方法、参数 | 保留精确整数，识别资产、权限和费用范围 |
| 节点 RPC | chainId、blockNumber、余额、代码、decimals、allowance | 确认查询网络和当前状态；失败不补造事实 |
| 合约接口 | DOMAIN_SEPARATOR、nonces、owner、healthFactor、previewDeposit | 做对应协议的局部校验；接口可模仿，不直接认证身份 |
| 独立副本 | 执行状态、gas、资产前后余额/权属、内部调用摘要 | 找额外扣款、资产转出与部分买卖限制；不是未来保证 |
| GoPlus | phishing_site、stealing_attack、is_honeypot、sell_tax 等 | 保留供应商实际返回的有限字段与来源 |
| 用户主动补充 | withdrawalFee、guaranteedProfit、requestedBy | 提现前付款、保证收益、陌生人引导等待核实背景 |

程序不会自动读取聊天、社交媒体私信或浏览器全部页面；“保证收益”“先交钱才能提现”目前来自用户勾选或主动提交的上下文，不是自动关键词爬取结果。

### 5.3 GoPlus 的具体字段

网站查询目前关注 `phishing_site`。地址字段包括 `cybercrime`、`money_laundering`、`phishing_activities`、`stealing_attack`、`honeypot_related_address`、`blackmail_activities`、`sanctioned`。

代币只保留这些有界字符串字段：`is_honeypot`、`cannot_sell_all`、`buy_tax`、`sell_tax`、`is_open_source`、`is_proxy`、`transfer_pausable`、`is_blacklisted`、`slippage_modifiable`、`owner_change_balance`、`hidden_owner`、`can_take_back_ownership`、`is_mintable`。

当前明确升级为代币风险的例子包括 `is_honeypot=1`、`cannot_sell_all=1`、`owner_change_balance=1`，或可解析的 `sell_tax≥0.5`。其他返回字段也会留给模型，但不等于每一个都已实现完整因果分析。没有命中、字段为空或查询失败均不是安全证明。

资源限制：地址情报最多查询 3 个已解析目标，代币情报当前只有一个主要代币候选，并非路径中每个代币都查询。

## 6. 已覆盖哪些操作行为

下面列的是**有处理路径的类别**，不是全部风险已经检测完成。项目有 25 个演示选项、30 个共享能力说明类别；数量不同来自样本与分类的组织方式，不是覆盖率指标。

入口标记：

- **交易入口：** 需要 MetaMask 实际把该笔 EVM 交易交给已安装 Snap。
- **消息入口：** 需要钱包实际提供受支持的消息签名请求。
- **手动：** 当前要由网页/dApp 主动提交，Snap 不会全局自动看到。
- **混合：** 按实际请求入口处理，无法解析时保留未知。

### 6.A 交易入口：钱包提供交易时按候选类型处理

| 操作类别 | 尝试提取的数据 | 已实现程度与边界 |
|---|---|---|
| 原生币转账 / 合约收款 | 发送人、目标、value、网络、来源域名与费用参数<br>节点区块、余额、目标代码；可选副本净余额、gas 与调用摘要<br>已启用且可获得的地址 / 网站风险情报 | 常用交易检查，收款方身份未认证。<br><strong>未确定：</strong>对方真实身份、付款目的、跨网络误转、未来欺诈与最终成交费用不能由一次转账证明。 |
| ERC-20 代币转账 | 代币合约、接收方、原始数量<br>可读 symbol、decimals、余额、代码与固定区块<br>可选实际余额差异、额外扣款线索和代币风险情报 | 标准 transfer 候选与部分资产变化。<br><strong>未确定：</strong>名称可伪造；非标准扣费、重基准、无事件资产和资产价值未完整覆盖。 |
| NFT / 委托转移 / 批量 NFT | owner、recipient、tokenId 或 ids / amounts<br>ERC-165 声明或 ERC-20 风格接口；token 合约地址<br>可选副本权属 / 余额变化和内部调用摘要 | 常用 ERC-721 / ERC-1155 方法；相同 selector 仍需核对标准。<br><strong>未确定：</strong>合约可伪报标准；NFT 真伪、价格、全部回调与非标准资产语义未证实。 |
| ERC-20 / NFT 单项授权、撤销、链上 Permit | spender、金额或 NFT 编号、是否极高额度；部分 owner / deadline<br>代币接口标准；ERC-20 approve 可读既有 allowance<br>当前余额、目标控制信息、情报及副本额外支出线索 | 常用权限参数检查，不完整认证授权方。<br><strong>未确定：</strong>ERC-20 与 NFT approve 编码相同；有限额度也可能恶意；未验证所有链上 Permit 变体及未来权限消费。 |
| NFT 全量 operator 授权 / 撤销 | 集合合约、operator 与 approved 布尔值<br>当前请求是否增加全量权限<br>可读控制信息、地址情报和副本行为 | 识别集合级操作权限。<br><strong>未确定：</strong>没有全面枚举当前 / 未来 NFT 暴露，operator 的身份与以后是否滥用未知。 |
| Permit2 链上额度 | token、spender、uint160 amount、expiration<br>是否极高额度、当前代币信息和可得情报<br>本次调用的节点 / 副本事实 | 常见四参数 approve 候选。<br><strong>未确定：</strong>函数外观不能证明目标是可信 Permit2；既有三元 allowance / domain 不在此交易路径完整核对。 |
| 常见 V2 兑换 / Honeypot 线索 | path、输入金额、最低输出、接收方与 deadline<br>可选副本买入获得量、卖出成败、返回量、gas 和资产差异<br>可用的 honeypot、卖出税、黑名单及管理员风险情报 | 常见路由参数；满足条件时做副本买卖往返。<br><strong>未确定：</strong>卖出失败也可能由余额、路由或流动性造成；往返损耗不是纯税率；成功一次不保证未来能卖出。 |
| 常见 V3 兑换 | tokenIn / tokenOut 或路径、fee、接收方<br>输入 / 输出、最低输出 / 最高输入、价格限制与部分 deadline<br>当前交易副本差异、控制信息及可得代币情报 | 解析单池 / 路径候选；尚无 V3 专属连续买卖验证。<br><strong>未确定：</strong>未核对所有池子、报价与 tick 流动性；未完成 V3 卖出往返、MEV 和全部聚合器语义。 |
| ERC-4626 风格金库存取 / 份额 | deposit / mint / withdraw / redeem、金额、receiver / owner<br>asset、totalAssets、totalSupply<br>对应 preview 与 max 返回值、缺失接口、代码及常见控制状态 | 候选解析与当前接口查询。<br><strong>未确定：</strong>同名函数不证明 ERC-4626 或协议身份；返回值不证明资产估值、真实偿付、后续价格或未来可提现。 |
| 借贷 / 抵押 | asset、amount、onBehalfOf、利率模式或抵押开关<br>当前抵押、债务、可借额度、LTV、清算阈值、healthFactor<br>储备配置原值、固定区块、代码与本次副本行为 | Aave 风格当前账户接口，尚非完整清算模型。<br><strong>未确定：</strong>未计算操作后的全量头寸、价格冲击和清算结果；没有证明预言机或其他借贷协议可信。 |
| 质押 / 解质押 / 奖励提现 | stake / unstake / withdraw / getReward 等候选方法<br>可解析金额与 receiver<br>目标控制信息、固定区块、副本可识别资产与调用摘要 | 部分常见函数识别与通用副本检查。<br><strong>未确定：</strong>尚未自动读取锁定期、罚没、奖励公式和收益来源；withdraw 也可能属于其他协议。 |
| 增减流动性 | tokenA / tokenB、各金额 / 最小值或 LP 数量<br>recipient、deadline、目标及副本可识别资产差异<br>可获得的控制信息和主要目标代币情报 | 部分 V2 风格路由参数。<br><strong>未确定：</strong>当前没有完整池身份 / 储备 / LP 估值或无常损失模型；不保证退出，非全部代币都已查情报。 |
| 部分跨链桥存入 | localToken / remoteToken、amount 或原生币 value<br>recipient、桥候选 action、目标控制状态<br>本链副本资产差异；目标链未验证标记 | 部分 OP 风格桥方法和本链行为。<br><strong>未确定：</strong>未核实目标 chainId、目标链到账、消息证明、验证者 / 托管风险；extraData 未作为完整业务语义分析。 |
| 空投 / 奖励领取 | index、account / recipient、amount 和 proof 项数<br>目标合约 / 代码 / 常见控制信息<br>可选本次副本资产差异、调用与可用地址 / 网站情报 | 一种常见 Merkle claim 外观。<br><strong>未确定：</strong>未证明 Merkle 根、项目身份、领取权益；原 proof 与网站内容没有交给 AI 做完整验证。 |
| 包装原生币 / 无参存入候选 | value、接收合约及无参方法<br>代码、常见控制状态与副本资产变化 | deposit() 外观与原生币 value。<br><strong>未确定：</strong>deposit() 不一定是可信包装币；withdraw(uint256) 目前落入质押候选；未校验恒定兑付关系。 |
| 铸造 / 销毁 | mint / burn、recipient、amountOrId<br>合约 / 代币信息、value 和副本资产差异 | 少量常见方法，不完整区分金额与 NFT 编号。<br><strong>未确定：</strong>未证明发行权益、总量政策、真实价格及全部销毁后果。 |
| 控制权 / 角色 / 升级变更 | transferOwnership / renounceOwnership / grantRole / revokeRole / upgradeToAndCall<br>新控制者、角色、账户或实现地址<br>旧目标代码哈希、ERC-1967 槽及可读 owner / paused、副本行为 | 常见管理员操作候选。<br><strong>未确定：</strong>未完成新实现代码审计、存储兼容、动态 delegatecall 或所有隐藏管理员检查。 |
| 合约部署 | 发送人、value、初始化字节码 selector / 长度与费用摘要<br>副本可识别资金变化及调用摘要 | 部署请求和副本执行；未做完整源码审计。<br><strong>未确定：</strong>完整初始化字节码没有发给 AI；新合约权限、源码 / 编译对应、初始化逻辑和 CREATE2 身份未全面分析。 |
| 批量 / 聚合器 / 复杂调用 | method；deadline 包装可提供 callCount 与有限 selectors<br>父交易副本的有界资产差异与调用树<br>目标、代码与可用情报 | 父交易执行与部分包装参数，子调用语义不完整。<br><strong>未确定：</strong>普通 multicall(bytes[]) / execute 的子调用未全面解码；隐藏资产、跨协议与动态委托可能遗漏。 |

### 6.B 消息入口：以钱包实际提供的签名方法为准

| 操作类别 | 尝试提取的数据 | 已实现程度与边界 |
|---|---|---|
| 钱包登录消息候选 | method、最多 1600 字符 messagePreview<br>声明 domain、owner、chainId 与 expiration<br>来源域名匹配、账户匹配、过期和缺少当前网络等检查 | 部分 SIWE 外观 / 域名与账户检查。<br><strong>未确定：</strong>不是完整 SIWE 语法与 nonce / URI / audience 验证；未核验站点的登录会话和服务器用途。 |
| 普通消息签名 | 签名账户、方法、来源域名和最多 1600 字符消息预览<br>用户填写的用途与诈骗背景；可用网站 / 地址情报 | 文本预览与证据不足提示。<br><strong>未确定：</strong>文本可能被链上合约或网站赋予额外权限；摘要可能截断；没有当前链 ID 时不能猜测网络。 |
| Permit / NFT Permit 消息 | domain、verifyingContract、owner / spender、value 或 tokenId、nonce、deadline<br>EIP-712 编码 digest / domainHash；标准 EIP-2612 nonce 与 DOMAIN_SEPARATOR 匹配<br>代币信息、控制信息、情报与网络 / 账户不匹配检查 | 标准 EIP-2612 校验与部分 NFT 候选；变体不完整。<br><strong>未确定：</strong>NFT / DAI / 自定义 Permit 的链上校验不全面；声明网络不等于钱包当前网络；未来执行和协议身份未证明。 |
| Permit2 消息 | primaryType、domain、spender、token / amount / expiration、deadline 与部分财务摘要<br>EIP-712 编码；逐 token nonce 或 nonce 位图使用状态<br>当前链上查询区块、代币信息、情报与证据缺口 | 常见类型识别与部分链上 nonce 校验。<br><strong>未确定：</strong>尚未完整核对所有 batch / witness / 自定义变体、身份与既有三元额度；单次 nonce 可用不代表用途安全。 |
| 订单 / 挂单 / 其他 EIP-712 消息 | primaryType、domain、verifyingContract 与编码 digest<br>可识别的 offerer、recipient、amount、起止量 / 时间等有限财务摘要<br>可读目标控制信息、可用 nonce 结果或未覆盖标记 | 结构编码和白名单财务参数，协议语义兜底。<br><strong>未确定：</strong>Seaport 等订单的全部 offer / consideration、履约条件、对价、取消状态和自定义权限未完整解释。 |

### 6.C 手动提交与入口受限类别

| 操作类别 | 尝试提取的数据 | 已实现程度与边界 |
|---|---|---|
| 原始 eth_sign | 签名方法、账户、声明网络 / 来源与原始签名风险标记<br>可用上下文和情报；不向 AI 发送原始 digest 全文 | 识别盲签风险，不理解摘要原文。<br><strong>未确定：</strong>哈希摘要无法还原出唯一原文，不能确定权限、交易或重放范围。<br><strong>入口提醒：现有 SDK 的消息入口不保证提供 eth_sign；可在网页主动检查该类型。</strong> |
| 钱包连接 / 权限 / 会话密钥 | method、账户 / 地址、scope、limit、有效期等白名单字段<br>有限嵌套参数摘要、请求来源与可用地址 / 网站情报 | 有界参数摘要；无通用 Snap 自动截获。<br><strong>未确定：</strong>未证明钱包实际授予何种权限、会话验证器是否执行限制；不会读取私钥或会话密钥，也不执行授权。 |
| UserOperation / 智能账户 | method、sender、entryPoint、paymaster、factory、nonce 等可识别字段<br>callData selector / 长度、目标 / 金额与会话限制摘要（若存在） | sender / paymaster 等摘要；未执行 bundler 仿真。<br><strong>未确定：</strong>账户模块、签名策略、paymaster 代扣、bundler 校验和全部批量子操作未知；某些字节格式地址未解码。 |
| 添加 / 切换网络、资产显示配置 | method、chainId、可读 chainName 和其他白名单字段<br>rpcUrls / blockExplorerUrls 仅保留域名来源；不含路径 / 凭据 | 请求摘要，不连接客户端提供的 RPC。<br><strong>未确定：</strong>未验证新 RPC、浏览器或网络名真假；wallet_watchAsset 的自定义嵌套资产元数据未完整解码。 |
| 只读钱包 RPC | method、有限账户 / 地址 / 网络等字段<br>可得来源与情报；不执行原 RPC、不返回账户列表 | 只读请求摘要；无通用自动截获。<br><strong>未确定：</strong>只读不等于无隐私风险；未完整解释查询权限 / 返回数据的泄露范围。 |

### 6.D 混合入口与未知兜底

| 操作类别 | 尝试提取的数据 | 已实现程度与边界 |
|---|---|---|
| 未识别合约 / 钱包 RPC | 合约请求的 selector / 字节数、目标、value 或 RPC method<br>有限白名单参数；通用节点 / 副本 / 可用情报与缺失项 | 未知兜底，不能宣称已理解。<br><strong>未确定：</strong>没有协议语义就无法可靠判断全部资金 / 权限影响；不支持的链与未被钱包提交的请求不会自动出现。 |

### 6.1 四类高危权限操作的准确现状

| 关注点 | 当前已做 | 当前不能宣称 |
|---|---|---|
| 无限代币授权 | approve 解析、额度与标准辨别、既有 allowance、风险情报和可选副本 | 所有无限授权都恶意，或未来权限消费已经全面验证 |
| NFT 全量授权 | operator、approved 和集合级权限提示；撤销与开启区分 | 已列出所有当前/未来 NFT 暴露，或已认证 operator 可信 |
| Permit / Permit2 | 结构、域、金额/期限、部分 nonce/位图的检查 | 覆盖全部变体、所有 witness/batch 语义及未来消费 |
| EIP-7702 | 可对读取到的目标代码委托前缀给警告；部分通用 RPC 摘要能保留 delegate 等字段 | **没有完整的 7702 授权解析、签名验证、自动签名入口或委托实现安全审计** |

不能把“某账户已有 7702 代码委托的提示”写成“恶意 7702 授权已全面防护”。当前版本的交易转发也没有完整传递/验证 authorizationList。

## 7. 取数工具怎样工作

| 风险工具 | 触发场景 | 读取/执行内容 | 主要限制 |
|---|---|---|---|
| rpc_context | 综合请求共用 | 核对 chainId，取区块、原生币余额、目标代码、代币接口、部分 allowance | 消息的声明网络不等于钱包当前网络 |
| contract_controls | 交易目标或签名验证合约可确定时 | 代码哈希、ERC-1967 implementation/admin/beacon、owner、paused | 空槽不证明不可升级，接口外观不证明身份 |
| isolated_simulation | 交易且副本功能已启用 | 创建本地临时链副本、执行请求、比较资产与 gas、尝试调用树 | 只在副本写状态；不覆盖无事件资产和全部自定义存储 |
| round_trip | 支持的 V2 兑换 | 副本买入 → 授权已得代币 → 同路反向卖出 → 观察返回量 | 只支持部分方法/路径和同一收款账户；不支持全部 V3/聚合器 |
| signature_verification | 结构化消息 | EIP-712 编码、digest/domainHash，标准 Permit nonce/domain，部分 Permit2 nonce/位图 | 未签署消息的未来消费无法直接等同某笔交易 |
| vault_preview | 金库候选 | asset、totalAssets、totalSupply、对应 preview/max | 当前接口返回不是未来可提现承诺 |
| lending_account | 借贷候选 | 抵押、债务、可借额度、LTV、清算阈值、healthFactor | 没有完整操作后健康因子/预言机压力模型 |
| protocol_limits | 跨链、质押、LP、领取、升级、复杂批量等 | 保留已解析字段和明确的协议未知项 | 这是承认边界，不是专属风险检查已实现 |
| wallet_rpc_summary | 权限/会话、智能账户、未知 RPC | 5 层内、数组最多 16 项、约 40 项白名单字段与有界地址/selector 摘要 | 不执行原 RPC，不保证理解全部嵌套语义 |
| external_intelligence | 开启外部情报后 | GoPlus 支持链、地址、网站与主要代币查询 | 第三方覆盖、额度、限流和时效限制 |
| ai_assessment | 综合请求；模型已配置并开启时可调用 | 接收已取得证据与未知项，产生风险意见 | 模型自己不去查链，输出仍需校验与人工判断 |

副本模拟使用 Anvil 的临时账户冒充机制在**独立本地副本**执行，不需要用户私钥。模拟交易发送到临时本机节点，不发送给源链；不会为了让模拟成功而任意改高用户资产余额或伪造代币授权。

资产发现当前限制约 32 项资产、256 条相关日志和 128 项调用摘要；这些是资源边界，不代表扫描了全部钱包资产。副本内买卖测试将最低卖出量设为 0 只是为了观察返回，不能复制为用户真实交易的滑点建议。

## 8. 发给 Meta 的内容是什么

### 8.1 证据包的实际字段

| 字段 | 内容 |
|---|---|
| version、chainId | 分析内部版本与请求网络；产品 0.4.1 中部分内部规则标签仍为 0.4.0/0.3.0 |
| origin | 来源 URL 的 origin：去掉账号密码、路径、查询与片段 |
| requestSummary | 交易的 from/target/valueWei/selector/字节长度，或消息 from/method，或 RPC method |
| feeParameters | 已提供的 gas、gasPrice、maxFeePerGas、maxPriorityFeePerGas、nonce；转为精确十进制字符串 |
| intent、userReportedContext | 用户用途与主动报告的背景，标注为待核实信息 |
| operation | 类别、名称、已解析财务字段、目标、代币候选、复杂/原始签名等标记 |
| checks | 检查 ID、状态、文字解释、来源、观察时间和实际取得的数据 |
| missing_checks | 明确缺失、未支持、失败或未知的检查 |
| score_meaning | Muse 独立按证据评分，无规则数字、最低分或固定权重；不是概率，资料不足可为 null |
| score_meaning | 说明分数是风险指标，资料不足可为 null |

不把 API Key、RPC 密钥、Snap 配对令牌、整份交易历史或完整 calldata 直接放入该模型证据包。完整 calldata 仍会交给本机解析器和模拟器使用。来源域名会发送给模型，不等于完全匿名。

普通消息预览、用户填写的用途和其他自由文本仍可能含私人信息；当前没有全量自动脱敏保证。不主动索取私钥/助记词，不等于能够识别用户误粘贴的所有秘密。

### 8.2 输入与输出示例

以下均为**文档合成示例，不是一次真实 Meta 调用**。输入从当前代码的组包函数生成；展示节选省略部分检查，实际字段以完整 JSON 为准。

[查看完整合成输入](manual-examples/meta-input-synthetic.json) · [查看合成输出示例](manual-examples/meta-output-synthetic.json)

完整输出文件还包含后端补充的模型名、生成时间和合并后的缺失项；下面展示的是模型核心返回字段。

输入节选：

```json
{
  "chainId": 31337,
  "intent": "仅用于使用说明的合成样本；未查真实链，未调用模型。",
  "requestSummary": {
    "from": "0x2222222222222222222222222222222222222222",
    "target": "0x1111111111111111111111111111111111111111",
    "valueWei": "0",
    "selector": "0x095ea7b3",
    "calldataBytes": 68
  },
  "operation": {
    "category": "approval",
    "label": "代币 / NFT 单项授权",
    "fields": {
      "spender": "0x3333333333333333333333333333333333333333",
      "amountOrTokenId": "115792089237316195423570985008687907853269984665640564039457584007913129639935",
      "unlimited": true
    },
    "targets": [
      "0x3333333333333333333333333333333333333333"
    ],
    "decoded": true,
    "tokenStandard": "ambiguous",
    "addsPermission": true,
    "token": "0x1111111111111111111111111111111111111111"
  },
  "checks": [
    {
      "id": "permission_scope",
      "status": "risk",
      "title": "请求授予资产使用权限",
      "detail": "权限可能允许未来转走资产；有限额度或无 gas 签名也可能有风险。",
      "source": "rules/0.3.0",
      "observedAt": "2026-10-22T18:45:10.124Z"
    },
    {
      "id": "fraud_context",
      "status": "unknown",
      "title": "平台与用户意图不能仅靠交易确定",
      "detail": "正常代币和成功转账也可能被用于杀猪盘；用户提供的背景只是待核实陈述，不证明平台身份或业务真实性。",
      "source": "rules/0.3.0",
      "observedAt": "2026-10-22T18:45:10.124Z"
    }
  ],
  "score_meaning": "0-100 风险指标，不是损失概率；信息不足时 score 可以为 null。"
}
```

输出示意（85 仅为文档举例）：

```json
{
  "score": 85,
  "assessment": "high",
  "summary": "文档合成示例：极高额度增加资产权限暴露。此内容不是一次真实模型响应。",
  "reasons": [
    {
      "text": "请求授予极高额度资产使用权限，且仍有证据缺口。",
      "evidence_ids": [
        "permission_scope"
      ]
    }
  ],
  "missing_data": [],
  "suggested_action": "先核实授权对象与用途，并查看仍未完成的检查。",
  "honeypot": "unknown"
}
```

模型请求固定使用 Bearer `MODEL_API_KEY`、`muse-wonder-1.0`、`store:false` 和严格 JSON Schema。这里没有给模型配置浏览器、RPC 或函数调用工具。后端先取证，再把证据交给模型，不是把所有工具交给 AI 自由控制。

请求设置 `store:false` 不应解释为供应商对所有日志的绝对零留存保证。实际服务条款与数据政策应在 Meta 平台核对。

## 9. AI 怎样评分，哪些分数不是 AI 给的

### 9.1 Muse 独立给分，规则仅提供信号

新请求不再计算规则数字、不发送 rule_score_floor，也没有固定加分表、权重、最低分或按操作名称套用的档位。后端取得证据后，由 Muse 独立返回 0–100 整数或 null；后端直接保存该值，不抬高、不压低、不四舍五入成档位。

模型会考虑权限对象 / 范围 / 额度 / 期限、相对资产暴露、地址与签名的一致性、资产模拟与费用变化、外部情报可靠性及用户背景；只分析实际取得的证据。潜在损失影响、恶意迹象和证据完整性分别考虑：无限授权不自动等于诈骗，缺失信息不机械变成高分；不足以给出有意义的数字时返回 null。

规则仍标记 risk / warning / unknown，保留可解释信号。综合提示的优先顺序是：有 risk → 高风险；否则有 unknown → 无法判断；否则有 warning → 需要注意；否则 → 未发现明显风险。模型报告高风险时也会提升综合提示；它不按数字阈值换算。网页和 Snap 另列“模型判断”，避免把综合提示误当作模型原文。

当前综合分析固定保留“平台与用户意图不能仅靠交易确定”这一未知项，不能用数字消除这个缺口；有缺失项的模型回答也不得直接宣称 low。

历史记录不重新打分；旧规则数字标为“历史规则分数”，不是新算法或模型重新评估的结果。

### 9.2 Meta 返回的字段

| 返回字段 | 用户应怎样理解 |
|---|---|
| score | 0–100 整数或 null；未校准风险指标，不是损失概率 |
| assessment | low / review / high / unknown；不是系统按统一数值区间自动推导的等级 |
| summary | 模型对当前证据的解释 |
| reasons | 每项理由必须引用已有 evidence_ids |
| missing_data | 模型认为仍缺的数据；后端还会补回原有缺失项 |
| suggested_action | 核实对象、检查用途或谨慎处理等建议，不自动执行 |
| honeypot | unknown / risk_indicator / no_known_indicator；只有具备指定证据才可使用后两种结论 |

### 9.3 后端如何检查模型输出

后端用 Zod 和业务规则验证：分数类型与范围；必需字段；理由数量及长度；引用的检查 ID 是否真实存在；关键证据缺失时是否错误给 low；honeypot 判断是否具备对应情报或副本风险证据。

不通过校验就标记模型失败，不把任意文本当评分。有效 AI 数字会显示“AI 风险指标”；缺少或失败时显示“无 AI 评分”。**格式与引用校验不能证明模型每句话的推理都正确，也不保证分数与等级已经统计校准。**

当模型返回 score=null 时，表示本次无法可靠评分；不会补上规则数字。模型超时、额度不足、关闭或未配置时同样无数字，风险信号与缺失项仍可查看。

模型调用预算目前约 15 秒、最多 4000 输出 token；综合取证等待预算约 24 秒；每日最多 30 次模型尝试，失败也计数。扫描接口每个服务实例还有短时间调用与并发限制，超限会返回未完成状态。慢请求、额度、节点套餐都会影响可用性。

| 情况 | 正确理解 |
|---|---|
| Key 未配置 / 模型关闭 | 没有模型评分，保留本地规则和缺失项 |
| 401/403/404、429、超时、拒答或输出无效 | 本次模型未成功，不能拿规则数字冒充 AI 数字 |
| AI 分析已完成但数字为空 | 模型允许无法评分，不等于零风险 |
| 规则或 AI 显示高风险 | 有需要优先核实的信号，不等于已证明对方诈骗 |
| 未发现明显风险 | 只适用于已检查范围，不是安全担保 |

## 10. Honeypot 与“杀猪盘”分别怎样处理

**Honeypot** 在这里主要指某类代币可能买入后难以卖出、被限制或遭受极端损耗。当前证据来自 GoPlus 的代币标志及部分 V2 路由的副本往返测试。

程序会观察是否获得目标代币、能否反向卖出、返回数量，以及扣款和 gas。卖出失败也可能来自路由、流动性、余额、授权或 gas，所以单次失败目前可能只形成 warning；损耗比例也不等于纯卖出税。某次成功卖出不能证明未来不会被拉黑。

**杀猪盘/投资诈骗** 可能使用完全正常的代币和普通转账。链上交易执行成功，无法证明投资承诺、客服身份、提现规则或收益真实。

目前用户可提供 `withdrawalFee`、`guaranteedProfit`、`requestedBy` 等背景，网站/地址情报可作为外部线索，再交模型综合解释。没有读取私聊、核验线下身份、调查全部项目经营状况，因此不能宣称全面识别杀猪盘。

## 11. 整个项目的工具清单与职责

### 11.1 用户、服务与风险工具

| 工具/组件 | 是什么 | 在本项目具体做什么 |
|---|---|---|
| MetaMask Flask | MetaMask 的开发测试钱包环境 | 连接账户，批准 Snap 安装，展示交易/消息确认界面，由用户签名或拒绝 |
| WalletShield Snap | 安装在钱包内的扩展代码 | 从钱包取得支持的请求，调用本机分析，展示主要事实、来源、分数与缺失项 |
| MetaMask Snaps SDK | Snap 开发接口与 UI 组件库 | 声明 onTransaction/onSignature/onHomePage/onRpcRequest；构造钱包内提示 |
| Snaps CLI（mm-snap） | Snap 构建工具 | 打包、沙箱评估、更新安装清单及文件校验和；不负责风险评分 |
| 本机 Snap 文件服务 | Node HTTP 服务，8080 | 向 Flask 提供 manifest、bundle 和图标；不是链节点 |
| Infura | 外部节点访问服务 | 给后端读取相应真实网络的链状态；不自动提供用户钱包私钥或诈骗黑名单 |
| Anvil 主测试链 | 本机 EVM 开发节点 | 创建链 31337、测试 ETH、TEST-USD 和本地授权测试环境 |
| Anvil 临时副本 | 为某次交易临时创建的链副本 | 基于指定区块模拟交易和部分买卖往返；不修改源链状态 |
| TEST-USD 测试合约 | Solidity 本地代币 | 发放本地测试余额，支持 approve/transferFrom 和撤销测试；不是 USDT |
| SimulationFixtures | 独立测试合约集合 | 自动验证买卖、Permit、金库和借贷工具；不是提供给用户的真实 DeFi 产品 |
| GoPlus API | 可选安全情报源 | 地址、网站、代币及部分 honeypot/税率/管理员风险查询 |
| Meta Model API | 外部模型推理服务 | 对后端组好的证据调用 Muse Wonder，返回结构化风险意见 |
| 本地规则引擎 | 确定性的业务规则 | 形成 permission_scope 等文字信号与未知项，不产生分数或限制模型数字 |
| 工具路由器 | 后端操作分类分流 | 决定哪些数据工具被选中，记录计划与可用性 |
| SQLite | 本地数据库 | 保存原始未签名请求、检查依据、综合报告、部分钱包处理状态和调用次数 |
| Snap 配对令牌 | 本机通信凭据 | 限制外部来源直接冒用 Snap 检查接口；与模型/钱包密钥不同 |

### 11.2 网页、后端、语言与开发工具

| 工具 | 职责 | 不应误解为 |
|---|---|---|
| Node.js 24 | 运行后端、启动脚本、文件服务和构建工具 | AI 模型或区块链 |
| npm | 安装依赖、组织启动/构建/测试命令 | 风险情报平台 |
| TypeScript | 为请求、报告和代码提供类型约束 | 证明代码安全的形式化验证 |
| tsx | 在开发/测试时执行 TypeScript | 一种风险评分算法 |
| React + ReactDOM | 渲染四个页面、表单、状态与结果 | 钱包本身 |
| Vite + React 插件 | 网页开发服务、热更新与生产打包；代理/复用本机 API | 真实链 RPC |
| Fastify | 接收 API 请求，路由到规则、取数、模型和记录逻辑 | 自动安全审计器 |
| @fastify/cors | 设置允许的浏览器跨域来源和请求头 | 全部身份认证；Snap 仍需配对令牌验证 |
| viem | ABI 编解码、EIP-712 哈希、JSON-RPC 交互与单位处理 | 外部风险数据库 |
| Zod | 校验请求与模型 JSON 的格式、字段和范围 | 保证模型解释一定正确 |
| solc | 编译本地 Solidity 测试合约 | 自动审计所有合约漏洞 |
| Node crypto | 生成随机令牌、记录指纹和哈希 | 给用户生成钱包私钥或代签资产交易 |
| node:sqlite | SQLite 的运行时接口 | 外部云数据库 |
| Lucide React | 图标与界面可读性 | 风险识别模块 |
| Node 测试运行器 | 执行离线与接口测试 | 真实攻击检出率证明 |
| tsc / @types | 检查 TypeScript 类型与库声明 | 业务正确性的全部证明 |
| @fastify/static | 项目声明的静态服务依赖 | 当前核心取证工具；实际一键开发页面由 Vite 提供，Snap 文件由专门 HTTP 服务提供 |

不需要把这些开发工具理解成“都在调用外网”。实际可能离开本机的路径主要是已配置 RPC、已启用 GoPlus 和 Meta 模型请求；其余大量处理在本机完成。

## 12. 记录怎么看，为什么有未知或多种结果

项目存在两个记录域：

| 记录域 | 主要入口 | 记录重点 |
|---|---|---|
| 本地授权/工作流记录 | 左侧“检查记录” | 授权预检、工作台钱包请求、钱包回报和本地链回执 |
| 综合安全报告 | “钱包防护”下的“最近的综合检查” | 操作分类、工具计划、风险依据、Meta 状态/结果和未知项 |

同一次综合分析在模型返回前后更新同一个报告 ID，不额外生成一条 AI 完成记录。但你主动重复检查、先做网页预检再发钱包请求，或两个不同业务路径分别记录，仍可能产生不同记录。当前没有把所有综合报告和钱包工作流统一成一个全局交易时间线。

风险结果与钱包处理状态是两件事：

- 高风险 / 无法判断：描述检查结论。
- 已取消（钱包报告）：工作台收到该次钱包拒绝返回，不是链上回执。
- 已提交：拿到哈希但尚未核实最终执行。
- 链上执行成功 / 失败：核对了匹配交易和后续规范区块回执。
- 结果未知：没有关联最终回报，不能推断允许或取消。

综合 Snap 报告通常只保存签前分析；不能凭其风险等级判断用户最后点了哪个按钮。底层 approve 方法名也不等于用户已经“批准”。

## 13. 常见故障与排查顺序

| 现象 | 先检查什么 |
|---|---|
| 网页打不开 | 一键启动终端是否仍运行；5173 是否被旧实例占用 |
| 页面找不到钱包 | 使用安装 Flask 的桌面浏览器；普通内置浏览器可能没有该扩展 |
| Snap 安装失败 | 8080 文件服务是否运行、是否完成钱包权限确认、是否选中正确钱包环境 |
| 提示 Snap 未配对/403 | 在“钱包接入”重新加载并配对，不只连接账户 |
| 本地没有余额 | 当前链是否为 31337、账户是否与网页一致、是否重新准备测试资金 |
| 本地 ETH 出现美元估值 | 本地测试币仍无实际价值，不能据钱包价格显示推断可兑现 |
| 所有样本都没有 AI 分数 | 是否仍在“演示样本”模式；是否配置 MODEL_API_KEY 和开启 ENABLE_META_AI |
| Key 已保存但 AI 失败 | 看该次 HTTP/超时/校验错误；检查 Meta 额度、模型访问权限和网络 |
| 输入真实网络仍显示未知 | 该链 RPC 是否配置并能返回匹配 chainId；节点是否支持所需历史状态/方法 |
| Honeypot 无法判断 | 可能无有效代币情报、路由不支持、卖出失败原因不唯一或模拟未完成 |
| 钱包没有弹出某类提示 | 该请求是否真进入已配对 Snap 支持的入口；手动类别不会自动出现；签名提示的展示阶段也由钱包控制 |
| 页面同时有数字和未知项 | 查看模型理由与缺失项；AI 数字不代表全部检查完成，综合提示不按分数阈值换算 |
| 重启后旧交易哈希查不到 | 本地链已重置，旧 SQLite 记录对应以前的链快照 |

## 14. 给团队演示时怎样讲

建议先在无模型调用的固定样本中展示权限范围（没有数字），再用自己的测试钱包完成一次本地授权与取消/确认；配置 Meta 后，再单独展示一次真实模型连接测试和证据引用。新请求只有 AI 会给数字，旧规则数字明确标为历史；模型也可因证据不足返回 null。

可以这样介绍：

> WalletShield 是面向 EVM 钱包请求的签前风险提示原型。它通过 Snap 或网页接收未签名请求，按操作选择节点、协议、签名、模拟和情报工具，将实际取得的证据与未知项交给 Meta Muse Wonder 评价，再把可解释的风险意见显示给用户。当前没有全钱包、全协议的完整安全保证，也不提供强制阻止或签后持续监控。

不要将“25 个演示场景”“30 个说明类别”“自动测试通过”“已配置模型 Key”解释成真实攻击覆盖率或资金保护保证。

## 15. 代码核对位置与维护

| 内容 | 主要代码 |
|---|---|
| 网页主流程、连接钱包、安装 Snap、授权测试 | web/src/main.tsx、web/src/wallet.ts |
| 综合检查、模型状态与记录界面 | web/src/SecurityDesk.tsx |
| Snap 入口与提示 | snap/src/index.ts、snap/snap.manifest.json |
| 请求校验与综合 API | src/security/types.ts、src/security/api.ts |
| 常见方法/签名/RPC 参数解析 | src/security/decode.ts、src/security/operations.ts |
| 工具计划 | src/security/routing.ts |
| 基础节点与 GoPlus | src/security/providers.ts |
| 结构签名/nonce/domain | src/security/signatures.ts |
| 合约控制、金库与借贷 | src/security/protocols.ts |
| 副本资产变化与 V2 往返 | src/security/simulation.ts |
| 综合规则信号 | src/security/rules.ts |
| Meta 组包、请求与结果校验 | src/security/ai.ts |
| 模型/RPC 配置读取 | src/security/config.ts |
| 旧授权规则与历史归整 | src/core/、src/server/workflow.ts |
| 本地链资金与存储 | src/server/chain.ts、funding.ts、store.ts |
| 共享能力说明与生成文档 | src/security/coverage.ts、scripts/coverage-guide.ts |

评分更新已移除规则数字与下限，保留文字证据与未知项；历史数据不自动改写。固定合成样本已验证 Meta 联通，但分数稳定性、误报和漏报仍需独立的真实案例评测；本地测试不能替代该评测。

项目更新后，应同步本说明、共享覆盖说明和实际代码。更多逐类扩展条件见 [AI 取数与边界说明](AI-COVERAGE-GUIDE.md)；启动与配置速查见 [项目 README](../README.md)。
