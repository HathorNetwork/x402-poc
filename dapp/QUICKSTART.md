# Quick Start Guide

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.local.example .env.local
```

The default configuration uses mock wallet mode, so you can test immediately without a real wallet.

### 3. Run Development Server
```bash
npm run dev
```

### 4. Open in Browser
Navigate to [http://localhost:3000](http://localhost:3000)

## Testing with Mock Wallet

With `NEXT_PUBLIC_USE_MOCK_WALLET=true` (default), you can:

1. **Connect Wallet**: Click "Connect Wallet" and choose any option
2. **View Mock Balance**: See simulated HTR balance
3. **View Contract Info**: See mock contract state

All actions are simulated and no real transactions occur.

## Connecting a Real Wallet

### Prerequisites
- Hathor Wallet extension or MetaMask with Hathor Snap
- HTR tokens on India Testnet
- Deployed nano contract

### Steps

1. **Update Environment**:
```env
NEXT_PUBLIC_USE_MOCK_WALLET=false
NEXT_PUBLIC_CONTRACT_IDS_TESTNET=["your_contract_id_here"]
```

2. **Restart Server**:
```bash
npm run dev
```

3. **Connect Wallet**:
   - Click "Connect Wallet"
   - Choose Reown or MetaMask Snaps
   - Approve connection in wallet

4. **Interact with Contract**:
   - Use the provided hooks and utilities
   - Send transactions via `sendNanoContractTx`
   - Confirm transactions in your wallet

## Network Selection

Use the network selector in the top-right to switch between:
- **India Testnet** (active)
- **Mainnet** (coming soon)

## Troubleshooting

### "Wallet not connected" error
- Ensure wallet extension is installed and unlocked
- Try refreshing the page
- Check that you're on the correct network

### "Contract state not loaded"
- Verify `NEXT_PUBLIC_CONTRACT_IDS_TESTNET` is set correctly
- Check that the contract exists on the selected network
- Ensure node URL is accessible

### Build errors
- Run `npm install` to ensure all dependencies are installed
- Delete `.next` folder and rebuild: `rm -rf .next && npm run dev`
- Check that Node.js version is 18 or higher

## Next Steps

1. **Deploy Contract**: Deploy your nano contract to India Testnet
2. **Update Config**: Add contract ID to `.env.local`
3. **Build Your dApp**: Modify the template to add your features

## Development Tips

- Use mock mode for rapid UI development
- Monitor browser console for errors
- Use React DevTools to inspect component state

## Support

- Check [README.md](./README.md) for detailed documentation
- Open an issue on GitHub for bugs or questions
