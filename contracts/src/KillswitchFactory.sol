// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {KillswitchAccount} from "./KillswitchAccount.sol";

/// @notice Deploys Killswitch accounts and keeps an owner -> accounts index for the dashboard.
contract KillswitchFactory {
    mapping(address => address[]) internal _accountsOf;

    event AccountCreated(address indexed owner, address account, address guardian);

    function createAccount(address guardian, bytes32 salt) external returns (address account) {
        account = address(new KillswitchAccount{salt: keccak256(abi.encode(msg.sender, salt))}(msg.sender, guardian));
        _accountsOf[msg.sender].push(account);
        emit AccountCreated(msg.sender, account, guardian);
    }

    function accountsOf(address owner) external view returns (address[] memory) {
        return _accountsOf[owner];
    }
}
