// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {ERC20Permit, ERC20} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {RefuelSwap} from "../src/RefuelSwap.sol";

contract MockPermitToken is ERC20Permit {
    constructor() ERC20("Mock USDC", "mUSDC") ERC20Permit("Mock USDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract DeployMockUSDC is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address userAddress = 0x4E7fA7958e7F63508409E0045FE61D495d09D6FD;

        vm.startBroadcast(deployerKey);

        // 1. Deploy new token with permit support
        MockPermitToken newUsdc = new MockPermitToken();
        console.log("Deployed new MockPermitToken at:", address(newUsdc));

        // 2. Mint tokens to the user
        newUsdc.mint(userAddress, 50000 ether);
        console.log("Minted 50000 mUSDC to user");

        // 3. Configure existing RefuelSwap
        RefuelSwap refuel = RefuelSwap(payable(0xecB2f47FD664f0376562f2A3b3748B2b4C6f40a7));
        
        // 5 mUSDC = 0.001 RBTC -> 5e18 mUSDC -> 0.001 ether RBTC
        refuel.configureToken(address(newUsdc), 5 ether, 0.001 ether);
        console.log("Configured token in RefuelSwap");

        vm.stopBroadcast();
    }
}
