import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {AIDimension,SecurityReport} from './types.js';
import {decodedExposureFields,dimensionsForEvidence} from './ai-claims.js';

export const FACT_SCHEMA_VERSION='walletshield-facts-v1' as const;
export const FACT_LIMITS={candidates:256,selected:32,perEvidence:48,arrayItems:16,traceFrames:4,text:200} as const;
export const modelFactSchema=z.object({
 id:z.string().regex(/^fact_[a-f0-9]{24}$/),evidence_id:z.string().min(1).max(150),
 subject:z.object({role:z.enum(['operation','token','asset','address','account','owner','verifier','target','origin','evidence']),value:z.string().min(1).max(200)}).strict(),
 field:z.string().min(1).max(150),value:z.union([z.string().max(200),z.number().finite(),z.boolean(),z.null()]),
 scope:z.enum(['decoded-request','reported-observation','isolated-fork','reference-observation','unresolved-check']),
 provenance:z.object({source:z.string().min(1).max(100),chain_id:z.number().int().positive().nullable(),block_number:z.string().regex(/^\d+$/).nullable(),block_hash:z.string().regex(/^0x[\da-f]{64}$/i).nullable(),observed_at:z.string().max(100)}).strict()
}).strict();
export type ModelFact=z.infer<typeof modelFactSchema>;
export type FactCandidate={fact:ModelFact;admissible_dimensions:AIDimension['dimension'][]};
const address=(value:unknown):value is string=>typeof value==='string'&&/^0x[\da-f]{40}$/i.test(value);
const scalar=(value:unknown):value is ModelFact['value']=>value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)||typeof value==='string'&&value.length<=FACT_LIMITS.text;
// Explicit server-owned observation fields. Names, free-form messages, source
// code, signatures, calldata and arbitrary provider prose are never candidates.
const fields=new Set((
 'token tokenIn tokenOut asset localToken address account owner holder signer spender operator recipient receiver to from verifier verifyingContract target executionTarget newController newAuthority newOwner module guard fallbackHandler '+
 'amount amountOrTokenId amountRaw amountIn amountOut amountInMaximum amountOutMinimum amountADesired amountBDesired amountAMin amountBMin value valueWei balance nativeBalanceWei decimals standard allowance currentAllowance expected declaredNonce nonce observed activeAtObservedBlock expiration deadline sigDeadline validAfter validBefore validAtObservedBlock expiredAtObservedBlock invalidWindow notYetValidAtObservedBlock authorizationUsedOrCanceled '+
 'unlimited allowed approved addsPermission tokenId tokenIds amounts tokens path fee liquidity shares assets minimum maximum totalAssets totalSupply maxDeposit maxWithdraw maxRedeem convertToAssets previewDeposit previewMint previewWithdraw previewRedeem '+
 'returned received spent actualInputDebit roundTripReturnPercent gasUsed status success revert reasonCode amountKind outputKind shareKind maxFeePerGas maxPriorityFeePerGas gas gasPrice maximumExecutionFeeWei transactionNonce pendingNonce baseFeePerGas '+
 'hasCode targetHasCode codeHash accountKind ownerMatchesSigner publishedAddressMatch standardDomainFieldsMatch declared interfaceId interfaceSupported threshold newThreshold owners moduleEnabled enabled domainHash digest signingHash domainChainId chainId readChainId requestChainId declaredChainId signingNetworkVerified cryptographicSignerVerified identityVerified loginStructureValid nonceFormatValid nonceLength resourceCount domain scheme issuedAt notBefore declaredOrigin uriOrigin sourceOrigin '+
 'is_honeypot cannot_sell_all buy_tax sell_tax is_open_source is_proxy transfer_pausable is_blacklisted slippage_modifiable owner_change_balance hidden_owner can_take_back_ownership is_mintable phishing_site '+
 'cybercrime money_laundering phishing_activities stealing_attack honeypot_related_address blackmail_activities sanctioned '+
 'totalCollateralBase totalDebtBase availableBorrowsBase currentLiquidationThreshold ltv healthFactor configuration reserveConfiguration '+
 'tickLower tickUpper tick feeGrowthInside0LastX128 feeGrowthInside1LastX128 tokensOwed0 tokensOwed1 amount0Min amount1Min amount0Desired amount1Desired amount0Max amount1Max '+
 'pathIndex selector category callType abiShapeDecoded executionContextVerified fullWalletInventory runtimeMatch referenceOnly sourceCodeAudit verifiedMatch implementation implementationCodeHash protocol version role subject '+
 'priceRaw priceDecimals currency assetDecimals updatedAtSeconds feed counter counterMatches cancelled filled totalFilled totalSize isValidated isCancelled orderHash witnessHash witnessTypeHash witnessCommitted maximumCommitted '+
 'matched expectedCodeHash implementationChecked safetyCertified offerer zone itemType itemIndices identifierOrCriteria startAmount endAmount startTime endTime orderType conduitKey fullyFilled deploymentMatched signedDomainMatchesInformation codeAudited balanceRaw allowanceRaw currentOwner operatorApproved witnessType consumerVerified balanceBelowMinimum balanceCoversMaximum protocolDecoded semanticsVerified '+
 'totalAssetsRaw totalSharesRaw shareDecimals ownerSharesRaw receiverSharesRaw maxOwnerWithdrawRaw maxOwnerRedeemRaw requestPreviewRaw underlyingDecimals callerUnderlyingRaw receiverUnderlyingRaw callerUnderlyingAllowanceToVaultRaw callerUnderlyingAllowanceToPoolRaw totalCollateralBaseRaw totalDebtBaseRaw availableBorrowsBaseRaw currentLiquidationThresholdRaw ltvRaw healthFactor1e18 assetSame assetUnitsSame shareUnitsSame simulationOnly caller '+
 'entryPoint sender factory paymaster nonceKey nonceSequence callGasLimit verificationGasLimit preVerificationGas maxFeePerGasWei maxPriorityFeePerGasWei paymasterVerificationGasLimit paymasterPostOpGasLimit callDataBytes callSelector factoryDataBytes paymasterDataBytes signaturePresent signatureBytes gasValuesWithinUint120 priorityWithinMaximum requestedNonce currentNonce matches payer payerRole depositWei declaredRequiredGas declaredPrefundWei depositCoversDeclaredPrefund actualCostKnown tokenFeesKnown baseFeePerGasWei maxFeeCoversCurrentBaseFee '+
 'type authorizationCount typeExplicitlySet destinationPresent envelopeShapeSupported tupleIndex delegate action authorizationChainId chainMatches crossChainAuthorization nonceWithinProcessingRange signatureRecovered recoveredAuthority authorityIsOuterSender authority expectedNonceAtThisTuple authorityCodeEligible tupleEligibleAtSnapshot assumesOuterTransactionAccepted outerEnvelopeShapeSupported outerDeclaredNonceMatchesCurrent codeObservation authorityCodeHash currentDelegate declaredOuterNonce declaredNonceMatchesCurrent conditional confirmedChanges registryMatched resolutionHopsChecked implementationPolicyVerified '+
 'manager token0 token1 factory pool poolToken0 poolToken1 poolFee poolFactory sqrtPriceX96 currentTick observationIndex observationCardinality observationCardinalityNext feeProtocol unlocked activeLiquidityRaw poolHasCode poolCodeHash interfaceBindingConsistent withinDeclaredTickRange priceQuoteEstablished sourceMethod exactOutput declaredInputRaw declaredInputKind requestedOutputRaw observedInputDebitRaw ratioInputRaw originalBuyPreserved '+
 'kind sameStore changedFields erc20AllowanceRaw erc20AllowanceToVerifierRaw permit2AmountRaw permit2ExpirationSeconds permit2Nonce erc721Owner erc721Approved ownerCount ownersTruncated '+
 'traceAvailable traceTruncated traceGaps retainedTraceCalls rootReverted completeAssetCoverage '+
 'vault underlying underlyingBalanceRaw existingUnderlyingAllowanceRaw shareBalanceRaw declaredCapRaw declaredTransferAmountRaw existingAllowanceRaw snapshotBalanceBoundRaw balanceCoversDeclaredAmount suppliedFeeCapWei bought inputToken outputToken inputUnit maxMint requested '+
 'sourceChainId destinationChainId sourceBridge destinationBridge sourceMessenger destinationMessenger sourceChainRole destinationChainRole roleVersionsCompatible routeBindingEstablished anyObservedPaused snapshotsSynchronized arrivalProven proofVerified runtimeVersion runtimeCodeMatched versionMatchesRegistry adapterVersionSupported trustedGetterSemantics observedOther expectedOther observedMessenger expectedMessenger pointerMatches paused nextMessageNonce nonceProvesThisMessage observationComplete callerMatchesMessenger expectedMessenger declaredAssetSender activeCrossDomainSenderVerified declaredRemoteToken declaredBridge expectedRemoteToken expectedBridge maintainedMintableBinding pairMatches tokenValueEstablished localChainId otherChainId otherToken bothTokenCodeObserved maintainedMintableCount maintainedDeclarationsMatch tokenPairBindingEstablished'
).split(/\s+/));
const metadataOnly=new Set(['status','standard','declared','interfaceId','interfaceSupported','hasCode','poolHasCode','codeObservation','identityVerified','cryptographicSignerVerified','signingNetworkVerified','referenceOnly','sourceCodeAudit','is_open_source','fullWalletInventory','completeAssetCoverage','semanticsVerified','protocolDecoded','chainId','domainChainId','readChainId','requestChainId','declaredChainId','sourceChainId','destinationChainId','authorizationChainId','localChainId','otherChainId','digest','domainHash','signingHash','orderHash','witnessHash','witnessTypeHash','simulationOnly','conditional','consumerVerified','actualCostKnown','tokenFeesKnown','safetyCertified','priceQuoteEstablished','implementationPolicyVerified','implementationChecked','executionContextVerified','abiShapeDecoded','codeAudited','assetSame','assetUnitsSame','shareUnitsSame','originalBuyPreserved','assumesOuterTransactionAccepted']);
const unsigned=(value:unknown)=>typeof value==='string'&&/^\d+$/.test(value)||typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const signed=(value:unknown)=>typeof value==='string'&&/^-?\d+$/.test(value)||typeof value==='number'&&Number.isSafeInteger(value);
const names=(field:string,list:string)=>list.split(' ').includes(field);
/** Positive financial-evidence table. A collector's broad dimensions never
 * make its other flags, IDs, provenance or addresses economic observations.
 * Each admitted path names an actual quantity or a bounded economic relation. */
function exposureFact(check:SecurityReport['checks'][number],field:string,value:unknown,report:SecurityReport):boolean {
 const id=check.id,data=check.data??{},key=field.replace(/^data\./,'');
 if(/^rules(?:\/|$)/.test(check.source)){
  if(id==='operation'){const path=/^operation\.(\w+)(?:\[\d+\])?$/.exec(field);return Boolean(path&&decodedExposureFields(report.operation).includes(path[1])&&unsigned(value));}
  return id==='fee_budget'&&key==='maximumExecutionFeeWei'&&unsigned(value);
 }
 if(check.source==='rpc'){
  if(id==='chain_context')return key==='nativeBalanceWei'&&unsigned(value);
  if(/^(?:token_identity|asset_identity_\d+)$/.test(id))return key==='balance'&&unsigned(value);
  if(/^asset_balance_\d+$/.test(id))return key==='balanceRaw'&&address(data.token)&&unsigned(value);
  if(/^signature_exposure(?:_\d+)?$/.test(id))return address(data.token)&&(names(key,'balanceRaw declaredCapRaw declaredTransferAmountRaw existingAllowanceRaw snapshotBalanceBoundRaw')&&unsigned(value)||key==='balanceCoversDeclaredAmount'&&typeof value==='boolean');
  if(/^nft_position_\d+_\d+$/.test(id))return address(data.token)&&unsigned(data.tokenId)&&(key==='balance'&&unsigned(value)||key==='owner'&&address(value));
  if(/^order_asset_\d+$/.test(id))return address(data.token)&&(names(key,'balanceRaw minimum maximum startAmount endAmount')&&unsigned(value)||names(key,'balanceBelowMinimum balanceCoversMaximum')&&typeof value==='boolean'||unsigned(data.tokenId)&&(key==='currentOwner'&&address(value)||key==='matches'&&address(data.currentOwner)&&typeof value==='boolean'));
  if(id==='vault_context')return names(key,'amount totalAssets totalSupply previewDeposit previewMint previewWithdraw previewRedeem maxDeposit maxMint maxWithdraw maxRedeem')&&unsigned(value);
  if(id==='vault_asset_context')return names(key,'underlyingBalanceRaw existingUnderlyingAllowanceRaw shareBalanceRaw')&&unsigned(value);
  if(id==='lending_context'||id==='liquidation_risk')return names(key,'totalCollateralBase totalDebtBase availableBorrowsBase currentLiquidationThreshold ltv healthFactor')&&unsigned(value);
  if(id==='transaction_base_fee'||id==='userop_fee')return names(key,'baseFeePerGasWei suppliedFeeCapWei maxFeePerGasWei maxPriorityFeePerGasWei')&&unsigned(value)||key==='maxFeeCoversCurrentBaseFee'&&typeof value==='boolean';
  if(id==='userop_deposit')return names(key,'depositWei declaredRequiredGas declaredPrefundWei')&&unsigned(value)||key==='depositCoversDeclaredPrefund'&&typeof value==='boolean';
  if(/^position_asset_\d+$/.test(id))return key==='balanceRaw'&&address(data.token)&&unsigned(value);
  if(id==='position_context')return names(key,'liquidity tokensOwed0 tokensOwed1')&&unsigned(value)||key==='owner'&&address(data.manager)&&unsigned(data.tokenId)&&address(value);
  if(id==='position_liquidity_limit')return names(key,'requested observed')&&unsigned(value);
  if(id==='position_pool')return key==='activeLiquidityRaw'&&unsigned(value);
 }
 if(check.source==='isolated-fork'){
  if(/^(?:simulation_execution|unexpected_asset_loss|excess_token_spend)$/.test(id)){
   if(/^native\.(?:before|after|gasWei)$/.test(key))return unsigned(value);
   if(/^native\.(?:deltaIncludingGas|deltaExcludingGas)$/.test(key))return signed(value);
   const path=/^assets\[(\d+)\]\.(before|after|delta)$/.exec(key),asset=path&&Array.isArray(data.assets)?data.assets[Number(path[1])] as Record<string,unknown>|undefined:undefined;
   return Boolean(path&&asset&&address(asset.contract)&&(['erc20','erc1155'].includes(String(asset.kind))?(asset.kind!=='erc1155'||unsigned(asset.tokenId))&&(path[2]==='delta'?signed(value):unsigned(value)):asset.kind==='erc721'&&unsigned(asset.tokenId)&&path[2]!=='delta'&&address(value)));
  }
  if(id==='round_trip')return names(key,'bought returned declaredInputRaw requestedOutputRaw observedInputDebitRaw ratioInputRaw')&&unsigned(value)||key==='roundTripReturnPercent'&&typeof value==='number'&&Number.isFinite(value)&&value>=0;
  if(/^fork_(?:vault|lending)_(?:before|after|change)$/.test(id))return /^data\.(?:values|differences)\.(?:totalAssetsRaw|totalSharesRaw|ownerSharesRaw|receiverSharesRaw|maxOwnerWithdrawRaw|maxOwnerRedeemRaw|requestPreviewRaw|callerUnderlyingRaw|receiverUnderlyingRaw|callerUnderlyingAllowanceToVaultRaw|callerUnderlyingAllowanceToPoolRaw|totalCollateralBaseRaw|totalDebtBaseRaw|availableBorrowsBaseRaw|currentLiquidationThresholdRaw|ltvRaw|healthFactor1e18)$/.test(field)&&(field.startsWith('data.differences.')?signed(value):unsigned(value));
  if(id==='fork_lending_health')return key==='healthFactor1e18'&&unsigned(value);
 }
 if(check.source==='goplus'&&/^token_security(?:_0x[\da-f]{40})?$/i.test(id))return names(key,'is_honeypot cannot_sell_all')&&(value==='0'||value==='1')||names(key,'buy_tax sell_tax')&&typeof value==='string'&&/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(value);
 if(check.source==='calldata/batch-v1'&&/^(?:batch_structure|batch_child_[\d_]+)$/.test(id))return key==='valueWei'&&unsigned(value);
 if(check.source==='request'&&id==='userop_request')return names(key,'callGasLimit verificationGasLimit preVerificationGas maxFeePerGasWei maxPriorityFeePerGasWei paymasterVerificationGasLimit paymasterPostOpGasLimit')&&unsigned(value);
 return false;
}
function factDimensions(check:SecurityReport['checks'][number],field:string,value:unknown,dimensions:AIDimension['dimension'][],report:SecurityReport):AIDimension['dimension'][] {
 const key=field.split('.').at(-1)!.replace(/\[\d+\]$/,'');
 // This is an actually observed successful fork receipt, distinct from the
 // generic check-status inventory or a "simulationOnly" provenance flag.
 if(check.source==='isolated-fork'&&check.id==='simulation_execution'&&field==='data.status'&&check.status==='pass'&&value==='success')return dimensions.filter(dimension=>dimension==='execution');
 if(metadataOnly.has(key)||/(?:CodeHash|blockHash|BlockHash)$/.test(key)||key==='codeHash')return [];
 if(check.id==='chain_context'){
  if(field==='data.nativeBalanceWei')return dimensions.filter(dimension=>dimension==='exposure'&&exposureFact(check,field,value,report));
  if(field==='data.targetHasCode')return dimensions.filter(dimension=>dimension==='execution'&&typeof value==='boolean');
  return [];
 }
 return dimensions.filter(dimension=>dimension!=='exposure'||exposureFact(check,field,value,report));
}
function stable(value:unknown):string{return JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);}
function subjectFor(check:SecurityReport['checks'][number],field:string,report:SecurityReport):ModelFact['subject']{
 const data=check.data??{};
 if(check.id==='operation'&&/^rules(?:\/|$)/.test(check.source)&&decodedExposureFields(report.operation).some(name=>field===`operation.${name}`||field.startsWith(`operation.${name}[`))){
  if(report.operation.category==='native_transfer')return {role:'asset',value:'native'};
  const index=/^operation\.amounts\[(\d+)\]$/.exec(field),tokens=report.operation.fields.tokens;
  const asset=report.operation.category==='permit2_signature'&&index&&Array.isArray(tokens)?tokens[Number(index[1])]:report.operation.token;
  return address(asset)?{role:'token',value:asset.toLowerCase()}:{role:'operation',value:check.id};
 }
 // basicCollector reads the sender/signer's native balance. Its "target" is
 // the recipient or verifier and must never become the balance owner.
 if(check.id==='chain_context'&&field==='data.nativeBalanceWei'){
  const owner=report.request.kind==='transaction'?report.request.transaction.from:report.request.kind==='signature'?report.request.signature.from:undefined;
  return address(owner)?{role:'account',value:owner.toLowerCase()}:{role:'evidence',value:check.id};
 }
 const subjects=data.subjects as Record<string,unknown>|undefined;
 const targetAsset=(target:unknown):ModelFact['subject']=>address(target)?{role:'asset',value:target.toLowerCase()}:{role:'evidence',value:check.id};
 if(check.source==='rpc'&&/^(?:token_identity|asset_identity_\d+|asset_balance_\d+|signature_exposure(?:_\d+)?|position_asset_\d+)$/.test(check.id)&&/^data\.(?:balance|balanceRaw|decimals|declaredCapRaw|declaredTransferAmountRaw|existingAllowanceRaw|snapshotBalanceBoundRaw|balanceCoversDeclaredAmount)$/.test(field)){
  const token=data.token??data.address;return address(token)?{role:'token',value:token.toLowerCase()}:{role:'evidence',value:check.id};
 }
 if(check.source==='isolated-fork'&&/^fork_authority_(?:before|after|change)$/.test(check.id)&&/^data\.(?:values|beforeValues|afterValues)\./.test(field)){
  const name=field.split('.').at(-1)!;
  if(names(name,'erc20AllowanceRaw erc721Owner erc721Approved operatorApproved'))return targetAsset(data.target);
  if(names(name,'erc20AllowanceToVerifierRaw permit2AmountRaw permit2ExpirationSeconds permit2Nonce'))return targetAsset(subjects?.token);
  return address(data.target)?{role:'account',value:data.target.toLowerCase()}:{role:'evidence',value:check.id};
 }
 if(check.source==='isolated-fork'&&/^(?:simulation_execution|unexpected_asset_loss|excess_token_spend)$/.test(check.id)){
  if(/^data\.native\./.test(field))return {role:'asset',value:'native'};
  const path=/^data\.assets\[(\d+)\]\./.exec(field),asset=path&&Array.isArray(data.assets)?data.assets[Number(path[1])] as Record<string,unknown>|undefined:undefined;
  if(path)return address(asset?.contract)?{role:'token',value:asset.contract.toLowerCase()}:{role:'evidence',value:check.id};
 }
 if(check.source==='isolated-fork'&&check.id==='round_trip'){
  if(field==='data.bought'||field==='data.requestedOutputRaw')return targetAsset(data.outputToken);
  if(names(field,'data.returned data.declaredInputRaw data.observedInputDebitRaw data.ratioInputRaw'))return data.inputUnit==='native_wei'?{role:'asset',value:'native'}:targetAsset(data.inputToken);
  if(field==='data.roundTripReturnPercent')return {role:'evidence',value:check.id};
 }
 if(check.source==='rpc'&&check.id==='vault_context'){
  const name=field.split('.').at(-1)!,vault=data.vault;
  if(names(name,'totalSupply previewDeposit previewWithdraw maxMint maxRedeem'))return targetAsset(vault);
  if(names(name,'totalAssets previewMint previewRedeem maxDeposit maxWithdraw'))return targetAsset(data.asset);
  if(name==='amount')return targetAsset(['mint','redeem'].includes(String(data.action))?vault:data.asset);
 }
 if(check.source==='rpc'&&check.id==='vault_asset_context'){
  const name=field.split('.').at(-1)!;
  if(names(name,'underlyingBalanceRaw existingUnderlyingAllowanceRaw underlyingDecimals'))return targetAsset(data.underlying);
  if(names(name,'shareBalanceRaw shareDecimals'))return targetAsset(report.request.kind==='transaction'?report.request.transaction.to:undefined);
 }
 if(check.source==='rpc'&&['lending_context','liquidation_risk'].includes(check.id)&&/^data\.(?:totalCollateralBase|totalDebtBase|availableBorrowsBase|currentLiquidationThreshold|ltv|healthFactor)$/.test(field)){
  const owner=data.owner??report.operation.fields.onBehalfOf;return address(owner)?{role:'account',value:owner.toLowerCase()}:{role:'evidence',value:check.id};
 }
 if(check.source==='rpc'&&/^position_/.test(check.id)){
  const name=field.split('.').at(-1)!;
  if(names(name,'tokensOwed0 feeGrowthInside0LastX128'))return targetAsset(data.token0);
  if(names(name,'tokensOwed1 feeGrowthInside1LastX128'))return targetAsset(data.token1);
  if(names(name,'liquidity requested observed')&&['position_context','position_liquidity_limit'].includes(check.id))return targetAsset(data.manager);
  if(name==='activeLiquidityRaw')return targetAsset(data.pool);
 }
 const traceFrame=['call_trace','call_trace_fork'].includes(check.id)&&/^data\.calls\[(\d+)\]\.(\w+)$/.exec(field);
 if(traceFrame&&Array.isArray(data.calls)){
  const frame=data.calls[Number(traceFrame[1])] as Record<string,unknown>|undefined;
  if(traceFrame[2]==='valueWei')return {role:'asset',value:'native'};
  if(traceFrame[2]==='from'&&address(frame?.from))return {role:'account',value:frame.from.toLowerCase()};
  if(address(frame?.to))return {role:'target',value:frame.to.toLowerCase()};
  if(address(frame?.from))return {role:'account',value:frame.from.toLowerCase()};
  return {role:'evidence',value:check.id};
 }
 // A wallet owner is not the unit of a vault share or underlying-token
 // quantity. Real fork collectors include subjects.owner, unlike early minimal
 // fixtures; choosing that owner first silently collapsed distinct assets.
 if(/^fork_(?:vault|lending)_(?:before|after|change)$/.test(check.id)&&/^data\.(?:values|differences)\./.test(field)){
  const name=field.split('.').at(-1)!;
  const shares=/^(?:totalSharesRaw|ownerSharesRaw|receiverSharesRaw|maxOwnerRedeemRaw|shareDecimals)$/.test(name);
  const underlying=/^(?:totalAssetsRaw|maxOwnerWithdrawRaw|(?:caller|receiver)Underlying(?:Raw|AllowanceTo(?:Vault|Pool)Raw)|underlyingDecimals)$/.test(name);
  // ERC-4626 previewDeposit/previewWithdraw return shares, whereas previewMint/
  // previewRedeem return assets. Preserve that distinction instead of treating
  // every preview as the underlying token just because data.asset is present.
  const action=String(report.operation.fields.action??'');
  const previewShares=name==='requestPreviewRaw'&&['deposit','withdraw'].includes(action);
  const previewAssets=name==='requestPreviewRaw'&&['mint','redeem'].includes(action);
  if(shares||previewShares)return address(data.target)?{role:'asset',value:data.target.toLowerCase()}:{role:'evidence',value:check.id};
  if(underlying||previewAssets)return address(data.asset)?{role:'asset',value:data.asset.toLowerCase()}:{role:'evidence',value:check.id};
  if(name==='requestPreviewRaw')return {role:'evidence',value:check.id};
  if(/BaseRaw|healthFactor|ltvRaw|currentLiquidationThresholdRaw/.test(name)){
   const owner=subjects?.owner??data.owner;
   return address(owner)?{role:'account',value:owner.toLowerCase()}:{role:'evidence',value:check.id};
  }
 }
 if(/^data\.(?:values|differences|beforeValues|afterValues)\./.test(field)&&subjects){for(const [key,role] of [['token','token'],['account','account'],['owner','owner']] as const)if(address(subjects[key]))return {role,value:String(subjects[key]).toLowerCase()};}
 const item=/^data\.(offer|consideration)\[(\d+)\]\./.exec(field);if(item&&Array.isArray(data[item[1]])){const entry=(data[item[1]] as Record<string,unknown>[])[Number(item[2])],token=entry?.token;if(Number(entry?.itemType)===0&&typeof token==='string'&&/^0x0{40}$/i.test(token))return {role:'asset',value:'native'};if(address(token))return {role:'token',value:token.toLowerCase()};}
 if(/Shares|Redeem/.test(field)&&address(data.target))return {role:'asset',value:data.target.toLowerCase()};
 if(/BaseRaw|healthFactor|ltvRaw/.test(field)){const owner=(data.subjects as Record<string,unknown>|undefined)?.owner??data.owner;if(address(owner))return {role:'account',value:owner.toLowerCase()};}
 if(data.asset==='native')return {role:'asset',value:'native'};
 for(const [field,role] of [['pool','verifier'],['token','token'],['asset','asset'],['address','address'],['account','account'],['owner','owner'],['authority','account'],['recoveredAuthority','account'],['sender','account'],['payer','account'],['verifyingContract','verifier'],['entryPoint','verifier'],['delegate','target'],['target','target'],['subject','address']] as const)if(address(data[field]))return {role,value:String(data[field]).toLowerCase()};
 if(typeof data.origin==='string'){try{const origin=new URL(data.origin).origin;if(origin.length<=200)return {role:'origin',value:origin};}catch{}}
 return {role:check.id==='operation'?'operation':'evidence',value:check.id};
}
export function modelFactCandidates(report:SecurityReport):{version:typeof FACT_SCHEMA_VERSION;candidates:FactCandidate[];scope:{candidate_limit:number;omitted:number;full_report:false}}{
 const candidates:FactCandidate[]=[];let omitted=0;
 const add=(check:SecurityReport['checks'][number],field:string,value:unknown,dimensions:AIDimension['dimension'][]=[]):void=>{
  if(!scalar(value))return;
  const data=check.data??{},chain=Number(data.chainId),block=data.blockNumber??data.baseBlock,hash=data.blockHash??data.baseBlockHash;
  const base:Omit<ModelFact,'id'>={evidence_id:check.id,subject:subjectFor(check,field,report),field,value,scope:check.status==='unknown'?'unresolved-check':/^rules(?:\/|$)/.test(check.source)||['eip712','request','calldata/batch-v1'].includes(check.source)?'decoded-request':check.source==='isolated-fork'?'isolated-fork':['reference','sourcify'].includes(check.source)?'reference-observation':'reported-observation',provenance:{source:check.source,chain_id:Number.isSafeInteger(chain)&&chain>0?chain:null,block_number:typeof block==='string'&&/^\d+$/.test(block)?block:null,block_hash:typeof hash==='string'&&/^0x[\da-f]{64}$/i.test(hash)?hash.toLowerCase():null,observed_at:check.observedAt}};
  const fact={id:`fact_${createHash('sha256').update(stable(base)).digest('hex').slice(0,24)}`,...base};
  if(!modelFactSchema.safeParse(fact).success)return;
  if(candidates.length>=FACT_LIMITS.candidates){omitted++;return;}candidates.push({fact,admissible_dimensions:factDimensions(check,field,value,dimensions,report)});
 };
 for(const check of report.checks){
  const dimensions=dimensionsForEvidence(check,report);let count=0;
  const append=(field:string,value:unknown,dims=dimensions)=>{if(count>=FACT_LIMITS.perEvidence){if(scalar(value))omitted++;return;}count++;add(check,field,value,dims);};
  append('status',check.status,[]);
  if(check.id==='operation'){
   append('operation.category',report.operation.category,dimensions);append('operation.decoded',report.operation.decoded,dimensions);
   for(const [key,value] of Object.entries(report.operation.fields))if(fields.has(key)){
    if(Array.isArray(value)){omitted+=Math.max(0,value.length-FACT_LIMITS.arrayItems);value.slice(0,FACT_LIMITS.arrayItems).forEach((item,index)=>append(`operation.${key}[${index}]`,item,dimensions));}else append(`operation.${key}`,value,dimensions);
   }
  }
  for(const [key,value] of Object.entries(check.data??{}))if(check.source==='isolated-fork'&&/^(?:simulation_execution|unexpected_asset_loss|excess_token_spend)$/.test(check.id)&&key==='native'&&value&&typeof value==='object'&&!Array.isArray(value)){
   for(const name of ['before','after','deltaIncludingGas','gasWei','deltaExcludingGas'])if(scalar((value as Record<string,unknown>)[name]))append(`data.native.${name}`,(value as Record<string,unknown>)[name],dimensions);
  }else if(check.source==='isolated-fork'&&/^(?:simulation_execution|unexpected_asset_loss|excess_token_spend)$/.test(check.id)&&key==='assets'&&Array.isArray(value)){
   omitted+=Math.max(0,value.length-FACT_LIMITS.arrayItems);value.slice(0,FACT_LIMITS.arrayItems).forEach((asset,index)=>{if(!asset||typeof asset!=='object'||!address(asset.contract)||!['erc20','erc721','erc1155'].includes(asset.kind))return;for(const name of ['contract','kind','tokenId','owner','before','after','delta'])if(scalar(asset[name]))append(`data.assets[${index}].${name}`,asset[name],dimensions);});
  }else if(fields.has(key)){
   let admissible=dimensions;
   if(['token_identity','asset_identity_0'].includes(check.id)&&key==='decimals')admissible=dimensions.filter(d=>d==='exposure'||d==='protocol');
   if(Array.isArray(value)){omitted+=Math.max(0,value.length-FACT_LIMITS.arrayItems);value.slice(0,FACT_LIMITS.arrayItems).forEach((item,index)=>append(`data.${key}[${index}]`,item,admissible));}else append(`data.${key}`,value,admissible);
  }else if(key==='flags'&&value&&typeof value==='object'&&!Array.isArray(value)){
   for(const [name,flag] of Object.entries(value))if(fields.has(name))append(`data.flags.${name}`,flag,dimensions);
  }else if(['values','differences','subjects','beforeValues','afterValues'].includes(key)&&value&&typeof value==='object'&&!Array.isArray(value)){
   for(const [name,item] of Object.entries(value))if(fields.has(name)){if(Array.isArray(item)){omitted+=Math.max(0,item.length-FACT_LIMITS.arrayItems);item.slice(0,FACT_LIMITS.arrayItems).forEach((entry,index)=>append(`data.${key}.${name}[${index}]`,entry,dimensions));}else append(`data.${key}.${name}`,item,dimensions);}
  }else if(['call_trace','call_trace_fork'].includes(check.id)&&key==='calls'&&Array.isArray(value)){
   omitted+=Math.max(0,value.length-FACT_LIMITS.traceFrames);
   value.slice(0,FACT_LIMITS.traceFrames).forEach((item,index)=>{
    if(!item||typeof item!=='object'||Array.isArray(item))return;
    const frame=item as Record<string,unknown>;
    for(const name of ['from','to','selector','depth','reverted'])if(scalar(frame[name]))append(`data.calls[${index}].${name}`,frame[name],dimensions);
    if(typeof frame.type==='string'&&/^(?:CALL|STATICCALL|DELEGATECALL|CALLCODE|CREATE|CREATE2|SELFDESTRUCT|SUICIDE)$/.test(frame.type))append(`data.calls[${index}].callType`,frame.type,dimensions);
    if(typeof frame.value==='string'&&/^0x[\da-f]{1,64}$/i.test(frame.value))append(`data.calls[${index}].valueWei`,String(BigInt(frame.value)),dimensions);
   });
  }else if(['offer','consideration'].includes(key)&&Array.isArray(value)){
   omitted+=Math.max(0,value.length-FACT_LIMITS.arrayItems);value.slice(0,FACT_LIMITS.arrayItems).forEach((item,index)=>{if(item&&typeof item==='object')for(const [name,scalar] of Object.entries(item))if(fields.has(name))append(`data.${key}[${index}].${name}`,scalar,dimensions);});
  }
 }
 return {version:FACT_SCHEMA_VERSION,candidates,scope:{candidate_limit:FACT_LIMITS.candidates,omitted,full_report:false}};
}

type FactOutput={fact_schema_version?:typeof FACT_SCHEMA_VERSION;facts?:ModelFact[];reasons:{evidence_ids:string[];fact_ids?:string[]}[];dimensions:{dimension:AIDimension['dimension'];assessment:string;evidence_ids:string[];fact_ids?:string[]}[]};
/** Verify selected observations exactly; this does not prove arbitrary prose or
 * transform a reported provider result into an authenticated real-world fact. */
export function validateModelFacts(value:FactOutput,report:SecurityReport,required=false):ModelFact[]|undefined{
 if(value.fact_schema_version===undefined&&value.facts===undefined){if(required)throw Error('Structured facts required');return;}
 if(value.fact_schema_version!==FACT_SCHEMA_VERSION||!Array.isArray(value.facts))throw Error('Structured fact version mismatch');
 const candidates=new Map(modelFactCandidates(report).candidates.map(item=>[item.fact.id,item]));
 if(value.facts.length>FACT_LIMITS.selected||new Set(value.facts.map(fact=>fact.id)).size!==value.facts.length)throw Error('Ambiguous structured facts');
 const facts=new Map<string,FactCandidate>();
 for(const claimed of value.facts){const actual=candidates.get(claimed.id);if(!actual||stable(claimed)!==stable(actual.fact))throw Error('Structured fact does not match observation');facts.set(claimed.id,actual);}
 for(const statement of [...value.reasons,...value.dimensions]){
  if(!Array.isArray(statement.fact_ids)||new Set(statement.fact_ids).size!==statement.fact_ids.length||statement.fact_ids.some(id=>!facts.has(id)||!statement.evidence_ids.includes(facts.get(id)!.fact.evidence_id)))throw Error('Structured fact citation mismatch');
 }
 if(value.reasons.some(reason=>!reason.fact_ids?.length))throw Error('Structured reason lacks observation');
 for(const dimension of value.dimensions)if(!['unknown','not_applicable'].includes(dimension.assessment)&&!dimension.fact_ids?.some(id=>facts.get(id)?.admissible_dimensions.includes(dimension.dimension)))throw Error('Structured dimension lacks relevant fact');
 return value.facts.map(fact=>facts.get(fact.id)!.fact);
}
