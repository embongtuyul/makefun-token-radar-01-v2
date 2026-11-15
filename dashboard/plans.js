// Plan engine for the token launch radar. Pure logic, no DOM: the Node
// entrypoint (lib/model.ts) imports this file to write board.json, and the
// dashboard (app.js) loads it in the browser to render the same plans, so
// the board file and the page can never disagree about a plan.
// All money figures are US dollars. Gas figures are approximate typical
// costs per simple transaction, as of the snapshot date (2026-11-14).

const FARM_CAPITAL_USD = 1000; // size of the standard farm this radar prices
const FARM_WEEKS = 12;         // length of the standard farm, in weeks
const FARMER_SHARE = 0.07;     // assumed share of implied value reaching farmers
const BRIDGE_FEE_USD = 7;      // flat allowance for one Ethereum bridge crossing

// Typical gas per simple transaction on each chain, in USD. Chains not
// listed here use DEFAULT_GAS_USD. These are approximations, not quotes.
const GAS_USD = {
  'Ethereum': 2.00, 'Arbitrum': 0.15, 'Base': 0.03, 'Optimism': 0.10,
  'Solana': 0.01, 'Binance': 0.10, 'Polygon': 0.01, 'Avalanche': 0.05,
  'Tron': 1.50, 'Sui': 0.01, 'Aptos': 0.01, 'Berachain': 0.05, 'Ink': 0.03,
  'Mantle': 0.02, 'Linea': 0.05, 'Scroll': 0.05, 'zkSync Era': 0.10,
  'Gnosis': 0.02, 'Fantom': 0.02, 'Sonic': 0.01, 'Hyperliquid L1': 0.05,
  'Bittensor': 0.10, 'Stellar': 0.01, 'Flare': 0.02, 'Robinhood Chain': 0.05,
  'Pharos': 0.02, 'Plasma': 0.02, 'Monad': 0.01, 'Bitcoin': 1.00,
  'Ripple': 0.01, 'Algorand': 0.01, 'Kava': 0.02, 'Ronin': 0.01,
  'Manta': 0.05, 'Morph': 0.03, 'Plume Mainnet': 0.02, 'World Chain': 0.02,
  'Reya Network': 0.02, 'Klaytn': 0.02, 'Starknet': 0.10, 'XION': 0.01,
  'Sei': 0.01, 'Unichain': 0.02, 'Blast': 0.03, 'Mode': 0.02, 'Zora': 0.01,
  'Lisk': 0.01, 'Fraxtal': 0.02, 'Corn': 0.05, 'Tac': 0.05, 'Tempo': 0.05,
  'Stable': 0.05, 'Katana': 0.05, 'MegaETH': 0.01, 'RISE': 0.02,
  'Arc': 0.02, 'Fluent': 0.02, 'Strato': 0.02, 'BSquared': 0.05,
  'Mezo': 0.05, 'Proton': 0.01, 'Noble': 0.01, 'Qubic': 0.01, 'RSK': 0.02,
  'Canton': 0.05, 'Bifrost Network': 0.02, 'Stacks': 0.05,
  'Provenance': 0.02, 'Abstract': 0.02, 'Soneium': 0.02, 'BOB': 0.05
};
const DEFAULT_GAS_USD = 0.10;

// EVM chains a reader can actually reach by bridging from Ethereum. Chains
// outside this set are funded natively, never "bridged" from Ethereum.
const BRIDGEABLE_FROM_ETH = new Set([
  'Arbitrum', 'Base', 'Optimism', 'Polygon', 'Binance', 'Avalanche',
  'Gnosis', 'Ink', 'Mantle', 'Linea', 'Scroll', 'zkSync Era', 'Berachain',
  'Blast', 'Mode', 'Unichain', 'World Chain', 'Abstract', 'Sei', 'Sonic',
  'Fantom', 'Kava', 'Ronin', 'Manta', 'Morph', 'Plume Mainnet',
  'Reya Network', 'Katana', 'Stable', 'Tempo', 'Corn', 'Tac', 'MegaETH',
  'RISE', 'Arc', 'Fluent', 'Strato', 'Pharos', 'Plasma', 'BSquared',
  'Mezo', 'Lisk', 'Fraxtal', 'Zora', 'Starknet', 'Soneium', 'BOB'
]);

// What a farmer deploys on chains where USDC is not the natural asset.
const CHAIN_ASSET = {
  'Bitcoin': 'BTC', 'Bittensor': 'TAO', 'Tron': 'USDT', 'Ripple': 'XRP',
  'Stellar': 'XLM', 'Stacks': 'STX', 'Qubic': 'QUBIC'
};

function chainGas(chain) { return GAS_USD[chain] !== undefined ? GAS_USD[chain] : DEFAULT_GAS_USD; }
function chainAsset(chain) { return CHAIN_ASSET[chain] || 'USDC'; }
function needsBridge(chain) { return chain !== 'Ethereum' && BRIDGEABLE_FROM_ETH.has(chain); }

// Compact money: $98.4M, $2.5M, $850, $0.03.
function fmtMoney(n) {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'k';
  if (n >= 100) return '$' + Math.round(n);
  return '$' + n.toFixed(2);
}
function fmtUsd(n) {
  const parts = n.toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return '$' + parts.join('.');
}

// First step of every plan: get funded on the protocol's chain. The wording
// depends on the chain, and never invents a bridge that does not exist.
function fundingStep(ctx) {
  const amount = fmtUsd(FARM_CAPITAL_USD);
  const article = /^[AEIOU]/i.test(ctx.chain) ? 'an' : 'a';
  if (ctx.chain === 'Ethereum') {
    return 'Fund a wallet with ' + amount + ' in ' + ctx.asset + ' on Ethereum. No bridge is needed: ' + ctx.name + ' runs on Ethereum.';
  }
  if (needsBridge(ctx.chain)) {
    return 'If your funds sit on Ethereum, bridge ' + amount + ' in ' + ctx.asset + ' to ' + ctx.chain + ' with the official ' + ctx.chain + ' bridge (about ' + fmtUsd(BRIDGE_FEE_USD) + ', 10-20 minutes). Otherwise fund ' + article + ' ' + ctx.chain + ' wallet directly.';
  }
  return 'Fund ' + article + ' ' + ctx.chain + ' wallet with ' + amount + ' in ' + ctx.asset + '. ' + ctx.name + ' is native to ' + ctx.chain + ', so move funds there directly rather than through another chain.';
}

// One template per farming mechanism. Placeholders: {name} {chain} {asset}
// {gas} {cost} {expected} {net} {verdict} {weeks} {amount}. tx counts drive
// the plan cost: entry + weekly * weeks + checks + exit transactions.
const PLAN_TEMPLATES = {
  vault: { tx: [2, 0, 3, 1], steps: [
    'Deposit the full {amount} into the {name} vault on {chain} in one transaction (about {gas} gas). Keep the vault receipt token in the same wallet for the whole plan.',
    'Hold for {weeks} weeks. Check the position monthly and claim or compound only when the reward covers the {gas} transaction; do not move the capital between vaults.',
    'Before week 2, read the {name} docs and official channels for a rewards or points program. If none is announced, the plan still earns vault yield, but size expectations to that.',
    'Unwind after {weeks} weeks: withdraw through the same vault (about {gas} gas). Verdict {verdict}: expected value about {expected} against about {cost} total gas.'
  ]},
  dex: { tx: [3, 1, 0, 2], steps: [
    'Split the {amount}: swap half into the pool second asset and add both sides as liquidity on {name} (about {gas} gas per transaction). Keep the LP position in one wallet.',
    'Trade on {name} once a week for {weeks} weeks: one small swap each week (about {gas} gas) so the wallet shows real usage, not a single deposit.',
    'Check the docs for a rewards or points program in week 1. If none is announced, the plan still earns trading fees, but size expectations to those.',
    'Unwind after {weeks} weeks: remove liquidity and swap back to {asset} (about {gas} gas per transaction). Verdict {verdict}: expected value about {expected} against about {cost} total gas.'
  ]},
  lending: { tx: [2, 0, 2, 1], steps: [
    'Supply the {amount} in {asset} to the {name} lending market on {chain} (about {gas} gas). Borrowing against it is optional and adds liquidation risk; this plan supplies only.',
    'Leave the supply in place for {weeks} weeks. Adjust at most once a month; each adjustment costs about {gas}.',
    'Check the docs for a rewards or points program in week 1. If none is announced, the plan still earns supply interest, but size expectations to that.',
    'Unwind after {weeks} weeks: withdraw the supply (about {gas} gas). Verdict {verdict}: expected value about {expected} against about {cost} total gas.'
  ]},
  perps: { tx: [3, 1, 0, 2], steps: [
    'Deposit {amount} in {asset} as margin on {name} (about {gas} gas). Open a first position at low leverage (2x or less): liquidation wipes the position, so size it to survive a 20% move.',
    'Trade once a week for {weeks} weeks: one small position each week (about {gas} gas per trade). Never add to a losing position to chase the entry price.',
    'Keep at least half the margin unallocated at all times so a fast move cannot liquidate the account between weekly check-ins.',
    'Check the docs for a rewards or points program in week 1. If none is announced, the plan earns only trading outcomes, so size expectations to that.',
    'Close all positions and withdraw after {weeks} weeks (about {gas} gas per transaction). Verdict {verdict}: expected value about {expected} against about {cost} total gas.'
  ]},
  cdp: { tx: [2, 0, 2, 2], steps: [
    'Lock the {amount} in {asset} as collateral on {name} and mint its stablecoin against it (about {gas} gas per transaction). Keep the collateral ratio well above the stated minimum.',
    'Hold the debt position for {weeks} weeks. Watch the collateral ratio weekly; top up collateral (about {gas}) if a price move pushes it toward liquidation.',
    'Check the docs for a rewards or points program in week 1. If none is announced, the position still earns whatever the protocol pays, but size expectations to that.',
    'Repay the minted stablecoin and unlock the collateral after {weeks} weeks (about {gas} gas per transaction). Verdict {verdict}: expected value about {expected} against about {cost} total gas.'
  ]},
  rwa: { tx: [2, 0, 0, 1], steps: [
    'Check whether {name} requires identity verification: many RWA products are restricted by jurisdiction. Only continue if eligible; deposit {amount} in {asset} if so (about {gas} gas).',
    'Hold the position for {weeks} weeks. RWA yields accrue slowly and the position is usually illiquid, so do not plan on exiting early.',
    'Check the docs for a rewards or points program in week 1. If none is announced, the plan earns the asset yield alone.',
    'Redeem after {weeks} weeks through the protocol redemption flow (about {gas} gas, plus any redemption window it states). Verdict {verdict}: expected value about {expected} against about {cost} total gas.'
  ]},
  basis: { tx: [2, 0, 3, 1], steps: [
    'Deposit {amount} in {asset} into the {name} basis vault on {chain} (about {gas} gas). A basis trade earns the funding-rate spread and can lose if rates flip, so this is not a savings account.',
    'Hold for {weeks} weeks and check the reported funding rate monthly. If the rate stays negative for a full month, consider exiting early (about {gas}).',
    'Check the docs for a rewards or points program in week 1. If none is announced, the plan earns the basis spread only.',
    'Withdraw after {weeks} weeks (about {gas} gas). Verdict {verdict}: expected value about {expected} against about {cost} total gas.'
  ]},
  prediction: { tx: [2, 1, 0, 2], steps: [
    'Deposit {amount} in {asset} on {name} (about {gas} gas). Place a first trade on a market you have actually researched; a prediction market pays for being right, not for volume.',
    'Trade once a week for {weeks} weeks, one considered position each week (about {gas} gas per trade). Spread positions across markets instead of concentrating on one outcome.',
    'Check the docs for a rewards or points program in week 1. If none is announced, the plan earns only trading outcomes.',
    'Close positions and withdraw after {weeks} weeks (about {gas} gas per transaction). Verdict {verdict}: expected value about {expected} against about {cost} total gas.'
  ]},
  chain: { tx: [2, 1, 0, 2], steps: [
    'Use the {name} flagship apps: swap once on its main DEX and supply once to its main lending market (about {gas} gas per transaction). Real usage across apps is the point, not one deposit.',
    'Return once a week for {weeks} weeks and use a different app each time (about {gas} gas per visit). Keep all activity in one wallet so the history is readable.',
    'Check the chain docs and official channels for a rewards or points program in week 1. If none is announced, the activity still earns whatever the apps themselves pay.',
    'Wind down after {weeks} weeks: withdraw from the apps and bridge back only if you need the funds elsewhere (about {gas} per transaction). Verdict {verdict}: expected value about {expected} against about {cost} total gas.'
  ]},
  staking: { tx: [2, 0, 3, 1], steps: [
    'Stake the {amount} in {asset} with {name} on {chain} (about {gas} gas). Note the unbonding period the protocol states before staking: staked funds are locked for that long.',
    'Hold the stake for {weeks} weeks. Claim staking rewards monthly only if the claim covers its {gas} transaction cost.',
    'Check the docs for a rewards or points program in week 1. If none is announced, the plan earns staking yield only.',
    'Unstake after {weeks} weeks and wait out the unbonding period (about {gas} gas). Verdict {verdict}: expected value about {expected} against about {cost} total gas.'
  ]},
  farm: { tx: [2, 0, 3, 1], steps: [
    'Deposit the {amount} in {asset} into the {name} main pool on {chain} (about {gas} gas). Read the pool terms first: lockups and withdrawal fees vary by pool.',
    'Hold for {weeks} weeks, harvesting rewards monthly only when the harvest covers its {gas} transaction cost.',
    'Check the docs for a rewards or points program in week 1. If none is announced, the plan earns pool rewards alone.',
    'Withdraw after {weeks} weeks (about {gas} gas). Verdict {verdict}: expected value about {expected} against about {cost} total gas.'
  ]},
  bridge: { tx: [1, 1, 0, 0], steps: [
    'Use {name} to move {amount} in {asset} to another chain you actually use (about {gas} gas plus the bridge fee it quotes). Do not bridge back and forth for volume: fees eat the round trip.',
    'Route one real transfer a week through {name} for {weeks} weeks, only when you genuinely need to move funds (about {gas} gas each).',
    'Check the docs for a rewards or points program in week 1. If none is announced, the plan saves nothing and earns nothing beyond the transfers themselves.',
    'Stop after {weeks} weeks; there is nothing to unwind. Verdict {verdict}: expected value about {expected} against about {cost} total gas.'
  ]},
  generic: { tx: [2, 1, 0, 1], steps: [
    'Deposit the {amount} in {asset} into the {name} main product on {chain} (about {gas} gas). Read the product terms first: lockups, fees and risks vary.',
    'Use the product once a week for {weeks} weeks (about {gas} gas per use). Keep all activity in one wallet so the history is readable.',
    'Check the docs for a rewards or points program in week 1. If none is announced, the plan earns only what the product itself pays.',
    'Withdraw after {weeks} weeks (about {gas} gas). Verdict {verdict}: expected value about {expected} against about {cost} total gas.'
  ]}
};

// Which mechanism farms each DefiLlama category. Categories not listed
// here use the generic template.
const CATEGORY_TEMPLATE = {
  'Risk Curators': 'vault', 'Onchain Capital Allocator': 'vault',
  'Yield': 'vault', 'Yield Aggregator': 'vault', 'Liquidity Manager': 'vault',
  'Indexes': 'vault', 'Anchor BTC': 'vault', 'CDP Manager': 'vault',
  'Collateral Markets': 'vault', 'CeDeFi': 'vault',
  'Dexs': 'dex', 'OTC Marketplace': 'dex',
  'Lending': 'lending', 'Uncollateralized Lending': 'lending',
  'Derivatives': 'perps', 'Interest Rate Derivatives': 'perps',
  'Leveraged Farming': 'perps',
  'CDP': 'cdp', 'Dual-Token Stablecoin': 'cdp', 'Stablecoin Wrapper': 'cdp',
  'RWA': 'rwa', 'Basis Trading': 'basis', 'Prediction Market': 'prediction',
  'Chain': 'chain', 'Staking Pool': 'staking', 'Restaking': 'staking',
  'Decentralized BTC': 'staking',
  'Farm': 'farm', 'Governance Incentives': 'farm', 'Payments': 'farm',
  'Insurance': 'farm', 'Crypto Card Issuer': 'farm',
  'Cross Chain Bridge': 'bridge'
};

function templateFor(category) {
  const id = CATEGORY_TEMPLATE[category] || 'generic';
  return PLAN_TEMPLATES[id];
}
function templateIdFor(category) { return CATEGORY_TEMPLATE[category] || 'generic'; }

// Total transactions a plan runs over its whole life.
function planTxCount(template) {
  return template.tx[0] + template.tx[1] * FARM_WEEKS + template.tx[2] + template.tx[3];
}

// Full plan cost: every transaction at the chain's gas price, plus one
// bridge crossing when the funding step uses one.
function planCostUsd(chain, template) {
  let cost = planTxCount(template) * chainGas(chain);
  if (needsBridge(chain)) cost += BRIDGE_FEE_USD;
  return Math.round(cost * 100) / 100;
}

// Expand one protocol's farm plan. ctx carries: name, chain, category,
// cost, expected, net, verdict. The same function runs in Node (board.json)
// and in the browser (detail view), so both always agree.
function expandPlan(ctx) {
  const template = templateFor(ctx.category);
  const values = {
    name: ctx.name, chain: ctx.chain, asset: chainAsset(ctx.chain),
    gas: fmtUsd(chainGas(ctx.chain)), cost: fmtUsd(ctx.cost),
    expected: fmtUsd(ctx.expected), net: fmtUsd(ctx.net),
    verdict: ctx.verdict, weeks: String(FARM_WEEKS),
    amount: fmtUsd(FARM_CAPITAL_USD)
  };
  const out = [fundingStep({ name: ctx.name, chain: ctx.chain, asset: values.asset })];
  for (const step of template.steps) {
    out.push(step.replace(/\{(\w+)\}/g, function (m, key) {
      return values[key] !== undefined ? values[key] : m;
    }));
  }
  return out;
}

// Expected airdrop value for the standard farm, pro-rata by capital:
// implied value x farmer share x (capital / TVL). Assumes the protocol
// launches at its implied value; it does not discount launch probability.
function expectedValueUsd(impliedValueUsd, tvlUsd) {
  return impliedValueUsd * FARMER_SHARE * (FARM_CAPITAL_USD / tvlUsd);
}

// FARM: clearly worth it. THIN: positive but thin. SKIP: gas eats it.
function verdictFor(expectedUsd, costUsd) {
  const net = expectedUsd - costUsd;
  if (net >= 25 && net >= 3 * costUsd) return 'FARM';
  if (net > 0) return 'THIN';
  return 'SKIP';
}

const PLAN_ENGINE = {
  FARM_CAPITAL_USD, FARM_WEEKS, FARMER_SHARE, BRIDGE_FEE_USD,
  GAS_USD, DEFAULT_GAS_USD, chainGas, chainAsset, needsBridge,
  fmtMoney, fmtUsd, templateFor, templateIdFor, planTxCount,
  planCostUsd, expandPlan, expectedValueUsd, verdictFor
};
// One namespace for both runtimes: the browser reads window.PLAN_ENGINE
// from the classic script tag, and Node reads globalThis.PLAN_ENGINE after
// importing this file for its side effects.
if (typeof globalThis !== 'undefined') globalThis.PLAN_ENGINE = PLAN_ENGINE;
if (typeof module !== 'undefined' && module.exports) module.exports = PLAN_ENGINE;
