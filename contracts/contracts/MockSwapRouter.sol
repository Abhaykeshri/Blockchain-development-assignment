// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Minimal local-only router for task demos.
///         Supports ETH <-> ZYNC direct swaps at a 1:1 rate and
///         exposes the Uniswap V2-style methods used by the client.
contract MockSwapRouter {
    address public immutable token;
    address public immutable weth;

    constructor(address tokenAddress, address wethAddress) {
        token = tokenAddress;
        weth = wethAddress;
    }

    receive() external payable {}

    function getAmountsOut(uint256 amountIn, address[] calldata path) external pure returns (uint256[] memory amounts) {
        require(path.length >= 2, "path too short");
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        for (uint256 i = 1; i < path.length; i++) {
            amounts[i] = amounts[i - 1];
        }
    }

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256
    ) external payable returns (uint256[] memory amounts) {
        require(path.length >= 2, "path too short");
        require(path[0] == weth, "bad path");
        require(path[path.length - 1] == token, "bad path");
        uint256 amountOut = msg.value;
        require(amountOut >= amountOutMin, "insufficient output");
        require(IERC20(token).transfer(to, amountOut), "token transfer failed");
        amounts = new uint256[](path.length);
        amounts[0] = msg.value;
        for (uint256 i = 1; i < path.length; i++) {
            amounts[i] = amounts[i - 1];
        }
    }

    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256
    ) external returns (uint256[] memory amounts) {
        require(path.length >= 2, "path too short");
        require(path[0] == token, "bad path");
        require(path[path.length - 1] == weth, "bad path");
        require(IERC20(token).transferFrom(msg.sender, address(this), amountIn), "token pull failed");
        uint256 amountOut = amountIn;
        require(amountOut >= amountOutMin, "insufficient output");
        require(address(this).balance >= amountOut, "insufficient eth");
        (bool ok, ) = payable(to).call{value: amountOut}("");
        require(ok, "eth transfer failed");
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        for (uint256 i = 1; i < path.length; i++) {
            amounts[i] = amounts[i - 1];
        }
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256
    ) external returns (uint256[] memory amounts) {
        require(path.length >= 2, "path too short");
        require(IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn), "token pull failed");
        uint256 amountOut = amountIn;
        require(amountOut >= amountOutMin, "insufficient output");
        require(IERC20(path[path.length - 1]).transfer(to, amountOut), "token transfer failed");
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        for (uint256 i = 1; i < path.length; i++) {
            amounts[i] = amounts[i - 1];
        }
    }
}
