// src/app/blockchain/contracts/certification-registry.abi.ts
export const CERTIFICATION_REGISTRY_ABI = [
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'string',
        name: 'productId',
        type: 'string',
      },
      {
        indexed: false,
        internalType: 'string',
        name: 'proofHash',
        type: 'string',
      },
      {
        indexed: false,
        internalType: 'string',
        name: 'ipfsCID',
        type: 'string',
      },
      {
        indexed: false,
        internalType: 'string',
        name: 'step',
        type: 'string',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'timestamp',
        type: 'uint256',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'certifier',
        type: 'address',
      },
    ],
    name: 'ProofRegistered',
    type: 'event',
  },
  {
    inputs: [
      {
        internalType: 'string',
        name: '_productId',
        type: 'string',
      },
      {
        internalType: 'string',
        name: '_proofHash',
        type: 'string',
      },
      {
        internalType: 'string',
        name: '_ipfsCID',
        type: 'string',
      },
      {
        internalType: 'string',
        name: '_step',
        type: 'string',
      },
      {
        internalType: 'string',
        name: '_checkpointId',
        type: 'string',
      },
    ],
    name: 'registerProof',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getProofCount',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'string',
        name: '_proofHash',
        type: 'string',
      },
    ],
    name: 'getProofInfo',
    outputs: [
      {
        internalType: 'string',
        name: '',
        type: 'string',
      },
      {
        internalType: 'string',
        name: '',
        type: 'string',
      },
      {
        internalType: 'string',
        name: '',
        type: 'string',
      },
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
      {
        internalType: 'address',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'string',
        name: '_proofHash',
        type: 'string',
      },
    ],
    name: 'proofExists',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'string',
        name: '_proofHash',
        type: 'string',
      },
    ],
    name: 'verifyProof',
    outputs: [
      {
        internalType: 'string',
        name: 'productId',
        type: 'string',
      },
      {
        internalType: 'string',
        name: 'ipfsCID',
        type: 'string',
      },
      {
        internalType: 'string',
        name: 'step',
        type: 'string',
      },
      {
        internalType: 'uint256',
        name: 'timestamp',
        type: 'uint256',
      },
      {
        internalType: 'address',
        name: 'certifier',
        type: 'address',
      },
      {
        internalType: 'bool',
        name: 'exists',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
];
