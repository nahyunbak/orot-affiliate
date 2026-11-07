// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice One campaign per PCL proxy. Instagram evidence is attested by the human reviewer.
/// @dev Deploy the implementation behind Maroo's registered PCL proxy; fund only the proxy.
contract CampaignEscrow {
    struct Review {
        bytes32 evidenceHash;
        bool approved;
        bool paid;
    }
    bool private initialized;
    address public reviewer;
    bytes32 public rulesHash;
    uint64 public startsAt;
    uint64 public endsAt;
    uint256 public reward;
    uint64 public minimumLikes;
    uint64 public minimumComments;
    uint64 public minimumViews;
    uint256 public reserved;
    mapping(address => Review) public reviews;

    error Unauthorized();
    error InvalidConfiguration();
    error AlreadyInitialized();
    error OutsidePeriod();
    error ConditionsNotMet();
    error AlreadyApproved();
    error NotApproved();
    error AlreadyPaid();
    error InsufficientBudget();
    error TransferFailed();

    event Approved(address indexed recipient, bytes32 indexed evidenceHash, uint256 amount);
    event Paid(address indexed recipient, bytes32 indexed evidenceHash, uint256 amount);
    event Funded(address indexed sender, uint256 amount);

    constructor() {
        initialized = true;
    }

    function initialize(
        address owner,
        bytes32 ruleCommitment,
        uint64 start,
        uint64 end,
        uint256 amount,
        uint64 likes,
        uint64 comments,
        uint64 views
    ) external {
        if (initialized) revert AlreadyInitialized();
        if (owner == address(0) || ruleCommitment == bytes32(0) || start >= end || amount == 0) {
            revert InvalidConfiguration();
        }
        initialized = true;
        reviewer = owner;
        rulesHash = ruleCommitment;
        startsAt = start;
        endsAt = end;
        reward = amount;
        minimumLikes = likes;
        minimumComments = comments;
        minimumViews = views;
    }

    modifier onlyReviewer() {
        if (msg.sender != reviewer) revert Unauthorized();
        _;
    }
    modifier inPeriod() {
        if (block.timestamp < startsAt || block.timestamp > endsAt) revert OutsidePeriod();
        _;
    }

    function campaign() external view returns (bytes32, address, uint64, uint64, uint256, uint64, uint64, uint64) {
        return (rulesHash, reviewer, startsAt, endsAt, reward, minimumLikes, minimumComments, minimumViews);
    }

    /// @dev Numeric evidence and keyword match are statements by the reviewer, not Instagram API proofs.
    function approve(
        address recipient,
        bytes32 evidence,
        uint64 postedAt,
        uint64 likes,
        uint64 comments,
        uint64 views,
        bool keywordsMet
    ) external onlyReviewer inPeriod {
        if (
            recipient == address(0) || recipient == address(this) || evidence == bytes32(0) || postedAt < startsAt
                || postedAt > endsAt || postedAt > block.timestamp || !keywordsMet || likes < minimumLikes
                || comments < minimumComments || views < minimumViews
        ) revert ConditionsNotMet();
        if (reviews[recipient].approved) revert AlreadyApproved();
        if (address(this).balance < reserved + reward) revert InsufficientBudget();
        reviews[recipient] = Review(evidence, true, false);
        reserved += reward;
        emit Approved(recipient, evidence, reward);
    }

    function pay(address recipient) external onlyReviewer inPeriod {
        Review storage review = reviews[recipient];
        if (!review.approved) revert NotApproved();
        if (review.paid) revert AlreadyPaid();
        review.paid = true;
        reserved -= reward;
        (bool success,) = recipient.call{value: reward}("");
        if (!success) revert TransferFailed();
        emit Paid(recipient, review.evidenceHash, reward);
    }

    /// @notice After the campaign ends, unclaimed approvals expire; no payout is allowed after endsAt.
    function refundAfterEnd() external onlyReviewer {
        if (block.timestamp <= endsAt) revert OutsidePeriod();
        reserved = 0;
        (bool success,) = reviewer.call{value: address(this).balance}("");
        if (!success) revert TransferFailed();
    }

    receive() external payable {
        emit Funded(msg.sender, msg.value);
    }
}
