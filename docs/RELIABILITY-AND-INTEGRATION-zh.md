# 证据增强、模型事实与接入说明

[English](RELIABILITY-AND-INTEGRATION.md) · [简体中文](RELIABILITY-AND-INTEGRATION-zh.md)

最新完整检查、修复、模型观察及剩余验收边界见[完整验证记录 — 2026-10-22](FULL-VALIDATION-2026-10-22.md)。旧验收文件保留为历史记录，不代表最新验证结果。

本文描述已经实现的证据路径及操作选项，不证明检测准确率、官方协议身份、未来执行或公开上线就绪。WalletShield 仍然是**签名前风险提示**，用户在钱包中决定。没有启用强制阻止或签后持续监控。

## 从操作到评分

| 阶段 | 使用工具 | 提取或核对的内容 | 不能据此认定 |
| --- | --- | --- | --- |
| 接收请求 | MetaMask Snap，或 dApp 主动接入的 provider 包装器 | 钱包实际提供的未签名交易/消息；SDK 可主动提交权限、UserOperation、RPC 请求 | 未交给入口的操作不会自动被看到 |
| 结构解析 | viem、Zod、专用适配器 | selector、ABI 参数、EIP-712 实际承诺的类型图字段：地址、数量、NFT ID、额度、时间、nonce、订单项目、委托元组 | 名称或接口相似不等于真实官方部署 |
| 状态读取 | 配置的 RPC/Infura 和版本适配器 | 链/固定区块、余额、单位、代码、allowance、所有权、协议/账户状态和 UserOperation 代码/费用观察 | RPC 不是连接用户钱包的工具，也不自动提供全部诈骗情报 |
| 补充证据 | 可选 Sourcify、GoPlus | 有界源码匹配和代币/地址/网站风险标记 | 无维护部署匹配、USD 参考价格或两链桥路线核对；源码匹配或情报未命中不是审计或安全保证 |
| 实验 | 隔离 Anvil 分叉 | 原交易效果、支持的 V2/V3 买卖实验、部分金库/借贷的前后状态 | 不是公网执行、未来流动性、确定美元损失或必然可退出 |
| 模型判断 | Muse Wonder `muse-wonder-1.0` | 六个定性维度、0–100 或 null、选中的观察事实、理由、缺口和建议 | 模型没有配置浏览、RPC 或函数工具，不能自己取得缺失证据 |
| 校验与展示 | 后端、SQLite、网页、Snap | 精确事实/引用核对、输出与不确定性限制，以及适用时单独预留的一次修复 | 不证明每句自然语言推论；报告完成也不代表钱包确认 |

这里是**按结构解析字段**，不是搜索几个危险关键词。例如 `approve` 来自 selector/ABI；Permit 权限来自已验证的承诺类型图；NFT ID 不当作金额；DAI 结构的 `allowed=true` 在支持的参考语义下推导最大额度；UserOperation nonce/gas/fee 仅为声明字段，不是经认证的 EntryPoint 状态或实际费用。

## 逐条模型观察事实

当前模型回复使用 `fact_schema_version: "walletshield-facts-v1"`。后端提供 `structured_fact_candidates`，模型选择精确的 `facts`，每个理由和维度同时引用 `fact_ids` 和 `evidence_ids`。

每个事实包括候选 ID、原始证据 ID、主体角色/值、精确字段、标量值、适用范围，以及原始来源、已知链 ID、区块号/哈希、采集时间。范围区分请求解码、来源报告、参考资料、隔离分叉和未完成检查。缺失溯源保持 null，不能把请求声称的网络悄悄当成已验证链。

后端拒绝改写主体、字段、数值、来源、链、区块、时间和范围，也拒绝重复事实、引用错配及无关事实支持已评级维度。返回的是服务端原始观察。它说明**模型准确复制了给定观察**，不证明外部服务或合约一定诚实。元数据/状态不能代替实质证据。旧报告继续可读，当前 Muse 回复必须提供新结构。

提取最多 256 个候选，每个证据最多 48 项、每个数组最多 16 项，省略数量明确记录。模型最多选择 32 项，并被要求优先选 3–8 个相关事实。完整 calldata、签名、任意源码、代币名称文本和个人消息预览不成为结构化事实候选；证据包其他部分仍可能包含私密解码字段。

数值仍由 Muse 独立决定，**没有固定权重、数值下限、分段或兜底分数**。风险、证据支持度、无法评分是不同概念；未知不等于危险，也不等于安全。关键缺口禁止整体 `low` 或 `strong` 支持度；已知权限/敞口仍可能支持有条件数字，其他维度可以未知。null 保持无分数。数字不是损失概率或经过校准的置信度百分比。

模型输入在发送前受限：序列化证据包最多 **200,000 个 UTF-8 字节**，每次完整模型请求（包括修复请求）最多 **500,000 字节**。超限不会悄悄删减证据后生成看似完整的评估：原始证据保留，该次失败分析不接受分数。超时、供应商失败、拒答/无效输出及有效弃评也都不会产生本地编造的兜底分数。

有界语言校验也检查所有展示文字中的 nonce/domain 方向、官方身份/安全保证、未来执行/卖出及无依据美元损失。当前 UserOperation 输入不建立 EntryPoint keyed 状态；EIP-7702 保留元组索引和有条件快照范围。这不是能证明任意自然语言的系统。

## 已移除的增强与独立源码核对

部署登记/运行时代码匹配、USD 参考价格源和维护式两链桥接路线核对已移除。后端不再读取 `.local/registry.json`，已有本地文件保持原样，不再提供登记模板。基础交易/授权/签名解析、配置的 RPC 状态、通用分叉执行、部分 V2 路径（含已有原生币路径）和代币出资 V3 往返实验、可选 GoPlus 和 Muse 评分保留。

因此，Muse 不再取得维护的官方部署匹配、USD 参考估值或桥两端/counterpart 核对。依赖登记的 Seaport 当前订单 counter/填充/取消/直接授权，以及经认证 EntryPoint 的 keyed nonce/deposit 检查不再提供。V3 原生币出资往返实验和路由专用 sender-sentinel 接收人别名不再支持；适用时仍可进行原交易通用模拟，但不能把它称为完整往返实验。

**Wallet and network** 页面保留只读 RPC 能力观察：固定区块调用、一次历史余额和固定 trace 探测。成功仅证明该次返回，不证明完整 archive、全部 trace 或未来可用。Public networks 切换按钮直接通过选定 provider 调用 `wallet_switchEthereumChain`，不调用接入 SDK、风险扫描或 Muse，由钱包确认。

可选源码匹配独立保留：后端 `.local/rpc.env` 或环境设置 `ENABLE_SOURCE_VERIFICATION=1` 后重启，默认关闭，与 GoPlus 的 `ENABLE_EXTERNAL_LOOKUPS` 分开。`source-verification.ts` 只向固定 Sourcify 服务查询最多两组链/地址，限制响应大小和超时；不访问客户端任意 URL，不向 Muse 发送源码。runtime 匹配不是代码审计、官方身份或安全保证。无需 Sourcify Key，公网页面不显示源码核对配置状态。

## 当前缩小范围内的有界适配器

- **订单**：规范 Seaport `OrderComponents` 提取签入的 offer/consideration、数量/ID、接收人、时间、counter、conduit 和哈希，提示零 consideration 接收人。移除登记后不再读取当前 counter/填充/取消状态或直接 verifier 的代币/NFT 授权。合约订单 `orderType=4`、criteria、非零 conduit、自定义订单、签名接受和履约仍不完整。原生资产保持 wei 和 `asset:native`，不当作美元。
- **Permit2 witness**：识别规范外层 transfer 与 witness 类型/结构哈希；自定义业务语义和消费方执行仍未知，不生成或消费签名。
- **UserOperation**：主动提交的 v0.6/拆分 v0.7/v0.8 可提取参数，并观察 sender/EntryPoint/factory/paymaster 代码及费用/base fee 关系。声明 nonce/gas/fee/prefund 是请求字段，不再提供维护 EntryPoint 版本绑定、keyed nonce/deposit 核对或经认证 prefund 比较。完整 bundler/账户/聚合器/session/paymaster 验证和执行仍未知。
- **EIP-7702**：实际元组恢复、链/nonce 范围、外层 sender nonce、有条件顺序资格和一跳 delegate 代码保留，不再标注部署匹配。密码学成功不证明账户变更已确认、完整 set-code 执行或实现审计；有效授权也可能在后续执行回滚时保留。
- **金库/借贷**：原交易分叉前后支持的余额、preview/限制、抵押/债务/健康因子观察保留；差值要求相同资产与单位。不提供部署认证、USD 参考价格、未来偿付压力或退出保证。
- **权限状态**：原始分叉交易保留 allowance、部分 NFT approval/operator、账户 owner/threshold/module 前后比较。不伪造或消费单独签名；完整权限枚举和未经认证 guard/fallback 存储仍有缺口。
- **V3 交换/仓位**：代币出资、相同实际接收人的规范 single/path exact-input/exact-output 保留有界依赖式买卖实验和原执行字段/实际输入扣减；原生币出资与路由专用 sender 别名不支持该往返实验。池/factory、tick/range/流动性仍是未认证观察，不是可执行报价或 NFT 估值。
- **桥**：保留部分 OP 结构发起/提款/完成参数、通用源链合约读取和源链分叉模拟。不再维护两端 bridge/messenger 绑定、版本/指针/counterpart 或两链路线观察。message/proof/relay、储备、结算和到账均未验证。

带日期的验收说明保留原始观察。已经移除的登记、原生 V3 或两链路径测试描述历史实现，不认证当前功能；当前能力以覆盖说明为准。

## dApp 主动接入

`src/integration/provider.ts` 导出 `createWalletShieldProvider`。dApp 必须主动使用返回的 EIP-1193 包装器，它不会修改 `window.ethereum`，也不是全浏览器拦截器。 Public networks 的切换按钮不使用该包装器；源码模块保留供明确选择接入的 dApp 使用。

包装器需要 `context:()=>({chainId,account?,origin})`、`analyze:(request,signal)=>Promise<SecurityReport>` 和 `onAdvisory`。analyze 将标准请求提交 `/api/security/scan`；托管模式使用当前用户仅内存保存的 **web bearer**，不能拿 Snap bearer 给网页使用。完整示例见[英文说明](RELIABILITY-AND-INTEGRATION.md#explicit-dapp-integration)。

跟随选定 provider 的网络和账户变化维护 context，然后通过包装器 `.request(...)` 发起明确集成的操作。为避免与 Snap 重复分析，交易和签名分析默认关闭；只读与 Snap 内部方法默认跳过。可显式开启 `analyzeTransactions/analyzeSignatures/analyzeReadOnly`，只影响该 dApp。通用 RPC 的敏感键/签名字段在分析前剔除，但这不是通用秘密检测器。失败显示“无法取得建议”，不能显示安全；不把模型风险决定变成强制钱包阻止。已经签名的原始交易没有这里的签前入口。

## 托管合约钱包登录

EOA 恢复证明同一密钥对 EVM 地址的控制，因此其身份仍按地址跨链使用。ERC-1271 登录则建立**地址加已验证链的身份**：网页/Snap 凭据、扫描、私有报告访问、删除和撤销均限定在该链。同一个合约地址在另一条链上可能有不同所有者。切换网络后，请在目标链重新登录并配对；Snap 健康和请求检查会拒绝不匹配或无法观察到的绑定网络。链绑定签名仅在 provider 观察匹配后，使用已验证身份链作为认证/取数范围，并不证明 dApp 的实际签名网络。

托管资源也按已验证身份隔离：EOA 使用地址键，合约身份使用 `eip155:<chainId>:<address>` 键。活动/最近扫描、每身份 AI 和取证预算、Snap 配对签发频率及活动凭据容量都使用该范围；该身份的网页和 Snap 会话共用额度。IP/全局限额以及服务总并发、总凭据容量仍由所有身份共享，不因切换链而增加。

首次按此身份策略启动时，会一次性使旧托管登录挑战及网页/Snap 凭据失效，因为旧记录没有区分 EOA 与合约身份。请重新登录并配对。已存报告、使用额度、配置和本地链资产保留，迁移不会删除它们。

先对存储的一次性精确登录消息尝试 EOA 恢复；支持的已部署合约账户可通过可信服务端 RPC，使用有界 ERC-1271 `isValidSignature` **STATICCALL**。绑定实际网络/区块/哈希，并复查区块头和过期时间，不广播公网写入。

它只核对该快照下的这次登录，不验证未来 Permit、订单、UserOperation 等资产签名。未部署/ERC-6492 账户、依赖 caller 的实现、不支持此 eth_call 形式的 RPC、过时/不一致状态、gas 超限或错误返回值可能失败。账户策略改变后可能需要重新验证。

在 POSIX 系统上，启动时会将磁盘数据库及已有 WAL/SHM 附属文件限制为仅所属用户可读写的 `0600`，新建数据库目录使用 `0700`。这些权限也会收紧已有数据库，但不加密数据，不能阻止同一操作系统账户、管理员或未保护备份的访问。

Vite 禁止直接通过文件路由读取 `.local/`、`.audit-build/`、`.presentation-build/`、`.git/`、环境/凭据文件及数据库文件，包括 `/@fs/` 请求。秘密仍须保存在指定私有文件中；这些拒绝规则是额外防护，不意味着可以把开发服务器公开到互联网。

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

公开宣称风险判断质量之前，还要取得审查后的真实攻击/正常样本，隔离协议、时间和攻击家族留出集，预先登记验收标准，并同时报告误报、漏报、覆盖与弃权。本地案例和默认评估没有提供这一证据；本次在线调用观察及其边界单独记录在[完整验证记录](FULL-VALIDATION-2026-10-22.md)。
