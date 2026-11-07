// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "../../contracts/CampaignEscrow.sol";

interface Vm {
    function warp(uint256) external;
    function deal(address, uint256) external;
    function prank(address) external;
    function expectRevert(bytes4) external;
}

// Storage-free test proxy exercises delegatecall/initialization. This is NOT a PCL simulator.
contract TestProxy {
    address private immutable target;

    constructor(address implementation, bytes memory init) payable {
        target = implementation;
        (bool ok,) = implementation.delegatecall(init);
        require(ok, "init");
    }

    fallback() external payable {
        address t = target;
        assembly {
            calldatacopy(0, 0, calldatasize())
            let ok := delegatecall(gas(), t, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch ok
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}

contract RejectingRecipient {
    receive() external payable {
        revert();
    }
}

contract CampaignEscrowTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    CampaignEscrow escrow;
    address constant recipient = address(0xBEEF);
    bytes32 constant evidence = keccak256("verified evidence");

    function setUp() public {
        vm.warp(200);
        CampaignEscrow implementation = new CampaignEscrow();
        TestProxy proxy = new TestProxy(
            address(implementation),
            abi.encodeCall(
                CampaignEscrow.initialize,
                (
                    address(this),
                    keccak256("rules"),
                    uint64(100),
                    uint64(300),
                    uint256(500 ether),
                    uint64(100),
                    uint64(10),
                    uint64(1000)
                )
            )
        );
        escrow = CampaignEscrow(payable(address(proxy)));
        vm.deal(address(escrow), 1000 ether);
    }

    function approveValid(address to) internal {
        escrow.approve(to, evidence, 150, 100, 10, 1000, true);
    }

    function testValidPayoutAndReservation() public {
        approveValid(recipient);
        require(escrow.reserved() == 500 ether);
        escrow.pay(recipient);
        require(recipient.balance == 500 ether && escrow.reserved() == 0);
        (, bool approved, bool paid) = escrow.reviews(recipient);
        require(approved && paid);
    }

    function testRejectMissingKeyword() public {
        vm.expectRevert(CampaignEscrow.ConditionsNotMet.selector);
        escrow.approve(recipient, evidence, 150, 100, 10, 1000, false);
    }

    function testRejectBelowThreshold() public {
        vm.expectRevert(CampaignEscrow.ConditionsNotMet.selector);
        escrow.approve(recipient, evidence, 150, 99, 10, 1000, true);
    }

    function testRejectOldPost() public {
        vm.expectRevert(CampaignEscrow.ConditionsNotMet.selector);
        escrow.approve(recipient, evidence, 99, 100, 10, 1000, true);
    }

    function testRejectFuturePost() public {
        vm.expectRevert(CampaignEscrow.ConditionsNotMet.selector);
        escrow.approve(recipient, evidence, 201, 100, 10, 1000, true);
    }

    function testRejectUnapprovedPayout() public {
        vm.expectRevert(CampaignEscrow.NotApproved.selector);
        escrow.pay(recipient);
    }

    function testRejectUnauthorizedApproval() public {
        vm.prank(recipient);
        vm.expectRevert(CampaignEscrow.Unauthorized.selector);
        approveValid(recipient);
    }

    function testRejectDuplicatePayout() public {
        approveValid(recipient);
        escrow.pay(recipient);
        vm.expectRevert(CampaignEscrow.AlreadyPaid.selector);
        escrow.pay(recipient);
    }

    function testRejectDuplicateApproval() public {
        approveValid(recipient);
        vm.expectRevert(CampaignEscrow.AlreadyApproved.selector);
        approveValid(recipient);
    }

    function testRejectExpiredPayment() public {
        approveValid(recipient);
        vm.warp(301);
        vm.expectRevert(CampaignEscrow.OutsidePeriod.selector);
        escrow.pay(recipient);
    }

    function testRejectInsufficientBudget() public {
        approveValid(recipient);
        approveValid(address(2));
        vm.expectRevert(CampaignEscrow.InsufficientBudget.selector);
        approveValid(address(3));
    }

    function testRevertFailedTransferRestoresState() public {
        RejectingRecipient rejector = new RejectingRecipient();
        approveValid(address(rejector));
        vm.expectRevert(CampaignEscrow.TransferFailed.selector);
        escrow.pay(address(rejector));
        (,, bool paid) = escrow.reviews(address(rejector));
        require(!paid && escrow.reserved() == 500 ether);
    }

    function testCannotReinitialize() public {
        vm.expectRevert(CampaignEscrow.AlreadyInitialized.selector);
        escrow.initialize(address(this), evidence, 100, 300, 1, 1, 1, 1);
    }

    function testCannotRefundDuringPeriod() public {
        vm.expectRevert(CampaignEscrow.OutsidePeriod.selector);
        escrow.refundAfterEnd();
    }

    function testRefundAfterExpiration() public {
        approveValid(recipient);
        vm.warp(301);
        escrow.refundAfterEnd();
        require(address(escrow).balance == 0 && escrow.reserved() == 0);
    }
    receive() external payable {}
}
