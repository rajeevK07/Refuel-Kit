// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {RefuelSwap} from "../src/RefuelSwap.sol";

/**
 * @notice Deploy RefuelSwap to Rootstock.
 *
 * Usage:
 *   forge script script/Deploy.s.sol:DeployRefuelSwap \
 *     --rpc-url rootstock_testnet \
 *     --broadcast --legacy \
 *     -vvvv
 */
contract DeployRefuelSwap is Script {
    // Testnet token addresses
    address constant TRIF = 0x19F64674D8A5B4E652319F5e239eFd3bc969A1fE;
    address constant TUSDC = 0x166844B69F20dD7c609b81Cca603fe81f19c54B9;

    // Mainnet token addresses
    address constant RIF = 0x2AcC95758f8b5F583470ba265EB685a8F45fC9D5;
    address constant USDC = 0xbB739A6e04d07b08E38B66ba137d0c9Cd270c750;

    // Swap rates
    uint256 constant TOKEN_AMOUNT = 50 ether;       // 50 RIF  (18 decimals) → 0.0001 RBTC
    uint256 constant USDC_TOKEN_AMOUNT = 5_000_000;  // 5 USDC  (6 decimals)  → 0.00001 RBTC
    uint256 constant RBTC_AMOUNT = 0.00001 ether;    // 0.00001 RBTC per 5-base units

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerKey);

        // 1. Deploy
        RefuelSwap refuel = new RefuelSwap(deployer);
        console.log("RefuelSwap deployed at:", address(refuel));

        // 2. Configure tokens based on chain
        if (block.chainid == 31) {
            // Testnet — tRIF (18 decimals)
            refuel.configureToken(TRIF, TOKEN_AMOUNT, RBTC_AMOUNT);
            console.log("Configured tRIF:", TRIF);

            // Testnet — tUSDC (18 decimals on testnet mock)
            // Note: testnet mock USDC uses 18 decimals unlike mainnet USDC (6 decimals)
            refuel.configureToken(TUSDC, TOKEN_AMOUNT, RBTC_AMOUNT);
            console.log("Configured tUSDC:", TUSDC);
        } else if (block.chainid == 30) {
            // Mainnet — RIF (18 decimals)
            refuel.configureToken(RIF, TOKEN_AMOUNT, RBTC_AMOUNT);
            console.log("Configured RIF:", RIF);

            // Mainnet — USDC (6 decimals)
            refuel.configureToken(USDC, USDC_TOKEN_AMOUNT, RBTC_AMOUNT);
            console.log("Configured USDC:", USDC);
        }

        // 3. Deposit initial liquidity (if deployer sends value)
        if (address(deployer).balance > 0.01 ether) {
            refuel.depositLiquidity{value: 0.01 ether}();
            console.log("Deposited 0.01 RBTC liquidity");
        }

        vm.stopBroadcast();
    }
}
