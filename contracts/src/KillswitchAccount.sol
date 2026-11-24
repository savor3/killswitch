// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/utils/cryptography/EIP712.sol";
import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";

/// @title KillswitchAccount
/// @notice A non-custodial smart wallet. The owner keeps full control; AI agents get
///         narrow, capped, expiring permissions enforced by this contract. A guardian
///         can pause agents and co-sign large operations but can never spend or widen limits.
contract KillswitchAccount is EIP712 {
    using ECDSA for bytes32;

    // ------------------------------------------------------------------ types
    struct Call {
        address target;
        uint256 value;
        bytes data;
    }

    struct CallRule {
        address target;
        bytes4 selector;
    }

    struct SpendLimit {
        address token; // address(0) = native ETH
        uint128 maxPerPeriod; // cap in token units per period
        uint128 cosignAbove; // a single op moving more than this needs a guardian co-signature
        uint32 period; // seconds
    }

    struct Agent {
        address sessionKey;
        uint48 validUntil;
        uint64 epoch;
        uint64 nonce;
        bool paused;
        bool exists;
    }

    struct Window {
        uint64 start;
        uint128 used;
    }

    // ------------------------------------------------------------------ constants
    bytes32 public constant OP_TYPEHASH =
        keccak256("AgentOp(bytes32 agentId,bytes32 callsHash,uint256 nonce,uint256 deadline)");
    bytes4 private constant TRANSFER = 0xa9059cbb; // transfer(address,uint256)
    bytes4 private constant APPROVE = 0x095ea7b3; // approve(address,uint256)
    bytes4 private constant TRANSFER_FROM = 0x23b872dd; // transferFrom(address,address,uint256)
    uint256 public constant MAX_LIMITS = 8;
    uint256 public constant MAX_RULES = 16;

    // ------------------------------------------------------------------ storage
    address public owner;
    address public guardian;
    uint64 public epoch; // bumped by killAll(): invalidates every agent at once

    mapping(bytes32 => Agent) internal _agents;
    mapping(bytes32 => CallRule[]) internal _rules;
    mapping(bytes32 => SpendLimit[]) internal _limits;
    mapping(bytes32 => mapping(address => mapping(bytes4 => bool))) internal _allowed;
    mapping(bytes32 => mapping(address => Window)) internal _windows;
    bytes32[] internal _agentIds;

    bool private _locked;

    // ------------------------------------------------------------------ events
    event AgentGranted(bytes32 indexed agentId, address sessionKey, uint48 validUntil, string label);
    event AgentRevoked(bytes32 indexed agentId);
    event AgentPaused(bytes32 indexed agentId, address by);
    event AgentUnpaused(bytes32 indexed agentId);
    event KilledAll(uint64 newEpoch);
    event GuardianChanged(address guardian);
    event AgentExecuted(bytes32 indexed agentId, uint64 nonce, address submitter, bool cosigned, uint256[] outflows);
    event OwnerExecuted(uint256 calls);

    // ------------------------------------------------------------------ errors
    error NotOwner();
    error NotOwnerOrGuardian();
    error UnknownAgent();
    error AgentIsPaused();
    error AgentKilled();
    error PermissionExpired();
    error DeadlinePassed();
    error BadAgentSignature();
    error CallNotAllowed(address target, bytes4 selector);
    error SelfCallForbidden();
    error NativeValueNotAllowed();
    error UncappedTokenRule(address token);
    error CapExceeded(address token, uint256 used, uint256 max);
    error CosignRequired(address token, uint256 outflow, uint256 threshold);
    error BadGuardianSignature();
    error DanglingAllowance(address token, address spender);
    error SpenderNotAllowed(address token, address spender);
    error CallFailed(uint256 index, bytes reason);
    error TooMany();
    error BadPeriod();
    error Reentrancy();
    error SimulationResult(uint256[] outflows);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (_locked) revert Reentrancy();
        _locked = true;
        _;
        _locked = false;
    }

    constructor(address owner_, address guardian_) EIP712("Killswitch", "1") {
        owner = owner_;
        guardian = guardian_;
        emit GuardianChanged(guardian_);
    }

    receive() external payable {}

    // ================================================================== owner
    /// @notice The owner can always act directly. Killswitch never stands between an owner and their funds.
    function execute(Call[] calldata calls) external onlyOwner nonReentrant {
        for (uint256 i; i < calls.length; ++i) {
            (bool ok, bytes memory ret) = calls[i].target.call{value: calls[i].value}(calls[i].data);
            if (!ok) revert CallFailed(i, ret);
        }
        emit OwnerExecuted(calls.length);
    }

    function grant(
        bytes32 agentId,
        string calldata label,
        address sessionKey,
        uint48 validUntil,
        CallRule[] calldata rules,
        SpendLimit[] calldata limits
    ) external onlyOwner {
        if (rules.length > MAX_RULES || limits.length > MAX_LIMITS) revert TooMany();
        if (!_agents[agentId].exists) _agentIds.push(agentId);
        _clear(agentId);

        for (uint256 i; i < limits.length; ++i) {
            if (limits[i].period == 0) revert BadPeriod();
            _limits[agentId].push(limits[i]);
        }
        for (uint256 i; i < rules.length; ++i) {
            CallRule calldata r = rules[i];
            if (r.target == address(this)) revert SelfCallForbidden();
            // any token-moving selector must be on a token that is capped
            if (r.selector == TRANSFER || r.selector == APPROVE || r.selector == TRANSFER_FROM) {
                if (_limitIndex(agentId, r.target) == type(uint256).max) revert UncappedTokenRule(r.target);
            }
            _allowed[agentId][r.target][r.selector] = true;
            _rules[agentId].push(r);
        }

        _agents[agentId] = Agent({
            sessionKey: sessionKey,
            validUntil: validUntil,
            epoch: epoch,
            nonce: _agents[agentId].nonce, // keep nonce monotonic across re-grants
            paused: false,
            exists: true
        });
        emit AgentGranted(agentId, sessionKey, validUntil, label);
    }

    function revoke(bytes32 agentId) external onlyOwner {
        if (!_agents[agentId].exists) revert UnknownAgent();
        _clear(agentId);
        _agents[agentId].exists = false;
        _agents[agentId].sessionKey = address(0);
        emit AgentRevoked(agentId);
    }

    /// @notice The big red button: every agent permission dies in one transaction.
    function killAll() external onlyOwner {
        unchecked {
            epoch++;
        }
        emit KilledAll(epoch);
    }

    function pause(bytes32 agentId) external {
        if (msg.sender != owner && msg.sender != guardian) revert NotOwnerOrGuardian();
        if (!_agents[agentId].exists) revert UnknownAgent();
        _agents[agentId].paused = true;
        emit AgentPaused(agentId, msg.sender);
    }

    /// @notice Only the owner can resume an agent. Guardians can stop, never start.
    function unpause(bytes32 agentId) external onlyOwner {
        if (!_agents[agentId].exists) revert UnknownAgent();
        _agents[agentId].paused = false;
        emit AgentUnpaused(agentId);
    }

    function setGuardian(address guardian_) external onlyOwner {
        guardian = guardian_;
        emit GuardianChanged(guardian_);
    }

    // ================================================================== agents
    /// @notice Anyone may submit (relay, agent itself, anyone). Authority comes only from the signatures.
    function executeAsAgent(
        bytes32 agentId,
        Call[] calldata calls,
        uint256 deadline,
        bytes calldata agentSig,
        bytes calldata guardianSig
    ) external nonReentrant returns (uint256[] memory outflows) {
        Agent storage a = _agents[agentId];
        _checkAgent(a);
        if (block.timestamp > deadline) revert DeadlinePassed();

        bytes32 digest = opDigest(agentId, calls, a.nonce, deadline);
        if (digest.recover(agentSig) != a.sessionKey) revert BadAgentSignature();
        uint64 usedNonce = a.nonce;
        a.nonce = usedNonce + 1;

        bool needsCosign;
        (outflows, needsCosign) = _run(agentId, calls);

        bool cosigned;
        if (guardianSig.length != 0) {
            if (digest.recover(guardianSig) != guardian) revert BadGuardianSignature();
            cosigned = true;
        }
        if (needsCosign && !cosigned) _revertCosign(agentId, outflows);

        emit AgentExecuted(agentId, usedNonce, msg.sender, cosigned, outflows);
    }

    /// @notice Dry run used by the guardian. Always reverts; state is never kept.
    ///         Reverts with SimulationResult(outflows) on success, or the policy error that would fire.
    function simulate(bytes32 agentId, Call[] calldata calls) external nonReentrant {
        _checkAgent(_agents[agentId]);
        (uint256[] memory outflows,) = _run(agentId, calls);
        revert SimulationResult(outflows);
    }

    // ================================================================== views
    function opDigest(bytes32 agentId, Call[] calldata calls, uint256 nonce, uint256 deadline)
        public
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(
            keccak256(abi.encode(OP_TYPEHASH, agentId, keccak256(abi.encode(calls)), nonce, deadline))
        );
    }

    function getAgent(bytes32 agentId) external view returns (Agent memory a, bool active) {
        a = _agents[agentId];
        active = a.exists && !a.paused && a.epoch == epoch && block.timestamp <= a.validUntil;
    }

    function getRules(bytes32 agentId) external view returns (CallRule[] memory) {
        return _rules[agentId];
    }

    function getLimits(bytes32 agentId) external view returns (SpendLimit[] memory) {
        return _limits[agentId];
    }

    function agentIds() external view returns (bytes32[] memory) {
        return _agentIds;
    }

    /// @return used amount used in the current window, max the cap, resetsAt when the window rolls
    function spent(bytes32 agentId, address token) external view returns (uint256 used, uint256 max, uint256 resetsAt) {
        uint256 li = _limitIndex(agentId, token);
        if (li == type(uint256).max) return (0, 0, 0);
        SpendLimit storage l = _limits[agentId][li];
        Window storage w = _windows[agentId][token];
        if (block.timestamp >= uint256(w.start) + l.period) return (0, l.maxPerPeriod, block.timestamp + l.period);
        return (w.used, l.maxPerPeriod, uint256(w.start) + l.period);
    }

    // ================================================================== internals
    function _checkAgent(Agent storage a) internal view {
        if (!a.exists) revert UnknownAgent();
        if (a.epoch != epoch) revert AgentKilled();
        if (a.paused) revert AgentIsPaused();
        if (block.timestamp > a.validUntil) revert PermissionExpired();
    }

    function _run(bytes32 agentId, Call[] calldata calls)
        internal
        returns (uint256[] memory outflows, bool needsCosign)
    {
        SpendLimit[] storage limits = _limits[agentId];
        uint256 n = limits.length;

        // 1. allowlist
        for (uint256 i; i < calls.length; ++i) {
            Call calldata c = calls[i];
            if (c.target == address(this)) revert SelfCallForbidden();
            bytes4 sel = c.data.length >= 4 ? bytes4(c.data[:4]) : bytes4(0);
            if (!_allowed[agentId][c.target][sel]) revert CallNotAllowed(c.target, sel);
            // approve / increaseAllowance / setApprovalForAll may only name a contract the agent is
            // itself allowed to call: an allowance to an outside address could be spent later via
            // transferFrom, outside this wallet, where no cap would see it.
            if (sel == 0x095ea7b3 || sel == 0x39509351 || sel == 0xa22cb465) {
                if (c.data.length < 36) revert CallNotAllowed(c.target, sel);
                address spender = address(uint160(uint256(bytes32(c.data[4:36]))));
                if (spender == c.target || !_isRuleTarget(agentId, spender)) revert SpenderNotAllowed(c.target, spender);
            }
            if (c.value != 0 && _limitIndex(agentId, address(0)) == type(uint256).max) revert NativeValueNotAllowed();
        }

        // 2. snapshot balances of every capped asset
        uint256[] memory before = new uint256[](n);
        for (uint256 j; j < n; ++j) before[j] = _balance(limits[j].token);

        // 3. execute
        for (uint256 i; i < calls.length; ++i) {
            (bool ok, bytes memory ret) = calls[i].target.call{value: calls[i].value}(calls[i].data);
            if (!ok) revert CallFailed(i, ret);
        }

        // 4. measure real outflow, enforce caps
        outflows = new uint256[](n);
        for (uint256 j; j < n; ++j) {
            SpendLimit storage l = limits[j];
            uint256 afterBal = _balance(l.token);
            uint256 out = before[j] > afterBal ? before[j] - afterBal : 0;
            outflows[j] = out;
            if (out == 0) continue;

            Window storage w = _windows[agentId][l.token];
            if (block.timestamp >= uint256(w.start) + l.period) {
                w.start = uint64(block.timestamp);
                w.used = 0;
            }
            uint256 used = uint256(w.used) + out;
            if (used > l.maxPerPeriod) revert CapExceeded(l.token, used, l.maxPerPeriod);
            w.used = uint128(used);
            if (out > l.cosignAbove) needsCosign = true;
        }

        // 5. no leftover approvals: an agent may approve only what it spends in the same op
        CallRule[] storage rules = _rules[agentId];
        for (uint256 j; j < n; ++j) {
            address token = limits[j].token;
            if (token == address(0)) continue;
            for (uint256 r; r < rules.length; ++r) {
                address spender = rules[r].target;
                if (spender == token) continue;
                if (IERC20(token).allowance(address(this), spender) != 0) revert DanglingAllowance(token, spender);
            }
        }
    }

    function _revertCosign(bytes32 agentId, uint256[] memory outflows) internal view {
        SpendLimit[] storage limits = _limits[agentId];
        for (uint256 j; j < limits.length; ++j) {
            if (outflows[j] > limits[j].cosignAbove) {
                revert CosignRequired(limits[j].token, outflows[j], limits[j].cosignAbove);
            }
        }
    }

    function _clear(bytes32 agentId) internal {
        CallRule[] storage rules = _rules[agentId];
        for (uint256 i; i < rules.length; ++i) {
            delete _allowed[agentId][rules[i].target][rules[i].selector];
        }
        delete _rules[agentId];
        SpendLimit[] storage limits = _limits[agentId];
        for (uint256 i; i < limits.length; ++i) {
            delete _windows[agentId][limits[i].token];
        }
        delete _limits[agentId];
    }

    function _isRuleTarget(bytes32 agentId, address who) internal view returns (bool) {
        CallRule[] storage rules = _rules[agentId];
        for (uint256 r; r < rules.length; ++r) if (rules[r].target == who) return true;
        return false;
    }

    function _limitIndex(bytes32 agentId, address token) internal view returns (uint256) {
        SpendLimit[] storage limits = _limits[agentId];
        for (uint256 i; i < limits.length; ++i) {
            if (limits[i].token == token) return i;
        }
        return type(uint256).max;
    }

    function _balance(address token) internal view returns (uint256) {
        return token == address(0) ? address(this).balance : IERC20(token).balanceOf(address(this));
    }
}
