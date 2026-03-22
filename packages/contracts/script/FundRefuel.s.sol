// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {RefuelSwap} from "../src/RefuelSwap.sol";

contract FundRefuel is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        RefuelSwap refuel = RefuelSwap(
            payable(0xecB2f47FD664f0376562f2A3b3748B2b4C6f40a7)
        );

        // 1. Update payout to 0.0001 RBTC per user request
        address mUSDC = 0x6491A87c4a710c0cE79E60aEC0B1C3e847F4C852;
        refuel.configureToken(mUSDC, 5 ether, 0.0001 ether);
        console.log("Updated payout to 0.0001 RBTC");

        // 2. Deposit liquidity (0.0001 RBTC)
        refuel.depositLiquidity{value: 0.0001 ether}();
        console.log("Deposited 0.0001 RBTC liquidity");

        vm.stopBroadcast();
    }
}
