// Generated from packages/attest-contracts (commit 3354254d). Do not edit by hand.
// Source: forge build -> PolicyEvaluatorV1.json -> .abi
export const PolicyEvaluatorV1Abi = [
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
    name: "validate",
    inputs: [
      {
        name: "requirements",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "helper",
        type: "address",
        internalType: "contract IVerifierHelper",
      },
      {
        name: "committedInputs",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "publicInputs",
        type: "bytes32[]",
        internalType: "bytes32[]",
      },
    ],
    outputs: [
      {
        name: "unique",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "view",
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
    name: "PolicyEvaluator__InvalidNullifierType",
    inputs: [],
  },
  {
    type: "error",
    name: "PolicyEvaluator__NationalityNotIncluded",
    inputs: [],
  },
  {
    type: "error",
    name: "PolicyEvaluator__SaltedNullifierRequiresStrictFaceMatch",
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
] as const
