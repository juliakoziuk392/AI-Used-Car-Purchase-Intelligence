import { Analysis } from './analysis.model';
import { KnowledgeChunk } from './knowledge-chunk.model';
import { ListingPhoto } from './listing-photo.model';
import { Listing } from './listing.model';
import { MarketSnapshot } from './market-snapshot.model';
import { RiskFlag } from './risk-flag.model';
import { User } from './user.model';
import { Vehicle } from './vehicle.model';

export {
  Analysis,
  KnowledgeChunk,
  Listing,
  ListingPhoto,
  MarketSnapshot,
  RiskFlag,
  User,
  Vehicle,
};

export const models = [
  User,
  Vehicle,
  Listing,
  ListingPhoto,
  Analysis,
  RiskFlag,
  MarketSnapshot,
  KnowledgeChunk,
];
