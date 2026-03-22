# RIF Relay Setup Guide

This guide walks through deploying the RIF Relay infrastructure needed for **production gasless refueling** on Rootstock.

> **TL;DR**: RIF Relay V1 contracts are already deployed on testnet. You only need to deploy a **RIF Relay Server** and register it.

## Official Testnet Addresses (V1)

| Contract | Address |
|---|---|
| RelayHub | `0xAd525463961399793f8716b0D85133ff7503a7C2` |
| RelayVerifier | `0xB86c972Ff212838C4c396199B27a0DBe45560df8` |
| DeployVerifier | `0xc67f193Bb1D64F13FD49E2da6586a2F417e56b16` |

Source: [Rootstock Dev Portal — RIF Relay Contracts](https://dev.rootstock.io/developers/integrate/rif-relay/contracts/)

---

## Step 1: Deploy RIF Relay Contracts (optional — already deployed on testnet)

If deploying your **own** infrastructure:

```bash
git clone https://github.com/rsksmart/rif-relay-contracts
cd rif-relay-contracts
npm install

# Testnet
npx hardhat deploy --network testnet

# Mainnet
npx hardhat deploy --network mainnet
```

After deployment, you'll see a summary with all contract addresses (RelayHub, SmartWallet, SmartWalletFactory, Verifiers, etc).

---

## Step 2: Allow Tokens on Verifiers

Whitelist tRIF and tUSDC so the relay accepts them as fee payment:

```bash
# In rif-relay-contracts directory
npx hardhat allow-tokens --network testnet \
  --token-list 0x19F64674D8A5B4E652319F5e239eFd3bc969A1fE,0x166844B69F20dD7c609b81Cca603fe81f19c54B9
```

> Only the deployer account can allow tokens.

---

## Step 3: Run the RIF Relay Server

Clone and configure the server:

```bash
git clone https://github.com/rsksmart/rif-relay-server
cd rif-relay-server
npm install
```

Create `config/local.json`:

```json
{
  "app": {
    "url": "https://your-relay-server.example.com",
    "port": 8090,
    "devMode": false,
    "logLevel": 1,
    "feePercentage": "0"
  },
  "blockchain": {
    "rskNodeUrl": "https://rpc.testnet.rootstock.io/{YOUR_API_KEY}"
  },
  "contracts": {
    "relayHubAddress": "0xAd525463961399793f8716b0D85133ff7503a7C2",
    "relayVerifierAddress": "0xB86c972Ff212838C4c396199B27a0DBe45560df8",
    "deployVerifierAddress": "0xc67f193Bb1D64F13FD49E2da6586a2F417e56b16"
  }
}
```

Start the server:

```bash
NODE_ENV=testnet npm run start
```

---

## Step 4: Register the Relay Server

Once the server is running, get the worker/manager addresses:

```bash
curl http://localhost:8090/chain-info
```

Send tRBTC (e.g. 0.001) to both the `relayWorkerAddress` and `relayManagerAddress`, then register:

```bash
npm run register
```

The server is now ready to process relay transactions.

---

## Using with Refuel SDK

```typescript
import { RefuelClient, RIF_RELAY_TESTNET_ADDRESSES } from "@rootstock-kits/refuel-sdk";

const client = new RefuelClient({
  chainId: 31,
  rifRelay: {
    preferredRelays: ["https://your-relay-server.example.com"],
    relayHubAddress: RIF_RELAY_TESTNET_ADDRESSES.relayHubAddress,
    deployVerifierAddress: RIF_RELAY_TESTNET_ADDRESSES.deployVerifierAddress,
    relayVerifierAddress: RIF_RELAY_TESTNET_ADDRESSES.relayVerifierAddress,
    smartWalletFactoryAddress: "0x...", // your deployed factory
    callForwarder: "0x...",            // user's smart wallet
    feeToken: "0x19f64674d8a5b4e652319f5e239efd3bc969a1fe", // tRIF
    maxFeeTokenAmount: 50_000_000_000_000_000_000n,
  },
});
```

---

## References

- [RIF Relay Overview](https://dev.rootstock.io/developers/integrate/rif-relay/overview/)
- [RIF Relay Architecture](https://dev.rootstock.io/developers/integrate/rif-relay/architecture/)
- [RIF Relay Deployment Guide](https://dev.rootstock.io/developers/integrate/rif-relay/deployment/)
- [RIF Relay Contracts](https://github.com/rsksmart/rif-relay-contracts)
- [RIF Relay Server](https://github.com/rsksmart/rif-relay-server)
- [RIF Relay Client](https://github.com/rsksmart/rif-relay-client)
