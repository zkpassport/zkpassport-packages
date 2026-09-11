// Generated from packages/attest-contracts (commit 7ee650d6). Do not edit by hand.
// Source: forge build -> PolicyEvaluatorV1.json -> .abi
export const PolicyEvaluatorV1Abi = [
  {
    type: "constructor",
    inputs: [
      {
        name: "_rootVerifier",
        type: "address",
        internalType: "contract IRootVerifier",
      },
      {
        name: "_devMode",
        type: "bool",
        internalType: "bool",
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
    name: "decodeProofData",
    inputs: [
      {
        name: "proofData",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [
      {
        name: "",
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
    stateMutability: "pure",
  },
  {
    type: "function",
    name: "decodeRequirements",
    inputs: [
      {
        name: "requirements",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct PolicyEvaluatorV1.PolicyRequirements",
        components: [
          {
            name: "uniqueIdentifierType",
            type: "uint8",
            internalType: "enum NullifierType",
          },
          {
            name: "enforceUniqueness",
            type: "bool",
            internalType: "bool",
          },
          {
            name: "minAge",
            type: "uint8",
            internalType: "uint8",
          },
          {
            name: "sanctionsMode",
            type: "uint8",
            internalType: "enum PolicyEvaluatorV1.SanctionsMode",
          },
          {
            name: "faceMatchMode",
            type: "uint8",
            internalType: "enum FaceMatchMode",
          },
          {
            name: "includedNationalities",
            type: "string[]",
            internalType: "string[]",
          },
          {
            name: "excludedNationalities",
            type: "string[]",
            internalType: "string[]",
          },
        ],
      },
    ],
    stateMutability: "pure",
  },
  {
    type: "function",
    name: "devMode",
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
    name: "evaluate",
    inputs: [
      {
        name: "domain",
        type: "string",
        internalType: "string",
      },
      {
        name: "subscope",
        type: "string",
        internalType: "string",
      },
      {
        name: "requirements",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "proofData",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [
      {
        name: "result",
        type: "tuple",
        internalType: "struct PolicyEvaluationResult",
        components: [
          {
            name: "wallet",
            type: "address",
            internalType: "address",
          },
          {
            name: "nullifier",
            type: "bytes32",
            internalType: "bytes32",
          },
          {
            name: "unique",
            type: "bool",
            internalType: "bool",
          },
          {
            name: "customData",
            type: "string",
            internalType: "string",
          },
        ],
      },
    ],
    stateMutability: "view",
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
    name: "schemaVersion",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "pure",
  },
  {
    type: "function",
    name: "validateRequirements",
    inputs: [
      {
        name: "requirements",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "pure",
  },
  {
    type: "error",
    name: "PolicyEvaluator__AgeRequirementNotMet",
    inputs: [],
  },
  {
    type: "error",
    name: "PolicyEvaluator__DevModeProofRejected",
    inputs: [],
  },
  {
    type: "error",
    name: "PolicyEvaluator__ExcludedNationality",
    inputs: [],
  },
  {
    type: "error",
    name: "PolicyEvaluator__FaceMatchRequirementNotMet",
    inputs: [],
  },
  {
    type: "error",
    name: "PolicyEvaluator__InvalidCountryList",
    inputs: [],
  },
  {
    type: "error",
    name: "PolicyEvaluator__InvalidProof",
    inputs: [],
  },
  {
    type: "error",
    name: "PolicyEvaluator__NationalityNotIncluded",
    inputs: [],
  },
  {
    type: "error",
    name: "PolicyEvaluator__ProofNotBoundToChain",
    inputs: [],
  },
  {
    type: "error",
    name: "PolicyEvaluator__SaltedNullifierRequiresStrictFaceMatch",
    inputs: [],
  },
  {
    type: "error",
    name: "PolicyEvaluator__StaleProof",
    inputs: [],
  },
  {
    type: "error",
    name: "PolicyEvaluator__UniquenessRequiresNullifierType",
    inputs: [],
  },
  {
    type: "error",
    name: "PolicyEvaluator__WrongNullifierType",
    inputs: [],
  },
  {
    type: "error",
    name: "PolicyEvaluator__WrongScope",
    inputs: [],
  },
  {
    type: "error",
    name: "PolicyEvaluator__ZeroAddress",
    inputs: [],
  },
] as const
