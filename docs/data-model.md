# Data model

Source of truth: `prisma/schema.prisma`. Money and quantities are `Decimal`
columns; nothing monetary is stored as a float.

```mermaid
erDiagram
    User ||--o{ Transaction : records
    User ||--o{ WatchlistItem : follows
    User ||--o{ PriceAlert : sets
    User ||--o{ Notification : receives
    User ||--o{ PortfolioValuation : "valued daily"
    Instrument ||--o{ Transaction : "traded in"
    Instrument ||--o{ WatchlistItem : ""
    Instrument ||--o{ PriceAlert : ""
    Instrument ||--o| QuoteSnapshot : "latest quote"
    Instrument ||--o{ HistoricalPrice : ""
    PriceAlert ||--o{ Notification : triggers

    User {
        string id PK
        string email UK
        string displayName
        string passwordHash
    }
    Instrument {
        string id PK
        string symbol
        string exchange
        string companyName
        string sector
        string providerInstrumentId
        bool isActive
    }
    Transaction {
        string id PK
        string userId FK
        string instrumentId FK
        string type "BUY | SELL"
        datetime tradeDate
        decimal quantity
        decimal pricePerShare
        decimal charges
        string notes
    }
    WatchlistItem {
        string id PK
        string userId FK
        string instrumentId FK
    }
    QuoteSnapshot {
        string instrumentId FK
        decimal price
        decimal previousClose
        decimal dayChange
        decimal dayChangePercent
        bigint volume
        datetime quoteTimestamp
        datetime fetchedAt
        string provider
        string dataStatus "LIVE|DELAYED|END_OF_DAY|CACHED|DEMO"
    }
    PriceAlert {
        string id PK
        string userId FK
        string instrumentId FK
        string condition "ABOVE | BELOW"
        decimal thresholdPrice
        bool isEnabled
        bool isTriggered
        datetime lastTriggeredAt
    }
    Notification {
        string id PK
        string userId FK
        string alertId FK
        string type
        string title
        string message
        bool isRead
    }
    PortfolioValuation {
        string id PK
        string userId FK
        datetime valuationTimestamp
        decimal investedValue
        decimal marketValue
        decimal realizedPnl
        decimal unrealizedPnl
        decimal totalPnl
        string quoteStatusSummary
    }
```

Constraints that matter:

- `Instrument (exchange, symbol)` unique; `WatchlistItem (userId, instrumentId)` unique.
- `QuoteSnapshot.instrumentId` unique: one current quote per instrument, upserted; a failed refresh never overwrites it.
- `PortfolioValuation (userId, valuationTimestamp)` unique: one row per user per day.
- Every user-owned table cascades on user deletion, which is how "delete my account" removes everything.
- `HistoricalPrice` exists for a future cache; the MVP charts straight from the provider.
