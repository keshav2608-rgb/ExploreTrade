-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Instrument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "providerInstrumentId" TEXT,
    "sector" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "tradeDate" DATETIME NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "pricePerShare" DECIMAL NOT NULL,
    "charges" DECIMAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transaction_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WatchlistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WatchlistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WatchlistItem_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuoteSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instrumentId" TEXT NOT NULL,
    "price" DECIMAL NOT NULL,
    "previousClose" DECIMAL,
    "dayChange" DECIMAL,
    "dayChangePercent" DECIMAL,
    "volume" BIGINT,
    "quoteTimestamp" DATETIME NOT NULL,
    "fetchedAt" DATETIME NOT NULL,
    "provider" TEXT NOT NULL,
    "dataStatus" TEXT NOT NULL,
    CONSTRAINT "QuoteSnapshot_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HistoricalPrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instrumentId" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "open" DECIMAL,
    "high" DECIMAL,
    "low" DECIMAL,
    "close" DECIMAL NOT NULL,
    "volume" BIGINT,
    "provider" TEXT NOT NULL,
    CONSTRAINT "HistoricalPrice_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PriceAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "thresholdPrice" DECIMAL NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isTriggered" BOOLEAN NOT NULL DEFAULT false,
    "lastTriggeredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PriceAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PriceAlert_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "alertId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Notification_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "PriceAlert" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PortfolioValuation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "valuationTimestamp" DATETIME NOT NULL,
    "investedValue" DECIMAL NOT NULL,
    "marketValue" DECIMAL NOT NULL,
    "realizedPnl" DECIMAL NOT NULL,
    "unrealizedPnl" DECIMAL NOT NULL,
    "totalPnl" DECIMAL NOT NULL,
    "quoteStatusSummary" TEXT NOT NULL,
    CONSTRAINT "PortfolioValuation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Instrument_companyName_idx" ON "Instrument"("companyName");

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_exchange_symbol_key" ON "Instrument"("exchange", "symbol");

-- CreateIndex
CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");

-- CreateIndex
CREATE INDEX "Transaction_instrumentId_idx" ON "Transaction"("instrumentId");

-- CreateIndex
CREATE INDEX "Transaction_tradeDate_idx" ON "Transaction"("tradeDate");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistItem_userId_instrumentId_key" ON "WatchlistItem"("userId", "instrumentId");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteSnapshot_instrumentId_key" ON "QuoteSnapshot"("instrumentId");

-- CreateIndex
CREATE UNIQUE INDEX "HistoricalPrice_instrumentId_interval_timestamp_provider_key" ON "HistoricalPrice"("instrumentId", "interval", "timestamp", "provider");

-- CreateIndex
CREATE INDEX "PriceAlert_userId_idx" ON "PriceAlert"("userId");

-- CreateIndex
CREATE INDEX "PriceAlert_instrumentId_isEnabled_idx" ON "PriceAlert"("instrumentId", "isEnabled");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioValuation_userId_valuationTimestamp_key" ON "PortfolioValuation"("userId", "valuationTimestamp");
