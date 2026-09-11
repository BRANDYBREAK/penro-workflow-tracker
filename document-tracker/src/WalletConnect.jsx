import { useState } from 'react';
import { ethers } from 'ethers';

export default function WalletConnect() {
  const [walletAddress, setWalletAddress] = useState("");
  const [status, setStatus] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  async function connectWallet() {
    if (isConnecting) return;

    if (!window.ethereum) {
      setStatus("MetaMask is required.");
      return;
    }

    try {
      setIsConnecting(true);
      setStatus("Opening MetaMask...");

      // 1. Force switch to Sepolia (Chain ID: 0xaa36a7)
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0xaa36a7' }],
        });
      } catch (switchError) {
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: '0xaa36a7',
                chainName: 'Sepolia Testnet',
                nativeCurrency: { name: 'SepoliaETH', symbol: 'ETH', decimals: 18 },
                rpcUrls: ['https://rpc.sepolia.org'],
                blockExplorerUrls: ['https://sepolia.etherscan.io'],
              },
            ],
          });
        } else {
          throw switchError;
        }
      }

      // 2. Connect with Ethers v6
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      
      setWalletAddress(address);
      setStatus("Wallet connected successfully!");

    } catch (err) {
      console.error(err);
      if (err.info?.error?.code === -32002 || err.code === -32002) {
        setStatus("MetaMask prompt is already open. Please check your browser extension.");
      } else {
        setStatus(`Error: ${err.reason || err.message}`);
      }
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <div className="p-8 w-full max-w-md bg-white border-4 border-black mx-auto">
      <h2 className="text-2xl font-black text-black mb-6 uppercase tracking-widest text-center">System Access</h2>
      
      {status && (
        <div className="mb-6 p-4 bg-black text-white text-xs font-mono border-2 border-black">
           {status}
        </div>
      )}

      {walletAddress ? (
        <div className="p-4 border-4 border-black bg-white">
          <p className="text-xs text-black font-bold uppercase tracking-wider mb-2">Authorized Node</p>
          <p className="text-sm text-black break-all font-mono bg-gray-100 p-2">{walletAddress}</p>
        </div>
      ) : (
        <button 
          onClick={connectWallet}
          disabled={isConnecting}
          className="w-full py-4 px-6 bg-black hover:bg-white hover:text-black text-white border-4 border-black font-black uppercase tracking-widest transition-all cursor-pointer disabled:opacity-50"
        >
          {isConnecting ? "Connecting..." : "Initialize Connection"}
        </button>
      )}
    </div>
  );
}