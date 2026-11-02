/**
 * Supported instruments: a curated set of NSE-listed large and mid caps.
 *
 * The list is the "stock master" (SRS §11.2) seeded into the database. It
 * is deliberately small so a free provider can keep all quotes fresh within
 * its rate limits. `providerInstrumentId` is the Yahoo Finance symbol
 * (NSE listings end in ".NS"). `demoBase` is only used by the demo provider
 * as a starting point for its fixtures and is not a real price.
 */
export interface SeedInstrument {
  symbol: string;
  companyName: string;
  exchange: "NSE";
  sector: string;
  providerInstrumentId: string;
  demoBase: number;
}

export const SEED_INSTRUMENTS: SeedInstrument[] = [
  { symbol: "RELIANCE", companyName: "Reliance Industries", exchange: "NSE", sector: "Energy", providerInstrumentId: "RELIANCE.NS", demoBase: 1450 },
  { symbol: "TCS", companyName: "Tata Consultancy Services", exchange: "NSE", sector: "IT Services", providerInstrumentId: "TCS.NS", demoBase: 3400 },
  { symbol: "HDFCBANK", companyName: "HDFC Bank", exchange: "NSE", sector: "Banking", providerInstrumentId: "HDFCBANK.NS", demoBase: 960 },
  { symbol: "INFY", companyName: "Infosys", exchange: "NSE", sector: "IT Services", providerInstrumentId: "INFY.NS", demoBase: 1500 },
  { symbol: "ICICIBANK", companyName: "ICICI Bank", exchange: "NSE", sector: "Banking", providerInstrumentId: "ICICIBANK.NS", demoBase: 1380 },
  { symbol: "HINDUNILVR", companyName: "Hindustan Unilever", exchange: "NSE", sector: "Consumer Goods", providerInstrumentId: "HINDUNILVR.NS", demoBase: 2450 },
  { symbol: "SBIN", companyName: "State Bank of India", exchange: "NSE", sector: "Banking", providerInstrumentId: "SBIN.NS", demoBase: 860 },
  { symbol: "BHARTIARTL", companyName: "Bharti Airtel", exchange: "NSE", sector: "Telecom", providerInstrumentId: "BHARTIARTL.NS", demoBase: 1900 },
  { symbol: "ITC", companyName: "ITC", exchange: "NSE", sector: "Consumer Goods", providerInstrumentId: "ITC.NS", demoBase: 410 },
  { symbol: "LT", companyName: "Larsen & Toubro", exchange: "NSE", sector: "Infrastructure", providerInstrumentId: "LT.NS", demoBase: 3650 },
  { symbol: "KOTAKBANK", companyName: "Kotak Mahindra Bank", exchange: "NSE", sector: "Banking", providerInstrumentId: "KOTAKBANK.NS", demoBase: 2050 },
  { symbol: "AXISBANK", companyName: "Axis Bank", exchange: "NSE", sector: "Banking", providerInstrumentId: "AXISBANK.NS", demoBase: 1150 },
  { symbol: "ASIANPAINT", companyName: "Asian Paints", exchange: "NSE", sector: "Consumer Goods", providerInstrumentId: "ASIANPAINT.NS", demoBase: 2400 },
  { symbol: "MARUTI", companyName: "Maruti Suzuki India", exchange: "NSE", sector: "Automobiles", providerInstrumentId: "MARUTI.NS", demoBase: 14500 },
  // Tata Motors demerged in 2025; Yahoo now lists the passenger-vehicle company as TMPV.NS
  // and the commercial-vehicle company as TMCV.NS. TATAMOTORS.NS returns "no data".
  { symbol: "TMPV", companyName: "Tata Motors Passenger Vehicles", exchange: "NSE", sector: "Automobiles", providerInstrumentId: "TMPV.NS", demoBase: 270 },
  { symbol: "SUNPHARMA", companyName: "Sun Pharmaceutical Industries", exchange: "NSE", sector: "Pharmaceuticals", providerInstrumentId: "SUNPHARMA.NS", demoBase: 1700 },
  { symbol: "TITAN", companyName: "Titan Company", exchange: "NSE", sector: "Consumer Goods", providerInstrumentId: "TITAN.NS", demoBase: 3500 },
  { symbol: "BAJFINANCE", companyName: "Bajaj Finance", exchange: "NSE", sector: "Financial Services", providerInstrumentId: "BAJFINANCE.NS", demoBase: 950 },
  { symbol: "WIPRO", companyName: "Wipro", exchange: "NSE", sector: "IT Services", providerInstrumentId: "WIPRO.NS", demoBase: 250 },
  { symbol: "HCLTECH", companyName: "HCL Technologies", exchange: "NSE", sector: "IT Services", providerInstrumentId: "HCLTECH.NS", demoBase: 1500 },
  { symbol: "ULTRACEMCO", companyName: "UltraTech Cement", exchange: "NSE", sector: "Cement", providerInstrumentId: "ULTRACEMCO.NS", demoBase: 12000 },
  { symbol: "NTPC", companyName: "NTPC", exchange: "NSE", sector: "Power", providerInstrumentId: "NTPC.NS", demoBase: 340 },
  { symbol: "POWERGRID", companyName: "Power Grid Corporation of India", exchange: "NSE", sector: "Power", providerInstrumentId: "POWERGRID.NS", demoBase: 290 },
  { symbol: "ONGC", companyName: "Oil and Natural Gas Corporation", exchange: "NSE", sector: "Energy", providerInstrumentId: "ONGC.NS", demoBase: 245 },
  { symbol: "TATASTEEL", companyName: "Tata Steel", exchange: "NSE", sector: "Metals", providerInstrumentId: "TATASTEEL.NS", demoBase: 165 },
  { symbol: "JSWSTEEL", companyName: "JSW Steel", exchange: "NSE", sector: "Metals", providerInstrumentId: "JSWSTEEL.NS", demoBase: 1050 },
  { symbol: "ADANIENT", companyName: "Adani Enterprises", exchange: "NSE", sector: "Conglomerate", providerInstrumentId: "ADANIENT.NS", demoBase: 2400 },
  { symbol: "ADANIPORTS", companyName: "Adani Ports and SEZ", exchange: "NSE", sector: "Infrastructure", providerInstrumentId: "ADANIPORTS.NS", demoBase: 1400 },
  { symbol: "NESTLEIND", companyName: "Nestle India", exchange: "NSE", sector: "Consumer Goods", providerInstrumentId: "NESTLEIND.NS", demoBase: 1200 },
  { symbol: "BAJAJFINSV", companyName: "Bajaj Finserv", exchange: "NSE", sector: "Financial Services", providerInstrumentId: "BAJAJFINSV.NS", demoBase: 2000 },
  { symbol: "M&M", companyName: "Mahindra & Mahindra", exchange: "NSE", sector: "Automobiles", providerInstrumentId: "M&M.NS", demoBase: 3300 },
  { symbol: "TECHM", companyName: "Tech Mahindra", exchange: "NSE", sector: "IT Services", providerInstrumentId: "TECHM.NS", demoBase: 1550 },
  { symbol: "DRREDDY", companyName: "Dr. Reddy's Laboratories", exchange: "NSE", sector: "Pharmaceuticals", providerInstrumentId: "DRREDDY.NS", demoBase: 1250 },
  { symbol: "CIPLA", companyName: "Cipla", exchange: "NSE", sector: "Pharmaceuticals", providerInstrumentId: "CIPLA.NS", demoBase: 1500 },
  { symbol: "COALINDIA", companyName: "Coal India", exchange: "NSE", sector: "Mining", providerInstrumentId: "COALINDIA.NS", demoBase: 390 },
  { symbol: "GRASIM", companyName: "Grasim Industries", exchange: "NSE", sector: "Cement", providerInstrumentId: "GRASIM.NS", demoBase: 2800 },
  { symbol: "HINDALCO", companyName: "Hindalco Industries", exchange: "NSE", sector: "Metals", providerInstrumentId: "HINDALCO.NS", demoBase: 750 },
  { symbol: "EICHERMOT", companyName: "Eicher Motors", exchange: "NSE", sector: "Automobiles", providerInstrumentId: "EICHERMOT.NS", demoBase: 6500 },
  { symbol: "BRITANNIA", companyName: "Britannia Industries", exchange: "NSE", sector: "Consumer Goods", providerInstrumentId: "BRITANNIA.NS", demoBase: 5800 },
  { symbol: "DIVISLAB", companyName: "Divi's Laboratories", exchange: "NSE", sector: "Pharmaceuticals", providerInstrumentId: "DIVISLAB.NS", demoBase: 6200 },
  { symbol: "HEROMOTOCO", companyName: "Hero MotoCorp", exchange: "NSE", sector: "Automobiles", providerInstrumentId: "HEROMOTOCO.NS", demoBase: 5300 },
  { symbol: "BPCL", companyName: "Bharat Petroleum Corporation", exchange: "NSE", sector: "Energy", providerInstrumentId: "BPCL.NS", demoBase: 330 },
  { symbol: "TATACONSUM", companyName: "Tata Consumer Products", exchange: "NSE", sector: "Consumer Goods", providerInstrumentId: "TATACONSUM.NS", demoBase: 1100 },
  { symbol: "APOLLOHOSP", companyName: "Apollo Hospitals Enterprise", exchange: "NSE", sector: "Healthcare", providerInstrumentId: "APOLLOHOSP.NS", demoBase: 7300 },
  { symbol: "INDUSINDBK", companyName: "IndusInd Bank", exchange: "NSE", sector: "Banking", providerInstrumentId: "INDUSINDBK.NS", demoBase: 800 },
  { symbol: "SHRIRAMFIN", companyName: "Shriram Finance", exchange: "NSE", sector: "Financial Services", providerInstrumentId: "SHRIRAMFIN.NS", demoBase: 680 },
  { symbol: "TRENT", companyName: "Trent", exchange: "NSE", sector: "Retail", providerInstrumentId: "TRENT.NS", demoBase: 5500 },
  { symbol: "ZOMATO", companyName: "Eternal (Zomato)", exchange: "NSE", sector: "Internet", providerInstrumentId: "ETERNAL.NS", demoBase: 270 },
  { symbol: "IRCTC", companyName: "Indian Railway Catering and Tourism", exchange: "NSE", sector: "Travel", providerInstrumentId: "IRCTC.NS", demoBase: 760 },
  { symbol: "DMART", companyName: "Avenue Supermarts", exchange: "NSE", sector: "Retail", providerInstrumentId: "DMART.NS", demoBase: 4000 },
];

/** providerInstrumentId -> demo base price. */
export const DEMO_BASE_PRICES: Record<string, number> = Object.fromEntries(
  SEED_INSTRUMENTS.map((i) => [i.providerInstrumentId, i.demoBase]),
);
