// Generated from packages/attest-contracts (commit 6cd2a7f2). Do not edit by hand.
// Source: forge build -> PolicyValidationHook.json -> .abi
export const PolicyValidationHookAbi = [
  {
    type: "constructor",
    inputs: [
      {
        name: "_erc1155",
        type: "address",
        internalType: "contract IERC1155",
      },
      {
        name: "_tokenId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "attest",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IERC1155",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "erc1155",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IERC1155",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "policyId",
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
    stateMutability: "pure",
  },
  {
    type: "function",
    name: "tokenId",
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
    name: "validate",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "",
        type: "uint128",
        internalType: "uint128",
      },
      {
        name: "owner",
        type: "address",
        internalType: "address",
      },
      {
        name: "sender",
        type: "address",
        internalType: "address",
      },
      {
        name: "",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "view",
  },
  {
    type: "error",
    name: "InvalidTokenAddress",
    inputs: [],
  },
  {
    type: "error",
    name: "NotOwnerOfERC1155Token",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "SenderNotOwner",
    inputs: [],
  },
] as const
