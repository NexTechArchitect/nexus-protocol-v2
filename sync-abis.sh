#!/bin/bash

# Folder path for web3-app
FRONTEND_PATH="./web3-app/src/constants/abis"

mkdir -p $FRONTEND_PATH

extract_abi() {
    if [ -f "out/$1.sol/$1.json" ]; then
        jq '.abi' out/$1.sol/$1.json > $FRONTEND_PATH/$1.json
        echo "✅ Synced $1 ABI to web3-app"
    else
        echo "❌ Error: $1.json not found in out/ folder"
    fi
}

# Syncing all main contracts
extract_abi "PositionManager"
extract_abi "PerpsVault"
extract_abi "LiquidationEngine"
extract_abi "PriceOracle"
extract_abi "AccountFactory"
extract_abi "SmartAccount"
extract_abi "NexusPaymaster"
extract_abi "CrossChainRouter"
extract_abi "MessageReceiver"

echo "🚀 Sync complete! Now check web3-app/src/constants/abis"
