// CertificationRegistry.sol
pragma solidity ^0.8.19;

contract CertificationRegistry {
    struct CertificationProof {
        string productId;
        string proofHash;
        string ipfsCID;
        string step;
        string checkpointId;
        uint256 timestamp;
        address certifiedBy;
    }

    event ProofRegistered(
        string indexed productId,
        string proofHash,
        string ipfsCID,
        string step,
        uint256 timestamp,
        address indexed certifier
    );

    // Mapping pour stocker les preuves par hash
    mapping(string => CertificationProof) private proofs;

    // Enregistrer une preuve de certification
    function registerProof(
        string memory _productId,
        string memory _proofHash,
        string memory _ipfsCID,
        string memory _step,
        string memory _checkpointId
    ) public {
        require(bytes(_proofHash).length > 0, "Proof hash required");
        require(bytes(_ipfsCID).length > 0, "IPFS CID required");

        CertificationProof memory newProof = CertificationProof({
            productId: _productId,
            proofHash: _proofHash,
            ipfsCID: _ipfsCID,
            step: _step,
            checkpointId: _checkpointId,
            timestamp: block.timestamp,
            certifiedBy: msg.sender
        });

        proofs[_proofHash] = newProof;

        emit ProofRegistered(
            _productId,
            _proofHash,
            _ipfsCID,
            _step,
            block.timestamp,
            msg.sender
        );
    }

    // Vérifier une preuve
    function verifyProof(string memory _proofHash) public view returns (
        string memory productId,
        string memory ipfsCID,
        string memory step,
        uint256 timestamp,
        address certifier,
        bool exists
    ) {
        CertificationProof memory proof = proofs[_proofHash];
        return (
            proof.productId,
            proof.ipfsCID,
            proof.step,
            proof.timestamp,
            proof.certifiedBy,
            bytes(proof.proofHash).length > 0
        );
    }

    // Obtenir le nombre total de preuves
    function getProofCount() public view returns (uint256) {
        // Note: Ceci est une version simplifiée
        return 0;
    }
}
