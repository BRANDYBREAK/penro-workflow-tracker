import { useState, useEffect } from 'react';
import { ethers } from 'ethers';

const CONTRACT_ADDRESS = "0xe423Ea3F2024Aa73954E98DaCfE6989b5430d4C2";

const CONTRACT_ABI = [
  "function routeDocument(bytes32 documentHash, string calldata fromDesk, string calldata toDesk) external",
  "function completeDocument(bytes32 documentHash) external",
  "function getDocumentState(bytes32 documentHash) external view returns (string currentDesk, uint256 timeReceived, bool isCompleted)"
];

const STANDARD_DESKS = [
  "Receiving / Records Section",
  "Technical Services Division",
  "Enforcement & Wildlife Monitoring Section",
  "Accounting Unit",
  "Budget Section",
  "PENR Officer Desk",
  "Custom..."
];

export default function App() {
  const [walletAddress, setWalletAddress] = useState("");
  const [status, setStatus] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [activeTab, setActiveTab] = useState("route");

  // Route Form States
  const [fromDeskSelect, setFromDeskSelect] = useState(STANDARD_DESKS[0]);
  const [fromDeskCustom, setFromDeskCustom] = useState("");
  const [toDeskSelect, setToDeskSelect] = useState(STANDARD_DESKS[1]);
  const [toDeskCustom, setToDeskCustom] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastHash, setLastHash] = useState("");
  const [txHash, setTxHash] = useState("");

  // View / Lookup States
  const [lookupHash, setLookupHash] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState(null);

  // Auto-detect wallet connection on page load
  useEffect(() => {
    async function checkConnection() {
      if (window.ethereum) {
        try {
          const provider = new ethers.BrowserProvider(window.ethereum);
          const accounts = await provider.send("eth_accounts", []);
          if (accounts.length > 0) {
            setWalletAddress(accounts[0]);
          }
        } catch (err) {
          console.error("Auto-detect connection error:", err);
        }
      }
    }
    checkConnection();

    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length > 0) {
          setWalletAddress(accounts[0]);
        } else {
          setWalletAddress("");
        }
      });
    }
  }, []);

  async function connectWallet() {
    if (isConnecting) return;
    if (!window.ethereum) {
      setStatus("MetaMask is required.");
      return;
    }

    try {
      setIsConnecting(true);
      setStatus("Switching to Sepolia and connecting...");

      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0xaa36a7' }],
        });
      } catch (switchError) {
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0xaa36a7',
              chainName: 'Sepolia Testnet',
              nativeCurrency: { name: 'SepoliaETH', symbol: 'ETH', decimals: 18 },
              rpcUrls: ['https://rpc.sepolia.org'],
              blockExplorerUrls: ['https://sepolia.etherscan.io'],
            }],
          });
        } else {
          throw switchError;
        }
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      
      setWalletAddress(await signer.getAddress());
      setStatus("Wallet connected successfully!");
    } catch (err) {
      console.error(err);
      if (err.info?.error?.code === -32002 || err.code === -32002) {
        setStatus("MetaMask prompt is already open. Check your browser extension.");
      } else {
        setStatus(`Error: ${err.reason || err.message}`);
      }
    } finally {
      setIsConnecting(false);
    }
  }

  async function handleRoute(e) {
    e.preventDefault();
    if (!walletAddress) {
      setStatus("Please connect your wallet first.");
      return;
    }

    const finalFrom = fromDeskSelect === "Custom..." ? fromDeskCustom : fromDeskSelect;
    const finalTo = toDeskSelect === "Custom..." ? toDeskCustom : toDeskSelect;

    if (!finalFrom || !finalTo) {
      setStatus("Please specify both 'From' and 'To' desks.");
      return;
    }

    try {
      setLoading(true);
      setTxHash("");
      setStatus("Forging secure document fingerprint...");

      const newHash = ethers.hexlify(ethers.randomBytes(32));
      setLastHash(newHash);

      setStatus(`Fingerprint ready! Waiting for MetaMask approval.`);

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      setStatus("Unleashing blockchain flame to lock transaction...");
      const tx = await contract.routeDocument(newHash, finalFrom, finalTo);
      
      setTxHash(tx.hash);
      setStatus(`Flight in progress! Waiting for block confirmation...`);
      
      const receipt = await tx.wait();
      setStatus(`Success! Document movement sealed in block #${receipt.blockNumber}`);
    } catch (err) {
      console.error(err);
      setStatus(`Execution Failed: ${err.reason || err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleLookup(e) {
    e.preventDefault();
    if (!lookupHash) return;

    try {
      setLookupLoading(true);
      setLookupResult(null);

      const provider = new ethers.JsonRpcProvider("https://rpc.sepolia.org");
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

      const state = await contract.getDocumentState(lookupHash.trim());
      setLookupResult({
        currentDesk: state.currentDesk,
        timeReceived: new Date(Number(state.timeReceived) * 1000).toLocaleString(),
        isCompleted: state.isCompleted
      });
    } catch (err) {
      console.error(err);
      alert("Document not found or invalid fingerprint format.");
    } finally {
      setLookupLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-stone-950 flex flex-col justify-center items-center p-4 md:p-6 font-sans relative overflow-hidden">
      
      {/* CSS Styles for Flying Dragon & Fire Animations */}
      <style>{`
        @keyframes flyAcross {
          0% { transform: translate(-100px, 20px) rotate(5deg) scale(0.8); }
          50% { transform: translate(calc(100vw + 100px), -40px) rotate(-5deg) scale(1.1); }
          100% { transform: translate(-100px, 20px) rotate(5deg) scale(0.8); }
        }

        @keyframes flameGlow {
          0%, 100% { text-shadow: 0 0 10px #ff4500, 0 0 20px #ff8c00, 0 0 30px #ff0000; }
          50% { text-shadow: 0 0 20px #ff8c00, 0 0 35px #ff4500, 0 0 50px #ff2200; }
        }

        @keyframes flicker {
          0%, 100% { opacity: 0.8; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }

        .dragon-flight {
          position: fixed;
          top: 15%;
          left: -120px;
          font-size: 3rem;
          z-index: 0;
          animation: flyAcross 18s linear infinite;
          pointer-events: none;
          filter: drop-shadow(0 0 12px rgba(255, 69, 0, 0.8));
        }

        .fire-text {
          animation: flameGlow 2.5s infinite;
        }

        .fire-btn {
          position: relative;
          background: linear-gradient(135deg, #064e3b, #b91c1c);
          background-size: 200% 200%;
          transition: 0.4s;
        }

        .fire-btn:hover {
          background-position: right center;
          box-shadow: 0 0 20px rgba(239, 68, 68, 0.7);
        }

        .sparkle-ember {
          animation: flicker 1.5s infinite ease-in-out;
        }
      `}</style>

      {/* Background Flying Dragon */}
      <div className="dragon-flight">
        🐉🔥
      </div>

      <div className="w-full max-w-2xl bg-stone-900 border-4 border-amber-600 shadow-[0_0_30px_rgba(217,119,6,0.3)] rounded-lg overflow-hidden mb-8 relative z-10 text-stone-100">
        
        {/* DENR Header Banner */}
        <div className="bg-gradient-to-r from-emerald-950 via-stone-900 to-red-950 p-6 border-b-4 border-amber-600 text-center relative">
          <div className="text-3xl mb-1 sparkle-ember">🔥🌿</div>
          <p className="text-xs font-bold uppercase tracking-widest text-amber-400">Republic of the Philippines</p>
          <h1 className="text-xl md:text-2xl font-black uppercase tracking-wider mt-1 fire-text text-amber-200">
            DENR PENRO Palawan
          </h1>
          <p className="text-xs text-stone-300 mt-1 font-mono">Immutable Workflow & Turnaround Tracker</p>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-3 border-b-2 border-amber-600 bg-stone-950">
          <button
            onClick={() => setActiveTab("route")}
            className={`py-3 text-[11px] md:text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === "route" 
                ? "bg-amber-600 text-stone-950 font-bold" 
                : "text-amber-500 hover:bg-stone-900"
            }`}
          >
            📤 Route Paper
          </button>
          <button
            onClick={() => setActiveTab("view")}
            className={`py-3 text-[11px] md:text-xs font-black uppercase tracking-wider transition-all border-x-2 border-amber-600 cursor-pointer ${
              activeTab === "view" 
                ? "bg-amber-600 text-stone-950 font-bold" 
                : "text-amber-500 hover:bg-stone-900"
            }`}
          >
            🔍 Track Status
          </button>
          <button
            onClick={() => setActiveTab("presentation")}
            className={`py-3 text-[11px] md:text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === "presentation" 
                ? "bg-amber-600 text-stone-950 font-bold" 
                : "text-amber-500 hover:bg-stone-900"
            }`}
          >
            📖 How It Works
          </button>
        </div>

        <div className="p-6">
          {/* Connection Section */}
          <div className="mb-6">
            {!walletAddress ? (
              <button 
                onClick={connectWallet}
                disabled={isConnecting}
                className="w-full py-3 fire-btn text-white font-bold uppercase tracking-widest text-sm transition-all cursor-pointer disabled:opacity-50 border-2 border-amber-500 shadow-lg flex items-center justify-center gap-2"
              >
                <span>🦊🔥</span> {isConnecting ? "Connecting..." : "Connect MetaMask Wallet"}
              </button>
            ) : (
              <div className="p-3 border-2 border-emerald-600 bg-emerald-950/40 flex justify-between items-center rounded">
                <div>
                  <p className="text-[10px] font-bold uppercase text-emerald-400">Connected Staff Node</p>
                  <p className="text-xs font-mono text-emerald-200 font-semibold">{walletAddress.slice(0, 8)}...{walletAddress.slice(-6)}</p>
                </div>
                <span className="inline-block w-3 h-3 bg-amber-500 rounded-full animate-ping"></span>
              </div>
            )}
          </div>

          {activeTab === "route" && (
            /* ROUTE FORM */
            <form onSubmit={handleRoute} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase mb-1 text-amber-400">📍 From Which Office / Desk?</label>
                <select 
                  value={fromDeskSelect}
                  onChange={(e) => setFromDeskSelect(e.target.value)}
                  className="w-full p-3 border-2 border-amber-600 bg-stone-950 text-stone-200 text-sm font-medium focus:outline-none mb-2 rounded"
                >
                  {STANDARD_DESKS.map((desk, idx) => (
                    <option key={idx} value={desk}>{desk}</option>
                  ))}
                </select>
                {fromDeskSelect === "Custom..." && (
                  <input 
                    type="text" 
                    placeholder="Type custom origin desk..."
                    value={fromDeskCustom}
                    onChange={(e) => setFromDeskCustom(e.target.value)}
                    className="w-full p-3 border-2 border-amber-600 bg-stone-950 text-stone-200 text-sm focus:outline-none rounded"
                    required
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase mb-1 text-amber-400">🎯 Send To Which Office / Desk?</label>
                <select 
                  value={toDeskSelect}
                  onChange={(e) => setToDeskSelect(e.target.value)}
                  className="w-full p-3 border-2 border-amber-600 bg-stone-950 text-stone-200 text-sm font-medium focus:outline-none mb-2 rounded"
                >
                  {STANDARD_DESKS.map((desk, idx) => (
                    <option key={idx} value={desk}>{desk}</option>
                  ))}
                </select>
                {toDeskSelect === "Custom..." && (
                  <input 
                    type="text" 
                    placeholder="Type custom destination desk..."
                    value={toDeskCustom}
                    onChange={(e) => setToDeskCustom(e.target.value)}
                    className="w-full p-3 border-2 border-amber-600 bg-stone-950 text-stone-200 text-sm focus:outline-none rounded"
                    required
                  />
                )}
              </div>

              <button 
                type="submit"
                disabled={loading || !walletAddress}
                className="w-full py-4 fire-btn text-white font-black uppercase tracking-widest border-2 border-amber-500 transition-all cursor-pointer disabled:opacity-50 mt-2 shadow-xl flex items-center justify-center gap-2 rounded"
              >
                <span>🐉🔥</span> {loading ? "Forging..." : "Lock Movement On-Chain"}
              </button>
            </form>
          )} 

          {activeTab === "view" && (
            /* VIEW / LOOKUP SECTION */
            <form onSubmit={handleLookup} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase mb-1 text-amber-400">🔎 Document Fingerprint (Hash)</label>
                <input 
                  type="text" 
                  placeholder="Paste 0x... code here"
                  value={lookupHash}
                  onChange={(e) => setLookupHash(e.target.value)}
                  className="w-full p-3 border-2 border-amber-600 bg-stone-950 text-stone-200 font-mono text-xs focus:outline-none rounded"
                  required
                />
              </div>

              <button 
                type="submit"
                disabled={lookupLoading}
                className="w-full py-4 fire-btn text-white font-black uppercase tracking-widest border-2 border-amber-500 transition-all cursor-pointer disabled:opacity-50 shadow-xl flex items-center justify-center gap-2 rounded"
              >
                <span>🔍</span> {lookupLoading ? "Searching Ledger..." : "Check Live Status"}
              </button>

              {lookupResult && (
                <div className="mt-4 p-4 border-2 border-amber-600 bg-stone-950 text-xs font-mono space-y-2 rounded text-stone-300">
                  <p><span className="font-bold text-amber-400">🏢 Current Location:</span> {lookupResult.currentDesk}</p>
                  <p><span className="font-bold text-amber-400">⏱️ Exact Arrival Time:</span> {lookupResult.timeReceived}</p>
                  <p><span className="font-bold text-amber-400">✅ Status:</span> {lookupResult.isCompleted ? "Completed & Closed 📁" : "Still Active 🏃‍♂️🔥"}</p>
                </div>
              )}
            </form>
          )}

          {activeTab === "presentation" && (
            /* SIMPLIFIED SYSTEM BRIEFING */
            <div className="space-y-5 text-stone-200 text-sm">
              <div className="bg-stone-950 p-4 border-2 border-amber-600/60 rounded">
                <h3 className="font-black uppercase text-amber-400 flex items-center gap-2 text-base">
                  <span>🐢</span> The Old Problem: Lost & Delayed Papers
                </h3>
                <p className="text-xs mt-2 text-stone-300 leading-relaxed">
                  Government vouchers can sometimes sit unnoticed on office desks. Without clear digital tracking, processing delays happen and dates can accidentally get lost or altered.
                </p>
              </div>

              <div className="bg-stone-950 p-4 border-2 border-amber-600/60 rounded">
                <h3 className="font-black uppercase text-amber-400 flex items-center gap-2 text-base">
                  <span>🐉🔥</span> Our Solution: The Dragon's Fire Vault
                </h3>
                <p className="text-xs mt-2 text-stone-300 leading-relaxed">
                  We use an unalterable digital ledger secured by cryptographic flames. Once a document's details are recorded here, <strong>no one can ever erase or change the time records</strong>. It is locked permanently in stone and fire!
                </p>
              </div>

              <div className="bg-stone-950 p-4 border-2 border-amber-600/60 rounded">
                <h3 className="font-black uppercase text-amber-400 flex items-center gap-2 text-base">
                  <span>📋</span> How Staff Use It Everyday
                </h3>
                <div className="mt-2 space-y-2 text-xs text-stone-300">
                  <p><strong>1. Route Paper:</strong> When sending a voucher forward, click send. The system instantly stamps the exact second of transfer.</p>
                  <p><strong>2. Tamper-Proof:</strong> Because it's guarded by blockchain logic, nobody can fake arrival or departure dates.</p>
                  <p><strong>3. Public Transparency:</strong> Anyone can verify document milestones anytime in the "Track Status" tab.</p>
                </div>
              </div>
            </div>
          )}

          {/* Last Hash Display */}
          {lastHash && activeTab === "route" && (
            <div className="mt-4 p-3 bg-stone-950 border border-amber-600 text-[11px] font-mono break-all text-amber-200 rounded">
              <span className="font-bold text-amber-400">🔑 Document Fingerprint Code:</span> {lastHash}
            </div>
          )}

          {/* Etherscan Link Display */}
          {txHash && activeTab === "route" && (
            <div className="mt-2 p-3 bg-stone-950 border border-amber-600 text-xs font-mono break-all flex flex-col gap-1 rounded">
              <span className="font-bold text-amber-400">🌐 Public Record:</span>
              <a 
                href={`https://sepolia.etherscan.io/tx/${txHash}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-amber-400 underline font-bold hover:text-amber-300"
              >
                View Permanent Proof on Sepolia Etherscan ↗
              </a>
            </div>
          )}

          {/* Terminal Status Output */}
          {status && (
            <div className="mt-4 p-4 bg-stone-950 text-amber-300 text-xs font-mono border-2 border-amber-600 leading-relaxed break-words shadow-inner rounded">
              {`> ${status}`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}