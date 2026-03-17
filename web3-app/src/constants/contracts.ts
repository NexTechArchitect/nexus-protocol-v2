import PositionManagerABI from './abis/PositionManager.json';
import PerpsVaultABI from './abis/PerpsVault.json';
import LiquidationEngineABI from './abis/LiquidationEngine.json';
import PriceOracleABI from './abis/PriceOracle.json';
import CrossChainRouterABI from './abis/CrossChainRouter.json';
import MockUSDCABI from './abis/MockUSDC.json';
import MockWETHABI from './abis/MockWETH.json';
import MockWBTCABI from './abis/MockWBTC.json';
import PriceKeeperABI from './abis/PriceKeeper.json';
import AccountFactoryABI from './abis/AccountFactory.json';
import SmartAccountABI from './abis/SmartAccount.json';
import NexusPaymasterABI from './abis/NexusPaymaster.json';

export const CONTRACTS = {
    POSITION_MANAGER: {
        address: "0xd16150d0B2a04ECb1Aa09f840556347D5251fB53" as `0x${string}`,
        abi: PositionManagerABI.abi,
    },
    VAULT: {
        address: "0x9495fE47049a7aFe8180E9e8Aee743D533c67173" as `0x${string}`,
        abi: PerpsVaultABI.abi,
    },
    LIQUIDATION_ENGINE: {
        address: "0x01721d6502547faFD3049BE60b1485B12407f58B" as `0x${string}`,
        abi: LiquidationEngineABI.abi,
    },
    ORACLE: {
        address: "0x7C002F51B8D4F06275D43cFD1F15EcbFE7A52803" as `0x${string}`,
        abi: PriceOracleABI.abi,
    },
    ROUTER: {
        address: "0x8768d7470681a81caeA781285c9478dFDD7312e9" as `0x${string}`,
        abi: CrossChainRouterABI.abi,
    },
    USDC: {
        address: "0xDFdb18430C5C5C1EB4F9Abd69a78952f9BC3Afab" as `0x${string}`,
        abi: MockUSDCABI.abi,
    },
    WETH: {
        address: "0xE3579516aeB339A4a8624beadaE256619E77F61E" as `0x${string}`,
        abi: MockWETHABI.abi,
    },
    WBTC: {
        address: "0x20e9D3Ef17753EC0a0349eA7e26c8B8fd2B1A119" as `0x${string}`,
        abi: MockWBTCABI.abi,
    },
    PRICE_KEEPER: {
        address: "0x481EC593F7bD9aB4219a0d0A185C16F2687871C2" as `0x${string}`,
        abi: PriceKeeperABI.abi,
    },
    ACCOUNT_FACTORY: {
        address: "0x0000000000000000000000000000000000000001" as `0x${string}`,
        abi: AccountFactoryABI.abi,
    },
    PAYMASTER: {
        address: "0x0000000000000000000000000000000000000001" as `0x${string}`,
        abi: NexusPaymasterABI.abi,
    },
    SMART_ACCOUNT: {
        address: "0x0000000000000000000000000000000000000001" as `0x${string}`,
        abi: SmartAccountABI.abi,
    },
} as const;

export const POLKADOT_HUB = {
    id: 420420417,
    name: 'Polkadot Hub Testnet',
    rpcUrl: 'https://services.polkadothub-rpc.com/testnet',
    explorer: 'https://blockscout-passet-hub.parity-testnet.parity.io',
    nativeCurrency: { name: 'PAS', symbol: 'PAS', decimals: 18 },
} as const;

export const SUPPORTED_CHAIN_ID = 420420417;