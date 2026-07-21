const { expect } = require("chai");
const hre = require("hardhat");

describe("ZyncToken", function () {
  async function deployToken() {
    const Z = await hre.ethers.getContractFactory("ZyncToken");
    const token = await Z.deploy(hre.ethers.parseEther("0.001"));
    await token.waitForDeployment();
    return token;
  }

  it("mints ZYNC for ETH at the public price", async function () {
    const [, buyer] = await hre.ethers.getSigners();
    const token = await deployToken();

    const tx = await token.connect(buyer).mintWithEth({ value: hre.ethers.parseEther("0.001") });
    await tx.wait();

    const bal = await token.balanceOf(buyer.address);
    expect(bal).to.equal(hre.ethers.parseEther("1"));

    expect(await hre.ethers.provider.getBalance(await token.getAddress())).to.equal(hre.ethers.parseEther("0.001"));
  });

  it("burns the caller's tokens", async function () {
    const [owner, buyer] = await hre.ethers.getSigners();
    const token = await deployToken();
    await token.connect(owner).mintTo(buyer.address, hre.ethers.parseEther("10"));

    await expect(token.connect(buyer).burn(hre.ethers.parseEther("3")))
      .to.emit(token, "Burned")
      .withArgs(buyer.address, hre.ethers.parseEther("3"));

    expect(await token.balanceOf(buyer.address)).to.equal(hre.ethers.parseEther("7"));
    expect(await token.totalSupply()).to.equal(hre.ethers.parseEther("7"));
  });

  it("reverts burn when balance is too low", async function () {
    const [, buyer] = await hre.ethers.getSigners();
    const token = await deployToken();

    await expect(token.connect(buyer).burn(hre.ethers.parseEther("1"))).to.be.reverted;
  });

  it("burnFrom works with approval", async function () {
    const [owner, holder, spender] = await hre.ethers.getSigners();
    const token = await deployToken();
    await token.connect(owner).mintTo(holder.address, hre.ethers.parseEther("8"));
    await token.connect(holder).approve(spender.address, hre.ethers.parseEther("5"));

    await expect(token.connect(spender).burnFrom(holder.address, hre.ethers.parseEther("4")))
      .to.emit(token, "Burned")
      .withArgs(holder.address, hre.ethers.parseEther("4"));

    expect(await token.balanceOf(holder.address)).to.equal(hre.ethers.parseEther("4"));
    expect(await token.allowance(holder.address, spender.address)).to.equal(hre.ethers.parseEther("1"));
  });

  it("reverts burnFrom without allowance", async function () {
    const [owner, holder, spender] = await hre.ethers.getSigners();
    const token = await deployToken();
    await token.connect(owner).mintTo(holder.address, hre.ethers.parseEther("2"));

    await expect(
      token.connect(spender).burnFrom(holder.address, hre.ethers.parseEther("1")),
    ).to.be.reverted;
  });
});
