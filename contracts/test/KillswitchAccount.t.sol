// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {KillswitchAccount} from "../src/KillswitchAccount.sol";
import {KillswitchFactory} from "../src/KillswitchFactory.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockDEX} from "../src/mocks/MockDEX.sol";

contract KillswitchAccountTest is Test {
    KillswitchFactory factory;
    KillswitchAccount acct;
    MockERC20 usdc;
    MockERC20 weth;
    MockDEX dex;

    address owner = makeAddr("owner");
    uint256 guardianPk = 0xA11CE;
    address guardian;
    uint256 agentPk = 0xB0B;
    address agentKey;
    address attacker = makeAddr("attacker");
    address vendor = makeAddr("vendor");

    bytes32 constant TRADER = keccak256("trader");
    bytes32 constant PAYER = keccak256("payer");

    function setUp() public {
        guardian = vm.addr(guardianPk);
        agentKey = vm.addr(agentPk);
        usdc = new MockERC20("USD Coin", "USDC", 6);
        weth = new MockERC20("Wrapped Ether", "WETH", 18);
        dex = new MockDEX(usdc, weth, 3000e6);
        weth.mint(address(dex), 1000 ether);
        usdc.mint(address(dex), 1_000_000e6);

        factory = new KillswitchFactory();
        vm.prank(owner);
        acct = KillswitchAccount(payable(factory.createAccount(guardian, bytes32(0))));
        usdc.mint(address(acct), 1000e6);

        // trader: approve + swap USDC, capped 100/day, cosign above 50
        KillswitchAccount.CallRule[] memory rules = new KillswitchAccount.CallRule[](2);
        rules[0] = KillswitchAccount.CallRule(address(usdc), usdc.approve.selector);
        rules[1] = KillswitchAccount.CallRule(address(dex), dex.swapExactIn.selector);
        KillswitchAccount.SpendLimit[] memory lims = new KillswitchAccount.SpendLimit[](1);
        lims[0] = KillswitchAccount.SpendLimit(address(usdc), 100e6, 50e6, 1 days);
        vm.prank(owner);
        acct.grant(TRADER, "trader", agentKey, uint48(block.timestamp + 7 days), rules, lims);

        // payer: USDC transfer, capped 50/day, cosign above 20
        KillswitchAccount.CallRule[] memory r2 = new KillswitchAccount.CallRule[](1);
        r2[0] = KillswitchAccount.CallRule(address(usdc), usdc.transfer.selector);
        KillswitchAccount.SpendLimit[] memory l2 = new KillswitchAccount.SpendLimit[](1);
        l2[0] = KillswitchAccount.SpendLimit(address(usdc), 50e6, 20e6, 1 days);
        vm.prank(owner);
        acct.grant(PAYER, "payer", agentKey, uint48(block.timestamp + 7 days), r2, l2);
    }

    // ---------------------------------------------------------------- helpers
    function _swapCalls(uint256 amt) internal view returns (KillswitchAccount.Call[] memory c) {
        c = new KillswitchAccount.Call[](2);
        c[0] = KillswitchAccount.Call(address(usdc), 0, abi.encodeCall(usdc.approve, (address(dex), amt)));
        c[1] = KillswitchAccount.Call(address(dex), 0, abi.encodeCall(dex.swapExactIn, (address(usdc), amt, 0)));
    }

    function _payCalls(address to, uint256 amt) internal view returns (KillswitchAccount.Call[] memory c) {
        c = new KillswitchAccount.Call[](1);
        c[0] = KillswitchAccount.Call(address(usdc), 0, abi.encodeCall(usdc.transfer, (to, amt)));
    }

    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _exec(bytes32 id, KillswitchAccount.Call[] memory calls, bool cosign) internal {
        (KillswitchAccount.Agent memory a,) = acct.getAgent(id);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 d = acct.opDigest(id, calls, a.nonce, deadline);
        acct.executeAsAgent(id, calls, deadline, _sign(agentPk, d), cosign ? _sign(guardianPk, d) : bytes(""));
    }

    // ---------------------------------------------------------------- happy path
    function test_agentSwapWithinCap() public {
        _exec(TRADER, _swapCalls(40e6), false);
        assertEq(usdc.balanceOf(address(acct)), 960e6);
        assertGt(weth.balanceOf(address(acct)), 0);
        (uint256 used, uint256 max,) = acct.spent(TRADER, address(usdc));
        assertEq(used, 40e6);
        assertEq(max, 100e6);
    }

    function test_ownerAlwaysHasFullAccess() public {
        vm.prank(owner);
        acct.killAll();
        vm.prank(owner);
        acct.execute(_payCalls(owner, 1000e6));
        assertEq(usdc.balanceOf(owner), 1000e6);
    }

    // ---------------------------------------------------------------- caps
    function test_capExceededReverts() public {
        _exec(TRADER, _swapCalls(45e6), false);
        _exec(TRADER, _swapCalls(45e6), false);
        KillswitchAccount.Call[] memory c = _swapCalls(20e6);
        vm.expectRevert(abi.encodeWithSelector(KillswitchAccount.CapExceeded.selector, address(usdc), 110e6, 100e6));
        this.execExternal(TRADER, c, false);
    }

    function test_drainAttemptBlocked() public {
        vm.expectRevert(abi.encodeWithSelector(KillswitchAccount.CapExceeded.selector, address(usdc), 1000e6, 50e6));
        this.execExternal(PAYER, _payCalls(attacker, 1000e6), true);
        assertEq(usdc.balanceOf(attacker), 0);
    }

    function test_windowResetsAfterPeriod() public {
        _exec(PAYER, _payCalls(vendor, 20e6), false);
        _exec(PAYER, _payCalls(vendor, 20e6), false);
        vm.expectRevert();
        this.execExternal(PAYER, _payCalls(vendor, 20e6), false);
        vm.warp(block.timestamp + 1 days + 1);
        _exec(PAYER, _payCalls(vendor, 20e6), false);
        assertEq(usdc.balanceOf(vendor), 60e6);
    }

    // ---------------------------------------------------------------- allowlist
    function test_callNotAllowed() public {
        // trader may not call transfer
        vm.expectRevert(
            abi.encodeWithSelector(KillswitchAccount.CallNotAllowed.selector, address(usdc), usdc.transfer.selector)
        );
        this.execExternal(TRADER, _payCalls(attacker, 1e6), false);
    }

    function test_danglingAllowanceBlocked() public {
        KillswitchAccount.Call[] memory c = new KillswitchAccount.Call[](1);
        c[0] = KillswitchAccount.Call(address(usdc), 0, abi.encodeCall(usdc.approve, (address(dex), type(uint256).max)));
        vm.expectRevert(abi.encodeWithSelector(KillswitchAccount.DanglingAllowance.selector, address(usdc), address(dex)));
        this.execExternal(TRADER, c, false);
    }

    function test_cannotGrantUncappedTokenRule() public {
        KillswitchAccount.CallRule[] memory rules = new KillswitchAccount.CallRule[](1);
        rules[0] = KillswitchAccount.CallRule(address(weth), weth.transfer.selector);
        KillswitchAccount.SpendLimit[] memory lims = new KillswitchAccount.SpendLimit[](1);
        lims[0] = KillswitchAccount.SpendLimit(address(usdc), 1e6, 1e6, 1 days);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(KillswitchAccount.UncappedTokenRule.selector, address(weth)));
        acct.grant(keccak256("x"), "x", agentKey, uint48(block.timestamp + 1 days), rules, lims);
    }

    // ---------------------------------------------------------------- co-sign
    function test_cosignRequiredAboveThreshold() public {
        vm.expectRevert(abi.encodeWithSelector(KillswitchAccount.CosignRequired.selector, address(usdc), 30e6, 20e6));
        this.execExternal(PAYER, _payCalls(vendor, 30e6), false);
        _exec(PAYER, _payCalls(vendor, 30e6), true);
        assertEq(usdc.balanceOf(vendor), 30e6);
    }

    function test_badGuardianSigRejected() public {
        KillswitchAccount.Call[] memory c = _payCalls(vendor, 30e6);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 d = acct.opDigest(PAYER, c, 0, deadline);
        vm.expectRevert(KillswitchAccount.BadGuardianSignature.selector);
        acct.executeAsAgent(PAYER, c, deadline, _sign(agentPk, d), _sign(0xBAD, d));
    }

    // ---------------------------------------------------------------- signatures
    function test_badAgentSigRejected() public {
        KillswitchAccount.Call[] memory c = _payCalls(vendor, 1e6);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 d = acct.opDigest(PAYER, c, 0, deadline);
        vm.expectRevert(KillswitchAccount.BadAgentSignature.selector);
        acct.executeAsAgent(PAYER, c, deadline, _sign(0xBAD, d), "");
    }

    function test_replayRejected() public {
        KillswitchAccount.Call[] memory c = _payCalls(vendor, 1e6);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 d = acct.opDigest(PAYER, c, 0, deadline);
        bytes memory sig = _sign(agentPk, d);
        acct.executeAsAgent(PAYER, c, deadline, sig, "");
        vm.expectRevert(KillswitchAccount.BadAgentSignature.selector);
        acct.executeAsAgent(PAYER, c, deadline, sig, "");
    }

    function test_deadline() public {
        KillswitchAccount.Call[] memory c = _payCalls(vendor, 1e6);
        uint256 deadline = block.timestamp + 10;
        bytes32 d = acct.opDigest(PAYER, c, 0, deadline);
        vm.warp(block.timestamp + 11);
        vm.expectRevert(KillswitchAccount.DeadlinePassed.selector);
        acct.executeAsAgent(PAYER, c, deadline, _sign(agentPk, d), "");
    }

    // ---------------------------------------------------------------- stop controls
    function test_guardianPauseOnlyOwnerUnpause() public {
        vm.prank(guardian);
        acct.pause(PAYER);
        vm.expectRevert(KillswitchAccount.AgentIsPaused.selector);
        this.execExternal(PAYER, _payCalls(vendor, 1e6), false);
        vm.prank(guardian);
        vm.expectRevert(KillswitchAccount.NotOwner.selector);
        acct.unpause(PAYER);
        vm.prank(owner);
        acct.unpause(PAYER);
        _exec(PAYER, _payCalls(vendor, 1e6), false);
    }

    function test_guardianCannotGrantOrSpend() public {
        KillswitchAccount.CallRule[] memory rules = new KillswitchAccount.CallRule[](0);
        KillswitchAccount.SpendLimit[] memory lims = new KillswitchAccount.SpendLimit[](0);
        vm.startPrank(guardian);
        vm.expectRevert(KillswitchAccount.NotOwner.selector);
        acct.grant(keccak256("g"), "g", guardian, type(uint48).max, rules, lims);
        vm.expectRevert(KillswitchAccount.NotOwner.selector);
        acct.execute(_payCalls(guardian, 1e6));
        vm.expectRevert(KillswitchAccount.NotOwner.selector);
        acct.setGuardian(attacker);
        vm.stopPrank();
    }

    function test_strangerCannotPause() public {
        vm.prank(attacker);
        vm.expectRevert(KillswitchAccount.NotOwnerOrGuardian.selector);
        acct.pause(PAYER);
    }

    function test_killAllStopsEveryAgent() public {
        vm.prank(owner);
        acct.killAll();
        vm.expectRevert(KillswitchAccount.AgentKilled.selector);
        this.execExternal(PAYER, _payCalls(vendor, 1e6), false);
        vm.expectRevert(KillswitchAccount.AgentKilled.selector);
        this.execExternal(TRADER, _swapCalls(1e6), false);
    }

    function test_revoke() public {
        vm.prank(owner);
        acct.revoke(PAYER);
        vm.expectRevert(KillswitchAccount.UnknownAgent.selector);
        this.execExternal(PAYER, _payCalls(vendor, 1e6), false);
    }

    function test_expiry() public {
        vm.warp(block.timestamp + 8 days);
        vm.expectRevert(KillswitchAccount.PermissionExpired.selector);
        this.execExternal(PAYER, _payCalls(vendor, 1e6), false);
    }

    // ---------------------------------------------------------------- simulation
    function test_simulateRevertsWithOutflowsAndKeepsNoState() public {
        uint256[] memory expected = new uint256[](1);
        expected[0] = 10e6;
        vm.expectRevert(abi.encodeWithSelector(KillswitchAccount.SimulationResult.selector, expected));
        acct.simulate(PAYER, _payCalls(vendor, 10e6));
        assertEq(usdc.balanceOf(vendor), 0);
        (uint256 used,,) = acct.spent(PAYER, address(usdc));
        assertEq(used, 0);
    }

    // ---------------------------------------------------------------- fuzz: total outflow never exceeds cap
    function testFuzz_outflowNeverExceedsCap(uint96[6] memory amts) public {
        uint256 total;
        for (uint256 i; i < amts.length; ++i) {
            uint256 amt = bound(amts[i], 1, 200e6);
            try this.execExternal(PAYER, _payCalls(attacker, amt), true) {
                total += amt;
            } catch {}
        }
        assertLe(total, 50e6);
        assertEq(usdc.balanceOf(attacker), total);
    }

    function execExternal(bytes32 id, KillswitchAccount.Call[] memory calls, bool cosign) external {
        _exec(id, calls, cosign);
    }
}
