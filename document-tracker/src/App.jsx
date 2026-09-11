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

  // History / Local Storage state for forgetting fingerprints
  const [historyList, setHistoryList] = useState([]);

  // View / Lookup States
  const [lookupHash, setLookupHash] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState(null);

  // Auto-detect wallet connection and load saved transaction history on page load
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

    // Load saved transactions from browser local storage so you never lose them
    const savedHistory = localStorage.getItem("penro_tx_history");
    if (savedHistory) {
      try {
        setHistoryList(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }

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

  // Helper to save history items
  const saveToHistory = (hash, tx, from, to) => {
    const newItem = { hash, txHash: tx, fromDesk: from, toDesk: to, date: new Date().toLocaleString() };
    const updated = [newItem, ...historyList];
    setHistoryList(updated);
    localStorage.setItem("penro_tx_history", JSON.stringify(updated));
  };

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
      setStatus("Generating secure document fingerprint...");

      const newHash = ethers.hexlify(ethers.randomBytes(32));
      setLastHash(newHash);

      setStatus(`Fingerprint ready! Waiting for MetaMask approval.`);

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      setStatus("Sending transaction to the blockchain...");
      const tx = await contract.routeDocument(newHash, finalFrom, finalTo);
      
      setTxHash(tx.hash);
      saveToHistory(newHash, tx.hash, finalFrom, finalTo);
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

  async function handleLookup(hashToQuery) {
    const targetHash = hashToQuery || lookupHash;
    if (!targetHash) return;

    try {
      setLookupLoading(true);
      setLookupResult(null);
      if (hashToQuery) setLookupHash(hashToQuery);

      const provider = new ethers.JsonRpcProvider("https://rpc.sepolia.org");
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

      const state = await contract.getDocumentState(targetHash.trim());
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
    <div className="min-h-screen flex flex-col justify-center items-center p-4 md:p-6 font-sans relative overflow-hidden bg-stone-900">
      
      {/* Background Image Container based on provided nature/forest aesthetic */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center filter brightness-50"
        style={{ backgroundImage: `url('/BG.jpg')` }}
      />

      <div className="w-full max-w-2xl bg-emerald-950/90 backdrop-blur-md border-4 border-emerald-600 shadow-[0_0_40px_rgba(5,150,105,0.4)] rounded-lg overflow-hidden mb-8 relative z-10 text-emerald-100">
        
        {/* DENR Header Banner */}
        <div className="bg-emerald-900/90 p-6 border-b-4 border-emerald-600 text-center relative">
          <div className="text-3xl mb-1">🌿🌳</div>
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">Republic of the Philippines</p>
          <h1 className="text-xl md:text-2xl font-black uppercase tracking-wider mt-1 text-white">
            DENR PENRO Palawan
          </h1>
          <p className="text-xs text-emerald-200 mt-1 font-mono">Immutable Forest & Document Workflow Tracker</p>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-4 border-b-2 border-emerald-600 bg-emerald-950">
          <button
            onClick={() => setActiveTab("route")}
            className={`py-3 text-[10px] md:text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === "route" ? "bg-emerald-600 text-white font-bold" : "text-emerald-300 hover:bg-emerald-900"
            }`}
          >
            📤 Route
          </button>
          <button
            onClick={() => setActiveTab("view")}
            className={`py-3 text-[10px] md:text-xs font-black uppercase tracking-wider transition-all border-x-2 border-emerald-600 cursor-pointer ${
              activeTab === "view" ? "bg-emerald-600 text-white font-bold" : "text-emerald-300 hover:bg-emerald-900"
            }`}
          >
            🔍 Track
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`py-3 text-[10px] md:text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === "history" ? "bg-emerald-600 text-white font-bold" : "text-emerald-300 hover:bg-emerald-900"
            }`}
          >
            📜 History
          </button>
          <button
            onClick={() => setActiveTab("presentation")}
            className={`py-3 text-[10px] md:text-xs font-black uppercase tracking-wider transition-all border-l-2 border-emerald-600 cursor-pointer ${
              activeTab === "presentation" ? "bg-emerald-600 text-white font-bold" : "text-emerald-300 hover:bg-emerald-900"
            }`}
          >
            📖 Guide
          </button>
        </div>

        <div className="p-6">
          {/* Connection Section */}
          <div className="mb-6">
            {!walletAddress ? (
              <button 
                onClick={connectWallet}
                disabled={isConnecting}
                className="w-full py-3 bg-emerald-700 hover:bg-emerald-600 text-white font-bold uppercase tracking-widest text-sm transition-all cursor-pointer disabled:opacity-50 border-2 border-emerald-500 shadow-lg flex items-center justify-center gap-2 rounded"
              >
                <span>🦊🌿</span> {isConnecting ? "Connecting..." : "Connect MetaMask Wallet"}
              </button>
            ) : (
              <div className="p-3 border-2 border-emerald-500 bg-emerald-900/60 flex justify-between items-center rounded">
                <div>
                  <p className="text-[10px] font-bold uppercase text-emerald-300">Connected Staff Node</p>
                  <p className="text-xs font-mono text-emerald-100 font-semibold">{walletAddress.slice(0, 8)}...{walletAddress.slice(-6)}</p>
                </div>
                <span className="inline-block w-3 h-3 bg-emerald-400 rounded-full animate-ping"></span>
              </div>
            )}
          </div>

          {activeTab === "route" && (
            <form onSubmit={handleRoute} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase mb-1 text-emerald-300">📍 From Which Office / Desk?</label>
                <select 
                  value={fromDeskSelect}
                  onChange={(e) => setFromDeskSelect(e.target.value)}
                  className="w-full p-3 border-2 border-emerald-600 bg-emerald-950 text-emerald-100 text-sm font-medium focus:outline-none mb-2 rounded"
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
                    className="w-full p-3 border-2 border-emerald-600 bg-emerald-950 text-emerald-100 text-sm focus:outline-none rounded"
                    required
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase mb-1 text-emerald-300">🎯 Send To Which Office / Desk?</label>
                <select 
                  value={toDeskSelect}
                  onChange={(e) => setToDeskSelect(e.target.value)}
                  className="w-full p-3 border-2 border-emerald-600 bg-emerald-950 text-emerald-100 text-sm font-medium focus:outline-none mb-2 rounded"
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
                    className="w-full p-3 border-2 border-emerald-600 bg-emerald-950 text-emerald-100 text-sm focus:outline-none rounded"
                    required
                  />
                )}
              </div>

              <button 
                type="submit"
                disabled={loading || !walletAddress}
                className="w-full py-4 bg-emerald-700 hover:bg-emerald-600 text-white font-black uppercase tracking-widest border-2 border-emerald-500 transition-all cursor-pointer disabled:opacity-50 mt-2 shadow-xl flex items-center justify-center gap-2 rounded"
              >
                <span>🌳⚡</span> {loading ? "Locking Record..." : "Lock Movement On-Chain"}
              </button>
            </form>
          )} 

          {activeTab === "view" && (
            <div className="space-y-4">
              <form onSubmit={(e) => { e.preventDefault(); handleLookup(); }} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase mb-1 text-emerald-300">🔎 Document Fingerprint (Hash)</label>
                  <input 
                    type="text" 
                    placeholder="Paste 0x... code here"
                    value={lookupHash}
                    onChange={(e) => setLookupHash(e.target.value)}
                    className="w-full p-3 border-2 border-emerald-600 bg-emerald-950 text-emerald-100 font-mono text-xs focus:outline-none rounded"
                    required
                  />
                </div>

                <button 
                  type="submit"
                  disabled={lookupLoading}
                  className="w-full py-4 bg-emerald-700 hover:bg-emerald-600 text-white font-black uppercase tracking-widest border-2 border-emerald-500 transition-all cursor-pointer disabled:opacity-50 shadow-xl flex items-center justify-center gap-2 rounded"
                >
                  <span>🔍</span> {lookupLoading ? "Searching Ledger..." : "Check Live Status"}
                </button>
              </form>

              {lookupResult && (
                <div className="mt-4 p-4 border-2 border-emerald-600 bg-emerald-950 text-xs font-mono space-y-2 rounded text-emerald-200">
                  <p><span className="font-bold text-emerald-400">🏢 Current Location:</span> {lookupResult.currentDesk}</p>
                  <p><span className="font-bold text-emerald-400">⏱️ Exact Arrival Time:</span> {lookupResult.timeReceived}</p>
                  <p><span className="font-bold text-emerald-400">✅ Status:</span> {lookupResult.isCompleted ? "Completed & Closed 📁" : "Still Active 🌳"}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === "history" && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase text-emerald-300 mb-2">📜 Recent Transactions & Fingerprints History</h3>
              <p className="text-[11px] text-emerald-200 mb-3">Forgot your fingerprint? Click any item below to automatically query it or view its transaction directly on Etherscan.</p>
              
              {historyList.length === 0 ? (
                <div className="p-4 bg-emerald-950/60 border border-emerald-700 text-center text-xs text-emerald-400 rounded">
                  No local transaction history found yet. Route a document first!
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {historyList.map((item, index) => (
                    <div key={index} className="p-3 bg-emerald-950 border border-emerald-600 rounded text-xs space-y-1">
                      <div className="flex justify-between text-[10px] text-emerald-400 font-mono">
                        <span>{item.fromDesk} ➔ {item.toDesk}</span>
                        <span>{item.date}</span>
                      </div>
                      <div className="font-mono text-[11px] text-white truncate">
                        <span className="text-emerald-400">Hash:</span> {item.hash}
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button 
                          onClick={() => { setLookupHash(item.hash); setActiveTab("view"); handleLookup(item.hash); }}
                          className="px-2 py-1 bg-emerald-800 hover:bg-emerald-700 text-white rounded text-[10px] font-bold"
                        >
                          🔍 Check Status
                        </button>
                        <a 
                          href={`https://sepolia.etherscan.io/tx/${item.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-1 bg-emerald-900 hover:bg-emerald-800 text-emerald-200 rounded text-[10px] font-bold underline"
                        >
                          View on Etherscan ↗
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "presentation" && (
            <div className="space-y-4 text-emerald-100 text-sm">
              <div className="bg-emerald-950/80 p-4 border-2 border-emerald-600/60 rounded">
                <h3 className="font-black uppercase text-emerald-300 flex items-center gap-2 text-base">
                  <span>🛡️</span> What if I forget the document fingerprint?
                </h3>
                <p className="text-xs mt-2 text-emerald-200 leading-relaxed">
                  Don't worry! We added a <strong>History Tab (📜)</strong> right inside this app. Every time you route a document, it safely saves your fingerprint and Etherscan link in your browser memory so you can click them instantly anytime!
                </p>
              </div>

              <div className="bg-emerald-950/80 p-4 border-2 border-emerald-600/60 rounded">
                <h3 className="font-black uppercase text-emerald-300 flex items-center gap-2 text-base">
                  <span>🌐</span> Direct Etherscan Links
                </h3>
                <p className="text-xs mt-2 text-emerald-200 leading-relaxed">
                  Every transaction generates a clickable link straight to <a href="https://sepolia.etherscan.io" target="_blank" rel="noopener noreferrer" className="underline text-emerald-300 font-bold">Sepolia Etherscan</a>, allowing anyone to inspect block confirmations and timestamps publicly.
                </p>
              </div>
            </div>
          )}

          {/* Last Hash Display */}
          {lastHash && activeTab === "route" && (
            <div className="mt-4 p-3 bg-emerald-950 border border-emerald-600 text-[11px] font-mono break-all text-emerald-200 rounded">
              <span className="font-bold text-emerald-400">🔑 Document Fingerprint Code:</span> {lastHash}
            </div>
          )}

          {/* Etherscan Link Display */}
          {txHash && activeTab === "route" && (
            <div className="mt-2 p-3 bg-emerald-950 border border-emerald-600 text-xs font-mono break-all flex flex-col gap-1 rounded">
              <span className="font-bold text-emerald-400">🌐 Public Record:</span>
              <a 
                href={`https://sepolia.etherscan.io/tx/${txHash}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-emerald-300 underline font-bold hover:text-white"
              >
                View Permanent Proof on Sepolia Etherscan ↗
              </a>
            </div>
          )}

          {/* Terminal Status Output */}
          {status && (
            <div className="mt-4 p-4 bg-emerald-950 text-emerald-200 text-xs font-mono border-2 border-emerald-600 leading-relaxed break-words shadow-inner rounded">
              {`> ${status}`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}