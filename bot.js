   const ccxt = require('ccxt');
   const http = require('./in.js');

// Initialize the exchange with API credentials
const exchange = new ccxt.bitget({
    // Uncomment and add API credentials if required
    // apiKey: "API_KEY",
//    // secret: "API_SECRET",
    // password: "PASSWORD"
});

async function MarketSymbol() {
    const markets = await exchange.fetchMarkets();
    const marketSymbols = markets.map(market => market.symbol);
    console.log(`No. of market symbols: ${marketSymbols.length}`);
    return marketSymbols;
}

async function getCryptoCombinations(base) {
    const marketSymbols = await MarketSymbol();
    const combinations = [];

    for (const sym1 of marketSymbols) {
        const [sym1Token1, sym1Token2] = sym1.split('/');
        if (sym1Token2 === base) {
            for (const sym2 of marketSymbols) {
                const [sym2Token1, sym2Token2] = sym2.split('/');
                if (sym1Token1 === sym2Token2) {
                    for (const sym3 of marketSymbols) {
                        const [sym3Token1, sym3Token2] = sym3.split('/');
                        if (sym2Token1 === sym3Token1 && sym3Token2 === sym1Token2) {
                            const combination = {
                                base: sym1Token2,
                                intermediate: sym1Token1,
                                ticker: sym2Token1,
                            };
                            combinations.push(combination);
                        }
                    }
                }
            }
        }
    }
    return combinations;
}


async function tickers(srb, retryCount = 0) {
    try {
        const tickk = await exchange.fetchTicker(srb);
        return tickk;
    } catch (error) {
        if (error instanceof ccxt.RateLimitExceeded && retryCount < 5) {
            console.error('Rate limit exceeded. Retrying in 5 seconds...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            return tickers(srb, retryCount + 1);
        } else {
            console.error(error);
            return null;
        }
    }
}

function checkIfFloatZero(value) {
    return Math.abs(value) < 1e-3;
}
/*  COMPILE
        FOR
        FIST FUNCTION
     */
async function checkSellBuySell(scrip1, scrip2, scrip3, initialInvestment) {
    let finalPrice = 0;
    const scripPrices = {};

    // SCRIP1 - Sell
    const currentPrice1 = await tickers(scrip1);
    if (currentPrice1 !== null && !checkIfFloatZero(currentPrice1)) {
        const sellQuantity1 = initialInvestment / currentPrice1.ask;

        // SCRIP2 - Buy
        const currentPrice2 = await tickers(scrip2);
        if (currentPrice2 !== null && !checkIfFloatZero(currentPrice2)) {
            const buyQuantity2 = sellQuantity1 / currentPrice2.ask;

            // SCRIP3 - Sell
            const currentPrice3 = await tickers(scrip3);
            if (currentPrice3 !== null && !checkIfFloatZero(currentPrice3)) {
                finalPrice = buyQuantity2 * currentPrice3.bid;
                scripPrices[scrip1] = currentPrice1.ask;
                scripPrices[scrip2] = currentPrice2.ask;
                scripPrices[scrip3] = currentPrice3.bid;
            }
        }
    }
    return { finalPrice, scripPrices };
}


async function checkSellBuySellReverse(scrip1, scrip2, scrip3, initialInvestment) {
    let finalPrice = 0;
    const scripPrices = {};

    const currentPrice1 = await tickers(scrip1);
    if (currentPrice1 && !checkIfFloatZero(currentPrice1)) {
        const sellQuantity1 = initialInvestment / currentPrice1.bid;

        const currentPrice2 = await tickers(scrip2);
        if (currentPrice2 && !checkIfFloatZero(currentPrice2)) {
            const buyQuantity2 = sellQuantity1 * currentPrice2.bid;

            const currentPrice3 = await tickers(scrip3);
            if (currentPrice3 && !checkIfFloatZero(currentPrice3)) {
                finalPrice = buyQuantity2 / currentPrice3.ask;
                scripPrices[scrip1] = currentPrice1.bid;
                scripPrices[scrip2] = currentPrice2.bid;
                scripPrices[scrip3] = currentPrice3.ask;
            } else {
                console.error(`Failed to retrieve valid price for ${scrip3}`);
            }
        } else {
            console.error(`Failed to retrieve valid price for ${scrip2}`);
        }
    } else {
        console.error(`Failed to retrieve valid price for ${scrip1}`);
    }

    return { finalPrice, scripPrices };
}
    
function checkProfitLoss(totalPriceAfterSell, initialInvestment, transactionBrokerage, minProfit) {
    const apprxBrokerage = (transactionBrokerage * initialInvestment / 100) * 3;
    const minProfitablePrice = initialInvestment + apprxBrokerage + minProfit;
    const profitLoss = parseFloat((totalPriceAfterSell - minProfitablePrice).toFixed(3));
    return profitLoss;
}

async function placeBuyOrder(scrip, quantity, limit) {
    try {
        let order;
        while (true) {
            const balance = await exchange.fetchBalance();
            const splitting = scrip.split('/')[0];
            if (balance[splitting].total > 0) {
                order = await exchange.createLimitBuyOrder(scrip, quantity, limit);
                break;
            } else {
                console.log(`Waiting for the order to be completed for ${scrip}`);
                await new Promise(resolve => setTimeout(resolve, 800));
            }
        }
        return order;
    } catch (error) {
        console.error(`Error placing buy order for ${scrip}:`, error);
        throw error;
    }
}

async function placeSellOrder(scrip, quantity, limit) {
    try {
        let order;
        while (true) {
            const balance = await exchange.fetchBalance();
            const splitting = scrip.split('/')[0];
            if (balance[splitting].total > 0) {
                order = await exchange.createLimitSellOrder(scrip, quantity, limit);
                break;
            } else {
                console.log(`Waiting for the order to be completed for ${scrip}`);
                await new Promise(resolve => setTimeout(resolve, 800));
            }
        }
        return order;
    } catch (error) {
        console.error(`Error placing sell order for ${scrip}:`, error);
        throw error;
    }
}

async function placeTradeOrders(type, scrip1, scrip2, scrip3, initialAmount, scripPrices) {
    let finalAmount = 0.0;

    if (type === 'SELL_BUY_SELL') {
        const s1Quantity = initialAmount / scripPrices[scrip1];
        await placeSellOrder(scrip1, s1Quantity, scripPrices[scrip1]);

        const s2Quantity = s1Quantity * scripPrices[scrip2];
        await placeBuyOrder(scrip2, s2Quantity, scripPrices[scrip2]);

        const s3Quantity = s2Quantity;
        await placeSellOrder(scrip3, s3Quantity, scripPrices[scrip3]);
    } else if (type === 'SELL_BUY_SELL_REVERSE') {
        const s3Quantity = initialAmount / scripPrices[scrip3];
        await placeBuyOrder(scrip3, s3Quantity, scripPrices[scrip3]);

        const s2Quantity = s3Quantity * scripPrices[scrip2];
        await placeSellOrder(scrip2, s2Quantity, scripPrices[scrip2]);

        const s1Quantity = s2Quantity;
        await placeBuyOrder(scrip1, s1Quantity, scripPrices[scrip1]);
    }

    return finalAmount;
}


async function performTriangularArbitrage(scrip1, scrip2, scrip3, arbitrageType, initialInvestment, transactionBrokerage, minProfit) {
    let finalPrice = 0.0;
    let scripPrices = {};

    const intermediateToken = scrip2.split('/')[1];
    let isMajorToken = intermediateToken === 'BTC' || intermediateToken === 'ETH';

    if (arbitrageType === 'SELL_BUY_SELL') {
        if (isMajorToken) {
        console.log(' BTC pair or ETh poo pair')
        } else {
            ({ finalPrice, scripPrices } = await checkSellBuySell(scrip1, scrip2, scrip3, initialInvestment));
        }
    } 

    let profitLoss = checkProfitLoss(finalPrice, initialInvestment, transactionBrokerage, minProfit);

    if (profitLoss <= 0) {
        ({ finalPrice, scripPrices } = await checkSellBuySellReverse(scrip3, scrip2, scrip1, initialInvestment));
        profitLoss = checkProfitLoss(finalPrice, initialInvestment, transactionBrokerage, minProfit);

        if (profitLoss > 0) {
            const startTime = Date.now();
            console.table([{
                Time: new Date().toLocaleTimeString(),
                'Arbitrage Type': `${arbitrageType} (USDT(R))`,
                '1st': [scrip3, scripPrices[scrip3]],
                '2nd': [scrip2, scripPrices[scrip2]],
                '3rd': [scrip1, scripPrices[scrip1]],
                'Profit/Loss': parseFloat((finalPrice - initialInvestment).toFixed(3)),
                'latency/rev': ((Date.now()) - startTime)
            }]);

            // Uncomment this line to place the orders
            // await placeTradeOrders('SELL_BUY_SELL_REVERSE', scrip1, scrip2, scrip3, initialInvestment, scripPrices);
        }
    } else {
        // Normal sequence is profitable
        const startTime = Date.now();
        console.table([{
            Time: new Date().toLocaleTimeString(),
            'Arbitrage Type': arbitrageType,
            '1st': [scrip1, scripPrices[scrip1]],
            '2nd': [scrip2, scripPrices[scrip2]],
            '3rd': [scrip3, scripPrices[scrip3]],
            'Profit/Loss': parseFloat((finalPrice - initialInvestment).toFixed(3)),
            'latency': ((Date.now()) - startTime)
        }]);

        // Uncomment this line to place the orders
        // await placeTradeOrders(arbitrageType, scrip1, scrip2, scrip3, initialInvestment, scripPrices);
    }
}



(async () => {
    while(true){
    const base = 'USDT';
    const combinations = await getCryptoCombinations(base);
    const initialInvestment = 5; // example initial investment
    const transactionBrokerage = 0.001; // example brokerage percentage
    const minProfit = 0; // example minimum profit

    for (const combination of combinations) {
        const scrip1 = `${combination.intermediate}/${combination.base}`;
        const scrip2 = `${combination.ticker}/${combination.intermediate}`;
        const scrip3 = `${combination.ticker}/${combination.base}`;
        const arbitrageType = 'SELL_BUY_SELL';

        await performTriangularArbitrage(scrip1, scrip2, scrip3, arbitrageType, initialInvestment, transactionBrokerage, minProfit);
    }
  }
})();
                 
