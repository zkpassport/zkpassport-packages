// Generated from packages/attest-contracts (commit 27d48639). Do not edit by hand.
// Source: forge build -> MockAuction.json -> .abi + .bytecode.object
// Regenerate: bun packages/attest-demo/scripts/generate-mock-auction.mjs
export const MockAuctionAbi = [
  {
    type: "constructor",
    inputs: [
      {
        name: "_validationHook",
        type: "address",
        internalType: "contract IValidationHook",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "bidCount",
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
    name: "submitBid",
    inputs: [
      {
        name: "maxPrice",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "amount",
        type: "uint128",
        internalType: "uint128",
      },
      {
        name: "owner",
        type: "address",
        internalType: "address",
      },
      {
        name: "hookData",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "validationHook",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IValidationHook",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "BidAccepted",
    inputs: [
      {
        name: "owner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "sender",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "maxPrice",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "amount",
        type: "uint128",
        indexed: false,
        internalType: "uint128",
      },
    ],
    anonymous: false,
  },
] as const

export const MockAuctionBytecode =
  "0x60a0604052348015600e575f5ffd5b50604051610395380380610395833981016040819052602b91603b565b6001600160a01b03166080526066565b5f60208284031215604a575f5ffd5b81516001600160a01b0381168114605f575f5ffd5b9392505050565b60805161030c6100895f395f8181605d0152818160b4015260f8015261030c5ff3fe608060405234801561000f575f5ffd5b506004361061003f575f3560e01c8063140fe8ee146100435780638134f02714610058578063b40a56271461009c575b5f5ffd5b6100566100513660046101cd565b6100b2565b005b61007f7f000000000000000000000000000000000000000000000000000000000000000081565b6040516001600160a01b0390911681526020015b60405180910390f35b6100a45f5481565b604051908152602001610093565b7f00000000000000000000000000000000000000000000000000000000000000006001600160a01b031615610165576040516322c44b5f60e01b81526001600160a01b037f000000000000000000000000000000000000000000000000000000000000000016906322c44b5f906101379088908890889033908990899060040161027c565b5f604051808303815f87803b15801561014e575f5ffd5b505af1158015610160573d5f5f3e3d5ffd5b505050505b5f80549080610173836102db565b9091555050604080518681526001600160801b038616602082015233916001600160a01b038616917f525cdee365c7533e6ea36af737f4e152637e7ff2360fb9a7ed8ff77723b27c26910160405180910390a35050505050565b5f5f5f5f5f608086880312156101e1575f5ffd5b8535945060208601356001600160801b03811681146101fe575f5ffd5b935060408601356001600160a01b0381168114610219575f5ffd5b9250606086013567ffffffffffffffff811115610234575f5ffd5b8601601f81018813610244575f5ffd5b803567ffffffffffffffff81111561025a575f5ffd5b88602082840101111561026b575f5ffd5b959894975092955050506020019190565b8681526001600160801b03861660208201526001600160a01b0385811660408301528416606082015260a0608082018190528101829052818360c08301375f81830160c090810191909152601f909201601f1916010195945050505050565b5f600182016102f857634e487b7160e01b5f52601160045260245ffd5b506001019056fea164736f6c634300081e000a" as `0x${string}`
