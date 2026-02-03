export const environment = {
  production: false,
  firebase: {
    apiKey: 'AIzaSyB-_uOj14gB2CLzesf04S1z-vxBgwhvC4Y',
    authDomain: 'jokko-agro-2f241.firebaseapp.com',
    projectId: 'jokko-agro-2f241',
    storageBucket: 'jokko-agro-2f241.firebasestorage.app',
    messagingSenderId: '284485584728',
    appId: '1:284485584728:web:d1c438950ac0043eef072d',
    measurementId: 'G-JP1J9SSLKM',
  },

  ipfs: {
    pinataApiKey: 'b7e6a5f2989ef4f017ae',
    pinataSecretApiKey: '9febeff31ba53fce9f006b47f058c240be4bc5d4bcc0f5db1f03ded0352ad458',
    pinataJWT: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiIzN2YwMGJkMi0wNGM2LTRiMDctYjUzYy05NTBjZTQxYjM0NjgiLCJlbWFpbCI6Im1lbnRhbGlzdW0yMEBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGluX3BvbGljeSI6eyJyZWdpb25zIjpbeyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJGUkExIn0seyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJOWUMxIn1dLCJ2ZXJzaW9uIjoxfSwibWZhX2VuYWJsZWQiOmZhbHNlLCJzdGF0dXMiOiJBQ1RJVkUifSwiYXV0aGVudGljYXRpb25UeXBlIjoic2NvcGVkS2V5Iiwic2NvcGVkS2V5S2V5IjoiYjdlNmE1ZjI5ODllZjRmMDE3YWUiLCJzY29wZWRLZXlTZWNyZXQiOiI5ZmViZWZmMzFiYTUzZmNlOWYwMDZiNDdmMDU4YzI0MGJlNGJjNWQ0YmNjMGY1ZGIxZjAzZGVkMDM1MmFkNDU4IiwiZXhwIjoxODAxNTc3MTg4fQ.mWuK1KHl82aK-eNDeQjXn6m4jpD8oqOARPC1EzeWeiU',
  },

  blockchain: {
    // 🔹 VOTRE CLÉ ALCHEMY COMPLÈTE (à obtenir)
    alchemyApiKey: 'uLs1ZBKv2ch32H67aOa6d',

    // 🔹 Pour TEST : utilisez "sepolia" (gratuit, faucet disponible)
    // 🔹 Pour PRODUCTION : utilisez "mainnet" (coûte des vrais ETH)
    network: 'sepolia', // Commencez avec "sepolia" pour tester gratuitement

    contractAddress: '', // On créera plus tard

    // 🔹 VOTRE CLÉ ETHERSCAN (à obtenir)
    etherscanApiKey: '13Q6GHJW6S6J5MBKSSTNFYYSCGBNKJB6VX',

    // 🔹 CONFIGURATION SÉPOLIA (recommandée pour commencer)
    sepolia: {
      rpcUrl: 'https://eth-sepolia.g.alchemy.com/v2/demo-api-key-Ujr3Tz-P7En6BmfI_1o8-Dvak-a6tER3',
      chainId: 11155111,
      explorer: 'https://sepolia.etherscan.io'
    },

    // 🔹 CONFIGURATION MAINNET (pour plus tard)
    mainnet: {
      rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/demo-api-key-Ujr3Tz-P7En6BmfI_1o8-Dvak-a6tER3',
      chainId: 1,
      explorer: 'https://etherscan.io'
    }
  }
};
