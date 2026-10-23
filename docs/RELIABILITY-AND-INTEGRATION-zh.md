# 证据增强、模型事实与接入说明

[English](RELIABILITY-AND-INTEGRATION.md) · [简体中文](RELIABILITY-AND-INTEGRATION-zh.md)

本文描述已经实现的证据路径及操作选项，不证明检测准确率、官方协议身份、未来执行或公开上线就绪。WalletShield 仍然是**签名前风险提示**，用户在钱包中决定。没有启用强制阻止或签后持续监控。

## 从操作到评分

| 阶段 | 使用工具 | 提取或核对的内容 | 不能据此认定 |
| --- | --- | --- | --- |
| 接收请求 | MetaMask Snap，或 dApp 主动接入的 provider 包装器 | 钱包实际提供的未签名交易/消息；SDK 可主动提交权限、UserOperation、RPC 请求 | 未交给入口的操作不会自动被看到 |
| 结构解析 | viem、Zod、专用适配器 | selector、ABI 参数、EIP-712 实际承诺的类型图字段：地址、数量、NFT ID、额度、时间、nonce、订单项目、委托元组 | 名称或接口相似不等于真实官方部署 |
| 状态读取 | 配置的 RPC/Infura 和版本适配器 | 链/固定区块、余额、单位、代码、allowance、所有权、协议/账户及部分 UserOperation 状态 | RPC 不是连接用户钱包的工具，也不自动提供全部诈骗情报 |
| 补充证据 | 运营者维护的部署/价格记录，可选 Sourcify、GoPlus | 代码/实现绑定、参考预言机价格、源码匹配及有界代币/地址/网站风险标记 | 匹配或情报未命中都不是审计或安全保证 |
| 实验 | 隔离 Anvil 分叉 | 原交易效果、支持的 V2/V3 买卖实验、部分金库/借贷的前后状态 | 不是公网执行、未来流动性、确定美元损失或必然可退出 |
| 模型判断 | Muse Wonder `muse-wonder-1.0` | 六个定性维度、0–100 或 null、选中的观察事实、理由、缺口和建议 | 模型没有配置浏览、RPC 或函数工具，不能自己取得缺失证据 |
| 校验与展示 | 后端、SQLite、网页、Snap | 精确事实/引用核对、输出与不确定性限制，以及适用时单独预留的一次修复 | 不证明每句自然语言推论；报告完成也不代表钱包确认 |

这里是**按结构解析字段**，不是搜索几个危险关键词。例如 `approve` 来自 selector/ABI；Permit 权限来自已验证的承诺类型图；NFT ID 不当作金额；DAI 结构的 `allowed=true` 在支持的参考语义下推导最大额度；UserOperation deposit 比较是声明的预付费观察，不是实际费用。

## 逐条模型观察事实

当前模型回复使用 `fact_schema_version: "walletshield-facts-v1"`。后端提供 `structured_fact_candidates`，模型选择精确的 `facts`，每个理由和维度同时引用 `fact_ids` 和 `evidence_ids`。

每个事实包括候选 ID、原始证据 ID、主体角色/值、精确字段、标量值、适用范围，以及原始来源、已知链 ID、区块号/哈希、采集时间。范围区分请求解码、来源报告、参考资料、隔离分叉和未完成检查。缺失溯源保持 null，不能把请求声称的网络悄悄当成已验证链。

后端拒绝改写主体、字段、数值、来源、链、区块、时间和范围，也拒绝重复事实、引用错配及无关事实支持已评级维度。返回的是服务端原始观察。它说明**模型准确复制了给定观察**，不证明外部服务或合约一定诚实。元数据/状态不能代替实质证据。旧报告继续可读，当前 Muse 回复必须提供新结构。

提取最多 256 个候选，每个证据最多 48 项、每个数组最多 16 项，省略数量明确记录。模型最多选择 32 项，并被要求优先选 3–8 个相关事实。完整 calldata、签名、任意源码、代币名称文本和个人消息预览不成为结构化事实候选；证据包其他部分仍可能包含私密解码字段。

数值仍由 Muse 独立决定，**没有固定权重、数值下限、分段或兜底分数**。风险、证据支持度、无法评分是不同概念；未知不等于危险，也不等于安全。关键缺口禁止整体 `low` 或 `strong` 支持度；已知权限/敞口仍可能支持有条件数字，其他维度可以未知。null 保持无分数。数字不是损失概率或经过校准的置信度百分比。

有界语言校验也检查所有展示文字中的 nonce/domain 方向、官方身份/安全保证、未来执行/卖出及无依据美元损失。UserOperation nonce 必须对应 EntryPoint keyed 观察；EIP-7702 保留元组索引和有条件快照范围。这不是能证明任意自然语言的系统。

## 可选部署记录与参考价格

后端创建 `.local/registry.json`，有效的空配置是：

```json
{"version":1,"deployments":[],"priceFeeds":[],"bridgeRoutes":[]}
```

空列表没有建立任何可信部署或价格。运营者必须独立取得、审查并维护真实记录；项目不虚构默认官方绑定。

| 记录 | 字段与核对 |
| --- | --- |
| 部署 | `chainId/address/protocol/version/role/codeHash/sourceUrl`，可选 EIP-1967 `implementation` 地址和代码哈希。核对固定区块中的实际代码、适用时的实现槽及实现代码；其他代理架构仍需适配。 |
| USD 参考价格 | `chainId/asset/feed/codeHash/currency:"USD"/assetDecimals/maxAgeSeconds/expectedDescription/sourceUrl`；asset 为合约地址或 `native`。核对代码、描述、正数价格、轮次/时间和 decimals。运营者仍负责 feed 与资产的正确对应。 |
| OP 桥路线 | `adapter:"op-standard-bridge-v1"`、`sourceChainId/destinationChainId/sourceBridge/destinationBridge/sourceMessenger/destinationMessenger/sourceUrl`；两条链必须不同，需要双方服务端 RPC 及四个匹配的部署/代码/版本记录。按审查的桥/messenger 版本核对双向指针和暂停状态；反向发起另行配置。不证明某条消息/证明、relay 上下文、结算或到账。 |

按**网络和合约地址**对应，不能只按代币简称。无效/过大配置和读取失败保留缺口。参考价格不是可执行报价或确定美元损失；深度、脱锚、未来价格、预言机治理和代理变化仍是独立问题。取得参考价格也不会开放 AI 的美元损失保证。

**Wallet and network** 页面展示 registry 数量和源码核对开关，并提供只读 RPC 能力观察：固定区块调用、一次历史余额读取和固定 trace 探测。成功只证明这一次返回，不证明完整 archive 历史、所有 trace 方法或未来可用性。本页的网络切换可通过显式 SDK 提交建议，不是对其他网站的钩子。

可选源码匹配：在后端 `.local/rpc.env` 或环境中设置 `ENABLE_SOURCE_VERIFICATION=1`，然后重启。默认关闭，与 GoPlus 的 `ENABLE_EXTERNAL_LOOKUPS` 分开。采集器只向固定 Sourcify 服务查询最多两组链/地址，有响应大小和超时限制，不访问客户端任意 URL，也不向 Muse 发送源码。runtime 匹配不是审计或已验证项目身份；这里不配置 Sourcify Key。

## 新增的有界适配器

- **订单**：规范 Seaport `OrderComponents` 提取 offer/consideration、原始数量/ID、接收人、时间、counter、conduit 和哈希。可信订单状态读取要求维护部署的 role/protocol 都为 `seaport`、审查版本为 **1.6**，并匹配实际 `information()` 返回的运行版本和签入 domain。签入 counter、当前 counter、填充/取消状态和时间分别记录。`orderType=4` 合约订单因 nonce/hash 语义不同而不支持；签入零 consideration 接收人会明确提示。直接零 conduit 的 ERC-20/ERC-721 授权也要求该绑定。criteria 证明、非零 conduit、任意订单、真实签名接受和履行仍不完整。原生资产项保留原始 wei，标为 `asset:native`，不当作零地址代币或美元。
- **Permit2 witness**：识别规范外层 transfer 和 witness 类型/结构哈希。自定义 witness 业务意义及消费方是否执行限制仍未知；不生成或消费签名。
- **UserOperation**：主动提交的 `eth_sendUserOperation` 支持有界 v0.6、拆分 v0.7/v0.8 结构；维护的 EntryPoint 绑定须满足 role `entrypoint`、protocol `erc4337`、对应精确版本 `0.6`、`0.7` 或 `0.8` 及代码匹配，才读取 keyed nonce 和 deposit/prefund。代码、声明费用与当前 base fee 分别记录。bundler 模拟、账户/聚合器/session 策略、paymaster 授权/代币扣费、完整执行仍未核实。
- **EIP-7702**：实际元组恢复、chain/nonce 范围、外层 sender nonce、有条件的顺序资格和一跳 delegate 代码分别处理。有效授权可能在执行随后回滚时仍保留。密码学成功或“最后符合条件”不等于账户变更已确认，也不是实现审计。
- **金库/借贷**：在原交易分叉执行前后实际读取支持的份额/底层余额、preview/限制，或抵押、债务、健康因子；差值要求资产和单位一致。它们是情景观察，不是未来偿付、价格压力、预言机可靠性或公网执行。
- **权限状态**：原始分叉交易可读取前后 allowance、部分 NFT approval/operator、账户所有者/阈值/module，并对同一状态存储作比较。不伪造或消费单独签名；完整权限枚举和未经认证的 guard/fallback 存储仍有缺口。
- **V3 交换/仓位**：支持的 single/path、exact-input/exact-output 规范结构保留原买入执行字段，衍生卖出比例使用实际输入扣减；原生币资金路径需要配置且核对的 router/wrapped-native 绑定。池接口关联、tick/range/流动性仍是候选状态，不是官方池身份、可执行报价或 NFT 估值；不透明聚合器仍不完整。
- **桥**：当前适配器基于 `op-contracts/v3.0.0` 审查，L1 bridge `2.3.0`、L2 bridge `1.13.0`、L1 messenger `2.6.0`、L2 messenger `2.2.0`、mintable 代币候选 `1.4.0-beta.5`。bridge 的 protocol/role 须为 `op-standard-bridge`/`bridge`，messenger 须为 `op-cross-domain-messenger`/`messenger`，维护 mintable 代币须为 `op-mintable-erc20`/`other`。配置路线后可核对这些两端绑定及部分代币 counterpart getter。两条链是独立快照；mintable 代币 getter 匹配不证明储备、赎回、relay 证明、消息有效性或未来到账。

## dApp 主动接入

`src/integration/provider.ts` 导出 `createWalletShieldProvider`。dApp 必须主动使用返回的 EIP-1193 包装器，它不会修改 `window.ethereum`，也不是全浏览器拦截器。

包装器需要 `context:()=>({chainId,account?,origin})`、`analyze:(request,signal)=>Promise<SecurityReport>` 和 `onAdvisory`。analyze 将标准请求提交 `/api/security/scan`；托管模式使用当前用户仅内存保存的 **web bearer**，不能拿 Snap bearer 给网页使用。完整示例见[英文说明](RELIABILITY-AND-INTEGRATION.md#explicit-dapp-integration)。

跟随选定 provider 的网络和账户变化维护 context，然后通过包装器 `.request(...)` 发起明确集成的操作。为避免与 Snap 重复分析，交易和签名分析默认关闭；只读与 Snap 内部方法默认跳过。可显式开启 `analyzeTransactions/analyzeSignatures/analyzeReadOnly`，只影响该 dApp。通用 RPC 的敏感键/签名字段在分析前剔除，但这不是通用秘密检测器。失败显示“无法取得建议”，不能显示安全；不把模型风险决定变成强制钱包阻止。已经签名的原始交易没有这里的签前入口。

## 托管合约钱包登录

先对存储的一次性精确登录消息尝试 EOA 恢复；支持的已部署合约账户可通过可信服务端 RPC，使用有界 ERC-1271 `isValidSignature` **STATICCALL**。绑定实际网络/区块/哈希，并复查区块头和过期时间，不广播公网写入。

它只核对该快照下的这次登录，不验证未来 Permit、订单、UserOperation 等资产签名。未部署/ERC-6492 账户、依赖 caller 的实现、不支持此 eth_call 形式的 RPC、过时/不一致状态、gas 超限或错误返回值可能失败。账户策略改变后可能需要重新验证。

## 离线评估与显式付费评估

```sh
npm run evaluate:ai
```

默认不读取 `.local` 或数据库，不启动节点，不请求 RPC/模型，也不写本地状态。版本和哈希固定的数据集有 12 个合成正常/不利/反事实/注入/无法评分案例，检查有效无分数输出和 120 项维护的事实/文字变异。它是**校验器回归检查**，不是 Muse 准确率、独立留出攻击基准或损失概率校准。

只有明确要求时，且当前进程环境已有 `MODEL_API_KEY`，才使用付费模式：

```sh
npm run evaluate:ai -- --live --confirm-paid --max-calls=2 --repeats=2 --cases=native-clear
```

不要在命令行粘贴或提交密钥。仅发送合成包，不访问 RPC、当前钱包/数据库，也不进行修复调用。接受 1–12 次调用、1–3 次重复、显式案例 ID，单包最多 100,000 字节、单次最多 6,000 输出 token。它们**不是保证的货币支出上限**，失败也可能计费。输出带分母的数字评分覆盖、弃权、不利样本错判低风险/正常样本高风险、失败、延迟、分数范围、评级/弃权变化及反事实方向。失败与弃权分开；相关的重复运行不提供独立置信区间。

公开宣称风险判断质量之前，还要取得审查后的真实攻击/正常样本，隔离协议、时间和攻击家族留出集，预先登记验收标准，并同时报告误报、漏报、覆盖与弃权。本地案例和默认评估没有提供这一证据；本轮未调用付费 Muse 来验证实际准确率。
