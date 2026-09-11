import { useState, useEffect } from 'react';
import { ethers } from 'ethers';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;

const CONTRACT_ABI = [
  "function routeDocument(bytes32 documentHash, string calldata fromDesk, string calldata toDesk) external",
  "function completeDocument(bytes32 documentHash) external",
  "function getDocumentState(bytes32 documentHash) external view returns (string currentDesk, uint256 timeReceived, bool isCompleted)",
  "function authorizeWallet(address wallet) external",
  "function revokeWallet(address wallet) external",
  "function authorizedWallets(address) external view returns (bool)",
  "function owner() external view returns (address)"
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

const SOLIDITY_CODE_STRING = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract TurnaroundTimeTracker is Ownable {
    
    struct DocumentState {
        string currentDesk; 
        uint256 timeReceived;
        bool isCompleted;
    }

    mapping(bytes32 => DocumentState) private _documentStates;
    mapping(address => bool) public authorizedWallets;

    event DocumentRouted(bytes32 indexed documentHash, string fromDesk, string toDesk, uint256 timestamp);
    event DocumentCompleted(bytes32 indexed documentHash, uint256 timestamp);
    event WalletAuthorized(address indexed wallet);
    event WalletRevoked(address indexed wallet);

    error InvalidInput();
    error DocumentAlreadyCompleted();
    error DocumentNotStarted();
    error UnauthorizedWallet();

    constructor(address initialOwner) Ownable(initialOwner) {
        authorizedWallets[initialOwner] = true;
    }

    modifier onlyAuthorized() {
        if (!authorizedWallets[msg.sender]) revert UnauthorizedWallet();
        _;
    }

    function authorizeWallet(address wallet) external onlyOwner {
        authorizedWallets[wallet] = true;
        emit WalletAuthorized(wallet);
    }

    function revokeWallet(address wallet) external onlyOwner {
        authorizedWallets[wallet] = false;
        emit WalletRevoked(wallet);
    }

    function routeDocument(bytes32 documentHash, string calldata fromDesk, string calldata toDesk) external onlyAuthorized {
        if (documentHash == bytes32(0) || bytes(toDesk).length == 0) revert InvalidInput();
        if (_documentStates[documentHash].isCompleted) revert DocumentAlreadyCompleted();

        _documentStates[documentHash] = DocumentState({
            currentDesk: toDesk,
            timeReceived: block.timestamp,
            isCompleted: false
        });

        emit DocumentRouted(documentHash, fromDesk, toDesk, block.timestamp);
    }

    function completeDocument(bytes32 documentHash) external onlyAuthorized {
        if (_documentStates[documentHash].timeReceived == 0) revert DocumentNotStarted();
        if (_documentStates[documentHash].isCompleted) revert DocumentAlreadyCompleted();

        _documentStates[documentHash].isCompleted = true;
        
        emit DocumentCompleted(documentHash, block.timestamp);
    }

    function getDocumentState(bytes32 documentHash) external view returns (string memory currentDesk, uint256 timeReceived, bool isCompleted) {
        DocumentState memory state = _documentStates[documentHash];
        return (state.currentDesk, state.timeReceived, state.isCompleted);
    }
}`;

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

  // Complete Document State
  const [completeHash, setCompleteHash] = useState("");
  const [completing, setCompleting] = useState("");

  // Admin / Wallet Authorization States
  const [targetWallet, setTargetWallet] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);

  // History & Lookup States
  const [historyList, setHistoryList] = useState([]);
  const [lookupHash, setLookupHash] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function checkConnection() {
      if (window.ethereum) {
        try {
          const provider = new ethers.BrowserProvider(window.ethereum);
          const accounts = await provider.send("eth_accounts", []);
          if (accounts.length > 0) {
            const userAcc = accounts[0];
            setWalletAddress(userAcc);
            checkIfOwner(userAcc);
          }
        } catch (err) {
          console.error("Auto-detect connection error:", err);
        }
      }
    }
    checkConnection();

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
          checkIfOwner(accounts[0]);
        } else {
          setWalletAddress("");
          setIsOwner(false);
        }
      });
    }
  }, []);

  async function checkIfOwner(acc) {
    try {
      const provider = new ethers.JsonRpcProvider("https://rpc.sepolia.org");
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      const contractOwner = await contract.owner();
      if (contractOwner.toLowerCase() === acc.toLowerCase()) {
        setIsOwner(true);
      } else {
        setIsOwner(false);
      }
    } catch (err) {
      console.error("Error checking owner:", err);
    }
  }

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
      const addr = await signer.getAddress();
      
      setWalletAddress(addr);
      checkIfOwner(addr);
      setStatus("Wallet connected successfully!");
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.reason || err.message}`);
    } finally {
      setIsConnecting(false);
    }
  }

  async function handleAuthorizeWallet(e) {
    e.preventDefault();
    if (!isOwner) {
      setStatus("Only the contract owner can authorize staff wallets.");
      return;
    }
    if (!targetWallet) return;

    try {
      setAdminLoading(true);
      setStatus(`Authorizing staff wallet ${targetWallet.slice(0, 6)}...`);

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      const tx = await contract.authorizeWallet(targetWallet.trim());
      setStatus(`Authorization broadcasted! Tx: ${tx.hash.slice(0, 10)}... Waiting for confirmation.`);
      
      const receipt = await tx.wait();
      setStatus(`Success! Staff wallet authorized in block #${receipt.blockNumber}`);
      setTargetWallet("");
    } catch (err) {
      console.error(err);
      setStatus(`Execution Failed: ${err.reason || err.message}`);
    } finally {
      setAdminLoading(false);
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
      setStatus("Generating secure document hash...");

      const newHash = ethers.hexlify(ethers.randomBytes(32));
      setLastHash(newHash);

      setStatus(`Fingerprint generated! Waiting for MetaMask approval.`);

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      setStatus("Sending transaction to Sepolia blockchain...");
      const tx = await contract.routeDocument(newHash, finalFrom, finalTo);
      
      setTxHash(tx.hash);
      saveToHistory(newHash, tx.hash, finalFrom, finalTo);
      setStatus(`Broadcasted! Waiting for block confirmation...`);
      
      const receipt = await tx.wait();
      setStatus(`Success! Document movement sealed in block #${receipt.blockNumber}`);
    } catch (err) {
      console.error(err);
      setStatus(`Execution Failed: ${err.reason || err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleComplete(e) {
    e.preventDefault();
    if (!walletAddress) {
      setStatus("Please connect your wallet first.");
      return;
    }
    if (!completeHash) return;

    try {
      setCompleting(true);
      setStatus("Submitting completion transaction to Sepolia...");

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      const tx = await contract.completeDocument(completeHash.trim());
      setStatus(`Completion broadcasted! Tx: ${tx.hash.slice(0, 10)}... Waiting for confirmation.`);
      
      const receipt = await tx.wait();
      setStatus(`Success! Document finalized and closed in block #${receipt.blockNumber}`);
      setCompleteHash("");
    } catch (err) {
      console.error(err);
      setStatus(`Execution Failed: ${err.reason || err.message}`);
    } finally {
      setCompleting(false);
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
      alert("Document not found or invalid format.");
    } finally {
      setLookupLoading(false);
    }
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(SOLIDITY_CODE_STRING);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col justify-center items-center p-4 md:p-6 font-sans">
      <div className="w-full max-w-2xl bg-white border-2 border-emerald-800 shadow-xl rounded-lg overflow-hidden mb-8">
        
        {/* Minimalist Clean DENR Header Banner */}
        <div className="bg-emerald-800 text-white p-6 border-b-2 border-emerald-900 text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-200">Republic of the Philippines</p>
          <h1 className="text-xl md:text-2xl font-black uppercase tracking-wider mt-1">
            DENR PENRO Palawan
          </h1>
          <p className="text-xs text-emerald-100 mt-1 font-mono">Immutable Workflow & Turnaround Tracker</p>
        </div>

        {/* Minimalist Tabs */}
        <div className="grid grid-cols-7 border-b-2 border-emerald-800 bg-emerald-50 text-emerald-900 text-center font-bold text-[8px] md:text-[9px] uppercase tracking-wider">
          <button
            onClick={() => setActiveTab("route")}
            className={`py-3 transition-all cursor-pointer ${
              activeTab === "route" ? "bg-emerald-800 text-white" : "hover:bg-emerald-100"
            }`}
          >
            Route
          </button>
          <button
            onClick={() => setActiveTab("complete")}
            className={`py-3 transition-all border-x border-emerald-800 cursor-pointer ${
              activeTab === "complete" ? "bg-emerald-800 text-white" : "hover:bg-emerald-100"
            }`}
          >
            Complete
          </button>
          <button
            onClick={() => setActiveTab("admin")}
            className={`py-3 transition-all cursor-pointer ${
              activeTab === "admin" ? "bg-emerald-800 text-white" : "hover:bg-emerald-100"
            }`}
          >
            Access
          </button>
          <button
            onClick={() => setActiveTab("view")}
            className={`py-3 transition-all border-x border-emerald-800 cursor-pointer ${
              activeTab === "view" ? "bg-emerald-800 text-white" : "hover:bg-emerald-100"
            }`}
          >
            Track
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`py-3 transition-all cursor-pointer ${
              activeTab === "history" ? "bg-emerald-800 text-white" : "hover:bg-emerald-100"
            }`}
          >
            History
          </button>
          <button
            onClick={() => setActiveTab("guide")}
            className={`py-3 transition-all border-x border-emerald-800 cursor-pointer ${
              activeTab === "guide" ? "bg-emerald-800 text-white" : "hover:bg-emerald-100"
            }`}
          >
            Guide
          </button>
          <button
            onClick={() => setActiveTab("code")}
            className={`py-3 transition-all cursor-pointer ${
              activeTab === "code" ? "bg-emerald-800 text-white" : "hover:bg-emerald-100"
            }`}
          >
            Code
          </button>
        </div>

        <div className="p-6">
          {/* Connection Section */}
          <div className="mb-6">
            {!walletAddress ? (
              <button 
                onClick={connectWallet}
                disabled={isConnecting}
                className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold uppercase tracking-widest text-xs transition-all cursor-pointer disabled:opacity-50 border border-emerald-900 rounded shadow-sm"
              >
                {isConnecting ? "Connecting..." : "Connect MetaMask Wallet"}
              </button>
            ) : (
              <div className="p-3 border border-emerald-700 bg-emerald-50 flex justify-between items-center rounded">
                <div>
                  <p className="text-[10px] font-bold uppercase text-emerald-800">
                    Connected Node {isOwner && "(Contract Owner)"}
                  </p>
                  <p className="text-xs font-mono text-emerald-950 font-semibold">{walletAddress.slice(0, 8)}...{walletAddress.slice(-6)}</p>
                </div>
                <span className="inline-block w-2.5 h-2.5 bg-emerald-600 rounded-full animate-pulse"></span>
              </div>
            )}
          </div>

          {activeTab === "route" && (
            <form onSubmit={handleRoute} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase mb-1 text-emerald-950">From Desk / Unit</label>
                <select 
                  value={fromDeskSelect}
                  onChange={(e) => setFromDeskSelect(e.target.value)}
                  className="w-full p-2.5 border border-emerald-700 bg-white text-emerald-950 text-xs font-medium focus:outline-none mb-2 rounded"
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
                    className="w-full p-2.5 border border-emerald-700 text-xs focus:outline-none rounded"
                    required
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase mb-1 text-emerald-950">To Desk / Unit</label>
                <select 
                  value={toDeskSelect}
                  onChange={(e) => setToDeskSelect(e.target.value)}
                  className="w-full p-2.5 border border-emerald-700 bg-white text-emerald-950 text-xs font-medium focus:outline-none mb-2 rounded"
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
                    className="w-full p-2.5 border border-emerald-700 text-xs focus:outline-none rounded"
                    required
                  />
                )}
              </div>

              <button 
                type="submit"
                disabled={loading || !walletAddress}
                className="w-full py-3.5 bg-emerald-800 hover:bg-emerald-900 text-white font-bold uppercase tracking-widest text-xs transition-all cursor-pointer disabled:opacity-50 mt-2 shadow rounded"
              >
                {loading ? "Processing..." : "Generate Hash & Route On-Chain"}
              </button>
            </form>
          )} 

          {activeTab === "complete" && (
            <form onSubmit={handleComplete} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase mb-1 text-emerald-950">Document Hash to Complete (bytes32)</label>
                <input 
                  type="text" 
                  placeholder="0x..."
                  value={completeHash}
                  onChange={(e) => setCompleteHash(e.target.value)}
                  className="w-full p-2.5 border border-emerald-700 font-mono text-xs focus:outline-none rounded"
                  required
                />
              </div>

              <button 
                type="submit"
                disabled={completing || !walletAddress}
                className="w-full py-3.5 bg-emerald-800 hover:bg-emerald-900 text-white font-bold uppercase tracking-widest text-xs transition-all cursor-pointer disabled:opacity-50 shadow rounded"
              >
                {completing ? "Finalizing..." : "Complete Document Lifecycle"}
              </button>
            </form>
          )}

          {activeTab === "admin" && (
            <div className="space-y-4">
              <div className="border-l-2 border-emerald-800 pl-3 py-0.5">
                <h3 className="font-bold uppercase text-emerald-900 text-xs">Staff Access Control (Whitelist)</h3>
                <p className="text-[11px] text-stone-600 mt-0.5">Authorize office personnel wallets to route documents securely.</p>
              </div>

              {!isOwner ? (
                <div className="p-4 bg-amber-50 border border-amber-300 text-amber-900 text-xs rounded">
                  ⚠️ Note: Only the main contract owner wallet can authorize new staff addresses. Your current connected wallet is recognized as standard personnel.
                </div>
              ) : (
                <form onSubmit={handleAuthorizeWallet} className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold uppercase mb-1 text-emerald-950">Staff Wallet Address (0x...)</label>
                    <input 
                      type="text" 
                      placeholder="0x..."
                      value={targetWallet}
                      onChange={(e) => setTargetWallet(e.target.value)}
                      className="w-full p-2.5 border border-emerald-700 font-mono text-xs focus:outline-none rounded"
                      required
                    />
                  </div>

                  <button 
                    type="submit"
                    disabled={adminLoading}
                    className="w-full py-3 bg-emerald-800 hover:bg-emerald-900 text-white font-bold uppercase tracking-widest text-xs transition-all cursor-pointer disabled:opacity-50 shadow rounded"
                  >
                    {adminLoading ? "Authorizing..." : "Authorize Wallet on Blockchain"}
                  </button>
                </form>
              )}
            </div>
          )}

          {activeTab === "view" && (
            <div className="space-y-4">
              <form onSubmit={(e) => { e.preventDefault(); handleLookup(); }} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase mb-1 text-emerald-950">Document Hash (bytes32)</label>
                  <input 
                    type="text" 
                    placeholder="0x..."
                    value={lookupHash}
                    onChange={(e) => setLookupHash(e.target.value)}
                    className="w-full p-2.5 border border-emerald-700 font-mono text-xs focus:outline-none rounded"
                    required
                  />
                </div>

                <button 
                  type="submit"
                  disabled={lookupLoading}
                  className="w-full py-3.5 bg-emerald-800 hover:bg-emerald-900 text-white font-bold uppercase tracking-widest text-xs transition-all cursor-pointer disabled:opacity-50 shadow rounded"
                >
                  {lookupLoading ? "Querying..." : "Fetch On-Chain State"}
                </button>
              </form>

              {lookupResult && (
                <div className="mt-4 p-3 border border-emerald-700 bg-emerald-50 text-xs font-mono space-y-1.5 rounded text-emerald-950">
                  <p><span className="font-bold">Current Desk:</span> {lookupResult.currentDesk}</p>
                  <p><span className="font-bold">Timestamp:</span> {lookupResult.timeReceived}</p>
                  <p><span className="font-bold">Completed:</span> {lookupResult.isCompleted ? "Yes (Closed)" : "No (Active)"}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === "history" && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase text-emerald-950 mb-1">Recent Transactions History</h3>
              <p className="text-[11px] text-stone-600 mb-3">Click any item below to load its status or inspect it directly on Etherscan.</p>
              
              {historyList.length === 0 ? (
                <div className="p-4 bg-stone-50 border border-stone-200 text-center text-xs text-stone-500 rounded">
                  No local transaction history found yet.
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {historyList.map((item, index) => (
                    <div key={index} className="p-3 bg-white border border-emerald-700 rounded text-xs space-y-1 shadow-sm">
                      <div className="flex justify-between text-[10px] text-stone-500 font-mono">
                        <span className="font-bold text-emerald-900">{item.fromDesk} ➔ {item.toDesk}</span>
                        <span>{item.date}</span>
                      </div>
                      <div className="font-mono text-[11px] text-stone-800 truncate">
                        <span className="text-emerald-700 font-bold">Hash:</span> {item.hash}
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button 
                          onClick={() => { setLookupHash(item.hash); setActiveTab("view"); handleLookup(item.hash); }}
                          className="px-2 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded text-[10px] font-bold"
                        >
                          Check Status
                        </button>
                        <a 
                          href={`https://sepolia.etherscan.io/tx/${item.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-1 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded text-[10px] font-bold underline"
                        >
                          Etherscan ↗
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "guide" && (
            <div className="space-y-4 text-xs text-stone-800">
              <div className="border-l-2 border-emerald-800 pl-3 py-0.5">
                <h3 className="font-bold uppercase text-emerald-900">Smart Contract Logic & Flow</h3>
                <p className="text-[11px] text-stone-600 mt-0.5">Simplified overview of the deployed Solidity contract (`TurnaroundTimeTracker`).</p>
              </div>

              <div className="space-y-3 font-mono text-[11px]">
                <div className="p-2.5 bg-stone-50 border border-emerald-700 rounded">
                  <span className="font-bold text-emerald-900">1. authorizedWallets mapping</span>
                  <p className="font-sans text-[11px] text-stone-600 mt-1">
                    Enforces that only whitelisted office personnel or admin nodes can execute routing actions.
                  </p>
                </div>

                <div className="p-2.5 bg-stone-50 border border-emerald-700 rounded">
                  <span className="font-bold text-emerald-900">2. routeDocument(...)</span>
                  <p className="font-sans text-[11px] text-stone-600 mt-1">
                    Protected by the <code className="bg-emerald-100 px-1 text-emerald-900">onlyAuthorized</code> modifier to log the document location and block timestamp securely.
                  </p>
                </div>

                <div className="p-2.5 bg-stone-50 border border-emerald-700 rounded">
                  <span className="font-bold text-emerald-900">3. completeDocument(...)</span>
                  <p className="font-sans text-[11px] text-stone-600 mt-1">
                    Permanently closes the document lifecycle, stopping the turnaround clock upon clearance.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "code" && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold uppercase text-emerald-950 font-mono">TurnaroundTimeTracker.sol</span>
                <button 
                  onClick={copyToClipboard}
                  className="px-3 py-1 bg-emerald-800 hover:bg-emerald-900 text-white rounded text-[11px] font-bold transition-all shadow-sm cursor-pointer"
                >
                  {copied ? "Copied to Clipboard!" : "Copy Code"}
                </button>
              </div>
              
              <div className="bg-emerald-950 text-emerald-200 p-4 rounded border border-emerald-900 overflow-x-auto max-h-72 shadow-inner">
                <pre className="font-mono text-[10px] md:text-xs leading-relaxed whitespace-pre">
                  {SOLIDITY_CODE_STRING}
                </pre>
              </div>
            </div>
          )}

          {/* Last Hash Display */}
          {lastHash && activeTab === "route" && (
            <div className="mt-4 p-2.5 bg-stone-50 border border-emerald-700 text-[11px] font-mono break-all text-emerald-950 rounded">
              <span className="font-bold text-emerald-800">Latest Hash:</span> {lastHash}
            </div>
          )}

          {/* Etherscan Link Display */}
          {txHash && activeTab === "route" && (
            <div className="mt-2 p-2.5 bg-emerald-50 border border-emerald-700 text-xs font-mono break-all flex flex-col gap-1 rounded">
              <span className="font-bold text-emerald-800">Explorer Link:</span>
              <a 
                href={`https://sepolia.etherscan.io/tx/${txHash}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-emerald-700 underline font-semibold hover:text-emerald-900"
              >
                View Transaction on Sepolia Etherscan ↗
              </a>
            </div>
          )}

          {/* Terminal Status Output */}
          {status && (
            <div className="mt-4 p-3 bg-emerald-950 text-emerald-200 text-xs font-mono border border-emerald-900 leading-relaxed break-words rounded">
              {`> ${status}`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}