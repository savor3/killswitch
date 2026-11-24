// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";

/// @notice Fixed-price two-token exchange for demos. price = units of tokenB (scaled 1e18) per 1 whole tokenA.
contract MockDEX {
    IERC20 public immutable tokenA; // e.g. USDC (6 dp)
    IERC20 public immutable tokenB; // e.g. WETH (18 dp)
    uint256 public immutable aPerB; // tokenA base units per 1e18 tokenB base units (e.g. 3000e6)

    event Swapped(address indexed trader, address tokenIn, uint256 amountIn, uint256 amountOut);

    constructor(IERC20 a, IERC20 b, uint256 aPerB_) {
        tokenA = a;
        tokenB = b;
        aPerB = aPerB_;
    }

    function quote(address tokenIn, uint256 amountIn) public view returns (uint256) {
        if (tokenIn == address(tokenA)) return amountIn * 1e18 / aPerB;
        if (tokenIn == address(tokenB)) return amountIn * aPerB / 1e18;
        revert("bad token");
    }

    function swapExactIn(address tokenIn, uint256 amountIn, uint256 minOut) external returns (uint256 out) {
        out = quote(tokenIn, amountIn);
        require(out >= minOut, "slippage");
        IERC20 tIn = IERC20(tokenIn);
        IERC20 tOut = tokenIn == address(tokenA) ? tokenB : tokenA;
        require(tIn.transferFrom(msg.sender, address(this), amountIn), "pull");
        require(tOut.transfer(msg.sender, out), "push");
        emit Swapped(msg.sender, tokenIn, amountIn, out);
    }
}
