// Generated from packages/attest-contracts (commit ff39efce). Do not edit by hand.
// Source: forge build -> ZKPassportCredentials.json -> .abi
export const ZKPassportCredentialsAbi = [
  {
    type: "constructor",
    inputs: [
      {
        name: "_domain",
        type: "string",
        internalType: "string",
      },
      {
        name: "_admin",
        type: "address",
        internalType: "address",
      },
      {
        name: "_policyEvaluator",
        type: "address",
        internalType: "contract IPolicyEvaluator",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "admin",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [
      {
        name: "account",
        type: "address",
        internalType: "address",
      },
      {
        name: "id",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "balanceOfBatch",
    inputs: [
      {
        name: "accounts",
        type: "address[]",
        internalType: "address[]",
      },
      {
        name: "ids",
        type: "uint256[]",
        internalType: "uint256[]",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256[]",
        internalType: "uint256[]",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "banned",
    inputs: [
      {
        name: "wallet",
        type: "address",
        internalType: "address",
      },
      {
        name: "policyId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "createPolicy",
    inputs: [
      {
        name: "salt",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "requirements",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "credentialDuration",
        type: "uint64",
        internalType: "uint64",
      },
      {
        name: "metadataURL",
        type: "string",
        internalType: "string",
      },
      {
        name: "ownerIssuable",
        type: "bool",
        internalType: "bool",
      },
      {
        name: "ownerRevocable",
        type: "bool",
        internalType: "bool",
      },
    ],
    outputs: [
      {
        name: "policyId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "domain",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "string",
        internalType: "string",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPolicy",
    inputs: [
      {
        name: "policyId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct ZKPassportCredentials.Policy",
        components: [
          {
            name: "owner",
            type: "address",
            internalType: "address",
          },
          {
            name: "credentialDuration",
            type: "uint64",
            internalType: "uint64",
          },
          {
            name: "ownerIssuable",
            type: "bool",
            internalType: "bool",
          },
          {
            name: "ownerRevocable",
            type: "bool",
            internalType: "bool",
          },
          {
            name: "evaluator",
            type: "address",
            internalType: "address",
          },
          {
            name: "requirements",
            type: "bytes",
            internalType: "bytes",
          },
          {
            name: "metadataURL",
            type: "string",
            internalType: "string",
          },
          {
            name: "retiredAt",
            type: "uint64",
            internalType: "uint64",
          },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "heldUntil",
    inputs: [
      {
        name: "wallet",
        type: "address",
        internalType: "address",
      },
      {
        name: "policyId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint64",
        internalType: "uint64",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isApprovedForAll",
    inputs: [
      {
        name: "account",
        type: "address",
        internalType: "address",
      },
      {
        name: "operator",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "issue",
    inputs: [
      {
        name: "policyId",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "proofData",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "nullifierWallet",
    inputs: [
      {
        name: "policyId",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "nullifier",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "wallet",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "ownerIssue",
    inputs: [
      {
        name: "wallet",
        type: "address",
        internalType: "address",
      },
      {
        name: "policyId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "pause",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "paused",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "policyEvaluator",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IPolicyEvaluator",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "policyScope",
    inputs: [
      {
        name: "policyId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "string",
        internalType: "string",
      },
    ],
    stateMutability: "pure",
  },
  {
    type: "function",
    name: "retire",
    inputs: [
      {
        name: "policyId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "revoke",
    inputs: [
      {
        name: "wallet",
        type: "address",
        internalType: "address",
      },
      {
        name: "policyId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "safeBatchTransferFrom",
    inputs: [
      {
        name: "from",
        type: "address",
        internalType: "address",
      },
      {
        name: "to",
        type: "address",
        internalType: "address",
      },
      {
        name: "ids",
        type: "uint256[]",
        internalType: "uint256[]",
      },
      {
        name: "values",
        type: "uint256[]",
        internalType: "uint256[]",
      },
      {
        name: "data",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "safeTransferFrom",
    inputs: [
      {
        name: "from",
        type: "address",
        internalType: "address",
      },
      {
        name: "to",
        type: "address",
        internalType: "address",
      },
      {
        name: "id",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "value",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "data",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setApprovalForAll",
    inputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
      {
        name: "",
        type: "bool",
        internalType: "bool",
      },
    ],
    outputs: [],
    stateMutability: "pure",
  },
  {
    type: "function",
    name: "setDomain",
    inputs: [
      {
        name: "newDomain",
        type: "string",
        internalType: "string",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setMetadataURL",
    inputs: [
      {
        name: "policyId",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "url",
        type: "string",
        internalType: "string",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setPolicyEvaluator",
    inputs: [
      {
        name: "newEvaluator",
        type: "address",
        internalType: "contract IPolicyEvaluator",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "supportsInterface",
    inputs: [
      {
        name: "interfaceId",
        type: "bytes4",
        internalType: "bytes4",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "transferAdmin",
    inputs: [
      {
        name: "newAdmin",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "unban",
    inputs: [
      {
        name: "wallet",
        type: "address",
        internalType: "address",
      },
      {
        name: "policyId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "unpause",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "uri",
    inputs: [
      {
        name: "policyId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "string",
        internalType: "string",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "AdminUpdated",
    inputs: [
      {
        name: "oldAdmin",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "newAdmin",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ApprovalForAll",
    inputs: [
      {
        name: "account",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "operator",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "approved",
        type: "bool",
        indexed: false,
        internalType: "bool",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "CredentialIssued",
    inputs: [
      {
        name: "wallet",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "policyId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "heldUntil",
        type: "uint64",
        indexed: false,
        internalType: "uint64",
      },
      {
        name: "customData",
        type: "string",
        indexed: false,
        internalType: "string",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "CredentialIssuedByPolicyOwner",
    inputs: [
      {
        name: "wallet",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "policyId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "heldUntil",
        type: "uint64",
        indexed: false,
        internalType: "uint64",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "CredentialRenewed",
    inputs: [
      {
        name: "wallet",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "policyId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "heldUntil",
        type: "uint64",
        indexed: false,
        internalType: "uint64",
      },
      {
        name: "customData",
        type: "string",
        indexed: false,
        internalType: "string",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "CredentialRevoked",
    inputs: [
      {
        name: "wallet",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "policyId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "by",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "DomainUpdated",
    inputs: [
      {
        name: "oldDomain",
        type: "string",
        indexed: false,
        internalType: "string",
      },
      {
        name: "newDomain",
        type: "string",
        indexed: false,
        internalType: "string",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "PausedStatusChanged",
    inputs: [
      {
        name: "paused",
        type: "bool",
        indexed: false,
        internalType: "bool",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "PolicyCreated",
    inputs: [
      {
        name: "policyId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "owner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "PolicyEvaluatorUpdated",
    inputs: [
      {
        name: "oldEvaluator",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "newEvaluator",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "PolicyMetadataURLUpdated",
    inputs: [
      {
        name: "policyId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "url",
        type: "string",
        indexed: false,
        internalType: "string",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "PolicyRetired",
    inputs: [
      {
        name: "policyId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "TransferBatch",
    inputs: [
      {
        name: "operator",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "from",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "to",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "ids",
        type: "uint256[]",
        indexed: false,
        internalType: "uint256[]",
      },
      {
        name: "values",
        type: "uint256[]",
        indexed: false,
        internalType: "uint256[]",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "TransferSingle",
    inputs: [
      {
        name: "operator",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "from",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "to",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "id",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "value",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "URI",
    inputs: [
      {
        name: "value",
        type: "string",
        indexed: false,
        internalType: "string",
      },
      {
        name: "id",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "WalletBanned",
    inputs: [
      {
        name: "wallet",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "policyId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "WalletUnbanned",
    inputs: [
      {
        name: "wallet",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "policyId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "error",
    name: "ERC1155InsufficientBalance",
    inputs: [
      {
        name: "sender",
        type: "address",
        internalType: "address",
      },
      {
        name: "balance",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "needed",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "ERC1155InvalidApprover",
    inputs: [
      {
        name: "approver",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    type: "error",
    name: "ERC1155InvalidArrayLength",
    inputs: [
      {
        name: "idsLength",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "valuesLength",
        type: "uint256",
        internalType: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "ERC1155InvalidOperator",
    inputs: [
      {
        name: "operator",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    type: "error",
    name: "ERC1155InvalidReceiver",
    inputs: [
      {
        name: "receiver",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    type: "error",
    name: "ERC1155InvalidSender",
    inputs: [
      {
        name: "sender",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    type: "error",
    name: "ERC1155MissingApprovalForAll",
    inputs: [
      {
        name: "operator",
        type: "address",
        internalType: "address",
      },
      {
        name: "owner",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    type: "error",
    name: "StringsInsufficientHexLength",
    inputs: [
      {
        name: "value",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "length",
        type: "uint256",
        internalType: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "ZKPassportCredentials__InvalidCredentialDuration",
    inputs: [],
  },
  {
    type: "error",
    name: "ZKPassportCredentials__MissingNullifier",
    inputs: [],
  },
  {
    type: "error",
    name: "ZKPassportCredentials__NotAuthorized",
    inputs: [],
  },
  {
    type: "error",
    name: "ZKPassportCredentials__NotBanned",
    inputs: [],
  },
  {
    type: "error",
    name: "ZKPassportCredentials__NotIssuableByOwner",
    inputs: [],
  },
  {
    type: "error",
    name: "ZKPassportCredentials__NotPolicyOwner",
    inputs: [],
  },
  {
    type: "error",
    name: "ZKPassportCredentials__NotRevocable",
    inputs: [],
  },
  {
    type: "error",
    name: "ZKPassportCredentials__NothingToRevoke",
    inputs: [],
  },
  {
    type: "error",
    name: "ZKPassportCredentials__Paused",
    inputs: [],
  },
  {
    type: "error",
    name: "ZKPassportCredentials__PolicyAlreadyExists",
    inputs: [
      {
        name: "policyId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "ZKPassportCredentials__PolicyNotFound",
    inputs: [
      {
        name: "policyId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "ZKPassportCredentials__PolicyRetired",
    inputs: [
      {
        name: "policyId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "ZKPassportCredentials__SybilDetected",
    inputs: [
      {
        name: "nullifier",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
  },
  {
    type: "error",
    name: "ZKPassportCredentials__TokenIsSoulbound",
    inputs: [],
  },
  {
    type: "error",
    name: "ZKPassportCredentials__WalletBanned",
    inputs: [],
  },
  {
    type: "error",
    name: "ZKPassportCredentials__ZeroAddress",
    inputs: [],
  },
] as const
