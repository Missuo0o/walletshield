# WalletShield 0.3：当前交付与剩余边界

本版针对 EVM 签前检查和指定账户签后观察。AI 接口已实现，但用户选择稍后配置密钥，实际 OpenAI 联调尚未完成。不能描述成所有钱包防护均已完成。

| 能力 | 当前实现与验证 | 边界 |
|---|---|---|
| 独立副本执行 | 固定源区块并核对哈希，在随机本机端口启动临时 Anvil；所有修改只发生在副本 | RPC 历史状态、EVM 差异、资源预算可能导致失败 |
| 资产变化 | 原生币、已识别及标准事件发现资产的前后状态，gas 与有界调用树 | 最多 32 个资产、256 个日志、128 个调用；无事件资产和跨链结果可能遗漏 |
| 额外支出 | 授权时资产减少、实际扣款超过已支持 transfer 参数时提示 | 依赖能读取的余额、权属和已发现资产 |
| Honeypot 线索 | 常见 V2 买入→授权取得的代币→反向卖出；隔离合约验证正常往返和卖出限制 | 失败不等于确认诈骗，单次成功不保证未来；其他路由不完整 |
| EIP-712 | 类型、数值、结构编码和 digest 验证 | 不证明业务用途或目标合约可信 |
| Permit | 标准 EIP-2612 nonce 与 domain 分隔符核对，真实隔离合约验证匹配及不匹配 | 自定义、DAI、NFT Permit 等变体未统一覆盖 |
| Permit2 | 声明类型匹配时读取逐代币 nonce 或 nonce 位图 | 合约身份、未来消费和全部变体仍需核实 |
| 风险情报 | GoPlus 地址、代币、网站接口和支持链缓存；真实公共请求 HTTP 200 / code 1 | 只验证连接和字段存在，不代表检出率或数据准确率 |
| 诈骗背景 | 可选填写提现前付款、保证收益、陌生人引导并产生风险线索 | 用户陈述不是平台已验证事实；不自动读取私下聊天 |
| 签后观察 | 标准转出 / 授权事件、已选代币余额；故障不前进，重组 / 重置提示，事件去重 | 服务运行时每 30 秒轮询；不补齐全部历史，没有外部通知或自动撤销 |
| Snap 配对 | 本机随机令牌，经本地工作台交给 Snap 状态；普通 null 来源不能扫描 | 新权限需用户重新加载 0.3；不能防御已被攻破的本机同源页面 |
| OpenAI | Responses 结构化评分、证据引用、失败回退、每天 30 次尝试；独立连接测试按钮 | 仍缺用户 Key，真实响应、成本、延迟和语义效果待验收 |

“副本执行成功”只表示当前区块的一次测试执行完成，整体仍保留未覆盖项。损耗包含税、手续费和价格冲击，不把往返损耗冒充税率。

## 钱包与数据

解析原生币、ERC-20 转移 / 授权 / 撤销、常见 NFT 转移及 operator、Permit / Permit2 候选、常见 V2 兑换、消息 / 登录 / 订单候选。未识别批量、桥接、借贷、质押、部署等保留不完整。权限、会话密钥、UserOperation 目前没有自动 Snap 入口；只可手动提交不完整检查。

Snap 0.3 需用户在“钱包接入”重新加载，接受 `snap_manageState` 和 dApp RPC 等新增权限。工作台通过 `wallet_invokeSnap` 配对；令牌不是钱包私钥或 OpenAI Key，不写入状态接口或源码包。未配对时不会伪报检查成功。

模型仅接收白名单证据：网络、剔除凭据 / 路径 / 参数的 origin、用户用途及背景、公开发送及目标地址、value / selector / 长度、已解析参数、链上证据、资产差异、情报和缺失项。不主动获取私钥、助记词、已生成签名或整个钱包历史。

未签名消息和用途仍可能含个人信息，启用 AI 前应确认适合传给 OpenAI。`store:false` 不等于零留存承诺。规则下限 40 / 75 / 90 不是概率；模型校验不能保证其解释语义绝对正确。未知不能转成低风险。

## 证据与验证

- `npm test`：62 项自动化测试；`npm run build`：类型、网页与 Snap SES 构建。
- `npm run test:security`：自己的临时源节点和副本，真实部署可执行测试合约；模拟期间源链不增加区块，结束销毁节点。
- `simulation-acceptance.json`：2 种资产差异、调用树、正常往返、受限卖出；全部为测试合约。
- `signature-monitor-acceptance.json`：Permit nonce / domain 匹配与不匹配、监控事件与余额变化。
- `intelligence-connectivity.json`：仅公共数据连通性，未发送用户钱包数据。
- `security-local-v03.json`：现有本地链区块 6 的副本模拟。
- `security-monitor-v03.png`：当前测试账户和 TEST-USD 的只读监控基线。

## 明确未完成

用户 Key 后的实际 OpenAI 联调；Flask 新权限与配对实机验收；其他钱包和移动端兼容；全部链 / 协议、MEV 和未来管理员行为分析；钱包全局强制拦截、自动撤销、全天云端监控；设备恶意软件、私钥泄露、交易所内部操作；生产级多用户隔离、独立审计和真实攻击误报 / 漏报评测。

这些边界不能只通过增加提示词消除。杀猪盘可使用正常代币与普通转账，交易成功不证明对方身份真实。

技术依据：[OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)、[Anvil](https://www.getfoundry.sh/anvil/index.html)、[ERC-2612](https://eips.ethereum.org/EIPS/eip-2612)、[MetaMask 入口](https://docs.metamask.io/snaps/reference/entry-points/)、[GoPlus 官方 API](https://github.com/GoPlusLabs/OpenAPI/blob/main/SecurityAPI.md)。
