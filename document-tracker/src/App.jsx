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
  const [activeTab, setActiveTab] = useState("route"); // "route", "view", or "presentation"

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
      setStatus("Generating unique document hash...");

      const newHash = ethers.hexlify(ethers.randomBytes(32));
      setLastHash(newHash);

      setStatus(`Generated Hash: ${newHash.slice(0, 10)}... Awaiting MetaMask approval.`);

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      setStatus("Sending transaction to Sepolia...");
      const tx = await contract.routeDocument(newHash, finalFrom, finalTo);
      
      setTxHash(tx.hash);
      setStatus(`Broadcasted! Waiting for block confirmation...`);
      
      const receipt = await tx.wait();
      setStatus(`Success! Document etched into Sepolia block #${receipt.blockNumber}`);
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
      alert("Document not found or invalid hash format.");
    } finally {
      setLookupLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col justify-center items-center p-4 md:p-6 font-sans">
      <div className="w-full max-w-2xl bg-white border-4 border-emerald-900 shadow-2xl overflow-hidden mb-8">
        
        {/* DENR Header Banner */}
        <div className="bg-emerald-900 text-white p-6 border-b-4 border-emerald-950 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">Republic of the Philippines</p>
          <h1 className="text-xl md:text-2xl font-black uppercase tracking-wider mt-1">
            DENR PENRO Palawan
          </h1>
          <p className="text-xs text-emerald-200 mt-1 font-mono">Immutable Workflow & Turnaround Tracker</p>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-3 border-b-2 border-emerald-900 bg-emerald-50">
          <button
            onClick={() => setActiveTab("route")}
            className={`py-3 text-[11px] md:text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === "route" 
                ? "bg-emerald-900 text-white" 
                : "text-emerald-900 hover:bg-emerald-100"
            }`}
          >
            Route Document
          </button>
          <button
            onClick={() => setActiveTab("view")}
            className={`py-3 text-[11px] md:text-xs font-black uppercase tracking-wider transition-all border-x-2 border-emerald-900 cursor-pointer ${
              activeTab === "view" 
                ? "bg-emerald-900 text-white" 
                : "text-emerald-900 hover:bg-emerald-100"
            }`}
          >
            Verify Status
          </button>
          <button
            onClick={() => setActiveTab("presentation")}
            className={`py-3 text-[11px] md:text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === "presentation" 
                ? "bg-emerald-900 text-white" 
                : "text-emerald-900 hover:bg-emerald-100"
            }`}
          >
            System Briefing
          </button>
        </div>

        <div className="p-6">
          {/* Connection Section */}
          <div className="mb-6">
            {!walletAddress ? (
              <button 
                onClick={connectWallet}
                disabled={isConnecting}
                className="w-full py-3 bg-emerald-800 text-white font-bold uppercase tracking-widest text-sm hover:bg-emerald-900 transition-all cursor-pointer disabled:opacity-50 border-2 border-emerald-950 shadow"
              >
                {isConnecting ? "Connecting..." : "Connect MetaMask Wallet"}
              </button>
            ) : (
              <div className="p-3 border-2 border-emerald-900 bg-emerald-50 flex justify-between items-center">
                <div>
                  <p className="text-[10px] font-bold uppercase text-emerald-800">Connected Admin Node</p>
                  <p className="text-xs font-mono text-emerald-950 font-semibold">{walletAddress.slice(0, 8)}...{walletAddress.slice(-6)}</p>
                </div>
                <span className="inline-block w-3 h-3 bg-emerald-600 rounded-full animate-pulse"></span>
              </div>
            )}
          </div>

          {activeTab === "route" && (
            /* ROUTE FORM */
            <form onSubmit={handleRoute} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase mb-1 text-emerald-950">From Desk / Unit</label>
                <select 
                  value={fromDeskSelect}
                  onChange={(e) => setFromDeskSelect(e.target.value)}
                  className="w-full p-3 border-2 border-emerald-900 bg-white text-sm font-medium focus:outline-none mb-2"
                >
                  {STANDARD_DESKS.map((desk, idx) => (
                    <option key={idx} value={desk}>{desk}</option>
                  ))}
                </select>
                {fromDeskSelect === "Custom..." && (
                  <input 
                    type="text" 
                    placeholder="Enter custom origin desk..."
                    value={fromDeskCustom}
                    onChange={(e) => setFromDeskCustom(e.target.value)}
                    className="w-full p-3 border-2 border-emerald-900 text-sm focus:outline-none"
                    required
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase mb-1 text-emerald-950">To Desk / Unit</label>
                <select 
                  value={toDeskSelect}
                  onChange={(e) => setToDeskSelect(e.target.value)}
                  className="w-full p-3 border-2 border-emerald-900 bg-white text-sm font-medium focus:outline-none mb-2"
                >
                  {STANDARD_DESKS.map((desk, idx) => (
                    <option key={idx} value={desk}>{desk}</option>
                  ))}
                </select>
                {toDeskSelect === "Custom..." && (
                  <input 
                    type="text" 
                    placeholder="Enter custom destination desk..."
                    value={toDeskCustom}
                    onChange={(e) => setToDeskCustom(e.target.value)}
                    className="w-full p-3 border-2 border-emerald-900 text-sm focus:outline-none"
                    required
                  />
                )}
              </div>

              <button 
                type="submit"
                disabled={loading || !walletAddress}
                className="w-full py-4 bg-emerald-900 text-white font-black uppercase tracking-widest hover:bg-emerald-800 border-2 border-emerald-950 transition-all cursor-pointer disabled:opacity-50 mt-2 shadow-md"
              >
                {loading ? "Processing Transaction..." : "Generate Hash & Route On-Chain"}
              </button>
            </form>
          )} 

          {activeTab === "view" && (
            /* VIEW / LOOKUP SECTION */
            <form onSubmit={handleLookup} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase mb-1 text-emerald-950">Document Hash (bytes32)</label>
                <input 
                  type="text" 
                  placeholder="0x..."
                  value={lookupHash}
                  onChange={(e) => setLookupHash(e.target.value)}
                  className="w-full p-3 border-2 border-emerald-900 font-mono text-xs focus:outline-none"
                  required
                />
              </div>

              <button 
                type="submit"
                disabled={lookupLoading}
                className="w-full py-4 bg-emerald-900 text-white font-black uppercase tracking-widest hover:bg-emerald-800 border-2 border-emerald-950 transition-all cursor-pointer disabled:opacity-50 shadow-md"
              >
                {lookupLoading ? "Querying Blockchain..." : "Fetch On-Chain State"}
              </button>

              {lookupResult && (
                <div className="mt-4 p-4 border-2 border-emerald-900 bg-emerald-50 text-xs font-mono space-y-2">
                  <p><span className="font-bold">Current Desk:</span> {lookupResult.currentDesk}</p>
                  <p><span className="font-bold">Timestamp:</span> {lookupResult.timeReceived}</p>
                  <p><span className="font-bold">Completed:</span> {lookupResult.isCompleted ? "Yes (Closed)" : "No (Active)"}</p>
                </div>
              )}
            </form>
          )}

          {activeTab === "presentation" && (
            /* SYSTEM PRESENTATION / BRIEFING */
            <div className="space-y-6 text-emerald-950">
              <div className="border-l-4 border-emerald-900 pl-4 py-1">
                <h2 className="font-black text-sm uppercase tracking-wider text-emerald-900">1. The Problem: ARTA Compliance & Delays</h2>
                <p className="text-xs mt-1 text-stone-700 leading-relaxed">
                  Traditional paper and internal database routing for Travelling Expense Vouchers (TEVs) and financial payables suffer from processing bottlenecks, lack transparency, and leave processing timestamps vulnerable to internal modification or tampering by rogue administrators.
                </p>
              </div>

              <div className="border-l-4 border-emerald-900 pl-4 py-1">
                <h2 className="font-black text-sm uppercase tracking-wider text-emerald-900">2. The Solution: Immutable Ledger Layer</h2>
                <p className="text-xs mt-1 text-stone-700 leading-relaxed">
                  We integrate an append-only cryptographic state machine deployed on the Ethereum Sepolia Testnet. This provides an unalterable audit trail that strictly enforces Anti-Red Tape Act (ARTA) turnaround time compliance without relying on centralized database edits.
                </p>
              </div>

              <div className="border-l-4 border-emerald-900 pl-4 py-1">
                <h2 className="font-black text-sm uppercase tracking-wider text-emerald-900">3. Core Smart Contract Architecture</h2>
                <div className="mt-2 space-y-3">
                  <div className="bg-stone-50 p-3 border border-emerald-900 rounded font-mono text-[11px]">
                    <span className="font-bold text-emerald-900">routeDocument(bytes32 documentHash, string fromDesk, string toDesk)</span>
                    <p className="text-stone-600 font-sans mt-1">
                      Restricted via OpenZeppelin's <code className="bg-emerald-100 px-1">onlyOwner</code> modifier. Updates the active location of the document and stamps the exact block timestamp, preventing backdating or fraudulent turnaround logging.
                    </p>
                  </div>

                  <div className="bg-stone-50 p-3 border border-emerald-900 rounded font-mono text-[11px]">
                    <span className="font-bold text-emerald-900">completeDocument(bytes32 documentHash)</span>
                    <p className="text-stone-600 font-sans mt-1">
                      Finalizes the document lifecycle. Locks the workflow state permanently and stops the turnaround clock, ensuring accountability upon voucher clearance.
                    </p>
                  </div>

                  <div className="bg-stone-50 p-3 border border-emerald-900 rounded font-mono text-[11px]">
                    <span className="font-bold text-emerald-900">getDocumentState(bytes32 documentHash)</span>
                    <p className="text-stone-600 font-sans mt-1">
                      Public view function. Allows any auditor or staff member to fetch the current desk, entry timestamp, and completion status directly from the public blockchain.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Last Hash Display */}
          {lastHash && activeTab === "route" && (
            <div className="mt-4 p-3 bg-stone-50 border border-emerald-900 text-[11px] font-mono break-all">
              <span className="font-bold text-emerald-900">Generated Hash:</span> {lastHash}
            </div>
          )}

          {/* Etherscan Link Display */}
          {txHash && activeTab === "route" && (
            <div className="mt-2 p-3 bg-emerald-50 border border-emerald-900 text-xs font-mono break-all flex flex-col gap-1">
              <span className="font-bold text-emerald-900">Explorer Link:</span>
              <a 
                href={`https://sepolia.etherscan.io/tx/${txHash}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-emerald-700 underline font-bold hover:text-emerald-900"
              >
                View Transaction on Sepolia Etherscan ↗
              </a>
            </div>
          )}

          {/* Terminal Status Output */}
          {status && (
            <div className="mt-4 p-4 bg-emerald-950 text-emerald-200 text-xs font-mono border-2 border-emerald-900 leading-relaxed break-words shadow-inner">
              {`> ${status}`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}