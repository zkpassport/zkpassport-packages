// Generated from packages/attest-contracts (commit 6cd2a7f2). Do not edit by hand.
// Source: forge build -> ZKPassportAttest.json -> .abi
export const ZKPassportAttestAbi = [
  {
    type: "constructor",
    inputs: [
      {
        name: "_rootVerifier",
        type: "address",
        internalType: "contract IRootVerifier",
      },
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
        name: "_guardian",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "PROOF_FRESHNESS",
    inputs: [],
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
    name: "createPolicy",
    inputs: [
      {
        name: "salt",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "validityPeriod",
        type: "uint64",
        internalType: "uint64",
      },
      {
        name: "unique",
        type: "bool",
        internalType: "bool",
      },
      {
        name: "saltedNullifierOnly",
        type: "bool",
        internalType: "bool",
      },
      {
        name: "minAge",
        type: "uint8",
        internalType: "uint8",
      },
      {
        name: "sanctionsCheck",
        type: "bool",
        internalType: "bool",
      },
      {
        name: "excludedCountries",
        type: "string[]",
        internalType: "string[]",
      },
      {
        name: "metadataURL",
        type: "string",
        internalType: "string",
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
        internalType: "struct ZKPassportAttest.Policy",
        components: [
          {
            name: "owner",
            type: "address",
            internalType: "address",
          },
          {
            name: "validityPeriod",
            type: "uint64",
            internalType: "uint64",
          },
          {
            name: "unique",
            type: "bool",
            internalType: "bool",
          },
          {
            name: "saltedNullifierOnly",
            type: "bool",
            internalType: "bool",
          },
          {
            name: "minAge",
            type: "uint8",
            internalType: "uint8",
          },
          {
            name: "sanctionsCheck",
            type: "bool",
            internalType: "bool",
          },
          {
            name: "excludedCountries",
            type: "string[]",
            internalType: "string[]",
          },
          {
            name: "metadataURL",
            type: "string",
            internalType: "string",
          },
          {
            name: "hook",
            type: "address",
            internalType: "address",
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
    name: "guardian",
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
        name: "wallet",
        type: "address",
        internalType: "address",
      },
      {
        name: "policyId",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "params",
        type: "tuple",
        internalType: "struct ProofVerificationParams",
        components: [
          {
            name: "version",
            type: "bytes32",
            internalType: "bytes32",
          },
          {
            name: "proofVerificationData",
            type: "tuple",
            internalType: "struct ProofVerificationData",
            components: [
              {
                name: "vkeyHash",
                type: "bytes32",
                internalType: "bytes32",
              },
              {
                name: "proof",
                type: "bytes",
                internalType: "bytes",
              },
              {
                name: "publicInputs",
                type: "bytes32[]",
                internalType: "bytes32[]",
              },
            ],
          },
          {
            name: "committedInputs",
            type: "bytes",
            internalType: "bytes",
          },
          {
            name: "serviceConfig",
            type: "tuple",
            internalType: "struct ServiceConfig",
            components: [
              {
                name: "validityPeriodInSeconds",
                type: "uint256",
                internalType: "uint256",
              },
              {
                name: "domain",
                type: "string",
                internalType: "string",
              },
              {
                name: "scope",
                type: "string",
                internalType: "string",
              },
              {
                name: "devMode",
                type: "bool",
                internalType: "bool",
              },
            ],
          },
        ],
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
    name: "rootVerifier",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IRootVerifier",
      },
    ],
    stateMutability: "view",
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
    name: "setGuardian",
    inputs: [
      {
        name: "newGuardian",
        type: "address",
        internalType: "address",
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
    name: "GuardianUpdated",
    inputs: [
      {
        name: "oldGuardian",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "newGuardian",
        type: "address",
        indexed: true,
        internalType: "address",
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
      {
        name: "hook",
        type: "address",
        indexed: false,
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
    name: "ZKPassportAttest__AgeBelowMinimum",
    inputs: [],
  },
  {
    type: "error",
    name: "ZKPassportAttest__DevModeNotAllowed",
    inputs: [],
  },
  {
    type: "error",
    name: "ZKPassportAttest__ExcludedJurisdiction",
    inputs: [],
  },
  {
    type: "error",
    name: "ZKPassportAttest__InvalidProof",
    inputs: [],
  },
  {
    type: "error",
    name: "ZKPassportAttest__InvalidValidityPeriod",
    inputs: [],
  },
  {
    type: "error",
    name: "ZKPassportAttest__MissingNullifier",
    inputs: [],
  },
  {
    type: "error",
    name: "ZKPassportAttest__NotAuthorized",
    inputs: [],
  },
  {
    type: "error",
    name: "ZKPassportAttest__NotPolicyOwner",
    inputs: [],
  },
  {
    type: "error",
    name: "ZKPassportAttest__NotRevocable",
    inputs: [],
  },
  {
    type: "error",
    name: "ZKPassportAttest__NothingToRevoke",
    inputs: [],
  },
  {
    type: "error",
    name: "ZKPassportAttest__Paused",
    inputs: [],
  },
  {
    type: "error",
    name: "ZKPassportAttest__PolicyAlreadyExists",
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
    name: "ZKPassportAttest__PolicyNotFound",
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
    name: "ZKPassportAttest__PolicyRetired",
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
    name: "ZKPassportAttest__ProofNotBoundToChain",
    inputs: [],
  },
  {
    type: "error",
    name: "ZKPassportAttest__ProofNotBoundToWallet",
    inputs: [],
  },
  {
    type: "error",
    name: "ZKPassportAttest__SaltedNullifierRequired",
    inputs: [],
  },
  {
    type: "error",
    name: "ZKPassportAttest__StaleProof",
    inputs: [],
  },
  {
    type: "error",
    name: "ZKPassportAttest__SybilDetected",
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
    name: "ZKPassportAttest__TokenIsSoulbound",
    inputs: [],
  },
  {
    type: "error",
    name: "ZKPassportAttest__UnexpectedBoundData",
    inputs: [],
  },
  {
    type: "error",
    name: "ZKPassportAttest__WrongScope",
    inputs: [],
  },
  {
    type: "error",
    name: "ZKPassportAttest__ZeroAddress",
    inputs: [],
  },
] as const
