-include .env

.PHONY: all test clean deploy help install snapshot format coverage

DEFAULT_ANVIL_KEY := 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

help:
	@echo "-----------------------------------------------------------------"
	@echo "                    ⚡ NEXUS PROTOCOL MAKEFILE ⚡                  "
	@echo "-----------------------------------------------------------------"
	@echo "Usage:"
	@echo "  make build            : Compile contracts"
	@echo "  make test             : Run all tests"
	@echo "  make test-unit        : Run only unit tests"
	@echo "  make test-integration : Run only integration tests"
	@echo "  make test-fuzz        : Run fuzz & invariant tests"
	@echo "  make coverage         : Generate coverage report"
	@echo "  make clean            : Clean artifacts"
	@echo "  make snapshot         : Generate gas snapshot"
	@echo "  make format           : Auto-format Solidity code"
	@echo "-----------------------------------------------------------------"
	@echo "                    DEPLOYMENT (SEPOLIA)                         "
	@echo "-----------------------------------------------------------------"
	@echo "  make deploy-oracles   : Phase 1 (PriceOracle)"
	@echo "  make deploy-core      : Phase 2 (PerpsVault, PositionManager, LiquidationEngine)"
	@echo "  make deploy-crosschain: Phase 3 (CrossChainRouter, MessageReceiver)"
	@echo "  make deploy-aa        : Phase 4 (SmartAccount, Factory, Paymaster)"
	@echo "  make deploy-full      : Deploy Entire System (Phase 1 to 4 combined)"
	@echo "-----------------------------------------------------------------"

# --- SETUP & TOOLS ---

all: clean install build

# Install dependencies
install:; forge install

# Update dependencies
update:; forge update

# Compile contracts
build:; forge build

# Clean artifacts
clean:; forge clean

# Generate Gas Snapshot
snapshot:; forge snapshot

# Format Code
format:; forge fmt

# Generate Coverage Report
coverage:; forge coverage

# --- TESTING ---

test:
	forge test

test-unit:
	forge test --match-path test/unit/*

test-integration:
	forge test --match-path test/integration/*

test-fuzz:
	forge test --match-path test/fuzz/*

test-gas:
	forge test --gas-report

# --- DEPLOYMENT ARGS (SEPOLIA) ---
NETWORK_ARGS := --rpc-url $(RPC_URL) --private-key $(PRIVATE_KEY) --broadcast --verify --etherscan-api-key $(ETHERSCAN_API_KEY) -vvvv

# --- DEPLOYMENT PHASES ---

deploy-oracles:
	@source .env && forge script script/deploy/01_DeployOracles.s.sol:DeployOracles $(NETWORK_ARGS)

deploy-core:
	@source .env && forge script script/deploy/02_DeployCore.s.sol:DeployCore $(NETWORK_ARGS)

deploy-crosschain:
	@source .env && forge script script/deploy/03_DeployCrossChain.s.sol:DeployCrossChain $(NETWORK_ARGS)

deploy-aa:
	@source .env && forge script script/deploy/04_DeployAA.s.sol:DeployAA $(NETWORK_ARGS)

deploy-full:
	@source .env && forge script script/deploy/05_FullDeploy.s.sol:FullDeploy $(NETWORK_ARGS)

# --- LOCAL DEPLOYMENT (ANVIL) ---
deploy-local:
	forge script script/deploy/05_FullDeploy.s.sol:FullDeploy --rpc-url http://localhost:8545 --private-key $(DEFAULT_ANVIL_KEY) --broadcast -vvvv

