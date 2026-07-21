const hre = require("hardhat");

// Default: 0.0001 ETH per 1 ZYNC (1e18 token wei)
const DEFAULT_MINT_PRICE = hre.ethers.parseEther("0.0001");

async function main() {
  const price =
    process.env.MINT_PRICE_WEI !== undefined && process.env.MINT_PRICE_WEI !== ""
      ? BigInt(process.env.MINT_PRICE_WEI)
      : DEFAULT_MINT_PRICE;

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const Zync = await hre.ethers.getContractFactory("ZyncToken");
  const token = await Zync.deploy(price);
  await token.waitForDeployment();
  const addr = await token.getAddress();
  console.log("ZyncToken:", addr);
  console.log("mintPriceWei:", price.toString());

  const Weth = await hre.ethers.getContractFactory("MockWETH9");
  const weth = await Weth.deploy();
  await weth.waitForDeployment();
  const wethAddr = await weth.getAddress();
  console.log("MockWETH9:", wethAddr);

  const Router = await hre.ethers.getContractFactory("MockSwapRouter");
  const router = await Router.deploy(addr, wethAddr);
  await router.waitForDeployment();
  const routerAddr = await router.getAddress();
  console.log("MockSwapRouter:", routerAddr);

  // Seed the router with liquidity so the local demo can execute swaps.
  const seedZync = hre.ethers.parseEther("1000000");
  await (await token.mintTo(routerAddr, seedZync)).wait();
  await (await deployer.sendTransaction({ to: routerAddr, value: hre.ethers.parseEther("1000") })).wait();

  console.log("SWAP_ROUTER_ADDRESS:", routerAddr);
  console.log("WETH_ADDRESS:", wethAddr);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
