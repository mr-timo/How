const ccxt = require('ccxt');

// Initialize Bybit exchange with demo mode
const exchange = new ccxt.bybit({
    apiKey: 'YOUR_API_KEY',
    secret: 'YOUR_SECRET_KEY',
    enableRateLimit: true,
    options: {
        defaultType: 'future',
        testnet: true, // Enable testnet
    },
});

// Define parameters
const symbol = 'BTC/USDT';
let balance = 10; // Fixed balance in USDT
const gridPercentage = 0.002;
const leverage = 30;
const stopLossPercentage = 0.01;
const takeProfitPercentage = 0.01;
const pricePrecision = 2; // Precision for rounding prices

(async () => {
    const ticker = await exchange.fetchTicker(symbol);
    const price = ticker.last;

    // Calculate grid levels
    const stopLoss = parseFloat((price * (1 - stopLossPercentage)).toFixed(pricePrecision));
    const takeProfit = parseFloat((price * (1 + takeProfitPercentage)).toFixed(pricePrecision));

    const buyLines = [];
    const sellLines = [];

    for (let i = 1; i <= 5; i++) {
        buyLines.push(parseFloat((price * (1 - gridPercentage * i)).toFixed(pricePrecision)));
        sellLines.push(parseFloat((price * (1 + gridPercentage * i)).toFixed(pricePrecision)));
    }

    console.log(`Stop Loss: ${stopLoss}`);
    console.log(`Take Profit: ${takeProfit}`);
    console.log(`Buy Lines: ${buyLines.join(', ')}`);
    console.log(`Sell Lines: ${sellLines.join(', ')}`);
    console.log(`Available funds (fixed): ${balance} USDT`);

    let positionSize = 0;

    while (true) {
        const ticker = await exchange.fetchTicker(symbol);
        const currentPrice = ticker.last;

        // Check for buy condition
        for (let buyPrice of buyLines) {
            if (currentPrice <= buyPrice && balance > 0) {
                const amount = parseFloat((balance / currentPrice).toFixed(8)); // Calculate how much BTC to buy
                console.log(`[DEMO] Buy Order: ${amount} BTC at ${currentPrice}`);
                positionSize += amount;
                balance = 0; // Update balance after purchase
                console.log(`Bought ${amount} BTC at ${currentPrice}`);
                break;
            }
        }

        // Check for sell condition
        for (let sellPrice of sellLines) {
            if (currentPrice >= sellPrice && positionSize > 0) {
                console.log(`[DEMO] Sell Order: ${positionSize} BTC at ${currentPrice}`);
                const profit = parseFloat((positionSize * (currentPrice - price)).toFixed(8));
                balance += profit * leverage; // Update balance with profit from sale
                console.log(`Sold ${positionSize} BTC at ${currentPrice}, Profit: ${profit} USDT`);
                positionSize = 0; // Reset position size after selling
                break;
            }
        }

        // Check for stop loss
        if (currentPrice <= stopLoss && positionSize > 0) {
            console.log(`[DEMO] Sell Order: ${positionSize} BTC at ${currentPrice}`);
            const loss = parseFloat((positionSize * (price - currentPrice)).toFixed(8));
            balance -= loss * leverage;
            console.log(`Stop Loss triggered! Sold ${positionSize} BTC at ${currentPrice}, Loss: ${loss} USDT`);
            positionSize = 0;
            break;
        }

        // Check for take profit
        if (currentPrice >= takeProfit && positionSize > 0) {
            console.log(`[DEMO] Sell Order: ${positionSize} BTC at ${currentPrice}`);
            const profit = parseFloat((positionSize * (currentPrice - price)).toFixed(8));
            balance += profit * leverage;
            console.log(`Take Profit triggered! Sold ${positionSize} BTC at ${currentPrice}, Profit: ${profit} USDT`);
            positionSize = 0;
            break;
        }

        console.log(`Current Price: ${currentPrice}, Position Size: ${positionSize}, Balance: ${balance} USDT`);

        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before checking the next price update
    }
})();
